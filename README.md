# ✦ Lumora AI

Transform your emotions into a beautiful, mood-reactive AI experience — powered by **Google Gemini 3 Flash**.

Lumora reads how you feel, detects the emotion, and reshapes the entire interface (colors, animations, cards, recommendations) into a small sanctuary tuned to your current state.

Built with vanilla HTML/CSS/JS + Node.js + Express — no frameworks, no bloat, just polish.

![Stack](https://img.shields.io/badge/stack-Node.js%20%2B%20Express%20%2B%20Vanilla%20JS-000?style=flat-square)
![AI](https://img.shields.io/badge/AI-Google%20Gemini%203%20Flash-4285F4?style=flat-square)

## ✨ Features

- **AI mood analysis** via Gemini with structured JSON output (mood, confidence, insight, advice, quote, affirmation, breathing exercise, self-care tip, music genre, today's intention)
- **11 dynamic mood palettes** — the whole page reshapes based on the detected emotion (happy, calm, sad, excited, motivated, lonely, hopeful, anxious, angry, grateful, neutral)
- **Unique mood animations** — rain overlay for sad, star overlay for lonely/hopeful, animated aurora blobs, floating particles reactive to your cursor
- **Empathetic AI chat** — floating panel that remembers your latest mood as system context
- **Mood constellation** — local history saved to `localStorage` with emoji + color + date
- **PDF export** — jsPDF branded mood summary (client-side)
- **Web Share / clipboard fallback** — share your reading as a quote card
- **Dark + light theme**, **sound toggle** (WebAudio soft tones), animated boot screen, glass cards, cursor glow, ⌘+↵ keyboard shortcut
- **Fully accessible** — semantic HTML, ARIA labels, `prefers-reduced-motion` support, mobile-responsive

## 🗂 Project structure

```
.
├── server.js           # Express API on :8001 — /api/health, /api/analyze, /api/chat
├── static-server.js    # Express static server on :3000 — serves /public
├── package.json        # deps: @google/genai, express, dotenv
├── .env                # GEMINI_API_KEY, PORT_API, PORT_STATIC  (not committed)
├── .env.example        # template — copy to .env locally
└── public/
    ├── index.html
    ├── style.css       # aurora, glassmorphism, 11 mood palettes
    └── script.js       # ES module: analyze, theme, chat, PDF, particles
```

## 🚀 Local setup

**Requirements:** Node.js 20+, Yarn (or npm)

```bash
# 1. Clone
git clone <this-repo-url>
cd lumora-ai

# 2. Install
yarn install     # or: npm install

# 3. Add your Gemini API key
cp .env.example .env
# then open .env and paste your key after GEMINI_API_KEY=
# get a key from https://aistudio.google.com/apikey

# 4. Run (two processes)
yarn start:api      # → API on :8001
# in another terminal:
yarn start:web      # → static on :3000

# or run both together:
yarn dev
```

Open **http://localhost:3000** and start feeling ✦

## 🔌 API

Base URL: `http://localhost:8001`

| Method | Endpoint | Body | Returns |
|---|---|---|---|
| GET  | `/api/health`  | — | `{ ok, model, geminiConfigured }` |
| POST | `/api/analyze` | `{ text }` | `{ ok, data: { mood, emoji, confidence, explanation, advice, quote, quoteAuthor, affirmation, breathingExercise, selfCareTip, musicGenre, intention } }` |
| POST | `/api/chat`    | `{ messages: [{role,text}], mood }` | `{ ok, reply }` |

If `GEMINI_API_KEY` is missing, endpoints return `{ error, setupRequired: true }` and the UI shows a graceful setup card — the server never crashes.

## 🎨 Design notes

- **Typography:** Fraunces (serif display) + Inter (body) + JetBrains Mono (labels)
- **Colors:** CSS custom properties per mood — `--hue-a`, `--hue-b`, `--hue-c`, `--hue-glow`
- **Depth:** glass-morphism (20px backdrop blur), grain overlay, aurora blur blobs
- **Motion:** cubic-bezier `0.22, 1, 0.36, 1` easing, staggered reveals, cursor parallax

## 🔐 Security

- API key is only ever read from `process.env.GEMINI_API_KEY` via `dotenv`
- Never hardcoded, never sent to the frontend
- `.env` is gitignored
- Frontend uses same-origin relative `/api/*` calls — no CORS token leaks

## 📝 License

MIT — do beautiful things.

---

Made with soft light ✦
