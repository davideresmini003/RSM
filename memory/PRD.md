# RSM — Reinsurance Software Marketplace · PRD

## Problem statement
Build a B2B SaaS that digitizes European reinsurance intermediation. Three actors: Cedentes (insurance cos), Reaseguradores (reinsurers), Brokers. Anonymous by default, eIDAS-compliant digital NCA, regulatory verification, immutable audit log. Full end-to-end (all flows).

## User choices (confirmed)
- Full end-to-end MVP (all roles, all flows)
- JWT email+password auth (custom) + demo quick-access on landing
- Digital signature simple (checkbox + name + timestamp + IP, audit log)
- Bilingual ES/EN with toggle (UI default ES)
- Local storage (Mongo, base64) for files

## Architecture
- Backend: FastAPI + Motor (Mongo), JWT httpOnly cookie + Bearer fallback
- Frontend: React 19 + React Router 7 + Tailwind (design system "Swiss Institutional")
- MongoDB collections: users, companies, submission_packs, pack_files, interests, operations, quotes, contracts, messages, broker_profiles, solicitudes, mandates, ratings, audit_log

## Implemented (May 2026 — investor MVP)
- Landing bilingual; auth (register, login, logout, /me) with demo seeds
- Onboarding multi-step per role
- Role-based sidebars + role-switcher
- Cedente: Dashboard, 4-step Submission Pack wizard with real file uploads (preview + confidential), pack list/publish/withdraw
- Marketplace: filtered anonymous grid, pack detail page with **pre-NCA preview docs**
- Reasegurador: marketplace browse, express interest (verified-company gate)
- Operations: timeline (8 states), **tripartite NCA** (cedente+reasegurador+broker if assigned), one-shot quote with versioned counter-offer, contract sign, chat (polling, dual broker channels)
- Brokers: marketplace, profile editor, public profile, contact → solicitud → mandate
- Mandates: broker-cedente NCA + identity reveal
- Ratings: 3-dim on closed operations
- Admin: company verification, audit log viewer (timestamps as `toLocaleString`)

## Iteration_3 changes (this session)
- Frontend `NewPack.jsx` Step 3: declared `previewFile` state and upload preview docs with `?is_preview=true`
- `SubmissionPackDetail.jsx`: fetches `/submission-packs/{id}/files` and renders pre-NCA preview section (`data-testid="pre-nca-preview-section"`)
- `OperationDetail.jsx`: tripartite NCA UI — `hasBroker`, `allSigned`; NcaSection now shows 3 columns when broker is present
- Backend errors translated to Spanish (E1): Invalid role, Invalid credentials, Pack not available, Already expressed, Max 10, Already responded, No quote, Cannot accept your own quote, Quote already accepted, Already signed × 2, Channel not available, Already rated
- A1: `_can_see_pack_files` now excludes operations with `state == "cancelled"`
- A2: `submit_quote` blocks back-to-back quotes by the same party while one is pending
- A3: `send_message` / `send_message_with_file` initialize `read_by: [sender]`
- A4: `list_pack_files` freezes the file list visible to counterparties at the moment all NCAs were signed
- D3: seeded `OP-DEMO01` (closed operation on RSM-2026-1900) with quote + contract + 4 chat messages for instant demo
- E7: seeded a 1-page placeholder `Presentacion-RSM-2026-XXXX.pdf` (is_preview=true) on every demo pack
- Dashboard: deduped `activeBrokers` by `broker_id` to remove React duplicate-key warning

## Test credentials
See `/app/memory/test_credentials.md`

## Backlog (P1/P2)
- Real eIDAS digital signature integration (current: internal audit-log signature)
- Email notifications (interest, NCA, quote, contract, mandate)
- Admin: suspend/resume operations UI
- Pricing + Stripe billing
- SSE/WebSocket push instead of 4s chat polling
- Mass i18n string replacement in Admin.jsx, Solicitudes.jsx, OperationDetail.jsx
- Refactor `OperationDetail.jsx` (~850 lines) into sub-components
- Legacy `/app/backend/tests/backend_test.py` needs credential refresh to `aseguradora@rsm.com / Admin123!`

## Testing status (May 25, 2026)
- ✅ iteration_3 pytest suite `/app/backend/tests/test_iter3_features.py` 10/10 pass
- ✅ Backend: tripartite helper, Spanish i18n, OP-DEMO01, preview files, A1/A4 verified
- ✅ Frontend: lint clean; OP-DEMO01 visible on cedente operations list (state=CERRADA); pack-detail preview render flow validated via API
- ⚠️ Legacy `backend_test.py` from iteration_2 needs cred update (not blocking demo)
