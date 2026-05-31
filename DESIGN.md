# Cafe Scheduler — Design Document

This document is the source of truth for the cafe scheduling system. Read it at the start of every session.

---

## 1. Product summary

A web-based shift scheduler for a small cafe. Replaces the current manual flow where employees text the boss their availability and the boss organizes shifts by hand.

**Two user types:**
- **Boss** — admin. Creates employee accounts, configures shift requirements, runs the auto-assigner, reviews/edits drafts, publishes schedules, exports PDFs.
- **Employee** — fills weekly availability, views the published schedule.

**Core flow:**
1. Boss creates next week (typically on Sunday). System copies last week's shift requirements and each employee's default shift count into the new week.
2. Employees log in and tick which slots they're available for.
3. Boss closes availability, runs the auto-assigner, reviews/edits the draft.
4. Boss publishes. Employees see the schedule and can also view it as a PDF.

**Scope discipline:** This is a small system for a single small business. Resist feature creep — see Non-goals at the end.

---

## 2. Data model

All entities below map to database tables. Use Prisma for schema definition.

### User

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `name` | string | display name |
| `username` | string, unique | login |
| `passwordHash` | string | bcrypt |
| `role` | enum `"boss"` \| `"employee"` | |
| `isCook` | boolean | |
| `isBarista` | boolean | |
| `defaultShiftsPerWeek` | int | template value, copied into WeeklyShiftCount when a new week is created |
| `isActive` | boolean | soft-delete flag |
| `createdAt` | datetime | |

- Dual-role allowed (both `isCook` and `isBarista` can be true).
- Soft delete: setting `isActive = false` prevents login and invalidates existing sessions. Old assignments remain intact.

### Week

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `startDate` | date, unique | the Sunday this week begins |
| `status` | enum | `"availability_open"` \| `"availability_closed"` \| `"draft"` \| `"published"` |
| `createdAt` | datetime | |
| `publishedAt` | datetime, nullable | |

- One row per week.
- Week starts Sunday (Israeli convention).
- Multiple weeks can be active simultaneously (e.g., this week `published`, next week `availability_open`).

### Availability

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `weekId` | FK → Week | |
| `userId` | FK → User | |
| `day` | int 0–6 | Sunday = 0 |
| `slot` | enum `"morning"` \| `"mid"` \| `"evening"` | |
| `available` | boolean | |

- Unique on `(weekId, userId, day, slot)`.
- Normalized one-row-per-cell rather than a JSON blob to support "who's available Friday morning?" queries.

### ShiftRequirement

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `weekId` | FK → Week | non-null; every week has its own copy |
| `day` | int 0–6 | |
| `slot` | enum `"morning"` \| `"mid"` \| `"evening"` | |
| `cooksNeeded` | int | |
| `baristasNeeded` | int | |

- Unique on `(weekId, day, slot)`.
- When a new week is created, rows are copied from the previous week's requirements (Option A from design discussion).
- `mid` slot only exists for a day if a row with `slot = "mid"` and non-zero needs exists for that day. UI uses this to decide whether to show the mid checkbox.

### WeeklyShiftCount

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `weekId` | FK → Week | |
| `userId` | FK → User | |
| `shiftsThisWeek` | int | |

- Unique on `(weekId, userId)`.
- When a new week is created, populated from each user's `defaultShiftsPerWeek`.
- Setting to `0` means the user is out this week (vacation, etc.).

### Assignment

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `weekId` | FK → Week | |
| `userId` | FK → User | |
| `day` | int 0–6 | |
| `slot` | enum | |
| `roleWorking` | enum `"cook"` \| `"barista"` | which role this user is filling in this slot |
| `createdAt` | datetime | |

- `roleWorking` matters because a dual-role employee can fill either a cook slot or a barista slot — the system needs to know which.

### Session

Stored by `express-session` with a SQLite-compatible store (e.g., `connect-sqlite3`). Schema managed by the store; we just need to be able to delete sessions by `userId` when deactivating users.

---

## 3. State machine

Each Week has a `status` that progresses through this lifecycle:

```
        availability_open
                │  (boss closes form)
                ▼
        availability_closed
                │  (boss runs assigner)
                ▼
            draft
                │  (boss publishes)
                ▼
          published
```

### What each state means

| State | Employees can edit availability | Schedule visible to employees | Assigner can run | Boss can manually edit assignments |
|---|---|---|---|---|
| `availability_open` | ✓ | ✗ | ✗ | ✗ |
| `availability_closed` | ✗ | ✗ | ✓ | ✗ |
| `draft` | ✗ | ✗ | ✓ (wipes & regenerates) | ✓ |
| `published` | ✗ | ✓ | ✗ | ✓ |

### Permission matrix

| Action | open | closed | draft | published |
|---|---|---|---|---|
| Employee edits own availability | ✓ | ✗ | ✗ | ✗ |
| Boss edits requirements | ✓ | ✓ | ✓ ⚠ | ✓ ⚠ |
| Boss edits weekly shift counts | ✓ | ✓ | ✓ ⚠ | ✓ ⚠ |
| Boss runs assigner | ✗ | ✓ | ✓ (wipes existing) | ✗ |
| Boss manually edits assignments | ✗ | ✗ | ✓ | ✓ |
| Employee views schedule | ✗ | ✗ | ✗ | ✓ |

