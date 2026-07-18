# BizKhata API — quick reference

Full interactive docs: **`http://localhost:4000/api/docs`** (Swagger UI, served
from [`backend/docs/openapi.yaml`](../backend/docs/openapi.yaml)).

Base URL: `/api/v1` · Auth: `Authorization: Bearer <accessToken>`

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | name, email, password |
| POST | `/auth/login` | email + password |
| POST | `/auth/refresh` | rotates the refresh token |
| POST | `/auth/logout` | revokes refresh token |
| GET/PATCH | `/auth/me` | profile · `POST /auth/me/avatar` multipart |

## Businesses (books)
`GET/POST /businesses` · `GET/PATCH/DELETE /businesses/:businessId` ·
`POST /businesses/:businessId/logo`

All routes below are nested under `/businesses/:businessId` and require
membership; staff permissions (`parties`, `bills`, `items`) are enforced.

## Parties
`GET /parties?type=CUSTOMER|SUPPLIER&search=&sort=recent|name|highest|lowest&page=&limit=`
· `GET /parties/summary?type=` (You-will-give/get totals)
· `POST /parties` · `POST /parties/bulk` · `GET/PATCH/DELETE /parties/:partyId`
· `POST /parties/:partyId/photo`

## Ledger
- `GET /parties/:partyId/transactions?from=&to=&type=&search=` → `{party, entries[+runningBalance], totals}`
- `POST /parties/:partyId/transactions` — `{type: GAVE|GOT, amount, description?, paymentMode?, entryDate?}`
  (multipart `billImage` supported; auto cashbook entry + SMS hook)
- `GET /parties/:partyId/statement.pdf` — PDF statement
- `GET/PATCH/DELETE /transactions/:txId`

## Cashbook
`GET /cashbook?date=|from=&to=&paymentMode=` · `GET /cashbook/summary` ·
`GET /cashbook/report.pdf` · `POST /cashbook` `{direction: IN|OUT, amount, …}` ·
`PATCH/DELETE /cashbook/:entryId`

## Expenses
`GET /expenses` (+ total) · `GET /expenses/by-category` · `POST /expenses`
(multipart `attachment`) · `PATCH/DELETE /expenses/:expenseId`
· Reusable expense items (don't affect inventory): `GET /expenses/items?search=` ·
`POST /expenses/items` `{name, price?}` · `DELETE /expenses/items/:itemId`

## Items
`GET /items?search=&lowStock=true` · `GET /items/:itemId` (with movements) ·
`POST /items` · `PATCH /items/:itemId` · `POST /items/:itemId/stock`
`{type: IN|OUT|ADJUST, qty, note?}` · `DELETE /items/:itemId`

## Invoices
`GET /invoices?status=&partyId=&search=` (+ billed/collected summary) ·
`POST /invoices` `{partyId, items[{itemId?, name, qty, price, taxRate?}], discount?, dueDate?}` ·
`GET /invoices/:id` · `GET /invoices/:id/pdf` ·
`POST /invoices/:id/payments` `{amount, mode?}` → status rolls UNPAID→PARTIAL→PAID ·
`POST /invoices/:id/cancel` · `DELETE /invoices/:id`

## Staff
`GET /staff` · `POST /staff` `{email, name?, role: PARTNER|STAFF, permissions?}` ·
`PATCH /staff/:memberId` · `DELETE /staff/:memberId` (owner/partner only)

## Reminders
`GET /reminders?status=` · `POST /reminders` `{partyId, channel: SMS|WHATSAPP, dueDate, message?}` ·
`POST /reminders/:id/send` · `POST /reminders/:id/cancel`

## Reports & misc
`GET /reports/dashboard?from=&to=` · `GET /reports/transactions?from=&to=&partyType=&search=` ·
`GET /reports/transactions.pdf` (same filters, PDF download) ·
`GET /activity` (audit trail) · `GET /notifications` · `POST /notifications/read-all`

### Response envelope
```json
{ "success": true, "data": …, "meta": { "page": 1, "limit": 20, "total": 42, "pages": 3 } }
```
Errors: `{ "success": false, "message": "…", "details": [{"path": "…", "message": "…"}] }`
