# FinBook Business Management Suite

A complete digital-ledger ("khata") platform for small businesses, built from the
reference screenshots in this workspace and the public FinBook feature set —
with **original code, branding and assets**.

| Piece | Stack | Location |
|---|---|---|
| Shared REST API | Node.js · Express · Prisma · MySQL | [`backend/`](backend) |
| Web app (desktop UI) | React 18 · TypeScript · Vite · Tailwind | [`web/`](web) |
| Mobile app | Flutter (Material 3) | [`mobile/`](mobile) |
| Signed Android app releases | Versioned `.apk` files | [`releases/`](releases) |
| Orchestration | Docker Compose (MySQL + API + Web) | [`docker-compose.yml`](docker-compose.yml) |
| API docs | OpenAPI 3 + Swagger UI | `backend/docs/openapi.yaml` → `/api/docs` |

## Features

- **Auth** — email/password register & login, JWT access + rotating refresh
  tokens, roles (Admin/Staff/User).
- **Multiple FinBooks** — create/rename/switch books; each book has its own
  parties, ledgers, staff and settings.
- **Customers & Suppliers** — add with optional GSTIN + billing address, bulk
  import, search/filter/sort, computed *You will give / You will get* balances.
- **Digital khata** — `YOU GAVE ₹` / `YOU GOT ₹` entries with running balance,
  payment mode, bill photo upload, edit/delete (soft), transactional SMS hook.
- **Cashbook** — daily IN/OUT register with payment-mode filter, auto entries
  from ledger transactions and invoice payments, PDF report.
- **Expenses** — categories, attachments, category-wise summaries.
- **Inventory** — items with sale/purchase price, GST rate, stock movements,
  low-stock alerts.
- **Billing** — GST invoices with line items, stock deduction, payment
  collection (PARTIAL/PAID rollup), invoice PDF.
- **Payment reminders** — schedule + send via SMS/WhatsApp-ready gateway stub.
- **Reports** — dashboard KPIs, transactions report with date/party filters,
  party statement PDF, CSV export on web.
- **Staff & roles** — Owner / Partner / Staff per book with granular permission
  flags (parties, bills, items, cashbook, reports) enforced server-side.
- **Notifications, Activity log** — audit trail of every action.
- **Engineering** — Zod validation, Winston logging, rate limiting, Helmet,
  soft delete + audit columns everywhere, indexed FKs, Swagger docs.

## Quick start (Docker)

```bash
cd bizkhata
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:8080 | React web app |
| http://localhost:4000/api/docs | Swagger UI |
| http://localhost:4000/api/health | API health |
| localhost:3306 | MySQL (`finbook` / `finbook_pw`) |

The API container runs migrations (`prisma db push` on first boot) and seeds a
demo account: **email `owner@finbook.dev` / password `demo123`** — or register
a new account from the login screen.

## Local development

### Backend

```bash
cd backend
cp .env.example .env          # point DATABASE_URL at your MySQL
npm install
npx prisma migrate dev        # creates schema + generates client
npm run seed
npm run dev                   # http://localhost:4000
```

### Web

```bash
cd web
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :4000)
```

### Mobile (Flutter)

```bash
cd mobile
flutter create . --platforms=android,ios   # generates platform folders once
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:4000   # Android emulator
# physical device: use your machine's LAN IP, e.g. http://192.168.1.5:4000
```

## Architecture

```
mobile (Flutter)  ─┐
                   ├──►  backend (Express REST /api/v1) ──► MySQL (Prisma)
web (React + TS) ──┘             │
                                 ├── JWT auth + RBAC middleware chain
                                 ├── modules: auth · businesses · parties ·
                                 │   transactions · cashbook · expenses · items ·
                                 │   invoices · staff · reminders · reports ·
                                 │   notifications · activity
                                 └── utils: PDF (pdfkit) · SMS gateway stub ·
                                     uploads (multer) · winston logs