⚠ = allowed but UI shows a warning that current assignments may be inconsistent.

### Backward transitions

- **`availability_closed` → `availability_open`** allowed (boss reopens to let someone fill in).
- **`draft` → `availability_open`** allowed but wipes existing draft assignments. Frontend shows a confirmation.
- **`published` does NOT go backward.** Post-publish fixes are made by editing assignments in place — no "unpublish."

### New week creation

- **Manual.** Boss clicks "Open next week" in the dashboard when ready.
- Dashboard shows a nudge if it's Sunday and no upcoming week exists.
- Creates a new Week row with `status = "availability_open"`.
- Copies ShiftRequirements from the previous week.
- Creates WeeklyShiftCount rows for every active user based on their `defaultShiftsPerWeek`.
- No availability rows are created — they're created as employees fill out the form.

### Concurrent weeks

It is normal to have multiple non-archived weeks at once. The "current upcoming week from the boss POV" is the most recent week that isn't yet `published`, or the most recently published one if none are in earlier states.

---

## 4. Assigner algorithm

A deterministic, greedy slot-first algorithm that produces a draft of assignments. Lives as a **pure function** in `server/services/assigner.js` — no DB calls, no randomness, plain-object inputs and outputs. The route handler does all DB I/O around it.

### Inputs

- The Week
- ShiftRequirements for the Week
- All active Users with their `isCook`/`isBarista` flags
- Availability for the Week
- WeeklyShiftCount for the Week
- Assignments from the previous Week (for weekend rotation)

### Output

- A list of Assignment objects (`weekId`, `userId`, `day`, `slot`, `roleWorking`)

### Hard constraints (never violated)

1. Never assign someone to a slot they're unavailable for
2. Never assign someone to a slot for a role they don't have
3. Never assign the same person twice to the same slot
4. **Never assign the same person to more than one slot on the same day**
5. Don't exceed any user's `WeeklyShiftCount`
6. Don't exceed any slot's `cooksNeeded` / `baristasNeeded`

### Soft goals

1. Fill every slot completely (no understaffing)
2. Get each person as close to their `WeeklyShiftCount` as possible
3. **Weekend distribution:** every scheduled person should get exactly one weekend shift (Fri or Sat, any slot) when possible
   - If too few weekend slots exist, prefer giving weekends to people who didn't have one last week
   - If too many weekend slots, prefer giving the extra weekend(s) to people who didn't have one last week
4. Prefer pure-role candidates over dual-role candidates for role-specific slots (preserves flexibility for later slots)

### Algorithm

```
1. Build a flat list of slot-instances to fill, e.g.
   [(Sun, morning, cook), (Sun, morning, cook), (Sun, morning, barista), ...]
   (one entry per "head" needed — if Sun morning needs 2 cooks, that's 2 entries)

2. Sort by scarcity: count qualified+available users for each slot,
   process slots with the fewest options first.

3. For each slot-instance in scarcity order:
     a. Filter candidates: available, has the role, not yet assigned to this slot,
        not yet assigned anywhere else on this day, still has remaining shifts.
     b. Score each candidate (lower = better):
          score = 0
          score += shifts_already_assigned_this_week * 10
          if slot is weekend (day in {5, 6}):
              if candidate already has weekend this week:  score += 100
              if candidate had weekend last week:           score += 5
          if candidate is dual-role AND a pure-role candidate exists:
              score += 3
     c. Tiebreaker: lowest userId.
     d. Assign the best candidate. If no candidates exist, leave empty.

4. Second pass: for any user below their WeeklyShiftCount, check empty slot-instances
   they could fill. Slot the empty stayed empty for a reason (no candidates earlier),
   but this catches edge cases.
```

### Notes on determinism

- No randomness. Tiebreaker is `userId` ascending.
- Re-running the assigner with the same inputs produces identical output.
- The scoring weights above are starting values. Tune based on observed behavior.

### Understaffing & overstaffing

