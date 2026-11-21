# I-ITSM — Demo Video Script (15–20 minutes)

File name for upload: **`[GroupNo]_OOP_S1_2026-2027_Project`** (the brief's example uses "1_OOP_S1_2025-2026_Project"; use your group number and confirm the year string with your instructor).

## Before recording (10 minutes)

1. `backend/.env`: set `MONGODB_URI` (Atlas), `SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM` (Gmail app password) and `EMAIL_OVERRIDE_RECIPIENT` (an inbox you can show on screen).
2. Reset the demo data so the timings are fresh: `cd backend && npm run seed`, then `npm run dev`. In a second terminal `cd frontend && npm run dev`.
   *The seeded P1 incident INC1037 escalates automatically ~5 minutes after seeding, so start recording within a few minutes.*
3. Open three browser windows (or one normal + two private windows) logged in as:
   **Employee** `employee@itsm.demo`, **Technician / Team Lead** `teamlead@itsm.demo` (and `technician@itsm.demo`), **Admin** `admin@itsm.demo`. Password `Password@123`.
4. Open the Gmail inbox in another tab.

## Timeline

| Time | Speaker | What to show / say |
|---|---|---|
| 0:00–1:30 | All | Each member introduces themselves and their module (required by the brief). [Member 1] domain/OOP, [Member 2] API/security, [Member 3] database, [Member 4] UI, [Member 5] intelligence/testing. |
| 1:30–3:00 | [Member 1] | Problem and solution in one slide/diagram: architecture (report Fig. 3.1), lifecycle state diagram (Fig. 4.8). "Three portals for three user types." |
| 3:00–7:00 | [Member 4] + [Member 5] | **Workflow 1 – Employee reports → system prioritises → technician assigned → notification.** As employee: Report an incident → title "Checkout page not loading for customers", description "Customers cannot complete payment, the checkout page times out", service *Payment Gateway*, impact 4, urgency 4, users 500. While typing point at **Live analysis**: suggested category APPLICATION, expected P1, *Possibly already reported INC1037*, *Known fixes*. Submit → confirmation: category (AI), P1 score, Payments P1 SLA 5/20 min, technician chosen by the Smart strategy, related INC1037. Switch to the assignee's window: **toast notification** + bell. Show Gmail inbox: real e-mail received. Admin → Strategies & system → **notification delivery log** (IN_APP / EMAIL SENT / SMS SIMULATED). |
| 7:00–11:00 | [Member 2] + [Member 5] | **Workflow 2 – Technician investigates → SLA monitored → resolved → user notified.** As the assigned technician (or team lead) open the new incident: priority rationale, SLA panel (deadlines, % used). **Acknowledge** (response time recorded) → **Start** → add investigation note → **Request info** ("Which browser / error code?") — status PENDING INFO, *SLA paused*. As employee: home shows "needs your action" → **Provide information**. Technician: intelligence panel → *Suggested resolutions from history* → **Resolve** with summary + root cause. Employee gets notification + e-mail → **Confirm & rate** (5★) → technician **Close**. Show the **audit trail** table (timestamp, user, action, previous → new state). Try **Close** on a NEW incident via API/explain: blocked by the State pattern (invalid transition). |
| 11:00–14:30 | [Member 3] + [Member 5] | **Workflow 3 – Multiple incidents → duplicates/related → correlated/escalated.** As employee `priya@itsm.demo` report "Payment transaction failing" on Payment Gateway → linked as duplicate of INC1037; team lead receives "possible duplicate" notification. Admin → **SLA & correlations**: *Shared dependency: Core Database Cluster* (ERP + HR + DB + Payment incidents → probable root cause) and *Same service: Payment Gateway*. **Predicted SLA risk** list with reasons. **Escalation**: INC1037 / INC1044 show *Escalated L1–L3*, notifications to team lead, admin and IT manager (log in as manager to show the bell), SLA violations table. Optionally click **Run SLA monitor now**. |
| 14:30–16:30 | [Member 1] + [Member 3] | Admin console: Operations dashboard (KPIs, trend, priority mix, technician workload, service health), Reports (technician performance, service analysis), **CSV export**, Users & technicians (skills, capacity, availability), IT services with dependencies, add a new category **TELEPHONY** live and show it suggested immediately on the report form (extensibility), SLA policies (Payments override), switch assignment strategy to **Load-based** (Strategy pattern at runtime). Mention MongoDB Atlas collections (show Atlas UI briefly). |
| 16:30–18:30 | [Member 1] + [Member 2] | Code walkthrough (IDE): `Incident.ts` + `IncidentState.ts` (State), `strategies/` (Strategy + Template Method), `EventBus` + subscribers (Observer), `UserFactory`/`NotificationFactory` (Factory), `persistence/` (Repository, generics), `GmailSmtpAdapter` (Adapter), `errors.ts` (exception hierarchy), `container.ts` (DI). Security: JWT, bcrypt, RBAC (`IncidentAccessPolicy`), zod validation. |
| 18:30–19:30 | [Member 5] | Run `npm test` → 45 tests passing; mention unit / integration / MongoDB tests and edge cases. |
| 19:30–20:00 | All | Wrap-up: innovation items (AI classification, root-cause analysis, predictive SLA, real-time dashboard, escalation, cloud DB, Gmail integration). |

## Tips
* Keep each workflow continuous; if something takes time (e-mail delivery), cut while waiting.
* Zoom the browser to 110–125 % so text is readable in the recording.
* If Gmail is not configured, e-mails show as "SIMULATED" in the delivery log; say so explicitly.
