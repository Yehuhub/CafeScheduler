# Cafe Scheduler

A web app for building and publishing weekly staff schedules at a small cafe. It replaces a manual workflow (employees texting the owner their availability, the owner arranging shifts by hand) with a structured flow: employees submit availability online, a deterministic auto-assigner drafts the week, and the owner reviews, edits, and publishes.

Built with TypeScript on both the server and client, sharing one set of type definitions.

## Overview

Two roles:

- **Boss (admin):** creates employee accounts, configures each week's shift requirements, runs the auto-assigner, reviews and edits the draft, publishes, and exports a printable schedule.
- **Employee:** submits weekly availability and views published schedules.

The weekly cycle:

1. The boss opens the next week. The system copies the previous week's shifts, staffing requirements, and each employee's default shift count.
2. Employees log in and tick the slots they can work.
3. The boss closes availability, which runs the assigner and produces a draft in one step.
4. The boss reviews, adjusts, and publishes. Employees then see their schedule and can open a print view.

## Features

- **Deterministic auto-assigner:** a greedy, slot-first algorithm that fills shifts subject to hard constraints (availability, role capability, weekly limits, no double-booking in a day, staffing caps) while optimizing soft goals (even distribution, weekend rotation, dual-role flexibility). Written as a pure function, so it is reproducible and fully unit-testable.
- **Per-week dynamic shifts:** shifts are not a fixed enum. The boss defines, renames, and retimes shifts per week, and requirements attach shifts to specific days.
- **Explicit week lifecycle:** each week moves through a state machine (`availability_open` to `draft` to `published`) with a permission matrix per role and state. Transition logic lives in one place.
- **Role-based session auth:** cookie sessions with bcrypt hashing, no third-party auth. Middleware enforces login and role at the router level.
- **Soft-deletes:** users and weeks are never hard-deleted, preserving foreign-key integrity and schedule history. Destructive actions require the boss to re-enter their password.
- **Frozen past weeks:** once a week has elapsed it becomes immutable. Mutating routes reject edits and the UI renders it read-only.
- **Printable export:** a server-rendered, print-optimized HTML schedule, backed by a format-to-exporter registry that leaves a seam for a future PDF binary.
- **Internationalization-ready:** all UI strings go through i18next and the layout uses logical CSS properties, so an RTL (Hebrew) translation drops in without reworking components.
- **Mobile-first UI:** review and availability grids are built for narrow screens, with sticky columns and horizontal scrolling for dense tables.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, React Router, i18next |
| Backend | Node.js, Express, TypeScript, Prisma |
| Database | SQLite |
| Auth | bcrypt, express-session, connect-sqlite3 |
| Testing | Vitest |

## Architecture

Two independent npm projects plus a shared type layer:

```
cafe-scheduler/
├── server/                 Express API (TypeScript)
│   ├── prisma/             schema, migrations, seed scripts
│   └── src/
│       ├── routes/         one file per resource area
│       ├── services/       business logic
│       │   ├── assigner.ts       pure scheduling function (tested)
│       │   ├── weekState.ts      state-machine transitions
│       │   └── scheduleExport.ts printable schedule rendering
│       └── middleware/     auth, error handling
├── client/                 React + Vite app (TypeScript)
│   └── src/
│       ├── pages/          one component per route
│       ├── components/     shared UI
│       ├── api/            fetch wrappers
│       └── i18n/           translations
├── shared/                 types + date logic used by both sides
└── DESIGN.md               product and technical specification
```

Key decisions:

- **Shared types as one source of truth.** Response shapes, enum-like constants, and date rules live in `shared/` and are imported by both sides, so they cannot drift.
- **Thin routes, logic in services.** Handlers validate input, call a service, and return the resource.
- **The assigner is pure.** No DB calls, no randomness, no reads of the clock. Time-dependent data is passed in.
- **Transactional writes.** Multi-step mutations (such as an assigner run) run inside Prisma transactions.
- **Migrations are the schema history.** Every change is a committed migration, including the data-preserving move from fixed slots to dynamic shifts.

## Getting started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/Yehuhub/CafeScheduler.git
cd cafe-scheduler
npm run install:all
```

### Configure the server

```bash
cd server
cp .env.example .env
```

Set `SESSION_SECRET` and the `BOSS_*` credentials used to seed the initial admin account.

### Initialize the database

From `server/`:

```bash
npm run db:migrate
```

The boss account is seeded from the `BOSS_*` variables when the server starts.

### Run

From the repository root, in two terminals:

```bash
npm run dev:server    # API on http://localhost:3000
npm run dev:client    # Vite dev server, proxies /api to the API
```

Open the URL Vite prints and log in with the seeded boss credentials.

## Testing

Tests focus on the pure, high-value logic: the assigner, the exporter, and the shared date rules.

```bash
cd server
npm test
```

The assigner suite covers basic assignment, understaffing, weekend rotation, dual-role packing, the day-uniqueness constraint, and determinism.

## Deployment

The app runs on a single VPS: the built server serves the API behind a reverse proxy (Caddy or nginx) that terminates TLS and forwards `/api`, with the process managed by systemd. `deploy.sh` performs a full redeploy: pull, install, `prisma migrate deploy`, build server and client, restart the service.

## Roadmap

Planned improvements:

- **Full Hebrew support.** Ship a Hebrew translation file and complete the RTL layout audit. The groundwork is in place: strings already route through i18next and the layout uses logical CSS properties.
- **OAuth authentication.** Add an OAuth sign-in option alongside the current username and password flow.
- **Design refresh.** A visual polish pass across the boss and employee views.

## Design document

`DESIGN.md` holds the full specification: data model, API surface, assigner algorithm, week state machine, and non-goals.
