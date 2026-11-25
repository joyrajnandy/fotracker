# Free Hosting & Deployment Guide — FO Tracker

This guide covers the best **free** hosting platforms for **FO Tracker** (FastAPI + React + SQLite), with full support for **ASGI (`uvicorn`)**, **SSE live streams**, and **outbound market APIs** (Yahoo Finance, NSE BhavCopy, AMFI `mfapi.in`).

> **Why not PythonAnywhere Free?** PythonAnywhere's free tier restricts outbound internet to an allowlist (blocking Yahoo/NSE/AMFI) and uses synchronous WSGI workers that do not support ASGI/SSE cleanly.

---

## Option 1: Render (Easiest GitHub Auto-Deploy — No Credit Card)

Render's free **Web Service** runs `uvicorn` natively, gives you free HTTPS (`https://<app>.onrender.com`), and allows **unrestricted outbound HTTP** for live NIFTY 50, SENSEX, GSec, and Mutual Fund feeds.

### Step 1 — Push Latest Code to GitHub
Your repo is already on GitHub:
- Repository: `https://github.com/joyrajnandy/fotracker.git`
- Branch: `Release-2`

### Step 2 — Create a Render Web Service
1. Sign up / log in at **https://render.com** (using GitHub).
2. Click **New +** → **Web Service**.
3. Connect your repository **`joyrajnandy/fotracker`** and select branch **`Release-2`**.
4. Configure the service:
   - **Name**: `fo-tracker`
   - **Region**: Singapore (closest to India) or Oregon
   - **Runtime**: `Docker` (uses the root `Dockerfile`, which builds `frontend/dist` and runs `uvicorn` on `$PORT` automatically)
   - *(No manual Build/Start commands needed when using Docker — Render reads the root `Dockerfile` directly.)*
   - **Instance Type**: **Free**

### Step 3 — Add Environment Variables on Render
In **Environment** → **Add Environment Variable**:

| Key | Value |
|---|---|
| `SECRET_KEY` | `<your-long-random-secret-key>` |
| `DEBUG` | `False` |
| `DATABASE_URL` | `sqlite:///./data/fotracker.db` *(or a free Neon PostgreSQL URL for persistent storage)* |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_EMAIL` | `admin@fotracker.local` |
| `ADMIN_PASSWORD` | `<your-strong-admin-password>` |
| `CORS_ORIGINS` | `["https://fo-tracker.onrender.com"]` |

### Step 4 — Deploy & Open
Click **Create Web Service**. Once live:
- App UI: `https://fo-tracker.onrender.com`
- Health Check: `https://fo-tracker.onrender.com/health`

> **Free-Tier Note on Render**: Render's free disk resets when the service sleeps/redeploys. For **permanent** cloud storage on Render Free, create a free PostgreSQL database at **https://neon.tech** (0.5 GB free forever) and paste its connection string into `DATABASE_URL` (our `database.py` supports both SQLite and PostgreSQL automatically).

---

## Option 2: Koyeb (Free Docker Hosting — No Credit Card)

Koyeb offers a free **Nano** web service that runs your existing `backend` + built `frontend` via Docker with free HTTPS and outbound internet access.

1. Sign up at **https://app.koyeb.com**.
2. Click **Create Web Service** → **GitHub** → select `joyrajnandy/fotracker` (`Release-2`).
3. Set **Builder**: `Buildpack` or `Dockerfile` (if using `Dockerfile`, build `frontend/dist` first or add a root `Dockerfile` that builds `frontend` and runs `backend`).
4. Expose port `8000`, set the same environment variables (`SECRET_KEY`, `DATABASE_URL`, `ADMIN_PASSWORD`, `CORS_ORIGINS`), and deploy.

---

## Option 3: Oracle Cloud Always Free VM (Best for 24/7 Persistent SQLite + Docker)

If you want **24/7 uptime (no sleep)** and **persistent SQLite (`fotracker.db`)** for \$0/month forever:

1. Create an **Oracle Cloud Free Tier** account (**https://www.oracle.com/cloud/free/**).
2. Launch an **Always Free Compute Instance** (Ubuntu 22.04, `VM.Standard.E2.1.Micro` or ARM `VM.Standard.A1.Flex`).
3. Open **Ingress Rules** in your VCN Security List for ports `80`, `443`, and `5173` (or `8000`).
4. SSH into the VM and run:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   git clone -b Release-2 https://github.com/joyrajnandy/fotracker.git
   cd fotracker
   cp .env.example .env   # set SECRET_KEY
   sudo docker compose up -d --build
   ```
5. Upload your existing `backend/data/fotracker.db` via `scp` to keep all trades, cash entries, and holdings.

---

## Quick Comparison

| Platform | Cost | Outbound Market APIs | Persistent SQLite | Sleeps when Idle? |
|---|---|---|---|---|
| **Render (Free)** | \$0 | Yes (NIFTY, SENSEX, GSec, MF) | No (use Neon Free Postgres) | Yes (15 min) |
| **Koyeb (Free)** | \$0 | Yes | No (use Neon Free Postgres) | Yes |
| **Oracle Cloud Always Free** | \$0 | Yes | **Yes (200 GB disk)** | **No (24/7)** |
| PythonAnywhere Free | \$0 | Blocked (allowlist only) | Yes | No |
