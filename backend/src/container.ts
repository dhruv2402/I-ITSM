import { EventBus } from './domain/events/EventBus';
import { CategoryClassifier } from './intelligence/CategoryClassifier';
import { CorrelationEngine } from './intelligence/CorrelationEngine';
import { DuplicateDetector } from './intelligence/DuplicateDetector';
import { ResolutionRecommender } from './intelligence/ResolutionRecommender';
import { SlaRiskPredictor } from './intelligence/SlaRiskPredictor';
import { ConsoleEmailAdapter, EmailGateway } from './notification/adapters/EmailGateway';
import { SimulatedSmsGateway, SmsGateway } from './notification/adapters/SmsGateway';
import { PriorityBasedChannelPolicy } from './notification/ChannelSelectionPolicy';
import { NotificationFactory } from './notification/NotificationFactory';
import { NotificationService } from './notification/NotificationService';
import { RealtimeHub } from './notification/RealtimeHub';
import { Repositories } from './persistence/repositories';
import { AuthService } from './services/AuthService';
import { CatalogService } from './services/CatalogService';
import { IncidentAccessPolicy } from './services/IncidentAccessPolicy';
import { IncidentService } from './services/IncidentService';
import { ReportService } from './services/ReportService';
import { SettingsService } from './services/SettingsService';
import { UserService } from './services/UserService';
import { EscalationService } from './sla/EscalationService';
import { SlaMonitor } from './sla/SlaMonitor';
import { SlaService } from './sla/SlaService';
import { AssignmentStrategyRegistry } from './strategies/assignment/AssignmentStrategyRegistry';
import { PriorityCalculator } from './strategies/priority/PriorityCalculator';
import { AuditTrailSubscriber } from './subscribers/AuditTrailSubscriber';
import { NotificationSubscriber } from './subscribers/NotificationSubscriber';
import { RealtimeSubscriber } from './subscribers/RealtimeSubscriber';

export interface ContainerOptions {
  repos: Repositories;
  email?: EmailGateway;
  sms?: SmsGateway;
  jwtSecret: string;
  tokenTtlSeconds: number;
}

/**
 * Composition root: the single place where concrete classes are chosen and
 * wired together (manual dependency injection). Everything else depends on
 * abstractions, which is what lets tests swap MongoDB for in-memory storage
 * and Gmail for a console adapter.
 */
export function buildContainer(o: ContainerOptions) {
  const repos = o.repos;
  const bus = new EventBus();
  const hub = new RealtimeHub();
  const email = o.email ?? new ConsoleEmailAdapter();
  const sms = o.sms ?? new SimulatedSmsGateway();

  const priority = new PriorityCalculator();
  const assignment = new AssignmentStrategyRegistry();
  const slaService = new SlaService(repos.slaPolicies);
  const escalation = new EscalationService();
  const classifier = new CategoryClassifier();
  const duplicates = new DuplicateDetector();
  const resolutions = new ResolutionRecommender();
  const correlation = new CorrelationEngine();
  const risk = new SlaRiskPredictor();
  const access = new IncidentAccessPolicy();

  const notificationFactory = new NotificationFactory({ hub, email, sms });
  const notifications = new NotificationService(notificationFactory, new PriorityBasedChannelPolicy(), repos.notifications);

  // Observer wiring: the incident workflow never calls these directly.
  bus.subscribe(new AuditTrailSubscriber(repos.audit));
  bus.subscribe(new NotificationSubscriber(repos.users, notifications));
  bus.subscribe(new RealtimeSubscriber(hub));

  const auth = new AuthService(repos.users, repos.sequences, bus, o.jwtSecret, o.tokenTtlSeconds);
  const users = new UserService(repos.users, repos.incidents, repos.sequences, bus);
  const catalog = new CatalogService(repos.services, repos.categories, repos.slaPolicies, bus);
  const settings = new SettingsService(repos.settings, assignment, priority, bus);
  const incidents = new IncidentService({ repos, bus, priority, assignment, sla: slaService, classifier, duplicates, resolutions, correlation, access });
  const reports = new ReportService(repos, risk, correlation);
  const slaMonitor = new SlaMonitor(repos.incidents, escalation, bus);

  return { repos, bus, hub, email, sms, priority, assignment, classifier, access, auth, users, catalog, settings, incidents, reports, slaMonitor, notifications };
}

export type Container = ReturnType<typeof buildContainer>;
