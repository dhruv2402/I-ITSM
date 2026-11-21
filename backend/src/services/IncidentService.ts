import { IncidentStatus, Level, NoteType, Permission, Role } from '../domain/enums';
import {
  AuthorizationError,
  DuplicateIncidentError,
  IncidentNotFoundError,
  ServiceNotFoundError,
  SlaConfigurationError,
  TechnicianUnavailableError,
  UserNotFoundError,
  ValidationError,
  WorkloadExceededError,
} from '../domain/errors';
import { EventType, SYSTEM_ACTOR } from '../domain/events/DomainEvent';
import { EventBus } from '../domain/events/EventBus';
import { Incident } from '../domain/incident/Incident';
import { User } from '../domain/user/User';
import { isTechnician } from '../domain/user/UserFactory';
import { CategoryClassifier } from '../intelligence/CategoryClassifier';
import { CorrelationEngine } from '../intelligence/CorrelationEngine';
import { DuplicateDetector } from '../intelligence/DuplicateDetector';
import { ResolutionRecommender } from '../intelligence/ResolutionRecommender';
import { TextAnalyzer } from '../intelligence/TextAnalyzer';
import { IncidentSearchCriteria, Page, Repositories } from '../persistence/repositories';
import { clock } from '../shared/clock';
import { SlaService } from '../sla/SlaService';
import { AssignmentContext, RankedCandidate, TechnicianCandidate } from '../strategies/assignment/AssignmentStrategy';
import { AssignmentStrategyRegistry } from '../strategies/assignment/AssignmentStrategyRegistry';
import { PriorityCalculator } from '../strategies/priority/PriorityCalculator';
import { IncidentAccessPolicy } from './IncidentAccessPolicy';

export interface CreateIncidentInput {
  title: string;
  description: string;
  serviceId: string;
  categoryCode?: string | null;
  impact: Level;
  urgency: Level;
  affectedUsers: number;
  /** Reporter confirmed it is not a resubmission of their own open incident. */
  confirmNotDuplicate?: boolean;
}

export interface IncidentDeps {
  repos: Repositories;
  bus: EventBus;
  priority: PriorityCalculator;
  assignment: AssignmentStrategyRegistry;
  sla: SlaService;
  classifier: CategoryClassifier;
  duplicates: DuplicateDetector;
  resolutions: ResolutionRecommender;
  correlation: CorrelationEngine;
  access: IncidentAccessPolicy;
}

/**
 * Application service orchestrating the incident lifecycle:
 * Report -> Classify -> Prioritise -> SLA -> Assign -> Investigate -> Resolve -> Verify -> Close.
 * It coordinates collaborators (strategies, intelligence, repositories, event bus)
 * while the business rules themselves live in the domain objects.
 */
export class IncidentService {
  constructor(private readonly d: IncidentDeps) {}

  // ================================================================ helpers

  private get repo() {
    return this.d.repos.incidents;
  }

  private async load(id: string): Promise<Incident> {
    const inc = await this.repo.findById(id);
    if (!inc) throw new IncidentNotFoundError(id);
    return inc;
  }

  private async loadVisible(user: User, id: string): Promise<Incident> {
    const inc = await this.load(id);
    this.d.access.assertCanView(user, inc);
    return inc;
  }

  private async commit(inc: Incident): Promise<void> {
    await this.repo.save(inc);
    await this.d.bus.publishAll(inc.pullEvents());
  }

  view(user: User, inc: Incident) {
    return { ...inc.toView(), permittedActions: this.d.access.permittedActions(user, inc) };
  }

  /** Re-trains the category classifier on all classified historical incidents. */
  async retrainClassifier(): Promise<number> {
    const solved = await this.repo.findSolved(2000);
    const samples = solved.filter((i) => i.categoryCode).map((i) => ({ text: i.searchableText(), categoryCode: i.categoryCode! }));
    this.d.classifier.train(samples);
    return samples.length;
  }

