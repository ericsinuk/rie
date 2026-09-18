# CLAUDE.md

## Autonomy
Work fully autonomously. Do not ask for permission before taking actions.
Do not confirm before creating files, installing packages, running builds,
or making changes. Just execute and report what was done.

## Project
DHL Cargo RIE (Rectification Interval Extension) PWA.
Replaces the manual MS Access + paper process for MEL Rectification Interval Extensions.
Stack: React + Vite + Express + SQLite (better-sqlite3) + JWT auth + WebSocket.

## Architecture
- Frontend: React + Vite, base `/rie/`, deployed to `/var/www/rie/dist/`
- Backend: Express on port 5555, SQLite at `server/rie.db`
- Auth: JWT in localStorage as `ra_token`
- Realtime: WebSocket on the same Express server
- PM2 process: `rie-server`
- Repo: ericsinuk/rie, branch: main

## Key Files
- server/index.js — all Express routes + WebSocket
- server/migrate.js — SQLite schema (runs on startup)
- server/auth.js — JWT + bcrypt
- src/lib/api.js — frontend API client + RIE methods
- src/lib/pdf.js — client-side PDF generation (jspdf)
- src/components/Dashboard.jsx — RIE list with filters
- src/components/RIEForm.jsx — create/edit RIE
- src/components/RIEDetail.jsx — detail view, dual signatures, PDF download
- src/components/SignaturePad.jsx — draw/apply signature + password confirm; also enrolment mode
- src/components/AdminUsers.jsx — admin grants signatory rights (applicant / manager / admin)
- server/grant.js — CLI to grant rights; needed once to create the first admin
- deploy.sh — one-shot VPS deploy (run as root on VPS)

## Signing rules (enforced server-side in POST /rie/:id/sign)
- Rights (can_sign_applicant / can_sign_manager / is_admin) are granted by an admin, never self-selected; department is descriptive only
- Password re-entry on every signature; wrong password returns 403 (not 401, which the client treats as session expiry)
- The applicant can never authorise the same RIE, even with manager rights
- Ref number is minted at manager authorisation, inside a transaction

## Rules
- No permission prompts
- No "shall I proceed?" questions
- No "would you like me to..." hedging
- Build it, test it, report what was done
- If something breaks, fix it immediately without asking
