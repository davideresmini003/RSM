# RSM — Reinsurance Software Marketplace · PRD

## Problem statement
Build a B2B SaaS that digitizes European reinsurance intermediation. Three actors: Cedentes (insurance cos), Reaseguradores (reinsurers), Brokers. Anonymous by default, eIDAS-compliant digital NCA, regulatory verification, immutable audit log. Full end-to-end (all flows).

## User choices (confirmed)
- Full end-to-end MVP (all roles, all flows)
- JWT email+password auth (custom) + demo quick-access on landing
- Digital signature simple (checkbox + name + timestamp + IP, audit log)
- Bilingual ES/EN with toggle
- Local storage (Mongo) for files

## Architecture
- Backend: FastAPI + Motor (Mongo), JWT httpOnly cookie + Bearer fallback
- Frontend: React 19 + React Router 7 + Tailwind (design system "Swiss Institutional")
- MongoDB collections: users, companies, submission_packs, interests, operations, quotes, contracts, messages, broker_profiles, solicitudes, mandates, ratings, audit_log

## Implemented (Apr 2026)
- Landing bilingual with 4 quick-demo buttons (Cedente, Reasegurador, Broker, Admin) + Admin shortcut header + link to /login
- Auth: register, login, logout, /me (JWT cookie + Bearer). Admin + 3 demo users seeded.
- Onboarding multi-step per role (kept intact for production)
- Role-based sidebar with role-switcher (demo)
- Cedente: Dashboard (4 KPIs, Mis Programas, Intereses, Operaciones recientes), Submission Pack 4-step wizard, list/publish/withdraw
- Marketplace: filtered grid, anonymous cards with verified badges
- **Submission Pack detail page** with full data + express interest modal (NEW)
- Reasegurador: Dashboard, marketplace access, express interest
- Operation detail: timeline (8 states), NCA signing modal (eIDAS-style), Quote form (one-shot), Accept quote → auto-contract, Sign contract, Chat (polling, dual channels for brokers)
- Brokers: public marketplace, broker profile editor (visible/bio/branches/services/zones/languages/rating), public profile page, contact modal → solicitud
- Solicitudes: receive/accept/decline (auto-creates Mandate for cedente)
- Mandates: broker-cedente NCA signing → identity reveal
- Ratings: 3-dimension (technical/comm/deadlines) on closed operations with broker
- Admin: verify/unverify companies, audit log viewer
- Immutable audit log on all significant actions

## Test credentials
See /app/memory/test_credentials.md

## Status
- ✅ Full MVP functional end-to-end
- ⏳ Not yet tested by testing agent (user declined for now)

## Backlog (P1/P2)
- File upload real (currently simulated placeholders)
- Real eIDAS digital signature integration (current: internal audit-log signature)
- Email notifications (interest received, NCA to sign, quote received, contract, mandate)
- Admin: suspend/resume operations UI
- Pricing + Stripe billing integration
- SSE/WebSocket push instead of 4s chat polling

## Next action items
- [ ] Run testing agent end-to-end (cedente publica → reasegurador interés → NCA → cotización → contrato → rating)
- [ ] Decide on file upload storage (local GridFS vs Cloudinary/S3)
- [ ] Add payment integration for trial → paid conversion
