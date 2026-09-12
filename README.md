# Velozity Global Solutions – Real-Time Client Project Dashboard

A secure, full-stack, enterprise-grade project management dashboard built for the **Velozity Global Solutions Technical Hiring Assessment**. 

The system features multi-role access control (Admin, Project Manager, Developer), real-time task status synchronization and activity broadcasting via Socket.IO, PostgreSQL database-backed missed-event catchup, scheduled server-side background job overdue evaluation, and in-app notifications.

---

## 1. Project Overview

The **Velozity Global Solutions Project Management Dashboard** enables cross-functional teams to track clients, projects, and tasks with granular authorization boundaries. The platform is designed around a single source of truth: PostgreSQL persisted records accessed through Prisma ORM, with live multi-client updates dispatched over Socket.IO WebSockets and scheduled background processing via `node-cron`.

### Key Capabilities
- **Strict Role-Based Access Control (RBAC)** across Admin, Project Manager, and Developer personas.
- **Dual-Token Authentication** with short-lived memory access tokens and HttpOnly rotating refresh tokens backed by database session records.
- **Transactional Task & Activity Logging** capturing status changes directly in PostgreSQL.
- **Real-Time Event Broadcasting** delivering instant task updates and activity feeds to authorized project and global rooms.
- **Database-Backed Missed-Event Catchup** enabling reconnected clients to retrieve missed events using a deterministic compound cursor (`createdAt` + `id`).
- **Automated Overdue Task Processing** running as an independent server-side scheduler.
- **Real-Time In-App Notifications** notifying developers of assignments and PMs of review-ready tasks.
- **Multi-Parameter Task Filtering** supporting simultaneous filtering across `status`, `priority`, `fromDate`, and `toDate` at the database level.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, Vite, TypeScript | Single-page application, responsive dashboard UI |
| **Backend** | Node.js, Express, TypeScript | REST API server, security middlewares, routing |
| **Realtime** | Socket.IO 4 | Low-latency WebSockets, room authorization, presence |
| **Database** | PostgreSQL 16 | ACID-compliant relational data store |
| **ORM** | Prisma 5 | Type-safe queries, migrations, and transactions |
| **Background Jobs** | `node-cron` | Autonomous server-side overdue task scheduler |
| **Security** | `jsonwebtoken`, `bcryptjs`, `cookie-parser` | JWT dual-tokens, password hashing, HttpOnly cookies |
| **Testing** | Node.js Test Runner, TypeScript | Unified automated integration test suite (174 tests) |

---

## 3. Architecture Overview

The system strictly enforces a decoupled architecture where Express and PostgreSQL form the source of truth, and Socket.IO delivers live updates post-commit.

```
                  +-----------------------------------+
                  |      React 18 SPA (Client)        |
                  +-----------------+-----------------+
                                    |
          +-------------------------+-------------------------+
          | REST API (JSON / Cookies)                         | Socket.IO (WebSockets)
          v                                                   v
+-----------------------+                           +-------------------+
|     Express 4 App     |                           | Socket.IO Server  |
| - Authentication      |                           | - Room Auth       |
| - API-level RBAC      |                           | - Presence Sync   |
| - Query Validation    |                           | - Live Broadcasts |
+-----------+-----------+                           +---------+---------+
            |                                                 |
            | Interactive Transactions (Post-Commit Emits)    |
            v                                                 |
+-------------------------------------------------------------+---------+
|                          Prisma ORM                                   |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                       PostgreSQL Database                             |
|  - Users             - Projects         - ActivityLog (Audit)         |
|  - RefreshSessions   - Tasks            - Notifications               |
+-----------------------------------+-----------------------------------+
                                    ^
                                    |
+-----------------------------------+-----------------------------------+
|               Background Scheduler (node-cron)                        |
|  - Autonomous server-side execution (no page load required)           |
|  - Persists isOverdue = true / false directly in PostgreSQL           |
+-----------------------------------------------------------------------+
```

---

## 4. Authentication Architecture

The application implements a secure dual-token authentication architecture:

1. **Access Token**:
   - Short-lived (**15 minutes**).
   - Signed with `JWT_ACCESS_SECRET`.
   - Payload: `{ userId, role }`.
   - Transmitted via standard `Authorization: Bearer <token>` header.
   - Kept exclusively in client memory (React state) — never stored in `localStorage` or `sessionStorage`.

