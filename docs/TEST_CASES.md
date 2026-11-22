# I-ITSM — Test Cases

Automated with **Jest + ts-jest**, **Supertest** (REST API) and **mongodb-memory-server** (real MongoDB).
Run: `cd backend && npm test` (coverage: `npm run test:coverage`).

**Latest result (22 Nov 2026): Test Suites 8 passed · Tests 47 passed, 47 total.**

| Suite | File | Tests |
|---|---|---|
| Priority determination | `tests/unit/priority.test.ts` | 6 |
| Incident lifecycle & SLA tracker | `tests/unit/lifecycle.test.ts` | 9 |
| Technician assignment | `tests/unit/assignment.test.ts` | 6 |
| Intelligent features | `tests/unit/intelligence.test.ts` | 7 |
| SLA monitor & escalation | `tests/unit/slaMonitor.test.ts` | 3 |
| REST API integration | `tests/integration/api.test.ts` | 13 |
| MongoDB repositories | `tests/integration/mongo.test.ts` | 1 |

Demo data used by the tests is the automatic seed (`backend/src/seed/seedData.ts`): users E1001–E1003, T1001–T1006, A1001–A1002, incidents INC1001–INC1045.

## Documented test cases

| ID | Category | Description | Preconditions / input | Steps | Expected result | Automated test | Status |
|---|---|---|---|---|---|---|---|
| TC01 | Normal operation | Critical outage is prioritised P1 | Impact 4, urgency 4, criticality 4, 800 of 2000 users | `WeightedPriorityStrategy.calculate()` | P1, score ≥ 75, rationale non-empty | priority › TC01 | Pass |
| TC02 | Normal operation | Minor issue is prioritised P4 | Impact 1, urgency 1, criticality 2, 1 user | calculate | P4 | priority › TC02 | Pass |
| TC03 | Boundary | Matrix thresholds | Scores 36, 27, 8, 6 | `MatrixPriorityStrategy.calculate()` | P1, P2, P3, P4 | priority › TC03 | Pass |
| TC04 | Normal operation | Complete lifecycle | New incident | classify → priority → SLA → assign → acknowledge → start → resolve → verify → close | Status CLOSED, events CREATED/ASSIGNED/RESOLVED/CLOSED, events drained once | lifecycle › TC04 | Pass |
| TC05 | Business rule | Illegal transition NEW → CLOSED | Incident in NEW | `close()`, `resolve()` | `InvalidStateTransitionError`, state still NEW | lifecycle › TC05 | Pass |
| TC06 | Invalid input | Domain validation | Title "abc"; impact 5 | `Incident.create()` | `ValidationError` | lifecycle › TC06 | Pass |
| TC07 | Boundary | SLA warning and breach | P1 policy 5/30 min, clock +23 min (76 %) | `flagSlaWarning()` twice, `flagSlaBreaches()` | Exactly one warning; status BREACHED; response breach flagged | lifecycle › TC07 | Pass |
| TC08 | Normal operation | Skill-based assignment | 2 DB technicians (load 3 and 1) + network engineer | `SkillBasedStrategy.rank()` | Only DB technicians, least loaded first | assignment › TC08 | Pass |
| TC09 | Boundary | Unavailable / full technicians | Unavailable tech; tech with load = max (3/3) and load 2/3 | rank / select | 3/3 and unavailable excluded; 2/3 selected | assignment › TC09 | Pass |
| TC10 | Intelligent feature | Duplicate detection (brief example) | Open "Payment application unavailable" on SVC-PAY | Detect "Payment transaction failing" | INC101 returned, same service | intelligence › TC10 | Pass |
| TC11 | Intelligent feature | Category suggestion | Keyword lists + 2 training samples | Suggest for password / wifi / gibberish | AUTHENTICATION, NETWORK, null | intelligence › TC11 | Pass |
| TC12 | Intelligent feature | Root-cause correlation | ERP→DB, HR→DB, DB→NET; incidents on ERP, HR, DB | `CorrelationEngine.correlate()` | One shared-dependency cluster, root cause DB (not NET) | intelligence › TC12 | Pass |
| TC13 | Business rule | Automatic escalation | Unacknowledged P1 on SVC-AUTH | Clock +6 min, run monitor; +10 min, run monitor | Response breach, escalation level 3, IT manager notified in-app, e-mail sent | slaMonitor › TC13 | Pass |
| TC14 | Exception | Invalid login | Wrong password; unknown e-mail | `POST /api/auth/login` | 401 `INVALID_LOGIN`, identical messages | api › TC14 | Pass |
| TC15 | Authorization | Role-based access | Employee and technician tokens | GET /admin/users, /reports/overview, /incidents/INC1038; PUT /admin/settings | 403 for each; employee search returns only own incidents | api › TC15 | Pass |
| TC16 | Integration | Workflows 1 + 2 end-to-end | Employee Rohan | Report HR login problem → technician acknowledges, starts, notes, requests info → employee answers → resolve → feedback → close | Auto category AUTHENTICATION, priority + SLA set, assigned, assignee notified, CLOSED; audit has previous/new state | api › TC16 | Pass |
| TC17 | Exception | Invalid transition through API | INC1043 CLASSIFIED (unassigned) | POST /incidents/INC1043/resolve | 409 `INVALID_STATE_TRANSITION` | api › TC17 | Pass |
| TC18 | Integration | Workflow 3 duplicates & correlation | INC1037 open on SVC-PAY | Priya reports "Payment transaction failing" | Duplicate of INC1037; SAME_SERVICE cluster on SVC-PAY | api › TC18 | Pass |
| TC19 | Persistence | MongoDB repositories | In-process mongod | Seed, find, search, aggregate workload, nextId, audit search | Round-trip intact; T1003 workload 2; next id INC1046 | mongo › TC19 | Pass |
| TC20 | Business rule | Same reporter resubmits | Employee | Submit identical incident twice | 2nd: 409 `DUPLICATE_INCIDENT` | api › same reporter… | Pass |
| TC21 | Exception | Technician unavailable / workload exceeded | Rahul unavailable; Sneha max 1 with 3 active | Manual assign INC1043 | 409 `TECHNICIAN_UNAVAILABLE`, 409 `TECHNICIAN_WORKLOAD_EXCEEDED`; then Arjun OK | api › manual assignment… | Pass |
| TC22 | Invalid input | API validation & not found | Bad body; SVC-NOPE; INC9999 | POST /incidents; GET /incidents/INC9999 | 400 with field details; 404 `SERVICE_NOT_FOUND`; 404 | api › invalid input… | Pass |
| TC23 | Normal operation | Multi-criteria search | Seeded data | status+priority+service+sort; slaStatus=BREACHED; text+technician | Only matching incidents; INC1044 breached; INC1045 found | api › search… | Pass |
| TC24 | Extensibility | New category & SLA validation | Admin | Add TELEPHONY; analyze "desk phone"; duplicate default P1 policy; resolution < response | Suggestion TELEPHONY; 409; 400 | api › admin can add… | Pass |
| TC25 | Boundary | Feedback rating limits | Resolved incident | Rating 0, 6, before resolution, then 5 | Rejected ×3; 5 accepted, status VERIFIED | lifecycle › feedback boundary | Pass |
| TC26 | Business rule | SLA pause while pending info | In progress P1 | requestInfo, +60 min, provideInfo | Status PAUSED during wait; deadline 10:30 → 11:30 | lifecycle › SLA clock pauses | Pass |
| TC27 | Exception | Missing SLA configuration | All SLA policies deleted | Create incident | Incident created with no SLA; `SLA_MISSING` audited (admins alerted) | slaMonitor › missing SLA | Pass |
| TC28 | Authentication | Missing / forged token | — | GET /incidents without token, with forged token | 401 | api › requests without a token | Pass |
| TC29 | Security | Registration rules | — | Weak password; valid; duplicate e-mail | 400; 201 role EMPLOYEE, no passwordHash in response; 409 | api › registration… | Pass |
| TC30 | Business rule | Escalation stops when acknowledged | P1 on SVC-DB acknowledged | Clock +12 min, run monitor | escalationLevel 0 | slaMonitor › acknowledged… | Pass |
| TC31 | Non-functional | Slow e-mail provider never blocks the user | E-mail gateway taking 1.5 s | Create incident; then wait for background deliveries | Request returns in < 1 s; in-app notification immediate; e-mail logged as SENT later | notifications › slow e-mail provider | Pass |
| TC32 | Exception | E-mail provider failure | Gateway throws "connection timeout" | Create incident | Incident created; e-mail delivery logged as FAILED with the error | notifications › failing e-mail provider | Pass |

## Manual UI test checklist (performed in the browser)

| # | Scenario | Result |
|---|---|---|
| M1 | Login with demo account quick-fill; wrong password shows error | Pass |
| M2 | Employee home shows "needs your action" for PENDING_INFO and RESOLVED incidents | Pass |
| M3 | Report form live analysis: category 88 %, expected P1, duplicate INC1037, known fixes | Pass |
| M4 | Submit → confirmation with category, priority, SLA, technician, related reports | Pass |
| M5 | Technician: Acknowledge → response time recorded; Start → IN PROGRESS; Resolve dialog | Pass |
| M6 | Admin dashboard KPIs and charts, SLA centre correlations, strategies page, reports — no console errors | Pass |
| M7 | Real-time toast appears for the assignee when a new incident is assigned | Pass |
