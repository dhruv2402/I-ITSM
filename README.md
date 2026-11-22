# I-ITSM — Intelligent IT Service Management & Incident Resolution System (Gurveer Did No work)

CS F213 / MAC F212 OOP project, Semester I 2026-27 — **Group 44**: Dhruv Chaudhary (2024B3A70624H), Nayan Sanjay Kasera (ID No. 2024B5A71012H), Gurveer Singh Gulati (2024B3A70627H), Sela Kartikeya (2024B4A70769H)

Repository: https://github.com/dhruv2402/I-ITSM

**Live demo:** https://i-itsm-jy6e.onrender.com (free plan: the first visit after ~15 idle minutes takes 30-60 s to wake up). Demo password `Password@123`.

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
| Employee / Customer | employee@itsm.demo |
| Technician / Support Engineer | technician@itsm.demo |
| Administrator / IT Manager | admin@itsm.demo |

Additional seeded accounts (same password): employees priya@, rohan@; technicians vikram@, sneha@, kavya@, rahul@; team lead teamlead@; IT manager manager@ (all `@itsm.demo`).

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

### Cloud deployment (Render + MongoDB Atlas)

The repository contains a Render Blueprint (`render.yaml`). One free web service builds the React app and the API (`npm run render-build`) and serves both (`npm start`); data stays in MongoDB Atlas.

1. render.com → **New → Blueprint** → select this repository.
2. Paste the Atlas connection string when asked for `MONGODB_URI` (`JWT_SECRET` is generated automatically).
3. Optional real e-mail: Render's free plan blocks outgoing SMTP, so add `BREVO_API_KEY`, `EMAIL_FROM` (a sender verified in Brevo) and `EMAIL_OVERRIDE_RECIPIENT` in the service's **Environment** tab (HTTPS e-mail API adapter). Gmail SMTP (`SMTP_USER`, `SMTP_PASS`) works for local runs. E-mail is always sent in the background, so a slow provider never delays users.

The free plan sleeps after ~15 minutes without traffic; the first request then takes ~30-60 s.

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
