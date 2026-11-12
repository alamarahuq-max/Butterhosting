# ButterHosting
Made by md imran.

- **Frontend** (this folder's static files) deploys to Vercel as-is. No build step.
- **Backend** (`backend/server.js`) goes in a GitHub repo and runs on your cloud server.
- To connect them, set `window.BUTTER_API` in `config.js` to your backend URL (use HTTPS), and set `ALLOW_ORIGIN` on the backend to your Vercel URL.
- Until `BUTTER_API` is set, the dashboard runs in demo mode with sample data.
- Typeface: NType 82 via OnlineWebFonts, CC BY 4.0 (credited in the footer).
