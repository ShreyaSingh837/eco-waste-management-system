# EcoWaste Management System

Full-stack waste management app with:

- Express backend
- SQLite database via `better-sqlite3`
- Static frontend in `public/`
- JWT authentication
- Admin, user, and AI features

## Local Run

1. Copy `.env.example` to `.env`
2. Update the secrets in `.env`
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

The SQLite database is created automatically on first run. Default seed users:

- `admin@wastems.com` / `Admin@123`
- `driver@wastems.com` / `Admin@123`

## Useful Scripts

```bash
npm start
npm run dev
npm run smoke
```

## Environment Variables

Important values:

- `PORT`
- `NODE_ENV`
- `JWT_SECRET`
- `SESSION_SECRET`
- `DATABASE_PATH`
- `ALLOWED_ORIGINS`
- `GEMINI_API_KEY` (optional)

For Render with a persistent disk, use a database path such as:

```text
/var/data/ecowaste.db
```

## Deployment Notes

- The frontend can be hosted on Netlify from the `public/` folder.
- The backend can be hosted on Render as a Node web service.
- `render.yaml` and `netlify.toml` are included for quicker deployment.
- `public/_redirects` proxies `/api/*` to the configured Render backend service.

Detailed deployment steps are in [DEPLOYMENT.md](/d:/INT219Project/DEPLOYMENT.md).

## Project Structure

```text
public/                 Static frontend
public/js/app.js        Main SPA logic
public/js/ai_features.js
public/css/style.css
server/index.js         Express server
server/routes/          API routes
server/config/database.js
database/               Local SQLite files
```

## Legacy Note

`database/schema.sql` is an older MySQL reference file. The current app runs on SQLite and initializes its schema automatically from `server/config/database.js`.