  private async buildCandidates(inc: Incident): Promise<TechnicianCandidate[]> {
    const techs = (await this.d.repos.users.findByRoles([Role.TECHNICIAN, Role.TEAM_LEAD])).filter(isTechnician);
    const workload = await this.repo.activeWorkload();
    const solved = await this.repo.findSolved(1000);
    return techs.map((t) => ({
      technician: t,
      activeWorkload: workload.get(t.id) ?? 0,
      resolvedForService: solved.filter((s) => s.resolution?.resolvedById === t.id && s.serviceId === inc.serviceId).length,
      resolvedInCategory: solved.filter((s) => s.resolution?.resolvedById === t.id && s.categoryCode === inc.categoryCode).length,
    }));
  }

  private context(inc: Incident): AssignmentContext {
    return { incidentId: inc.id, categoryCode: inc.categoryCode, serviceId: inc.serviceId, priority: inc.priority };
  }

  private async applySla(inc: Incident): Promise<void> {
    if (!inc.priority) return;
    try {
      inc.attachSla(await this.d.sla.resolvePolicy(inc.serviceId, inc.priority), SYSTEM_ACTOR);
    } catch (err) {
      if (!(err instanceof SlaConfigurationError)) throw err;
      // graceful degradation: the incident is still recorded, admins are alerted to fix the configuration
      inc.raise(EventType.SLA_MISSING, SYSTEM_ACTOR, err.message);
    }
  }

  private async recalculatePriority(inc: Incident, actor: User | null): Promise<void> {
    const service = await this.d.repos.services.findById(inc.serviceId);
    const result = this.d.priority.calculate({
      impact: inc.impact,
      urgency: inc.urgency,
      businessCriticality: inc.businessCriticality,
      affectedUsers: inc.affectedUsers,
      serviceUserBase: service?.userBase ?? 0,
    });
    const changed = inc.applyPriority(result, actor ? actor.toActor() : SYSTEM_ACTOR);
    if (changed) await this.applySla(inc);
  }

  private async autoAssign(inc: Incident): Promise<{ strategy: string; chosen: RankedCandidate | null }> {
    const strategy = this.d.assignment.active;
    const chosen = strategy.select(this.context(inc), await this.buildCandidates(inc));
    if (chosen) {
      inc.assignTo({ id: chosen.technicianId, name: chosen.technicianName }, SYSTEM_ACTOR, `auto-assigned by ${strategy.name} strategy`);
    } else {
      inc.raise(EventType.ASSIGNMENT_FAILED, SYSTEM_ACTOR, `No available technician (strategy ${strategy.name}); incident queued for manual assignment`);
    }
    return { strategy: strategy.name, chosen };
  }

  // ================================================================ intelligence

  /** Live analysis while the reporter is typing: category, duplicates, known fixes, priority preview. */
  async analyzeDraft(input: { title: string; description: string; serviceId?: string; impact?: Level; urgency?: Level; affectedUsers?: number }) {
    const text = `${input.title ?? ''} ${input.description ?? ''}`;
    const service = input.serviceId ? await this.d.repos.services.findById(input.serviceId) : null;
    if (input.serviceId && !service) throw new ServiceNotFoundError(input.serviceId);
    const categorySuggestion = this.d.classifier.suggest(text, await this.d.repos.categories.findAll());
    const active = await this.repo.findActive();
    const duplicates = service
      ? this.d.duplicates.findDuplicates({ title: input.title ?? '', description: input.description ?? '', serviceId: service.id }, active, clock.now())
      : [];
    const suggestedResolutions = this.d.resolutions.suggest(
      { title: input.title ?? '', description: input.description ?? '', categoryCode: categorySuggestion?.categoryCode ?? null, serviceId: input.serviceId ?? '' },
      await this.repo.findSolved(),
    );
    const priorityPreview =
      service && input.impact && input.urgency
        ? this.d.priority.calculate({
            impact: input.impact,
            urgency: input.urgency,
            businessCriticality: service.businessCriticality,
            affectedUsers: input.affectedUsers ?? 1,
            serviceUserBase: service.userBase,
          })
        : null;
    return { categorySuggestion, duplicates, suggestedResolutions, priorityPreview };
  }

