# Attendance Tracker

A self-hosted employee leave and attendance tracker for a single organisation. Configurable leave
rules engine with an immutable ledger, one-tap signed approval links, geofenced check-in (consent
based, no continuous tracking, no biometrics), monthly payroll reporting, and an installable PWA
front-end. Built with Next.js (App Router), Prisma, and PostgreSQL.

All dates in the UI are shown as `DD/MM/YYYY` and all scheduling (leave years, holidays, late-mark
cut-offs, report locking) operates in Asia/Kolkata (IST), regardless of server timezone.

## Tech stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- PostgreSQL via Prisma ORM (self-hosted — bring your own instance)
- Server Actions + a thin service layer (`src/server/*`) wrapping a pure, dependency-free rules
  engine (`src/lib/rules/*`)
- Vitest for the test suite
- Installable PWA (manifest + offline-capable service worker, no caching of authenticated pages)

## Getting started

### 1. Prerequisites

- Node.js 20+
- A PostgreSQL server you control (version 14+). This project does not use a managed/cloud
  database — point it at any instance you run yourself.

### 2. Create the database and app role

Run `scripts/setup-db.sql` once as the `postgres` superuser. **Edit the password placeholder
first** — open the file and replace `CHANGE_ME` with a strong password of your own (don't commit
the real password).

```powershell
& "C:\Program Files\PostgreSQL\<version>\bin\psql.exe" -U postgres -h localhost -p <port> -f scripts\setup-db.sql
```

