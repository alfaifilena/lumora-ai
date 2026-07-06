# Lumora AI — PRD

## Problem Statement (original)
Build **Lumora AI**, a production-ready AI-powered web app (vanilla HTML/CSS/JS + Node/Express) that transforms a user's emotions into an immersive visual experience using Google Gemini. The website must feel elegant, magical, premium, emotionally intelligent, and portfolio-quality.

## Stack (locked)
- Frontend: Vanilla HTML5, CSS3, ES Modules (no React / framework)
- Backend: Node.js + Express (ES modules)
- LLM: Google Gemini via **@google/genai** SDK (model: `gemini-3-flash-preview`)
- Storage: `localStorage` for mood history + preferences
- PDF: `jsPDF` (client-side via CDN)

## Architecture
- Single Node process (`/app/server.js`) runs two listeners:
  - `:8001` → Express API app (`/api/health`, `/api/analyze`, `/api/chat`)
  - `:3000` → Static Express serving `/app/public/` + SPA fallback
- Platform ingress: `/api/*` → :8001, `/*` → :3000
- Supervisor: `backend` runs `node /app/server.js`; `frontend` is a no-op (single process handles both).
- API key read from `process.env.GEMINI_API_KEY` (via `dotenv` on `/app/.env`); if missing, endpoints return `{setupRequired:true}` and UI shows a beautiful setup card without crashing.

## User Persona
Anyone who wants a soft, poetic, non-clinical AI companion that acknowledges feelings, offers gentle rituals, and generates a shareable mood snapshot.

## Core Requirements (implemented)
1. ✅ **Hero + composer** — Fraunces serif headline, glass composer, ⌘+↵ shortcut, chip prompts, char counter
2. ✅ **POST /api/analyze** — Gemini structured JSON output (mood, emoji, confidence, explanation, advice, quote, quoteAuthor, affirmation, breathingExercise, selfCareTip, musicGenre, intention)
3. ✅ **Dynamic mood theme engine** — 11 mood palettes (happy, calm, sad, excited, motivated, lonely, hopeful, anxious, angry, grateful, neutral); background, buttons, cards, cursor glow, particles all shift on detection
4. ✅ **Unique mood animations** — rain overlay for sad, star overlay for lonely/hopeful, aurora blobs always drifting
5. ✅ **AI dashboard** — 8 glass cards (mood, insight, self-care, breathing, quote, affirmation, music, intention) with typewriter + animated confidence bar
6. ✅ **Mood history** — localStorage-backed constellation grid with emoji, color, date; clear button
7. ✅ **Floating AI chat** — /api/chat with Gemini; remembers `currentMood` in-session; empathetic system prompt
8. ✅ **PDF export** — jsPDF branded layout (mood, confidence, insight, advice, self-care, breathing, affirmation, quote, intention)
9. ✅ **Share** — Web Share API with clipboard fallback
10. ✅ **Dark/light theme** — CSS variables, saved to localStorage
11. ✅ **Sound toggle** — WebAudio soft tones (tick/chime/bloom), off by default, saved to localStorage
12. ✅ **Loading screen** — animated boot with logo & progress bar
13. ✅ **Particles canvas** — mouse-reactive glow dots, tinted to current mood
14. ✅ **Cursor glow + aurora parallax** — pointermove-driven
15. ✅ **Toasts** — glass pill notifications
16. ✅ **Accessibility** — semantic HTML, aria-labels, `prefers-reduced-motion` support, keyboard shortcut
17. ✅ **Responsive** — mobile breakpoints for nav, hero, dashboard, chat

## Files
```
/app/
├── package.json           # deps: @google/genai, express, dotenv
├── server.js              # Express (2 listeners), Gemini calls, JSON schema
├── .env                   # GEMINI_API_KEY (user-provided)
└── public/
    ├── index.html         # Semantic markup, data-testid coverage
    ├── style.css          # Aurora, glassmorphism, 11 mood palettes
    └── script.js          # ES module: analyze, theme, chat, PDF, particles
```

## What's implemented (2026-02-06)
Everything above. End-to-end functional. Setup notice gracefully handles missing key.

## Prioritized backlog
- P1: Multi-language support (auto-detect user language for Gemini prompt)
- P1: Weekly mood chart (Chart.js overlay in journal section)
- P2: Named history sessions ("Morning ritual", "Sunday reset")
- P2: Server-side rate limit + Redis session cache for chat memory across reloads
- P2: E2E test suite (Playwright) & GitHub Actions CI

## Next Action Items
- User adds `GEMINI_API_KEY` to Replit Secrets → app lights up
- Optional: revenue enhancement suggested in finish summary
