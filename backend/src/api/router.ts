import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Container } from '../container';
import { Permission } from '../domain/enums';
import { IncidentStates } from '../domain/incident/IncidentState';
import { authenticate, compact, currentUser, handle, parse, requirePermission } from './middleware';
import * as S from './schemas';

/** REST API (all routes under /api). Controllers are thin: parse -> call service -> return JSON. */
export function buildRouter(c: Container): Router {
  const r = Router();
  const auth = authenticate(c.auth);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many login attempts, try again in 15 minutes' } },
  });

  r.get('/health', (_req, res) => {
    res.json({ status: 'ok', storage: c.repos.kind, email: c.email.provider, time: new Date().toISOString() });
  });

  // ------------------------------------------------------------------ auth
  r.post('/auth/register', loginLimiter, handle(async (req, res) => {
    const { user, token } = await c.auth.register(parse(S.registerSchema, req.body));
    res.status(201).json({ token, user: user.toPublic() });
  }));
  r.post('/auth/login', loginLimiter, handle(async (req, res) => {
    const b = parse(S.loginSchema, req.body);
    const { user, token } = await c.auth.login(b.email, b.password);
    res.json({ token, user: user.toPublic() });
  }));
  r.get('/auth/me', auth, handle(async (req, res) => {
    res.json({ user: currentUser(req).toPublic() });
  }));
  r.post('/auth/change-password', auth, handle(async (req, res) => {
    const b = parse(S.changePasswordSchema, req.body);
    await c.auth.changePassword(currentUser(req), b.currentPassword, b.newPassword);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------------ reference data (any logged-in user)
  r.get('/services', auth, handle(async (_req, res) => {
    res.json((await c.catalog.listServices()).map((s) => s.toSnapshot()));
  }));
  r.get('/categories', auth, handle(async (_req, res) => {
    res.json((await c.catalog.listCategories()).map((x) => x.toSnapshot()));
  }));
  r.get('/sla-policies', auth, handle(async (_req, res) => {
    res.json((await c.catalog.listSlaPolicies()).map((p) => p.toSnapshot()));
  }));
  r.get('/lifecycle', auth, (_req, res) => {
    res.json(IncidentStates.transitionTable());
  });

  // ------------------------------------------------------------------ incidents
  r.post('/incidents/analyze', auth, handle(async (req, res) => {
    res.json(await c.incidents.analyzeDraft(parse(S.analyzeSchema, req.body)));
  }));
  r.post('/incidents', auth, handle(async (req, res) => {
    res.status(201).json(await c.incidents.create(currentUser(req), parse(S.createIncidentSchema, req.body)));
  }));
  r.get('/incidents', auth, handle(async (req, res) => {
    res.json(await c.incidents.search(currentUser(req), compact(parse(S.searchSchema, req.query))));
  }));
  r.get('/incidents/export.csv', auth, requirePermission(Permission.REPORT_VIEW), handle(async (req, res) => {
    const csv = await c.reports.exportCsv(currentUser(req), compact(parse(S.searchSchema, req.query)));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="incidents.csv"');
    res.send(csv);
  }));
  r.get('/incidents/:id', auth, handle(async (req, res) => {
    res.json(await c.incidents.get(currentUser(req), req.params.id));
  }));
  r.patch('/incidents/:id', auth, handle(async (req, res) => {
    res.json(await c.incidents.update(currentUser(req), req.params.id, compact(parse(S.updateIncidentSchema, req.body))));
  }));
  r.get('/incidents/:id/audit', auth, handle(async (req, res) => {
    res.json(await c.incidents.auditTrail(currentUser(req), req.params.id));
  }));
  r.get('/incidents/:id/related', auth, handle(async (req, res) => {
    res.json(await c.incidents.related(currentUser(req), req.params.id));
  }));
  r.get('/incidents/:id/recommendations', auth, handle(async (req, res) => {
    res.json(await c.incidents.recommendTechnicians(currentUser(req), req.params.id));
  }));
  r.post('/incidents/:id/classify', auth, handle(async (req, res) => {
    res.json(await c.incidents.classify(currentUser(req), req.params.id, parse(S.classifySchema, req.body).categoryCode));
  }));
  r.post('/incidents/:id/assign', auth, handle(async (req, res) => {
    res.json(await c.incidents.assign(currentUser(req), req.params.id, parse(S.assignSchema, req.body ?? {}).technicianId));
  }));
  r.post('/incidents/:id/acknowledge', auth, handle(async (req, res) => {
    res.json(await c.incidents.acknowledge(currentUser(req), req.params.id));
  }));
  r.post('/incidents/:id/start', auth, handle(async (req, res) => {
    res.json(await c.incidents.startWork(currentUser(req), req.params.id));
  }));
  r.post('/incidents/:id/notes', auth, handle(async (req, res) => {
    const b = parse(S.noteSchema, req.body);
    res.json(await c.incidents.addNote(currentUser(req), req.params.id, b.text, b.kind));
  }));
  r.post('/incidents/:id/request-info', auth, handle(async (req, res) => {
    res.json(await c.incidents.requestInfo(currentUser(req), req.params.id, parse(S.questionSchema, req.body).text));
  }));
  r.post('/incidents/:id/provide-info', auth, handle(async (req, res) => {
    res.json(await c.incidents.provideInfo(currentUser(req), req.params.id, parse(S.questionSchema, req.body).text));
  }));
  r.post('/incidents/:id/resolve', auth, handle(async (req, res) => {
    const b = parse(S.resolveSchema, req.body);
    res.json(await c.incidents.resolve(currentUser(req), req.params.id, b.summary, b.rootCause));
  }));
  r.post('/incidents/:id/verify', auth, handle(async (req, res) => {
    res.json(await c.incidents.verify(currentUser(req), req.params.id));
  }));
  r.post('/incidents/:id/reopen', auth, handle(async (req, res) => {
    res.json(await c.incidents.reopen(currentUser(req), req.params.id, parse(S.reasonSchema, req.body).reason));
  }));
  r.post('/incidents/:id/close', auth, handle(async (req, res) => {
    res.json(await c.incidents.close(currentUser(req), req.params.id, parse(S.closeSchema, req.body ?? {}).closureCode));
  }));
  r.post('/incidents/:id/feedback', auth, handle(async (req, res) => {
    const b = parse(S.feedbackSchema, req.body);
    res.json(await c.incidents.feedback(currentUser(req), req.params.id, b.rating, b.comment));
  }));
  r.post('/incidents/:id/duplicate-of', auth, handle(async (req, res) => {
    res.json(await c.incidents.markDuplicate(currentUser(req), req.params.id, parse(S.duplicateSchema, req.body).parentId));
  }));

  // ------------------------------------------------------------------ technicians
  r.get('/technicians', auth, requirePermission(Permission.INCIDENT_ASSIGN, Permission.USER_MANAGE), handle(async (_req, res) => {
    res.json((await c.users.technicians()).map(({ technician, activeWorkload }) => ({ ...technician.toPublic(), activeWorkload })));
  }));
  r.get('/technicians/me/workload', auth, handle(async (req, res) => {
    res.json(await c.incidents.myWorkload(currentUser(req)));
  }));
  r.put('/technicians/me/availability', auth, handle(async (req, res) => {
    const u = await c.users.setMyAvailability(currentUser(req), parse(S.availabilitySchema, req.body).available);
    res.json(u.toPublic());
  }));

  // ------------------------------------------------------------------ notifications
  r.get('/notifications', auth, handle(async (req, res) => {
    const list = await c.repos.notifications.findForUser(currentUser(req).id, { limit: 50 });
    res.json({ items: list, unread: list.filter((n) => !n.read).length });
  }));
  r.post('/notifications/read-all', auth, handle(async (req, res) => {
    res.json({ updated: await c.repos.notifications.markAllRead(currentUser(req).id) });
  }));
  r.post('/notifications/:id/read', auth, handle(async (req, res) => {
    res.json({ ok: await c.repos.notifications.markRead(req.params.id, currentUser(req).id) });
  }));
  r.get('/notifications/stream', auth, (req, res) => {
    const disconnect = c.hub.connect(currentUser(req).id, res);
    req.on('close', disconnect);
  });

  // ------------------------------------------------------------------ reports & intelligence
  r.get('/reports/overview', auth, handle(async (req, res) => {
    res.json(await c.reports.overview(currentUser(req)));
  }));
  r.get('/reports/technicians', auth, handle(async (req, res) => {
    res.json(await c.reports.technicianWorkload(currentUser(req)));
  }));
  r.get('/reports/services', auth, handle(async (req, res) => {
    res.json(await c.reports.serviceAnalysis(currentUser(req)));
  }));
  r.get('/reports/trend', auth, handle(async (req, res) => {
    res.json(await c.reports.trend(currentUser(req), Math.min(60, Number(req.query.days ?? 14) || 14)));
  }));
  r.get('/reports/sla-violations', auth, handle(async (req, res) => {
    res.json(await c.reports.slaViolations(currentUser(req)));
  }));
  r.get('/reports/sla-risk', auth, handle(async (req, res) => {
    res.json(await c.reports.slaRisk(currentUser(req)));
  }));
  r.get('/reports/correlations', auth, handle(async (req, res) => {
    res.json(await c.reports.correlations(currentUser(req)));
  }));

  // ------------------------------------------------------------------ administration
  const admin = Router();
  admin.use(auth);
  admin.get('/users', handle(async (req, res) => {
    const role = typeof req.query.role === 'string' ? (req.query.role as never) : undefined;
    res.json((await c.users.list(currentUser(req), role)).map((u) => u.toPublic()));
  }));
  admin.post('/users', handle(async (req, res) => {
    res.status(201).json((await c.users.create(currentUser(req), parse(S.createUserSchema, req.body))).toPublic());
  }));
  admin.patch('/users/:id', handle(async (req, res) => {
    res.json((await c.users.update(currentUser(req), req.params.id, compact(parse(S.updateUserSchema, req.body)))).toPublic());
  }));
  admin.post('/users/:id/reset-password', handle(async (req, res) => {
    await c.users.resetPassword(currentUser(req), req.params.id, parse(S.resetPasswordSchema, req.body).password);
    res.json({ ok: true });
  }));
  admin.post('/services', handle(async (req, res) => {
    res.status(201).json((await c.catalog.createService(currentUser(req), parse(S.serviceSchema, req.body))).toSnapshot());
  }));
  admin.patch('/services/:id', handle(async (req, res) => {
    res.json((await c.catalog.updateService(currentUser(req), req.params.id, compact(parse(S.serviceUpdateSchema, req.body)))).toSnapshot());
  }));
  admin.post('/categories', handle(async (req, res) => {
    res.status(201).json((await c.catalog.createCategory(currentUser(req), parse(S.categorySchema, req.body))).toSnapshot());
  }));
  admin.patch('/categories/:id', handle(async (req, res) => {
    res.json((await c.catalog.updateCategory(currentUser(req), req.params.id, compact(parse(S.categoryUpdateSchema, req.body)))).toSnapshot());
  }));
  admin.post('/sla-policies', handle(async (req, res) => {
    res.status(201).json((await c.catalog.createSlaPolicy(currentUser(req), parse(S.slaPolicySchema, req.body))).toSnapshot());
  }));
  admin.patch('/sla-policies/:id', handle(async (req, res) => {
    res.json((await c.catalog.updateSlaPolicy(currentUser(req), req.params.id, compact(parse(S.slaPolicyUpdateSchema, req.body)))).toSnapshot());
  }));
  admin.delete('/sla-policies/:id', handle(async (req, res) => {
    await c.catalog.deleteSlaPolicy(currentUser(req), req.params.id);
    res.status(204).end();
  }));
  admin.get('/settings', requirePermission(Permission.CONFIG_MANAGE), (_req, res) => {
    res.json(c.settings.current());
  });
  admin.put('/settings', handle(async (req, res) => {
    res.json(await c.settings.update(currentUser(req), compact(parse(S.settingsSchema, req.body))));
  }));
  admin.get('/audit', requirePermission(Permission.AUDIT_VIEW), handle(async (req, res) => {
    res.json(await c.repos.audit.search(compact(parse(S.auditQuerySchema, req.query))));
  }));
  admin.get('/notifications', handle(async (req, res) => {
    res.json(await c.reports.notificationLog(currentUser(req)));
  }));
  admin.post('/sla-monitor/run', requirePermission(Permission.CONFIG_MANAGE), handle(async (_req, res) => {
    res.json(await c.slaMonitor.runOnce());
  }));
  admin.get('/system', requirePermission(Permission.CONFIG_MANAGE), (_req, res) => {
    res.json({
      storage: c.repos.kind,
      emailProvider: c.email.provider,
      emailSimulated: c.email.isSimulated,
      smsProvider: c.sms.provider,
      classifierTrainingSize: c.classifier.trainingSize,
      slaMonitorLastRun: c.slaMonitor.lastRun,
      liveConnections: c.hub.connectedUsers(),
      observers: c.bus.subscriberNames(),
    });
  });
  r.use('/admin', admin);

  return r;
}
