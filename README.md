# BizKhata — FinBook Business Management Suite

A complete digital-ledger ("khata") platform for small businesses, built from the
reference screenshots in this workspace and the public FinBook feature set —
with **original code, branding and assets**.

| Piece | Stack | Location |
|---|---|---|
| Shared REST API | Node.js · Express · Prisma · MySQL | [`backend/`](backend) |
| Web app (desktop UI) | React 18 · TypeScript · Vite · Tailwind | [`web/`](web) |
| Mobile app | Flutter (Material 3) | [`mobile/`](mobile) |
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
| localhost:3306 | MySQL (`bizkhata` / `bizkhata_pw`) |

The API container runs migrations (`prisma db push` on first boot) and seeds a
demo account: **email `owner@bizkhata.dev` / password `demo123`** — or register
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
# finbook