  // ================================================================ create

  async create(user: User, input: CreateIncidentInput) {
    if (!user.hasPermission(Permission.INCIDENT_CREATE)) throw new AuthorizationError('You are not allowed to report incidents');
    const service = await this.d.repos.services.findById(input.serviceId);
    if (!service || !service.isActive) throw new ServiceNotFoundError(input.serviceId);
    const now = clock.now();
    const active = await this.repo.findActive();

    // Business rule: the same person re-submitting the same problem within 30 minutes is rejected.
    if (!input.confirmNotDuplicate) {
      const own = active.find(
        (i) =>
          i.reporterId === user.id &&
          i.serviceId === service.id &&
          now.getTime() - i.createdAt.getTime() < 30 * 60_000 &&
          TextAnalyzer.similarity(i.title, input.title) >= 0.8,
      );
      if (own) throw new DuplicateIncidentError(own.id);
    }

    const inc = Incident.create(await this.repo.nextId(), {
      title: input.title,
      description: input.description,
      reporter: user.toActor(),
      serviceId: service.id,
      impact: input.impact,
      urgency: input.urgency,
      businessCriticality: service.businessCriticality,
      affectedUsers: input.affectedUsers,
    });

    // 2. classify (reporter's choice, otherwise the AI suggestion, otherwise GENERAL)
    const categories = await this.d.repos.categories.findAll();
    if (input.categoryCode) {
      const chosen = categories.find((c) => c.code === input.categoryCode!.toUpperCase() && c.isActive);
      if (!chosen) throw new ValidationError(`Unknown incident category ${input.categoryCode}`);
      inc.classify(chosen.code, user.toActor());
    } else {
      const s = this.d.classifier.suggest(inc.searchableText(), categories);
      inc.classify(s?.categoryCode ?? 'GENERAL', SYSTEM_ACTOR, s?.confidence ?? null);
    }

    // 3-6. business impact -> priority -> SLA
    await this.recalculatePriority(inc, null);

    // intelligent: duplicate detection against open incidents
    const duplicates = this.d.duplicates.findDuplicates(
      { id: inc.id, title: inc.title, description: inc.description, serviceId: inc.serviceId },
      active,
      now,
    );
    if (duplicates.length) inc.linkRelated(duplicates.map((x) => x.incidentId), SYSTEM_ACTOR, 'Possible duplicate of', true);

    // 7-8. find and assign a technician
    const assignment = await this.autoAssign(inc);
    await this.commit(inc);

    // link back so the related incidents point at the new one too
    for (const dup of duplicates) {
      const other = await this.repo.findById(dup.incidentId);
      if (other) {
        other.linkRelated([inc.id], SYSTEM_ACTOR, 'New possibly related report', false);
        await this.commit(other);
      }
    }
    return { incident: this.view(user, inc), duplicates, assignment };
  }

  // ================================================================ queries

  async get(user: User, id: string) {
    return this.view(user, await this.loadVisible(user, id));
  }

  async search(user: User, criteria: IncidentSearchCriteria): Promise<Page<ReturnType<IncidentService['view']>>> {
    const scoped: IncidentSearchCriteria = { ...criteria };
    if (!user.hasPermission(Permission.INCIDENT_VIEW_ALL)) {
      scoped.visibleTo = { userId: user.id, includeAssigned: user.hasPermission(Permission.INCIDENT_VIEW_ASSIGNED) };
    }
    const page = await this.repo.search(scoped);
    return { ...page, items: page.items.map((i) => this.view(user, i)) };
  }

  async auditTrail(user: User, id: string) {
    await this.loadVisible(user, id);
    return this.d.repos.audit.search({ incidentId: id, limit: 1000 });
  }

