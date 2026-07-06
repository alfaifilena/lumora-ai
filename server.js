// Lumora AI — API server on :8001
// Handles /api/health, /api/analyze, /api/chat via Google Gemini.
// The static frontend is served by /app/static-server.js on :3000.

import 'dotenv/config';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const MODEL = 'gemini-3-flash-preview';
const PORT = Number(process.env.PORT_API || 8001);

// Instantiate Gemini client only when key present — server never crashes without one.
let ai = null;
if (GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log('[Lumora API] Gemini client ready → model:', MODEL);
  } catch (e) {
    console.error('[Lumora API] Failed to init Gemini:', e.message);
  }
} else {
  console.warn('[Lumora API] GEMINI_API_KEY missing — endpoints will return setup instructions.');
}

// System prompt: empathetic wellness assistant — never diagnose, always uplift.
const SYSTEM_PROMPT = `You are Lumora, a warm, poetic, and empathetic emotional wellness companion.

CORE RULES (never break):
- You are NOT a doctor or therapist. Never diagnose medical or psychological conditions.
- Never mention medication, clinical treatment, or crisis instructions beyond gently suggesting the user reach out to a trusted person or a local helpline if they seem to be in danger.
- Be warm, gentle, short, positive and human. Use rich but simple language. No corporate tone.
- Encourage, motivate, soothe. Suggest small, doable, screen-free self-care actions.
- Language: mirror the user's language when possible; default to English.

You detect emotions and respond with kindness. When asked for JSON, output ONLY valid JSON matching the schema — no markdown, no commentary.`;

// Structured JSON schema for /analyze
const ANALYZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mood:              { type: Type.STRING, description: 'One-word primary mood: happy, calm, sad, excited, motivated, lonely, hopeful, anxious, angry, grateful, or neutral' },
    emoji:             { type: Type.STRING, description: 'A single emoji that represents the mood' },
    confidence:        { type: Type.NUMBER, description: 'Confidence 0-100' },
    explanation:       { type: Type.STRING, description: 'Warm 1-2 sentence explanation of what you sense' },
    advice:            { type: Type.STRING, description: 'Personalized gentle advice, 2 sentences' },
    quote:             { type: Type.STRING, description: 'A short motivational quote' },
    quoteAuthor:       { type: Type.STRING, description: 'Author of the quote (or "Unknown")' },
    affirmation:       { type: Type.STRING, description: 'A short first-person affirmation starting with "I"' },
    breathingExercise: { type: Type.STRING, description: 'A 1-2 sentence breathing exercise the user can do now' },
    selfCareTip:       { type: Type.STRING, description: 'A tiny actionable self-care tip' },
    musicGenre:        { type: Type.STRING, description: 'A recommended music genre or vibe' },
    intention:         { type: Type.STRING, description: "A short today's intention starting with a verb" },
  },
  required: ['mood','emoji','confidence','explanation','advice','quote','quoteAuthor','affirmation','breathingExercise','selfCareTip','musicGenre','intention'],
};

// Retry helper for transient upstream 503/429 (preview models overload)
async function generateWithRetry(request, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await ai.models.generateContent(request);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || '');
      const transient = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(msg);
      if (!transient || i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, 400 * Math.pow(2, i) + Math.random() * 200));
    }
  }
  throw lastErr;
}

const app = express();
app.use(express.json({ limit: '32kb' }));

// CORS (permissive — same-origin via ingress in production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, geminiConfigured: Boolean(ai) });
});

app.post('/api/analyze', async (req, res) => {
  if (!ai) return res.status(503).json({ error: 'GEMINI_API_KEY not configured', setupRequired: true });
  const text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'Please share how you feel.' });
  if (text.length > 4000) return res.status(400).json({ error: 'Message too long.' });

  try {
    const response = await generateWithRetry({
      model: MODEL,
      contents: `The user says: """${text}"""\n\nAnalyze their emotional state and return the JSON.`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: ANALYZE_SCHEMA,
        temperature: 0.85,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    });
    const raw = response.text ?? '';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'Received an invalid response, please try again.' }); }
    parsed.confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0)));
    parsed.mood = String(parsed.mood || 'neutral').toLowerCase();
    res.json({ ok: true, data: parsed });
  } catch (err) {
    console.error('[analyze] error:', err?.message || err);
    res.status(500).json({ error: 'Lumora could not read the stars right now. Try again in a moment.' });
  }
});

app.post('/api/chat', async (req, res) => {
  if (!ai) return res.status(503).json({ error: 'GEMINI_API_KEY not configured', setupRequired: true });
  const { messages = [], mood } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'No messages provided.' });

  const contents = messages
    .filter(m => m && m.text)
    .slice(-20)
    .map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.text).slice(0, 2000) }],
    }));

  const moodContext = mood
    ? `\n\nThe user's most recent detected mood is: "${mood}". Keep this in mind and reference it gently when relevant.`
    : '';

  try {
    const response = await generateWithRetry({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT + moodContext,
        temperature: 0.9,
        maxOutputTokens: 1200,
      },
    });
    res.json({ ok: true, reply: response.text ?? '…' });
  } catch (err) {
    console.error('[chat] error:', err?.message || err);
    res.status(500).json({ error: 'Lumora is quiet right now. Try again shortly.' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`[Lumora API] listening on 0.0.0.0:${PORT}`));