2. **Refresh Token**:
   - Long-lived (**7 days**).
   - Signed with `JWT_REFRESH_SECRET`.
   - Stored in an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie scoped to `/api/auth`.
   - Inaccessible to client-side JavaScript, eliminating XSS token theft.

3. **Database Session Tracking & Rotation**:
   - Every active refresh token corresponds to a record in the `RefreshSession` table.
   - Upon calling `POST /api/auth/refresh`, token rotation issues a new refresh token and invalidates the old one.
   - Replay detection: If an invalidated refresh token is reused, all active sessions for that user are revoked immediately.
   - Calling `POST /api/auth/logout` deletes the server-side session and clears the cookie.

---

## 5. Role-Based Access Control (RBAC) & IDOR Prevention

Every API endpoint enforces server-side authorization via `requireAuth` and `requireRole` middlewares. Permissions are derived strictly from verified JWT claims, never client parameters.

| Resource / Action | Admin | Project Manager | Developer | IDOR Protection |
|---|:---:|:---:|:---:|---|
| **List Projects** | All | Own Created | Assigned Tasks Only | Non-accessible projects omitted |
| **Create Project** | Yes | Yes | No (403) | `createdBy` derived from `req.user.userId` |
| **View Project Details** | Yes | Own Created | Assigned Tasks Only | Cross-project access returns 403 Forbidden |
| **Update / Delete Project**| Yes | Own Created | No (403) | Non-owners blocked with 403 Forbidden |
| **List Project Tasks** | All | Own Created | Assigned to Dev Only | Developers cannot see other developers' tasks |
| **Create Task** | Yes | Own Created | No (403) | Rejects assignment to non-developers |
| **Update Task (Details)** | Yes | Own Created | No (403) | Developers attempting field edits receive 403 |
| **Update Task (Status)** | Yes | Own Created | Assigned Task Only | Updating unassigned task returns 403 Forbidden |
| **Delete Task** | Yes | Own Created | No (403) | Developers blocked with 403 Forbidden |
| **List Notifications** | Own | Own | Own | Scoped strictly to authenticated caller |
| **Mark Notification Read** | Own | Own | Own | Accessing another user's notification yields 403 |

---

## 6. Database Schema & Prisma ORM

The schema is defined in [`server/prisma/schema.prisma`](server/prisma/schema.prisma) with relational integrity and composite indexes:

### Models
- **`User`**: Core user accounts (`id`, `name`, `email`, `passwordHash`, `role`, `createdAt`).
- **`RefreshSession`**: Server-side token tracking (`id`, `userId`, `tokenHash`, `revoked`, `expiresAt`).
- **`Client`**: Organization clients (`id`, `name`, `email`, `company`).
- **`Project`**: Projects linked to clients (`id`, `name`, `description`, `clientId`, `createdBy`, `createdAt`).
- **`Task`**: Tasks within projects (`id`, `projectId`, `title`, `description`, `status`, `priority`, `dueDate`, `isOverdue`, `assignedTo`, `createdAt`).
- **`ActivityLog`**: Audit logs for task status changes (`id`, `taskId`, `projectId`, `userId`, `fromStatus`, `toStatus`, `description`, `createdAt`).
- **`Notification`**: In-app notifications (`id`, `userId`, `type`, `message`, `relatedTaskId`, `isRead`, `createdAt`).

### Performance Indexes
1. `(user_id, is_read)` on `notifications`
2. `(project_id, created_at)` on `tasks`
3. `(assigned_to, status)` on `tasks`
4. `(due_date, is_overdue, status)` on `tasks`
5. `(project_id, created_at)` on `activity_logs`
6. `(user_id, created_at)` on `activity_logs`
7. `(user_id, revoked)` on `refresh_sessions`
8. `(created_by)` on `projects`

---

## 7. Real-Time Architecture (Socket.IO)

Socket connections require a valid JWT access token passed via `auth.token`.

### Room Strategy
- **`user:<userId>`**: Joined upon authenticated connection; used for targeted notifications and unread counts.
- **`project:<projectId>`**: Joined after verifying database authorization (Admin, Project Manager who owns the project, or Developer with assigned tasks).
- **`global:activity`**: Joined exclusively by **Admin** for company-wide activity auditing.

### Multi-Tab Online Presence
- Tracked by `PresenceManager` mapping `userId -> Set<socketId>`.
- Opening multiple browser tabs counts as **1 unique online user**.
- A user transitions to offline only after their last connection disconnects.

---

## 8. Missed-Event Catchup Design