  async related(user: User, id: string) {
    const inc = await this.loadVisible(user, id);
    const active = await this.repo.findActive();
    const duplicates = this.d.duplicates.findDuplicates(
      { id: inc.id, title: inc.title, description: inc.description, serviceId: inc.serviceId },
      active,
      clock.now(),
    );
    const correlations = this.d.correlation
      .correlate(active, await this.d.repos.services.findAll(), clock.now())
      .filter((c) => c.incidentIds.includes(inc.id));
    const linked = [];
    for (const rid of inc.relatedIncidentIds) {
      const r = await this.repo.findById(rid);
      if (r) linked.push({ id: r.id, title: r.title, status: r.status, priority: r.priority, serviceId: r.serviceId });
    }
    const suggestedResolutions = this.d.resolutions.suggest(
      { title: inc.title, description: inc.description, categoryCode: inc.categoryCode, serviceId: inc.serviceId },
      (await this.repo.findSolved()).filter((s) => s.id !== inc.id),
    );
    return { duplicates, correlations, linked, suggestedResolutions };
  }

  async recommendTechnicians(user: User, id: string) {
    const inc = await this.loadVisible(user, id);
    this.d.access.assertAssigneeOrSupervisor(user, inc);
    const candidates = await this.buildCandidates(inc);
    return {
      activeStrategy: this.d.assignment.active.key,
      recommendations: this.d.assignment.get('SMART').rank(this.context(inc), candidates),
      unavailable: candidates
        .filter((c) => !c.technician.isAvailable || !c.technician.canTakeMore(c.activeWorkload))
        .map((c) => ({
          technicianId: c.technician.id,
          technicianName: c.technician.name,
          reason: !c.technician.isAvailable ? 'Unavailable' : `Workload limit reached (${c.activeWorkload}/${c.technician.maxWorkload})`,
        })),
    };
  }

  // ================================================================ commands

  private async act(user: User, id: string, fn: (inc: Incident) => void | Promise<void>) {
    const inc = await this.loadVisible(user, id);
    await fn(inc);
    await this.commit(inc);
    return this.view(user, inc);
  }

  update(user: User, id: string, changes: { title?: string; description?: string; impact?: Level; urgency?: Level; affectedUsers?: number }) {
    return this.act(user, id, async (inc) => {
      this.d.access.assertCanEdit(user, inc);
      const { priorityInputsChanged } = inc.updateDetails(user.toActor(), changes);
      if (priorityInputsChanged) await this.recalculatePriority(inc, user);
    });
  }

  classify(user: User, id: string, categoryCode: string) {
    return this.act(user, id, async (inc) => {
      this.d.access.assertAssigneeOrSupervisor(user, inc);
      const cat = await this.d.repos.categories.findById(categoryCode.toUpperCase());
      if (!cat || !cat.isActive) throw new ValidationError(`Unknown incident category ${categoryCode}`);
      inc.classify(cat.code, user.toActor());
    });
  }

  assign(user: User, id: string, technicianId?: string) {
    return this.act(user, id, async (inc) => {
      this.d.access.assertCanAssign(user);
      if (!technicianId) {
        const { chosen } = await this.autoAssign(inc);
        if (!chosen) throw new TechnicianUnavailableError('No technician is currently available for this incident');
        return;
      }
      const tech = await this.d.repos.users.findById(technicianId);
      if (!tech) throw new UserNotFoundError(technicianId);
      if (!isTechnician(tech)) throw new ValidationError(`${tech.name} is not a technician`);
      if (!tech.isAvailable) throw new TechnicianUnavailableError(`${tech.name} is currently unavailable`);
      const load = (await this.repo.activeWorkload()).get(tech.id) ?? 0;
      if (!tech.canTakeMore(load)) throw new WorkloadExceededError(tech.name, load, tech.maxWorkload);
      inc.assignTo({ id: tech.id, name: tech.name }, user.toActor(), `manual assignment by ${user.name}`);
    });
  }

