# 📈 FO Tracker — F&O Business Portfolio Manager

Enterprise-grade F&O (Futures & Options) trading portfolio tracker.
Multi-user, financial-year-aware, with P&L analytics, target tracking and CSV import.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Ant Design 5 |
| Charts | Recharts |
| State | Zustand + TanStack React Query |
| Backend | FastAPI (Python 3.11) + Uvicorn |
| ORM | SQLAlchemy 2.0 + Alembic |
| Auth | JWT (python-jose) + bcrypt (Invite-Only + Admin Role) |
| CSV / Quant | Pandas + PyXIRR |
| Live Market Data | Webhook + SSE (`nsearchives.nseindia.com`, `mfapi.in`, Yahoo Finance) |
| Database | SQLite 3 (WAL mode, zero external DB server) |
| Local Dev | Docker Compose (2 lightweight containers) |

---

## 📁 Project Structure

```
fo-tracker/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Route handlers
│   │   ├── core/            # Config, DB, Security, Dependencies
│   │   ├── models/          # SQLAlchemy DB models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/        # Business logic layer
│   │   └── utils/           # Financial year helpers
│   ├── alembic/             # DB migrations
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/           # Login, Home, TradeBook, PnL, Target
│   │   ├── components/      # AppLayout
│   │   ├── services/        # Axios API client
│   │   ├── store/           # Zustand auth store
│   │   └── types/           # TypeScript interfaces
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 🚀 LOCAL SETUP — Step by Step (Windows 10)

### OPTION A — Run with Docker (Recommended — Easiest)

#### Prerequisites
- Install **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop/
  - During install, enable WSL 2 backend when prompted
  - After install, open Docker Desktop and wait for the green "Engine running" status

#### Steps

**Step 1 — Clone / open the project folder**
```
Your project is already at: d:\Business-Portfolio
```

**Step 2 — Copy environment file**
```powershell
cd d:\Business-Portfolio
copy .env.example .env
```
*(Edit `.env` to set a strong `SECRET_KEY` before production use)*

**Step 3 — Start everything with Docker Compose**
```powershell
docker compose up -d --build
```
This will:
- Build the lightweight FastAPI backend image (with embedded SQLite 3 database at `./backend/data/fotracker.db`)
- Build the React frontend image
- Start both containers (`fo_tracker_backend` & `fo_tracker_frontend`)

Wait for logs to show:
```
fo_tracker_backend | INFO:     Uvicorn running on http://0.0.0.0:8000
fo_tracker_frontend | VITE v5.x.x  ready
```

**Step 4 — Open the app**
- **Frontend**: http://localhost:5173
- **API Docs (Swagger)**: http://localhost:8000/api/v1/docs

**Step 5 — Register your first user**
- Open http://localhost:5173
- Click the "Register" tab
- Create your account and log in

**To stop:**
```powershell
docker-compose down
```

**To stop and remove all data:**
```powershell
docker-compose down -v
```

---

### OPTION B — Run WITHOUT Docker (Manual Setup)

#### Prerequisites
1. **Python 3.11+**: https://www.python.org/downloads/
   - During install, check ✅ "Add Python to PATH"
2. **Node.js 20+**: https://nodejs.org/
3. **PostgreSQL 15**: https://www.postgresql.org/download/windows/
   - Remember your postgres superuser password
4. **Git** (optional): https://git-scm.com/download/win

---

#### PART 1 — Set Up PostgreSQL Database

**Step 1 — Open pgAdmin or psql (comes with PostgreSQL)**

Using psql (PowerShell):
```powershell
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres
```

**Step 2 — Create the database and user**
```sql
CREATE DATABASE fotracker_db;
CREATE USER fotracker WITH PASSWORD 'fotracker123';
GRANT ALL PRIVILEGES ON DATABASE fotracker_db TO fotracker;
-- PostgreSQL 15+ also needs schema grant:
\c fotracker_db
GRANT ALL ON SCHEMA public TO fotracker;
\q
```

---

#### PART 2 — Set Up the Backend

**Step 3 — Open a new PowerShell window for the backend**
```powershell
cd d:\Business-Portfolio\backend
```

**Step 4 — Create a Python virtual environment**
```powershell
python -m venv venv
```

**Step 5 — Activate the virtual environment**
```powershell
.\venv\Scripts\Activate.ps1
```
You should see `(venv)` at the start of your prompt.

> **If you get an error about execution policy**, run this first:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Then retry Step 5.

**Step 6 — Install Python dependencies**
```powershell
pip install -r requirements.txt
```
*(This takes 2–5 minutes the first time)*

**Step 7 — Create the backend .env file**
```powershell
copy .env.example .env
```
Then open `.env` in Notepad and verify/update:
```
DATABASE_URL=postgresql://fotracker:fotracker123@localhost:5432/fotracker_db
SECRET_KEY=my-very-long-random-secret-key-12345
```

**Step 8 — Start the backend server**
```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