Check `postgresql.conf` for the actual port your server listens on — it isn't always the default
5432.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL` — using the role/password/port from step 2.
- `AUTH_SECRET` and `APPROVAL_LINK_SECRET` — generate each with `openssl rand -hex 32`. These sign
  session cookies and one-tap approval links; losing/rotating them invalidates all active sessions
  and pending approval links.
- `APP_BASE_URL` — the externally reachable URL used to build links in emails/Telegram messages.
- `SMTP_*` / `TELEGRAM_BOT_TOKEN` — optional. Leave blank to disable; toggle notification channels
  per-channel in Admin → Settings once credentials are in place.

### 4. Install dependencies, run migrations, seed demo data

```bash
npm install
npm run prisma:migrate
npm run db:seed
```

The seed script creates:

- Organisation-wide policy defaults
- 8 leave types (Casual, Sick, Earned/Privilege, Maternity, Paternity, Comp-Off, Loss of Pay,
  Bereavement)
- A Tamil Nadu + national holiday calendar for the current and next year (festival dates with
  variable calendars, such as Pongal-adjacent days, are marked as approximate — verify and adjust
  in Admin → Holidays against the official state gazette each year)
- A team of 8 employees with a manager/second-approver/delegate reporting structure, including one
  employee on probation
- Roughly 10 months of deterministic attendance and leave history
- A handful of live pending leave requests for demoing the approvals inbox

All seeded users share the password `Password123` (change it after first login). Seeded employee
emails use a fictional `@marinasoftware.test` domain — none of this is real personal data. For
example: `owner@marinasoftware.test` (Owner), `hr@marinasoftware.test` (HR),
`karthik@marinasoftware.test` (Manager), `suresh@marinasoftware.test` (Employee) — the seed script
prints the full list on completion.

### 5. Run it

```bash
npm run dev
```

Open http://localhost:3000 and log in with one of the seeded accounts listed above.

### 6. Run the tests

```bash
npm test
```

This runs the full Vitest suite covering the rules engine (calendar/day-counting, sandwich-leave,
accrual, carry-forward/expiry, balance computation), RBAC, attendance evaluation, signed-link
logic, date-boundary handling, and HR abuse-pattern detection.

### 7. Production build

```bash
npm run build
npm start
```

## Policy settings (Admin → Settings)

Everything below is configurable per-organisation without a code change:

- **Leave year** — calendar year or financial year (with a configurable start month), used as the
  boundary for accrual, carry-forward, and balance resets.
- **Sandwich leave rule** — toggle whether a weekly-off/holiday sandwiched between two approved
  leave days is itself counted as leave.
- **Weekly off days** — which days of the week are non-working.
- **Team coverage limit** — maximum number of people from the same department permitted to be on
  leave on the same day, enforced as either a soft warning or a hard block.
- **Escalation hours** — how long a pending request waits before auto-escalating to the second
  approver.
- **Backdated leave limit** — how many days in the past a leave request may be filed for without
  an explicit override.
- **Shift window, grace period, late-mark threshold** — attendance check-in windows and how many
  late marks convert into a half-day deduction.
- **Comp-off expiry** — how many days an earned comp-off credit remains usable before lapsing.
- **Geofencing** — optional, off by default. When enabled, check-in (never continuous location
  tracking) is validated against a configured latitude/longitude/radius. Employees are asked for
  consent before any location is captured, and location is never used for anything beyond flagging
  an out-of-radius check-in to the approver.
- **Notification channels** — email and Telegram adapters are functional; toggle each on once SMTP
  / bot credentials are configured. A WhatsApp adapter exists as an intentional no-op stub (the
  official API requires a paid Meta Business account, out of scope for a self-hosted project) —
  wiring a real provider in is a drop-in replacement of that one adapter.
- **Birthdays / work anniversaries** — a visibility toggle exists in settings; no calendar display
  has been built against it yet.
- **Data retention** — number of years raw attendance/leave records are retained before they are
  eligible for purge (manual process; no destructive automatic job is wired in — see Privacy
  below).

Per leave type (Admin → Leave Types), each of the following is independently configurable: accrual
method (upfront / monthly / per-day-worked), annual quota, carry-forward cap and expiry, max
consecutive days, minimum notice period, negative-balance allowance and limit, applicability by
gender, availability during probation, and the day-count threshold beyond which a supporting
document is expected (surfaced as a warning, not a hard block).

## Core design notes

- **Ledger-first balances.** `LeaveLedgerEntry` is the only source of truth for balances — there is
  no mutable counter. Every balance is computed on demand by replaying ledger entries
  (`computeBalanceFor`/`computeBalances`). Leave is debited only on final approval, not at
  application time; pending/approved requests are instead treated as a temporary reservation for
  balance-preview purposes.
- **Comp-off** is tracked individually (per earned credit, FIFO expiry) and also mirrored onto the
  ledger through a dedicated Comp-Off leave type, so a comp-off request goes through the exact same
  apply → approve → cancel pipeline as any other leave.
- **One-tap approval links** are HMAC-signed, single-use, and expire after 72 hours. The database
  stores only a hash of the token, and consumption is done with an atomic single-use guard to
  prevent replay.
- **RBAC is enforced server-side** in the service layer, not just hidden in the UI — every Server
  Action re-checks the caller's role and relationship to the target employee (self, manager,
  second-approver, delegate, or HR/Owner) before doing anything.
- **Month locking.** Once a payroll month is locked (Admin → Reports), its attendance and leave
  figures are frozen for export; reopening requires an explicit, audit-logged action.

## Security

- Passwords hashed with bcrypt; a configurable password policy and login rate limiting are
  enforced server-side.
- Sessions are opaque, database-backed, delivered via an httpOnly cookie — no JWT is trusted
  client-side for auth state.
- Approval links are signed and single-use (see above).
- CSRF is mitigated by Server Actions' same-origin enforcement; all user-facing output is escaped
  by React by default (no `dangerouslySetInnerHTML` use in user-provided content paths).
- Every approval, cancellation, settings change, and data export is written to an append-only audit
  log.

MFA fields exist in the schema (`mfaSecret`/`mfaEnabled`) but are not yet wired up to a working
TOTP flow — treat MFA as not implemented in this build.

## Privacy

- Geolocation is collected only at the moment of check-in, only with explicit employee consent,
  and only when the organisation has geofencing enabled — never as background/continuous tracking.
- No biometric or facial-recognition data is collected anywhere in this system.
- Employees can self-export their own data (profile, leave history, attendance history, audit
  trail entries about them) as JSON from the "My data" link in the app, under `/privacy`. Every
  export is itself logged to the audit trail.
- `dataRetentionYears` in Admin → Settings documents the organisation's intended retention policy;
  there is no automatic destructive purge job — enforcing retention is a deliberate, manual
  decision left to whoever administers the instance.

## Backups

This project does not ship a backup service. For a self-hosted Postgres instance, a minimal
approach:

```bash
pg_dump --format=custom attendance_tracker > backup.dump
# encrypt at rest, e.g.:
gpg --symmetric --cipher-algo AES256 backup.dump
```

Restore with `pg_restore`. Schedule this (cron / Task Scheduler) at whatever interval your data
sensitivity warrants, and store the encrypted dump somewhere other than the database host.

## What's not built yet

- CSV import of attendance history from a biometric device or another system.
- A working MFA/TOTP flow (schema fields exist, no UI/logic behind them).
- Employee self-service profile editing (employee records are currently admin-managed only).
- A birthdays/work-anniversaries display (the settings toggle exists; no UI consumes it yet).
- A real WhatsApp notification adapter (stubbed out — see Policy settings above).
