# RSM Auth Testing

## Test accounts (seeded at backend startup)
- Admin: admin@rsm.eu / Admin123!  (role: admin)
- Cedente demo: cedente@demo.eu / Demo123! (role: cedente)
- Reasegurador demo: reasegurador@demo.eu / Demo123! (role: reasegurador)
- Broker demo: broker@demo.eu / Demo123! (role: broker)

All demo users are pre-verified and linked to a demo company.

## Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET  /api/auth/me

## Notes
- JWT tokens set as httpOnly cookie + returned in response body (token field) for Authorization: Bearer fallback used by frontend localStorage.
- Passwords are bcrypt hashed.
