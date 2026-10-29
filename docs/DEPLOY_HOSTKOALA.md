# Deploying LearnLens on HostKoala (cPanel + phpMyAdmin)

LearnLens has three parts, and each one runs differently on cPanel:

| Part | Local | On HostKoala |
|---|---|---|
| Database | PostgreSQL | MariaDB/MySQL, managed in phpMyAdmin |
| Backend (FastAPI) | `uvicorn` | cPanel **Setup Python App** (Passenger) via `passenger_wsgi.py` |
| Frontend (Next.js) | `npm run dev` | cPanel **Setup Node.js App** |

## 0. Check before you start (the blockers)

1. **Tesseract OCR.** Grading calls the `tesseract` program through `pytesseract`.
   Shared hosting gives you no root access, so you cannot `apt install tesseract-ocr`.
   Ask HostKoala support: *"Is the `tesseract` binary installed, or can it be?"*
   If the answer is no, everything except grading still works: login, exams and uploads.
   For grading you would then need a VPS plan instead of shared hosting.
2. **Python App and Node.js App.** Make sure both **Setup Python App** and
   **Setup Node.js App** appear in your cPanel. Some shared plans only offer PHP.
   You need Python 3.10 or newer and Node.js 20.9 or newer (required by Next.js 16).

## 1. Database (phpMyAdmin)

1. cPanel → **MySQL® Databases**:
   - Create a database, e.g. `learnlens`. cPanel names it `cpuser_learnlens`.
   - Create a user with a strong password.
   - **Add User To Database** and grant **ALL PRIVILEGES**.
2. cPanel → **phpMyAdmin** → click the new database in the left panel → **Import**.
   Choose `mysql/learnlens_schema_mysql.sql` and click **Go**.
   - Do **not** import `postgresql/learnlens_schema.sql`. That file is the PostgreSQL dump that caused the `\restrict` error.
   - If an import fails partway, drop the tables it created before you import again.
3. Ten tables should exist afterwards: `users`, `user_profiles`, `password_resets`,
   `exams`, `exam_pages`, `exam_page_parts`, `answer_keys`, `test_papers`,
   `paper_pages`, `paper_scores`.

## 2. Backend (Setup Python App)

1. Upload the `backend/` folder, **without `venv/`**, to e.g. `~/learnlens_api`.
2. cPanel → **Setup Python App** → **Create Application**:
   - Python version: 3.11 or newest available
   - Application root: `learnlens_api`
   - Application URL: a subdomain such as `api.yourdomain.com` (recommended, so `/api` and `/uploads` stay at the root)
   - Startup file: `passenger_wsgi.py`, Entry point: `application`
3. Copy the "Enter to the virtual environment" command that cPanel shows and run it in cPanel **Terminal**, then:
   ```bash
   pip install -r requirements.txt
   pip uninstall -y opencv-python && pip install opencv-python-headless==4.10.0.84
   ```
   Servers have no display libraries (`libGL`), so the headless OpenCV build is required. The code uses no GUI functions, so the switch is safe.
4. Create `~/learnlens_api/.env`:
   ```ini
   DATABASE_URL=mysql+aiomysql://cpuser_lluser:YOUR_PASSWORD@localhost:3306/cpuser_learnlens?charset=utf8mb4
   SECRET_KEY=<long random string — e.g. python -c "import secrets;print(secrets.token_urlsafe(48))">
   CORS_ORIGINS=["https://yourdomain.com","https://www.yourdomain.com"]
   FRONTEND_URL=https://yourdomain.com
   TESSERACT_CMD=/usr/bin/tesseract
   SHOW_DEV_RESET_LINK=False
   SMTP_HOST=mail.yourdomain.com
   SMTP_PORT=465
   SMTP_USE_SSL=True
   SMTP_USER=noreply@yourdomain.com
   SMTP_PASSWORD=...
   ```
   - If the DB password contains `@ : / # ? %`, URL-encode it (`@` → `%40`, `#` → `%23`, and so on).
   - `TESSERACT_CMD` must point at the real path. Check it with `which tesseract`.
   - `SHOW_DEV_RESET_LINK=False` is required on a public server (see `app/core/config.py`).
5. Click **Restart** on the Python app, then open `https://api.yourdomain.com/health`. You should get `{"status":"ok",...}`.

## 3. Frontend (Setup Node.js App)

1. Edit `frontend/next.config.ts`. `images.remotePatterns` only allows `localhost:8000`; add your API host:
   ```ts
   { protocol: "https", hostname: "api.yourdomain.com", pathname: "/uploads/**" },
   ```
2. Build **on your PC**, because shared hosts usually run out of memory during `next build`:
   ```bash
   cd frontend
   # NEXT_PUBLIC_* values are baked in at build time
   echo NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api > .env.production
   npm ci && npm run build
   ```
3. Upload `frontend/` without `node_modules`, including the `.next/` folder, to e.g. `~/learnlens_web`.
4. cPanel → **Setup Node.js App** → **Create Application**:
   - Application root: `learnlens_web`, Application URL: `yourdomain.com`
   - Startup file: `server.js` (create it, see below)
   - Click **Run NPM Install**, then **Restart**.
   ```js
   // ~/learnlens_web/server.js
   const { createServer } = require("http");
   const next = require("next");
   const app = next({ dev: false, dir: __dirname });
   const handle = app.getRequestHandler();
   app.prepare().then(() =>
     createServer((req, res) => handle(req, res)).listen(process.env.PORT || 3000)
   );
   ```

## What was changed in the code for MySQL compatibility

- `mysql/learnlens_schema_mysql.sql` is the new phpMyAdmin-importable schema.
- `backend/app/models/models.py` and `profile.py`: the `public` schema and the
  `public.` foreign-key prefixes are removed, and the PostgreSQL-only `TIMESTAMP` is
  replaced with `UTCDateTime`. Local PostgreSQL still works, because `public` is its default schema.
- `backend/app/models/types.py` adds `UTCDateTime`. It keeps API dates in UTC with a `+00:00` offset on MySQL, which has no time-zone-aware column type.
- `backend/app/core/database.py`: for MySQL URLs it sets the session `time_zone` to UTC and recycles pooled connections.
- `backend/requirements.txt` adds `aiomysql` (MySQL driver) and `a2wsgi` (ASGI→WSGI bridge for Passenger).
- `backend/passenger_wsgi.py` is the new cPanel entry point.

One behavioural difference: MySQL compares text case-insensitively by default,
so `User@x.com` and `user@x.com` count as the same e-mail. Login already
lower-cases e-mails, so nothing changes for users.

## Moving existing data (optional)

The PostgreSQL dump contains no rows, so a fresh import loses nothing. If you have
local data later, export each table in pgAdmin as CSV with headers, then import it
in phpMyAdmin (table → Import → CSV), parents first: users → user_profiles → exams →
exam_pages → exam_page_parts → answer_keys → test_papers → paper_pages → paper_scores.
Also copy the `backend/uploads/` folder, because image paths in the DB point there.