- **Understaffing:** allowed in draft (assigner couldn't fill every slot). UI highlights these in red. Boss decides whether to override `WeeklyShiftCount` manually, reopen availability, or accept it.
- **Overstaffing:** never. `cooksNeeded`/`baristasNeeded` are hard caps. To add a body, boss raises the requirement.

### Weekend definition

"Weekend" = days where `day >= 5` (Friday and Saturday), any slot.

### Weekend rotation history window

Look back **1 week** for the weekend rotation soft goal. No further history needed.

---

## 5. API surface

All routes prefixed with `/api`. Auth is session-cookie based. Boss-only routes marked 🔒.

### Auth
```
POST   /auth/login                     { username, password } → { user }
POST   /auth/logout                    → 204
GET    /auth/me                        → { user } | 401
```

### Users 🔒
```
GET    /users                          → [user, ...]
POST   /users                          { name, username, password, isCook, isBarista, defaultShiftsPerWeek }
                                       → { user }
PATCH  /users/:id                      { name?, isCook?, isBarista?, defaultShiftsPerWeek?, isActive? }
                                       → { user }
POST   /users/:id/reset-password       { newPassword } → 204
```

No DELETE endpoint — use `PATCH { isActive: false }`. Deactivating also clears the user's sessions.

### Weeks
```
GET    /weeks                          → [week, ...]
GET    /weeks/current                  → { week } | null
GET    /weeks/:id                      → { week }
POST   /weeks                          🔒 → { week }     creates next week
PATCH  /weeks/:id/status               🔒 { status } → { week }   state machine transitions
```

The status PATCH validates legal transitions and triggers side effects (e.g., wiping draft assignments on backward transition to `availability_open`).

### Availability
```
GET    /weeks/:weekId/availability                                  🔒 → all
GET    /weeks/:weekId/availability/me                               → mine
PUT    /weeks/:weekId/availability/me  { entries: [...] }           → updated
```

Bulk PUT — frontend submits the whole grid.

### Shift requirements 🔒
```
GET    /weeks/:weekId/requirements                                  → [...]
PUT    /weeks/:weekId/requirements     { entries: [...] }           → updated
```

### Weekly shift counts 🔒
```
GET    /weeks/:weekId/shift-counts                                  → [...]
PATCH  /weeks/:weekId/shift-counts/:userId   { shiftsThisWeek }     → updated
```

### Assignments
```
GET    /weeks/:weekId/assignments                                   → [...]
                                                                    (employees: only if published)
POST   /weeks/:weekId/assignments/run-assigner    🔒                → [...]
                                                                    wipes + regenerates
POST   /weeks/:weekId/assignments    🔒  { userId, day, slot, roleWorking }
                                                                    → { assignment }
DELETE /assignments/:id   🔒                                        → 204
```

### Dashboard 🔒
```
GET    /weeks/:weekId/dashboard  →  {
  filledCount, totalActiveUsers,
  unfilledUsers: [{ id, name }, ...],
  understaffedSlots: [{ day, slot, role, needed, assigned }, ...]
}
```

### Export
```
GET    /weeks/:weekId/export.pdf       → PDF binary
```

### Response conventions

- All mutating routes return the updated resource(s).
- Errors: `{ error: "human readable", code: "MACHINE_READABLE" }` with appropriate HTTP status.
  - `400` validation, `401` not logged in, `403` not allowed, `404` not found, `409` illegal state transition.
- Dates are ISO strings (`"2026-06-07"`).
- Slot values lowercase: `"morning"`, `"mid"`, `"evening"`.

---

## 6. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + Tailwind + react-router + i18next |
| Backend | Node.js + Express + Prisma |
| Database | SQLite (single file) |
| Auth | `bcrypt` + `express-session` + `connect-sqlite3` (no third-party auth) |
| PDF | Browser print-to-PDF from styled HTML route; upgrade to puppeteer only if needed |
| Deployment | Single VPS, nginx in front, process managed by pm2 or systemd |

### Repo layout

```
cafe-scheduler/
├── server/                  Express app
│   ├── prisma/              schema + migrations + seed
│   ├── routes/              one file per area
│   ├── services/            
│   │   └── assigner.js      pure function, heavily tested
│   ├── middleware/          auth, error handling
│   └── index.js             entrypoint
├── client/                  Vite + React
│   ├── src/
│   │   ├── pages/           one component per route
│   │   ├── components/      shared UI
│   │   ├── api/             fetch wrappers
│   │   ├── i18n/            translation files
│   │   └── App.jsx
│   └── index.html
├── DESIGN.md                this file
├── CLAUDE.md                operating instructions
└── README.md                setup + run instructions
```

Run server and client as independent npm projects. Not workspaces.

### Internationalization

- All UI strings go through `i18next` from day one.
- Ship with English only.
- Hebrew translation file added later when desired. Layout should not assume LTR — use logical CSS properties (`margin-inline-start` over `margin-left`) where it costs nothing.

---

## 7. Non-goals (v1)

Things explicitly NOT being built. If they come up during implementation, decline and refer here.

- Clock-in / time tracking / hour logging
- Payroll
- Notifications (email, SMS, push) — boss tells employees verbally for now
- Shift swap workflow (boss handles manually by editing assignments)
- Self-signup for employees (boss creates accounts)
- Password reset via email (boss resets)
- OAuth / SSO
- Multi-location or multi-business support
- Native mobile app (responsive web is enough)
- Detailed analytics / reporting beyond viewing past schedules
- Customer-facing features of any kind

---

## 8. Open questions / future considerations

Things deliberately punted but worth remembering:

- **Notifications.** Likely first addition. Email is simplest; WhatsApp would require external service.
- **Hebrew translation.** Translation file + small CSS audit for RTL. Maybe a language toggle.
- **More slot types.** Schema supports `morning | mid | evening`. Adding a fourth (e.g., "late") is an enum migration + UI handling.
- **Employee preferences.** "I prefer mornings." Would extend the assigner scoring.
- **Fairness metrics.** Show the boss a fairness dashboard (who got the most weekend shifts over time, etc.).