  acknowledge(user: User, id: string) {
    return this.act(user, id, (inc) => {
      this.d.access.assertAssignee(user, inc);
      inc.acknowledge(user.toActor());
    });
  }

  startWork(user: User, id: string) {
    return this.act(user, id, (inc) => {
      this.d.access.assertAssignee(user, inc);
      inc.startWork(user.toActor());
    });
  }

  addNote(user: User, id: string, text: string, kind: 'INVESTIGATION' | 'COMMENT' = 'COMMENT') {
    return this.act(user, id, (inc) => {
      const staffWorking = this.d.access.isAssignee(user, inc) || this.d.access.isSupervisor(user);
      const type = kind === 'INVESTIGATION' && staffWorking ? NoteType.INVESTIGATION : NoteType.COMMENT;
      inc.addNote(user.toActor(), text, type);
    });
  }

  requestInfo(user: User, id: string, question: string) {
    return this.act(user, id, (inc) => {
      this.d.access.assertAssignee(user, inc);
      inc.requestInfo(user.toActor(), question);
    });
  }

  provideInfo(user: User, id: string, answer: string) {
    return this.act(user, id, (inc) => {
      this.d.access.assertReporter(user, inc);
      inc.provideInfo(user.toActor(), answer);
    });
  }

  resolve(user: User, id: string, summary: string, rootCause: string) {
    return this.act(user, id, (inc) => {
      this.d.access.assertAssigneeOrSupervisor(user, inc);
      inc.resolve(user.toActor(), summary, rootCause);
    });
  }

  verify(user: User, id: string) {
    return this.act(user, id, (inc) => {
      this.d.access.assertReporter(user, inc);
      inc.verify(user.toActor());
    });
  }

  reopen(user: User, id: string, reason: string) {
    return this.act(user, id, (inc) => {
      if (!inc.isReporter(user.id) && !this.d.access.isSupervisor(user)) throw new AuthorizationError('Only the reporter or a supervisor can reopen');
      inc.reopen(user.toActor(), reason);
    });
  }

  async close(user: User, id: string, closureCode?: string) {
    const view = await this.act(user, id, (inc) => {
      this.d.access.assertCanClose(user, inc);
      inc.close(user.toActor(), closureCode);
    });
    await this.retrainClassifier(); // the knowledge base grows with every closed incident
    return view;
  }

  feedback(user: User, id: string, rating: number, comment: string) {
    return this.act(user, id, (inc) => {
      this.d.access.assertReporter(user, inc);
      inc.submitFeedback(user.toActor(), rating, comment);
    });
  }

  markDuplicate(user: User, id: string, parentId: string) {
    return this.act(user, id, async (inc) => {
      if (!this.d.access.isSupervisor(user) && !this.d.access.isAssignee(user, inc)) {
        throw new AuthorizationError('Only the assignee or a supervisor can link incidents');
      }
      await this.load(parentId); // must exist
      inc.markDuplicateOf(parentId, user.toActor());
    });
  }

  /** Technician's own queue and capacity. */
  async myWorkload(user: User) {
    if (!isTechnician(user)) throw new AuthorizationError('Only technicians have a workload');
    const page = await this.repo.search({ technicianId: user.id, activeOnly: true, sortBy: 'priority', pageSize: 200 });
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    page.items.forEach((i) => {
      byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
      byPriority[i.priority ?? 'NONE'] = (byPriority[i.priority ?? 'NONE'] ?? 0) + 1;
    });
    const resolved = (await this.repo.findSolved(2000)).filter((i) => i.resolution?.resolvedById === user.id);
    return {
      technician: user.toPublic(),
      active: page.total,
      capacity: user.maxWorkload,
      utilisationPct: Math.round((page.total / user.maxWorkload) * 100),
      byStatus,
      byPriority,
      resolvedTotal: resolved.length,
      awaitingAcknowledgement: page.items.filter((i) => i.status === IncidentStatus.ASSIGNED).length,
      incidents: page.items.map((i) => this.view(user, i)),
    };
  }
}