The database tables are created automatically on first startup.

✅ **Backend is running at**: http://localhost:8000
📄 **Swagger API docs**: http://localhost:8000/api/v1/docs

---

#### PART 3 — Set Up the Frontend

**Step 9 — Open a SECOND PowerShell window for the frontend**
```powershell
cd d:\Business-Portfolio\frontend
```

**Step 10 — Install Node.js dependencies**
```powershell
npm install
```
*(Takes 1–3 minutes)*

**Step 11 — Start the frontend dev server**
```powershell
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

✅ **Frontend is running at**: http://localhost:5173

---

#### PART 4 — Use the Application

**Step 12 — Open the app in your browser**
```
http://localhost:5173
```

**Step 13 — Register your account**
- Click the **Register** tab
- Fill in Username, Email, Password
- Click **Create Account**
- Switch to the **Sign In** tab and log in

---

## 📋 Usage Guide

### Home Page
- Select **Financial Year** (top right dropdown)
- **Add Investments**: Click to expand, fill in type, name, amount, date
- **Add Interest**: Click to expand, fill in amount, date, description
- View **Portfolio Growth** chart
- View **Investments** and **Interest** tables

### Trade Book
- Click **Upload CSV** to import your trade data
- Duplicates are automatically skipped
- Filter by Trade Type (Buy/Sell)
- 15 rows per page pagination

### CSV Format
Your CSV must have these columns (order does not matter):
```
symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date
```
Example:
```csv
symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date
NIFTY26OCT23500CE,,2026-10-26,NSE,FO,,buy,false,520.000000,2.250000,708916,1100000011845280,2026-10-26T09:24:30,2026-10-27
```

### P&L Page
- Automatically calculates profit/loss per expiry date
- Pie chart: Profit vs Loss split
- Bar chart: P&L by expiry (top 20)
- Detailed table with all expiry-wise breakdown

### Target Page
- **4 Cards**: Yearly / Quarterly / Monthly / Weekly targets
- Targets = **10% of total investments** (auto-calculated)
- Green border = Target ACHIEVED ✅
- Red border = Target PENDING ❌
- Click **Recalculate** after adding investments

---

## 🔄 Database Migrations (Advanced)

If you make model changes in future:
```powershell
cd d:\Business-Portfolio\backend
.\venv\Scripts\Activate.ps1

# Generate new migration
alembic revision --autogenerate -m "describe_your_change"

# Apply migration
alembic upgrade head
```

---

## 🚢 Deploy to Oracle Cloud (OCI Free Tier)

### OCI Always Free Resources you can use:
- 2× AMD VMs (1 OCPU, 1 GB RAM each) — or
- 1× ARM VM (4 OCPU, 24 GB RAM) — **recommended**
- 200 GB Block Volume storage

### Deployment steps (summary):
1. Create OCI Always Free ARM VM (Ubuntu 22.04)
2. SSH into VM; install Docker + Docker Compose
3. Copy project files via `scp` or `git clone`
4. Update `.env` with production `SECRET_KEY` and `CORS_ORIGINS`
5. Run `docker-compose up -d`
6. Configure OCI Security List to open ports 80, 443
7. (Optional) Set up Nginx + Let's Encrypt SSL

---

## 🔑 Default Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite) | 5173 | http://localhost:5173 |
| Backend (FastAPI) | 8000 | http://localhost:8000 |
| PostgreSQL | 5432 | localhost:5432 |
| API Swagger Docs | 8000 | http://localhost:8000/api/v1/docs |

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|---------|
| `venv\Scripts\Activate.ps1` blocked | Run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `psycopg2` install fails | Install PostgreSQL first, or use `psycopg2-binary` (already in requirements) |
| Frontend says "Network Error" | Make sure backend is running on port 8000 |
| DB connection refused | Check PostgreSQL service is running: `services.msc` → PostgreSQL |
| Docker Desktop won't start | Enable Virtualization in BIOS; enable WSL 2 |
| Port 5432 in use | Another PostgreSQL running — stop it via `services.msc` |

---

*FO Tracker v1.0.0 — Built for professional F&O trading portfolio management*