The catchup mechanism (`CatchupService`) queries PostgreSQL `ActivityLog` directly:
- **No in-memory buffers**: Historical events persist across server restarts.
- **Strict Last 20 Limit**: Queries fetch the latest 20 missed events in chronological order (oldest to newest).
- **Deterministic Compound Cursor**: Clients supply `lastSeenActivityId`. The query compares:
  $$\text{createdAt} > \text{cursor.createdAt} \lor (\text{createdAt} = \text{cursor.createdAt} \land \text{id} > \text{cursor.id})$$
  This guarantees that events sharing the exact same timestamp are never skipped.
- **Authorization Enforcement**: Catchup requests verify project access before returning data.

---

## 9. Background Overdue Task Job (`node-cron`)

Overdue task processing is executed on a server-side timer via `node-cron`:
- **Independent Execution**: Runs automatically regardless of client requests, webhooks, or page loads.
- **PostgreSQL Persistence**: Updates `tasks.is_overdue = true` in PostgreSQL.
- **Safety Invariant**: Tasks marked `DONE` are **never** marked overdue.
- **Automatic Recovery**: Transitioning an overdue task to `DONE` or extending its `dueDate` clears `isOverdue: false` on the next run.
- **Configurable Schedule**: Set via `OVERDUE_TASK_CRON` (default: `'* * * * *'`, every minute).

---

## 10. In-App Notification System

Notifications are saved to PostgreSQL inside interactive Prisma transactions:
- **`TASK_ASSIGNED`**: Created when a task is assigned or reassigned to a developer.
- **`TASK_IN_REVIEW`**: Created for the owning Project Manager when a task transitions to `IN_REVIEW`.
- **Targeted WebSocket Delivery**: Emitted post-commit to `user:<userId>` as `notification:new` and `notification:unreadCount`.
- **Authoritative REST Endpoints**:
  - `GET /api/notifications`: Scoped list with pagination.
  - `GET /api/notifications/unread-count`: Authoritative DB count.
  - `PATCH /api/notifications/:id/read`: Mark single notification as read (with IDOR protection).
  - `PATCH /api/notifications/read-all`: Mark all notifications read for caller.

---

## 11. Role-Specific Dashboards

The React SPA dynamically adapts based on the user's role while relying on backend enforcement:

- **Admin Dashboard**:
  - Global project selector (all projects across the company).
  - System-wide activity feed via `global:activity` room.
  - Full task filtering and management capabilities.
- **Project Manager Dashboard**:
  - Scoped to projects created by the PM.
  - Task management, assignment controls, and review notifications.
  - Cross-project access strictly prevented.
- **Developer Dashboard**:
  - Displays only projects containing tasks assigned to the developer.
  - Shows only assigned tasks (unassigned tasks in the same project are hidden).
  - Status update dropdown on assigned tasks; field edits and reassignments disabled.

---

## 12. Query-Parameter Task Filters

The `GET /api/projects/:projectId/tasks` endpoint supports four validated query parameters:
- `status`: One of `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`.
- `priority`: One of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (`URGENT` is strictly rejected with 400).
- `fromDate` & `toDate`: ISO 8601 date strings (`fromDate <= toDate`).

All filters are executed at the database level inside Prisma `where` clauses while preserving role scoping (Developers only receive their assigned tasks). Filter state is synchronized with browser URL parameters (`window.history.replaceState`) for shareable views.

---

## 13. Local Setup & Prerequisites

### Prerequisites
- **Node.js** ≥ 18.0.0
- **npm** ≥ 9.0.0
- **PostgreSQL** ≥ 14 running locally on port `5432`

### Setup Instructions

```bash
# 1. Clone the repository
git clone <repository-url>
cd internshala-project

# 2. Install workspace dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your local PostgreSQL credentials
```

---