```

Each backend module follows MVC-style layering: `*.routes.js` (routing +
validation) → `*.controller.js` (HTTP handling) → `*.service.js` / Prisma
(business logic & data). Business-scoped routes are nested under
`/api/v1/businesses/:businessId/…` and guarded by membership + permission
middleware.

### Balance convention

`balance = Σ GAVE − Σ GOT` per party.
`balance > 0` → **You will get** (party owes you) · `balance < 0` → **You will give**.

## Production notes

- Set real `JWT_*` secrets; wire an SMS provider in
  `backend/src/utils/sms.js` (single integration point for SMS + WhatsApp).
- `prisma migrate deploy` is already run by the container at boot.
- Uploaded files persist in the `api_uploads` volume; put them behind S3/CDN
  for scale.
- Web container proxies `/api` and `/uploads` to the API service via nginx.

## Releases

Mobile build number lives in `mobile/pubspec.yaml` (`version: 1.0.0+N`).
Signed installable APKs are kept in [`releases/vN/`](releases) in this repo;
the `.aab` (Play Store upload format) and the signing keystore itself stay
outside the repo at `../finbook-releases/` since they're either
store-upload-only or secret material, not something apps install directly.

| Version | Build | Date | Highlights | APK |
|---|---|---|---|---|
| v1 | 1.0.0+1 | — | Initial prototype (pre-dates this repo's history; no artifact kept) | — |
| v2 | 1.0.0+2 | 2026-07-19 | Renamed to FinBook; Tamil language support; nav cleanup | — |
| v3 | 1.0.0+5 | 2026-07-23 | OTP verification flow; WhatsApp channel removed (SMS-only); production Android signing config; graceful non-JSON API error handling | [`releases/v3/FinBook-v3-signed.apk`](releases/v3/FinBook-v3-signed.apk) |
| v4 | 1.0.0+6 | 2026-07-25 | Staff/party/invoice permission hardening; IST/UTC day-boundary fixes in cashbook & reports; report PDF redesign; fixed duplicate-submission bugs (cashbook/expenses) and infinite-spinner-on-permission-denied bugs across web + mobile | [`releases/v4/FinBook-v4-signed.apk`](releases/v4/FinBook-v4-signed.apk) |
| v5 | 1.0.0+7 | 2026-07-26 | Full logging/observability stack (Loki + Promtail + Grafana) with a segmented dashboard; Discord alerting for server/DB errors, client crashes, and failed logins; web + mobile now report crashes to the backend | [`releases/v5/FinBook-v5-signed.apk`](releases/v5/FinBook-v5-signed.apk) |
| v17 | 1.0.0+20 | 2026-08-09 | Staff and Cashbook screens now check server-side permissions up front and show a clear "no access" state instead of an empty list or endless spinner for a staff member who lacks the permission; add-staff email lookup mirrors the web flow (skips name/password for an address that already has a FinBook account) | [`releases/v17/FinBook-v17-signed.apk`](releases/v17/FinBook-v17-signed.apk) |
| v18 | 1.0.0+21 | 2026-08-10 | Fixed primary action button unreachable behind the system nav bar in every add-entry bottom sheet (cashbook/bills/expenses/items/parties); fixed a missing double-submit guard on Add Party; fixed Cashbook day totals and Items stock value silently undercounting past 100 entries/items; fixed Tamil text overflow on the ledger entry title; invoice creation form now marks required vs optional fields; token-refresh race and logout-not-revoking-server-side fixes | [`releases/v18/FinBook-v18-signed.apk`](releases/v18/FinBook-v18-signed.apk) |
| v19 | 1.0.0+22 | 2026-08-10 | Auth tokens now stored in the Android Keystore / iOS Keychain via `flutter_secure_storage` instead of plain SharedPreferences; existing sessions migrate automatically on first launch instead of being signed out | [`releases/v19/FinBook-v19-signed.apk`](releases/v19/FinBook-v19-signed.apk) |
| v20 | 1.0.0+23 | 2026-08-10 | Paid invoices can now be cancelled/deleted (previously blocked outright) — doing so properly reverses the payment and its matching cashbook cash-in entry instead of just being refused; both actions warn clearly when money will be reversed | [`releases/v20/FinBook-v20-signed.apk`](releases/v20/FinBook-v20-signed.apk) |

## Maintenance directions

**Cutting a new mobile release:**
```bash
cd mobile
# bump the build number in pubspec.yaml, e.g. 1.0.0+6 -> 1.0.0+7
flutter build appbundle --release   # -> build/app/outputs/bundle/release/app-release.aab
flutter build apk --release         # -> build/app/outputs/flutter-apk/app-release.apk
```
Both are signed automatically via `mobile/android/key.properties`, which
points at the shared keystore in `../finbook-releases/keystore/`. Copy the
`.apk` into a new `releases/vN/FinBook-vN-signed.apk` in this repo (add a row
to the table above), and the `.aab` into `../finbook-releases/vN/` alongside
it, following the naming used by earlier releases.

**Updating the deployed web/API:**
- Local dev: `docker compose up --build` picks up the override in
  `docker-compose.override.yml` (Vite dev server, hot reload).
- Production: **automatic** — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
  runs on every push to `main`, syncing `web/` and `backend/` to `DEPLOY_PATH`
  and rebuilding/restarting just the `api`/`web` containers. It never touches
  `docker-compose.yml` at `DEPLOY_PATH` — that file holds production DB/JWT
  secrets that differ from this repo's dev defaults — and never touches `db`.
- The deploy job runs on a **self-hosted runner installed on the production
  host itself** (`Settings → Actions → Runners` in GitHub), not a GitHub-hosted
  one — the current host sits behind Tailscale, which GitHub's cloud runners
  can't route to. Moving to a new server: install a runner there
  (`https://github.com/sivanesan1103/finbook/settings/actions/runners/new`,
  give it the `rpi` label or update `runs-on:` in the workflow to match),
  remove the old runner, and update the `DEPLOY_PATH` repo secret if the path
  differs. Nothing else in the workflow needs to change.
- After any deploy (manual or automatic), sanity-check with `docker compose
  ps` (all services `Up`/`healthy`) and `curl localhost:8080` / the API.
