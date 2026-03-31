# Deployment Guide

## 1. Prepare The Repo

Run these commands in the project root:

```bash
git init
git add .
git commit -m "Prepare EcoWaste for deployment"
```

Do not commit your real `.env`. The repo already ignores it.

## 2. Push To GitHub

1. Create a new empty GitHub repository.
2. Copy its remote URL.
3. Run:

```bash
git remote add origin YOUR_GITHUB_REPO_URL
git branch -M main
git push -u origin main
```

## 3. Deploy Backend On Render

Create a new Render Web Service connected to your GitHub repo.

This repo now includes [render.yaml](/d:/INT219Project/render.yaml), so Render can auto-detect the service settings.

Use these settings:

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Root Directory: leave blank

If you deploy from `render.yaml`, Render will auto-generate the app secrets and set `DATABASE_PATH=/tmp/ecowaste.db`.

Optional manual environment variables in Render:

- `NODE_ENV=production`
- `JWT_SECRET=<strong-random-secret>`
- `SESSION_SECRET=<strong-random-secret>`
- `DATABASE_PATH=/var/data/ecowaste.db` if you later attach a persistent disk
- `ALLOWED_ORIGINS=https://your-netlify-site.netlify.app` if you choose direct browser-to-API calls instead of the Netlify proxy
- `GEMINI_API_KEY=<optional>`

Important:

- If you want SQLite data to survive restarts and redeploys, attach a Render persistent disk and mount it at `/var/data`.
- Without a persistent disk, SQLite data can be lost on redeploy.

After deploy, copy your backend URL. Example:

```text
https://ecowaste-api.onrender.com
```

## 4. Deploy Frontend On Netlify

This repo now includes [netlify.toml](/d:/INT219Project/netlify.toml), so Netlify can detect the publish directory automatically.

Then create a new Netlify site from the same GitHub repo with:

- Base directory: blank
- Publish directory: auto-detected from `netlify.toml`
- Build command: blank

Redeploy after saving.

## 5. Final Check

After both deploys are live:

1. Open the Netlify URL
2. Register or log in
3. Confirm dashboard loads
4. Create a pickup request
5. Check admin login
6. Check `https://your-render-service.onrender.com/api/health`

## 6. If You Want One-Service Hosting Instead

If you do not want a split frontend/backend deployment, you can deploy the whole app only on Render and skip Netlify. Render will serve both the frontend and the API from the same Express app.
