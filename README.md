# ButterHosting
Made by md imran.

| Part | Where | What |
|---|---|---|
| Website + dashboard | repo root (`index.html`, `dashboard.html`, ...) | Static files, deployed by Vercel. No build step. |
| Hosting API | `backend/` | Node server with Discord login that runs servers as Docker containers. |
| Cloud server | `.devcontainer/` | A GitHub Codespace that starts the API automatically. |

**Setup guide:** [`backend/README.md`](backend/README.md). Secrets go in GitHub → Settings → Codespaces → Secrets (see `.env.example`).
Then set `window.BUTTER_API` in `config.js`. Until it is set, the dashboard runs in demo mode with sample data.

Typeface: NType 82 via OnlineWebFonts, CC BY 4.0 (display headings only). Body text uses the system sans-serif.
