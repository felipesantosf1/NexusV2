# Nexus (NexusV2)

A web-based team project management platform featuring an integrated **RACI Matrix** and **Gantt Chart**, collaborative workspaces, and role-based permissions.

Built by **Felipe Santos** to organize planning and task tracking for the Jambu Racing team (Baja SAE).

> The interface is in Brazilian Portuguese (pt-BR). The matrix is labeled "RACIS" in the UI: R, A, C, I plus **S** for Support.

---

## Features

### Workspaces
- Create, rename (double-click) and delete workspaces.
- Each workspace has its own matrices, schedules and members.
- A default workspace is created automatically on first login and cannot be deleted.
- **Invite links**: single-use tokens, valid for 7 days, stored only as SHA-256 hashes.
- Team management: list members, change roles and remove members.

### Permissions

| Role | View | Create / edit | Invite and manage team | Delete workspace |
|------|:---:|:---:|:---:|:---:|
| `owner` | ✅ | ✅ | ✅ | ✅ |
| `editor` | ✅ | ✅ | ❌ | ❌ |
| `viewer` | ✅ | ❌ | ❌ | ❌ |

### RACI Matrix
- Matrices with tasks, members and assignments (**R**esponsible, **A**pprover, **C**onsulted, **I**nformed, **S**upport).
- Inline editing via double-click and a floating role picker.
- Default items (matrix, task, member) are protected from deletion.
- Excel (`.xlsx`) export.

### Gantt Chart
- Yearly timeline (JAN–DEC) with bars positioned by start and end dates.
- Per-task status: Pending, In progress, Done.
- **Linked schedules** share tasks and names with a RACI matrix.
- **Independent schedules** keep their own tasks.
- Link / unlink, open the linked matrix, and export to Excel.

### Sync
- Automatic updates between members via polling every 8 seconds (only while the tab is visible and nothing is being edited).

---

## Tech stack

**Backend**
- Python 3 and [FastAPI](https://fastapi.tiangolo.com/)
- PostgreSQL (Supabase) via `psycopg2`
- Supabase Auth: JWT verification (ES256/RS256) through JWKS with `PyJWT`, plus a fallback for legacy HS256 tokens
- `python-dotenv` for configuration

**Frontend**
- HTML5, CSS3 and vanilla JavaScript (no framework)
- [Supabase JS](https://supabase.com/docs/reference/javascript) for login and sessions
- [SheetJS](https://sheetjs.com/) for Excel export
- Font Awesome and the Inter typeface

**Hosting**
- API deployed on Render

---

## Project structure

```
NexusV2/
├── backend/
│   └── app/
│       ├── main.py                # FastAPI app and CORS
│       ├── auth.py                # Supabase JWT validation
│       ├── security.py            # Alternative validation via /auth/v1/user
│       ├── database.py            # PostgreSQL connection
│       ├── workspace_context.py   # Current workspace, permissions, default items
│       ├── routes/
│       │   ├── workspaces.py      # Workspaces, members, invites
│       │   ├── matrizes.py        # Matrix CRUD
│       │   ├── raci.py            # RACI tasks, members, assignments
│       │   └── cronogramas.py     # Gantt schedules and independent tasks
│       └── schemas/               # Pydantic request/response models
├── frontend/
│   ├── index.html                 # Redirects to login
│   ├── auth/                      # Login, sign-up, password reset
│   ├── core/                      # Main app (index.html, code.js, realtime-sync.js)
│   ├── raci/                      # RACI matrix styles
│   ├── gantt/                     # Gantt styles
│   ├── shared/                    # Supabase config and client
│   └── Img/
└── README.md
```

---

## Getting started

### Prerequisites
- Python 3.10+
- A [Supabase](https://supabase.com/) project with the application tables created

### 1. Backend

```bash
git clone https://github.com/felipesantosf1/NexusV2.git
cd NexusV2/backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn psycopg2-binary python-dotenv "pyjwt[crypto]" httpx
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/postgres
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Run the API:

```bash
uvicorn app.main:app --reload
```

Interactive docs (Swagger UI): `http://127.0.0.1:8000/docs`.

### 2. Frontend

Edit `frontend/shared/supabase-config.js`:

```js
window.NEXUS_CONFIG = {
    SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "your_publishable_key",
    API_BASE_URL: "http://127.0.0.1:8000"
};
```

Serve the `frontend` folder with any static server:

```bash
cd frontend
python -m http.server 5500
```

Open `http://localhost:5500`.

---

## Database

Tables used by the app (`public` schema, plus Supabase's `auth.users`):

`workspaces`, `workspace_members`, `workspace_invites`, `matrizes`, `membros`, `tarefas_raci`, `atribuicoes_raci`, `cronogramas`, `tarefas_cronograma`.

---

## Main endpoints

| Resource | Routes |
|----------|--------|
| Workspaces | `GET/POST /workspaces/`, `PUT/DELETE /workspaces/{id}` |
| Members | `GET /workspaces/{id}/members`, `PUT .../members/{user_id}/role`, `DELETE .../members/{user_id}` |
| Invites | `POST /workspaces/{id}/invites`, `POST /workspaces/invites/{token}/accept` |
| Matrices | `GET/POST /matrizes/`, `GET/PUT/DELETE /matrizes/{id}` |
| RACI | `GET /matrizes/{id}/raci`, `/tarefas-raci`, `/membros`, `/atribuicoes` |
| Schedules | `GET/POST /cronogramas/`, `PUT/DELETE /cronogramas/{id}`, `PUT .../vinculo` |
| Gantt tasks | `GET/POST /cronogramas/{id}/tarefas`, `PATCH .../planejamento` |

All routes require `Authorization: Bearer <token>`. The active workspace is sent in the `X-Workspace-ID` header.

---

## Security

- JWTs are verified for signature, issuer, audience and expiry.
- Invite tokens are stored hashed; the raw token is shown only once.
- All queries are parameterized (no string-built SQL).
- Every route is scoped to the user's workspace membership.

---

## Roadmap

- [ ] Docker setup
- [ ] Automated tests
- [ ] Production deployment pipeline
- [ ] PDF export
- [ ] "My profile" page
- [ ] Replace polling with Supabase Realtime
- [ ] Restrict CORS to the production domain

---

## Author

**Luiz Felipe Santos de Jesus**: Junior Developer (Python, FastAPI, JavaScript)