## 14. Environment Variables Reference

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection URL (`postgresql://user:pass@localhost:5432/velozity_db?schema=public`) |
| `PORT` | No | `4000` | Express API server port |
| `NODE_ENV` | No | `development` | Environment mode (`development` / `production`) |
| `FRONTEND_URL` | No | `http://localhost:5173` | React client URL for CORS authorization |
| `JWT_ACCESS_SECRET` | Yes | - | Signing secret for 15-minute access tokens (≥32 chars) |
| `JWT_REFRESH_SECRET`| Yes | - | Signing secret for 7-day refresh tokens (≥32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN`| No | `7d` | Refresh token lifetime |
| `COOKIE_NAME` | No | `refreshToken` | Name of the HttpOnly refresh token cookie |
| `OVERDUE_TASK_CRON` | No | `* * * * *` | Cron expression for background overdue task evaluation |

---

## 15. Database Migration Commands

```bash
# Apply migrations to PostgreSQL
npm run prisma:migrate

# Reset database schema if needed (caution: wipes data)
npm run prisma:reset

# Open Prisma Studio web inspector
npm run prisma:studio
```

---

## 16. Database Seed Command

```bash
# Populate database with seed users, clients, projects, tasks, activities, and notifications
npm run prisma:seed
```

---

## 17. Automated Test Suite Commands

The test suite runs against a live PostgreSQL instance with isolated ports for each phase:

```bash
# Run the complete regression test suite (174 tests)
npm run test

# Run individual phase test suites
npx tsx server/test/security.test.ts        # Phase 2: Auth & RBAC (29 tests)
npx tsx server/test/projects-tasks.test.ts  # Phase 3: REST & ActivityLog (45 tests)
npx tsx server/test/realtime.test.ts        # Phase 4: Socket.IO & Presence (20 tests)
npx tsx server/test/catchup.test.ts         # Phase 5: Missed-Event Catchup (24 tests)
npx tsx server/test/jobs.test.ts            # Phase 6: Background Overdue Job (16 tests)
npx tsx server/test/notifications.test.ts   # Phase 7: Notifications & IDOR (20 tests)
npx tsx server/test/task-filters.test.ts    # Phase 8: Task Filters & Regression (20 tests)
```

---

## 18. Build & Typecheck Commands

```bash
# Run server TypeScript typecheck
npm run typecheck --workspace=server

# Run client TypeScript typecheck
npm run typecheck --workspace=client

# Build both server (tsc) and client (Vite bundle) for production
npm run build

# Start development servers concurrently
npm run dev:server    # Express API on http://localhost:4000
npm run dev:client    # Vite dev server on http://localhost:5173
```

---

## 19. Seed / Demo Credentials

All seed accounts share the same development password:

> **Development Password**: `DevPassword123!`

| Role | Name | Email | Permissions Scope |
|---|---|---|---|
| **Admin** | System Admin | `admin@velozity.com` | Full global access across all projects, tasks, and activity logs |
| **Project Manager** | Alice Johnson | `pm1@velozity.com` | Access to PM1 created projects, task creation/updates, review notifications |
| **Project Manager** | Bob Smith | `pm2@velozity.com` | Access to PM2 created projects; isolated from PM1 projects |
| **Developer** | Charlie Brown | `dev1@velozity.com` | Access only to assigned tasks; can update task status |
| **Developer** | Diana Prince | `dev2@velozity.com` | Access only to assigned tasks; can update task status |
| **Developer** | Evan Wright | `dev3@velozity.com` | Access only to assigned tasks; can update task status |
| **Developer** | Fiona Gallagher | `dev4@velozity.com` | Access only to assigned tasks; can update task status |

---

## 20. Limitations & Future Improvements

- **Horizontal WebSocket Scaling**: Currently uses in-memory Socket.IO adapter. Production scaling across multiple server instances would utilize `@socket.io/redis-adapter`.
- **Database Connection Pooling**: Direct Prisma PostgreSQL connection. For serverless deployments, Prisma Accelerate or PgBouncer should be used.
- **Push Notifications**: In-app notifications are delivered via WebSockets. Web Push notifications (Service Workers) could be added for closed-browser alerting.
- **File Attachments**: Tasks currently support markdown descriptions; S3/GCS bucket integration could be added for document attachments.

---

## 21. Assessment-Specific Architectural Decisions

1. **Pure Socket.IO Real-Time Delivery**: No polling or Server-Sent Events (SSE) are used. Reconnections automatically request missed events through the PostgreSQL catchup endpoint.
2. **Deterministic Compound Cursor**: Cursors use both `createdAt` and `id` to guarantee zero skipped events even when multiple records share identical millisecond timestamps.
3. **TaskPriority Enum Standard**: Follows the strict requirement of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Legacy `URGENT` values are rejected with `400 VALIDATION_ERROR`.
4. **Autonomous Overdue Evaluation**: Overdue flags are never calculated solely on page load; they are computed and persisted directly in PostgreSQL by the background scheduler.
5. **No Client-Trusted Identity**: All authorizations, room joins, task modifications, and catchup operations verify caller permissions server-side against PostgreSQL.
