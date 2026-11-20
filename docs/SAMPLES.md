# Sample Requests & Responses

Replace `<TOKEN>` with the token from register/login.

## Register
`POST /api/register/`
```json
{"username": "vishal", "email": "vishal@example.com", "password": "Str0ng!Pass99"}
```
201
```json
{"user": {"id": 1, "username": "vishal", "email": "vishal@example.com"}, "token": "fe6f9deae728d215d23a5e950fd433613e35a127"}
```

## Login
`POST /api/login/`
```json
{"username": "vishal", "password": "Str0ng!Pass99"}
```
200
```json
{"token": "fe6f9deae728d215d23a5e950fd433613e35a127"}
```

## Create query
`POST /api/queries/`  (Header: `Authorization: Token <TOKEN>`)
```json
{
  "customer_name": "Rahul Sharma",
  "email": "rahul@example.com",
  "subject": "Payment deducted twice",
  "description": "My payment has been deducted twice, but my subscription is still not activated."
}
```
201
```json
{
  "id": 1, "customer_name": "Rahul Sharma", "email": "rahul@example.com",
  "subject": "Payment deducted twice",
  "description": "My payment has been deducted twice, but my subscription is still not activated.",
  "category": "", "priority": "Medium", "status": "Pending",
  "suggested_response": "", "ai_source": "", "created_at": "2026-11-17T17:29:10.432034+05:30"
}
```

## AI analysis
`POST /api/queries/1/analyze/`
```json
{
  "category": "Billing",
  "priority": "High",
  "suggested_response": "We apologise for the inconvenience. Our team will verify the payment transaction and help activate your subscription.",
  "source": "ai"
}
```
When the fallback is used (no AI key or AI down), the same request returns:
```json
{"category": "Billing", "priority": "High", "suggested_response": "We apologise for the inconvenience. Our team will verify your payment details and get back to you shortly.", "source": "fallback"}
```

## Update status
`PATCH /api/queries/1/status/`
```json
{"status": "In Progress"}
```
200 returns the full updated query.

## List with search
`GET /api/queries/?search=rahul`
```json
{"count": 1, "next": null, "previous": null, "results": [ { "id": 1, "customer_name": "Rahul Sharma", "category": "Billing", "priority": "High", "status": "In Progress", "...": "..." } ]}
```

## Dashboard
`GET /api/queries/dashboard/`
```json
{"total": 1, "pending": 0, "in_progress": 1, "resolved": 0, "by_category": {"Billing": 1}, "by_priority": {"High": 1}}
```

## Validation error
`POST /api/queries/` with bad data -> 400
```json
{
  "customer_name": ["Customer name must be at least 2 characters."],
  "email": ["Enter a valid email address."],
  "subject": ["Subject must be at least 3 characters."],
  "description": ["Description must be at least 10 characters."]
}
```

## No token
`GET /api/queries/` -> 401 `{"detail": "Authentication credentials were not provided."}`
