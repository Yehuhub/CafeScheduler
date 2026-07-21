# CLAUDE.md — Operating instructions

Read this and DESIGN.md at the start of every session. DESIGN.md is the source of truth for what to build; this file is how to build it.

---

## Ground rules

- **DESIGN.md is the spec.** If a request conflicts with DESIGN.md, surface the conflict before implementing. Don't silently expand scope.
- **Non-goals are non-goals.** If asked to add something on the Non-goals list, push back and confirm before building.
- **Ask before adding dependencies.** New npm packages need a one-line justification and approval. Prefer the standard library and what's already installed.
- **Small, focused changes.** Prefer many small commits over sweeping ones. Don't refactor unrelated code while making a change.
- **No silent fallbacks.** If something can't be done, say so. Don't paper over errors with try/catch + console.log.
- **Backend before frontend.** For any full-stack feature, plan and implement the backend (routes, validation, DB) first as its own step. Only move to the frontend after the backend is done. Never bundle both into a single plan.

## Code style

- **TypeScript** on both server and client. Use `strict: true` in `tsconfig.json`.
- **Prefer real types over `any`.** If reaching for `any`, that's a sign to think harder. `unknown` + narrowing is usually the right move.
- **Shared types** (e.g., API response shapes, slot enums, week status) live in `/shared` and are imported by both server and client. Don't duplicate them.
- **Derive types from Prisma** where possible (`Prisma.UserGetPayload<...>`) rather than redefining them manually.
- **Modules:** ES modules (`import`/`export`) on both server and client.
- **Formatting:** Prettier defaults. 2-space indent. Semicolons.
- **Naming:** camelCase for variables/functions, PascalCase for React components, snake_case never.
- **Async:** prefer `async`/`await` over `.then()` chains.
- **Errors:** throw real `Error` objects, not strings. Use a custom error class (e.g., `HttpError`) for API errors that need a status code.
- **Comments:** explain *why*, not *what*. Skip comments that just restate the code.

## Backend specifics

- **All DB access goes through Prisma.** No raw SQL except for the session store.
- **Migrations:** every schema change is a Prisma migration. Never edit migration files after they're applied. Migrations are committed to git — they are the schema history.
- **SQLite has no native enums.** All enum-like fields in `schema.prisma` use `String`. The enum-like types in `shared/types.ts` are the source of truth. Pattern: validate incoming strings against the allowed values at the API boundary before any DB write; cast reads from Prisma (`user.role as Role`) since we control all writes. One guard per field per mutating route — don't scatter it.
- **Enum values live as `as const` arrays in `shared/types.ts`, and the union types are derived from them.** A union type alone can't validate a runtime string (types are erased at compile time), so you need an actual array to call `.includes()` on. The pattern: `export const SLOTS = ["morning","mid","evening"] as const;` then `export type Slot = (typeof SLOTS)[number];` (same for `ROLES_WORKING`/`RoleWorking`). Import the array — `import { SLOTS } from "@shared/types"` (client) or `"../../../shared/types"` (server) — and guard with `SLOTS.includes(x as Slot)`. **Do not redeclare a local `VALID_SLOTS = [...]` per file** — the shared `as const` array is the single source of truth for both validation and the union type, so they can never drift. (`Role`/`WeekStatus` are still plain unions with local `VALID_*` arrays in `users.ts`/`weeks.ts`; migrate them to this pattern if you touch them.)
- **`DATABASE_URL` is resolved relative to `prisma/schema.prisma`**, not the server root. The correct value is `file:./dev.db` (produces `server/prisma/dev.db`). Don't change it to `file:./prisma/dev.db` — that double-nests the path.
- **`server/tsconfig.json` has `rootDir: ".."`** because `include` spans `../shared/**/*`. This is intentional; don't "fix" it to `./src`.
- **The assigner lives in `server/services/assigner.ts` and is a pure function.** No DB calls. No randomness. No `Date.now()` inside it — pass time-dependent data as input. This is the highest-value testable unit in the system.
- **Route handlers are thin.** Validation → service call → response. Business logic goes in `services/`.
- **Auth middleware** enforces login + role. Apply at the router level, not per-handler.
- **All state-transition logic for Week.status lives in one place** (`services/weekState.ts` or similar). Don't sprinkle it across routes.
- **Wrap multi-step writes in Prisma transactions** (`prisma.$transaction`). The assigner run is the obvious case.
- **Soft-delete pattern** (`isDeleted Boolean @default(false)`) is used for both `User` and `Week`. Always filter `{ isDeleted: false }` in queries. Never hard-delete these rows — FK integrity and history depend on it.
- **Destructive actions require the boss's own password** in the request body. Verify with `bcrypt.compare(password, req.user!.passwordHash)` before applying. This applies to: delete user, delete week.
- **`POST /weeks` restores deleted rows** rather than failing on the unique `startDate` constraint. If a deleted week exists at the computed startDate, wipe its stale data and set `isDeleted: false`. See `routes/weeks.ts` for the pattern.
- **Boss seed script**: `npm run db:seed` (from `server/`). Reads `BOSS_NAME`, `BOSS_USERNAME`, `BOSS_PASSWORD` from `.env`. Runs automatically before `tsx watch` on `npm run dev`. Re-running only updates the password hash.

## Frontend specifics

- **One component per file** for pages; small shared components can group.
- **No global state library** (no Redux, Zustand, etc.) unless we hit a clear need. React state + context is enough for this size.
- **All API calls go through `src/api/`** wrappers. No `fetch()` calls scattered in components.
- **All user-facing strings go through `t()` (i18next).** Even during English-only phase. This is the cheapest time to enforce it.
- **Tailwind only.** No custom CSS files except `index.css` for resets and CSS variables.
- **Mobile-first.** Design at narrow widths first, enhance for wider screens. Test in narrow viewport regularly.
- **Logical CSS properties** (`ms-`/`me-` instead of `ml-`/`mr-` in Tailwind) where it costs nothing — pays off for RTL later.
- **Shared types use the `@shared` alias.** `import type { ... } from "@shared/types"`. Alias is defined in `vite.config.ts` and mirrored in `client/tsconfig.json` `paths`. Don't use deep relative paths (`../../../../shared/...`).
- **Auth state lives in `AuthContext`.** `useAuth()` gives `{ user, loading, login, logout }`. Boss redirects go to `/dashboard`; employee redirects go to `/`.
- **Boss pages use `BossNav`** (`src/components/BossNav.tsx`) for consistent navigation. Don't inline a duplicate header.

## Testing

- **The assigner gets real tests.** Vitest, table-driven, covering: basic assignment, understaffing, weekend rotation, dual-role packing, day-uniqueness constraint, determinism (same input → same output).
- **Route handlers get smoke tests** (one happy path per route). Not aiming for 100% coverage.
- **No frontend tests for v1** unless something complex emerges. The UI will change a lot early.

## Things to avoid

- Don't add features from the Non-goals list.
- Don't generalize early. If something is used in exactly one place, leave it there.
- Don't over-abstract. A 30-line route handler is fine. Don't split it into 4 helper functions.
- Don't add ORMs/query builders on top of Prisma.
- Don't add a CSS framework on top of Tailwind.
- Don't add a component library (no shadcn/ui, no MUI) unless we explicitly decide to.
- Don't write defensive null checks for things that can't be null per the schema.

## When in doubt

- Match what's already in the codebase.
- Ask. A two-line clarifying question is cheaper than a wrong implementation.
- Prefer doing less. The system is small on purpose.
