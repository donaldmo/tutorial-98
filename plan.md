# Node Server Migration Plan

## Goal
Build a new Node.js backend in `node-server` using Express + JWT + MongoDB (Mongoose), with:
- dual auth transport: `Authorization: Bearer <token>` **or** HttpOnly auth cookie
- MongoDB `_id` as backend identity
- API responses exposing both `_id` and `id` (`id` mirrors `_id`)

## Phases

### Phase 1 — Foundation (current)
1. Initialize Node project structure.
2. Add environment config, DB connection, app bootstrap.
3. Add CORS with trusted origin list and credential support.
4. Add JWT utilities and cookie configuration.
5. Add auth middleware supporting Bearer and cookie extraction.
6. Add base `Staff` mongoose model.
7. Add initial auth routes (`/auth/login`, `/auth/me`, `/auth/logout`).
8. Add shared serialization utility to expose both `id` and `_id`.

### Phase 2 — Core domain
1. Staff CRUD
2. Jobs CRUD
3. Allocations CRUD
4. Time entries CRUD

### Phase 3 — Operations
1. Departments
2. Authorization workflow
3. Notifications
4. Dashboard summaries

### Phase 4 — Analytics and reports
1. Core analytics endpoints
2. Reports endpoints
3. Performance/index tuning

### Phase 5 — Integrations and SaaS
1. Webhooks
2. Import/export flows
3. SaaS and tenant routes

## Acceptance criteria for Phase 1
- Server starts and connects to MongoDB.
- CORS supports multiple trusted origins with credentials.
- Login returns JWT and sets HttpOnly cookie.
- Protected endpoint accepts either Bearer token or cookie.
- Auth responses include both `id` and `_id` for user payloads.

## Progress tracking
- [x] Plan created
- [x] Phase 1 implementation
- [x] Phase 1 validation run
- [x] Phase 2 implementation
- [x] Phase 2 validation run
- [x] Phase 2 review and gap fixes
- [x] Phase 3 implementation
- [x] Phase 3 validation run
- [x] Phase 3 review and gap fixes
- [x] Phase 4 implementation
- [x] Phase 4 validation run
- [x] Phase 4 review and gap fixes
- [x] Phase 5 implementation
- [x] Phase 5 validation run
