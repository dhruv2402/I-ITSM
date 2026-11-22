# I-ITSM — Demo Video Script (15–20 minutes) — Group 44

File name for upload: **`44_OOP_S1_2026-2027_Project`** (the brief's example uses "1_OOP_S1_2025-2026_Project"; confirm the year string with your instructor).

| Speaker | ID | Module |
|---|---|---|
| Dhruv Chaudhary | 2024B3A70624H | Domain model & OOP, design patterns, intelligent features |
| Gurveer Singh Gulati | 2024B3A70627H | Backend REST API, security, SLA monitoring, testing |
| Sela Kartikeya | 2024B4A70769H | Database (MongoDB Atlas), cloud deployment (Render) |
| Nayan Sanjay Kasera | 2024B5A71012H | Frontend UI/UX, dashboards, real-time notifications |

## Before recording (10 minutes)

1. **Fresh demo data** (so the escalation happens on camera). On the hotspot (the campus LAN blocks the MongoDB port):
   ```powershell
   npm.cmd run seed --prefix backend
   ```
   The seeded P1 incident INC1037 escalates automatically ~5 minutes after seeding, so start recording within a few minutes.
2. **Use the live site**: https://i-itsm-jy6e.onrender.com (open it once a minute before recording to wake the free instance). It reads the freshly seeded Atlas data.
3. Open three browser windows (one normal + two private) logged in as **Employee** `employee@itsm.demo`, **Technician / Support Engineer** `technician@itsm.demo` (or `teamlead@itsm.demo`), **Administrator / IT Manager** `admin@itsm.demo`. Password `Password@123`.
4. Optional: if Gmail is configured in Render → Environment, open the inbox in another tab.

## Timeline

| Time | Speaker | What to show / say |
|---|---|---|
| 0:00–1:30 | All | Each member introduces themselves and their module (required by the brief), in the order of the table above. |
| 1:30–3:00 | Dhruv | Problem and solution: architecture (report Fig. 3.1), lifecycle state diagram (Fig. 4.8). "Three portals for three user types", deployed on Render with MongoDB Atlas. |
| 3:00–7:00 | Nayan + Dhruv | **Workflow 1 – Employee reports → system prioritises → technician assigned → notification.** As employee: Report an incident → title "Checkout page not loading for customers", description "Customers cannot complete payment, the checkout page times out", service *Payment Gateway*, impact 4, urgency 4, users 500. While typing, Dhruv explains the **Live analysis**: suggested category APPLICATION, expected P1, *Possibly already reported INC1037*, *Known fixes*. Submit → confirmation: category (AI), P1 score, Payments P1 SLA 5/20 min, technician chosen by the Smart strategy, related INC1037. Switch to the assignee's window: **toast notification** + bell. Admin → Strategies & system → **notification delivery log** (IN_APP / EMAIL / SMS). |
| 7:00–11:00 | Gurveer | **Workflow 2 – Technician investigates → SLA monitored → resolved → user notified.** As the assigned technician (or team lead) open the new incident: priority rationale, SLA panel (deadlines, % used). **Acknowledge** (response time recorded) → **Start** → add investigation note → **Request info** ("Which browser / error code?") — status PENDING INFO, *SLA paused*. As employee: home shows "needs your action" → **Provide information**. Technician: intelligence panel → *Suggested resolutions from history* → **Resolve** with summary + root cause. Employee gets a notification → **Confirm & rate** (5★) → technician **Close**. Show the **audit trail** (timestamp, user, action, previous → new state). Explain that NEW → CLOSED is blocked by the State pattern (invalid transition). |
| 11:00–14:30 | Dhruv + Sela | **Workflow 3 – Multiple incidents → duplicates/related → correlated/escalated.** As employee `priya@itsm.demo` report "Payment transaction failing" on Payment Gateway → linked as duplicate of INC1037; team lead receives a "possible duplicate" notification. Admin → **SLA & correlations**: *Shared dependency: Core Database Cluster* (ERP + HR + DB + Payment incidents → probable root cause) and *Same service: Payment Gateway*. **Predicted SLA risk** with reasons. **Escalation**: INC1037 / INC1044 show *Escalated L1–L3*, notifications to team lead, admin and IT manager, SLA violations table. Optionally click **Run SLA monitor now**. |
| 14:30–16:30 | Nayan + Sela | Admin console: Operations dashboard (KPIs, trend, priority mix, technician workload, service health), Reports, **CSV export**, Users & technicians, IT services with dependencies, add a new category **TELEPHONY** live and show it suggested on the report form (extensibility), SLA policies (Payments override), switch assignment strategy to **Load-based** (Strategy pattern at runtime). Sela shows the MongoDB Atlas collections and the Render dashboard (live service, logs, auto-deploy from GitHub). |
| 16:30–18:30 | Dhruv + Gurveer | Code walkthrough (IDE): `Incident.ts` + `IncidentState.ts` (State), `strategies/` (Strategy + Template Method), `EventBus` + subscribers (Observer), `UserFactory`/`NotificationFactory` (Factory), `persistence/` (Repository, generics), `GmailSmtpAdapter` (Adapter), `errors.ts` (exception hierarchy), `container.ts` (DI). Gurveer: JWT, bcrypt, RBAC (`IncidentAccessPolicy`), zod validation. |
| 18:30–19:30 | Gurveer | Run `npm.cmd test --prefix backend` → 45 tests passing; mention unit / integration / MongoDB tests and edge cases. |
| 19:30–20:00 | All | Wrap-up: innovation items (AI classification, root-cause analysis, predictive SLA, real-time dashboard, escalation, cloud deployment + cloud DB, Gmail integration). |

## Tips
* Keep each workflow continuous; cut while waiting for anything slow.
* Zoom the browser to 110–125 % so text is readable in the recording.
* If Gmail is not configured, e-mails show as "SIMULATED" in the delivery log; say so explicitly (the brief allows simulation).
