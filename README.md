# I-ITSM — Intelligent IT Service Management & Incident Resolution System

CS F213 / MAC F212 OOP project, Semester I 2026-27 — Group **[Group No.]**

A full-stack TypeScript application covering the complete incident lifecycle:
**Report → Classify → Prioritise → Assign → Investigate → Resolve → Verify → Close**.

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript, React Router, Recharts |
| Backend | Node.js + Express + TypeScript (REST API, JWT auth) |
| Database | MongoDB Atlas (Mongoose) — in-memory fallback for offline demo/tests |
| Notifications | In-app (Server-Sent Events), real e-mail via Gmail SMTP (nodemailer adapter), SMS (simulated adapter) |
| Testing | Jest + ts-jest + Supertest + mongodb-memory-server |

## Quick start

Prerequisite: **Node.js 20+** (22 LTS recommended).

```powershell
cd backend
npm install
copy .env.example .env     # then edit .env (see below)
npm run dev                # API on http://localhost:4000/api
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev                # UI on http://localhost:5173
```

Open http://localhost:5173 and sign in with a demo account (password **`Password@123`**):

| Role | E-mail |
|---|---|
| Employee | employee@itsm.demo (also priya@, rohan@) |
| Technician | technician@itsm.demo (also vikram@, sneha@, kavya@, rahul@) |
| Team Lead | teamlead@itsm.demo |
| Administrator | admin@itsm.demo |
| IT Manager | manager@itsm.demo |

### Configuration (`backend/.env`)

* `MONGODB_URI` — MongoDB Atlas connection string. Empty = in-memory demo mode (data resets on restart). The database is seeded automatically when empty; `npm run seed` resets it.
* `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` — Gmail address + **App password** to send real e-mails. Empty = e-mails are simulated in the console.
* `EMAIL_OVERRIDE_RECIPIENT` — demo users have fake `@itsm.demo` addresses; set this to your own inbox to receive every e-mail during the demo.
* `JWT_SECRET` — long random string.

### Tests

```powershell
cd backend
npm test             # unit + API integration + MongoDB repository tests
npm run test:coverage
```

### Production build (single server)

```powershell
npm run build --prefix frontend
npm run build --prefix backend
npm start --prefix backend   # serves the API and the built React app on :4000
```

## Project structure

```
backend/src
  domain/            entities & business rules (User hierarchy, Incident aggregate, State pattern, SLA tracker, events, errors)
  strategies/        Strategy pattern: priority algorithms, assignment strategies (+ Template Method)
  intelligence/      duplicate detection, NLP category classifier, correlation/root cause, resolution recommender, SLA risk
  notification/      Factory, Adapter (Gmail SMTP / console / SMS), channels, real-time hub
  persistence/       Repository interfaces + MongoDB and in-memory implementations, Specification
  sla/               SLA policy resolution, background SLA monitor, automatic escalation
  subscribers/       Observer pattern: audit trail, notifications, live dashboard
  services/          application services (auth, incidents, users, catalog, settings, reports, access policy)
  api/               Express router, validation (zod), auth middleware, error handler
  container.ts       composition root (dependency injection)
frontend/src         React app: employee portal, support workspace, IT management console
docs/                project report, UML/ER diagrams, test cases, demo video script
```

See `docs/` for the full report (`I-ITSM_Project_Report.pdf`), diagrams, test plan and demo script.
