# API Documentation

Interactive docs (Swagger UI): `/api/docs/`  |  OpenAPI schema: `/api/schema/`

All endpoints except register/login need the header `Authorization: Token <token>`.
Users only see and modify their own queries.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/register/` | No | Register user, returns token |
| POST | `/api/login/` | No | Login, returns token |
| POST | `/api/queries/` | Yes | Create customer query |
| GET | `/api/queries/` | Yes | List queries (paginated, 10/page) |
| GET | `/api/queries/{id}/` | Yes | Query details |
| PUT | `/api/queries/{id}/` | Yes | Update query |
| PATCH | `/api/queries/{id}/` | Yes | Partial update |
| DELETE | `/api/queries/{id}/` | Yes | Delete query |
| PATCH | `/api/queries/{id}/status/` | Yes | Update status only |
| POST | `/api/queries/{id}/analyze/` | Yes | AI analysis (category, priority, suggested response) |
| GET | `/api/queries/dashboard/` | Yes | Totals: total / pending / in_progress / resolved |

## Query fields
`customer_name`, `email`, `subject`, `description` (required, min 10 chars), `category`
(Technical, Billing, General, Account Related), `priority` (Low, Medium, High, default Medium),
`status` (Pending, In Progress, Resolved, default Pending), `created_at` (auto).
Read-only: `suggested_response`, `ai_source`.

## List query params
- Search: `?search=rahul` (customer name or email)
- Filter: `?category=Billing&priority=High&status=Pending`
- Order: `?ordering=-created_at`
- Page: `?page=2`

## Error format
Validation errors: HTTP 400 `{"field": ["message"]}`. Missing/invalid token: 401. Not found / not yours: 404.
