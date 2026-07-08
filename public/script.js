/* ================================================================
   Lumora AI — script.js
   Frontend logic: analysis, mood theming, particles, chat, PDF, etc.
   ================================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Generic user-facing error strings — never surface raw server / AI responses.
const USER_ERRORS = {
  analyze: 'Something went softly wrong. Please try again in a moment.',
  chat:    'Lumora is quiet right now. Try again shortly.',
  share:   'Could not share right now.',
  pdf:     'Could not create the PDF.',
  network: 'Cannot reach the Lumora server.',
  input:   'Please share a little more about how you feel.',
  setup:   'Lumora needs an API key to fully wake up.',
};

function reportError(scope, err) {
  try { console.warn(`[Lumora:${scope}]`, err?.message || err); } catch { /* noop */ }
}

// ---------- CSRF token management ----------
// Fetched on init from GET /api/csrf; sent as X-CSRF-Token on every POST.
let csrfToken = null;
async function fetchCsrfToken() {
  try {
    const r = await fetch('/api/csrf', { credentials: 'same-origin' });
    const j = await r.json();
    if (j?.csrfToken) csrfToken = j.csrfToken;
  } catch (err) { reportError('csrf', err); }
}

// Reusable safe fetch — always JSON, attaches CSRF token on writes, retries once
// if the server signals csrfInvalid (token expired).
async function apiPost(path, body) {
  const doFetch = () => fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(body),
  });
  let r = await doFetch();
  let j = await r.json().catch(() => ({}));
  if (r.status === 403 && j?.csrfInvalid) {
    await fetchCsrfToken();
    r = await doFetch();
    j = await r.json().catch(() => ({}));
  }
  return { r, j };
}

// ---------- State ----------
const state = {
  currentMood: null,        // last detected mood string
  currentData: null,        // last full analysis payload
  history: [],              // populated on DOMContentLoaded via loadHistory()
  soundOn: localStorage.getItem('lumora.sound') === 'on',
  theme: localStorage.getItem('lumora.theme') || 'dark',
  chat: [],                 // [{role, text}]
};

const MOOD_EMOJI = {
  happy:'😊', calm:'🌊', sad:'🌧️', excited:'⚡', motivated:'🔥',
  lonely:'🌌', hopeful:'🌅', anxious:'🌀', angry:'🌋', grateful:'🌸', neutral:'✦'
};
const MOOD_COLOR = {
  happy:'#facc15', calm:'#38bdf8', sad:'#3b82f6', excited:'#a855f7', motivated:'#eab308',
  lonely:'#7c3aed', hopeful:'#fb923c', anxious:'#f472b6', angry:'#ef4444', grateful:'#f59e0b', neutral:'#8b5cf6'
};
const MOOD_MUSIC = {
  happy:{ q:'happy pop', label:'Happy Pop' },
  calm:{ q:'ambient chill', label:'Ambient Chill' },
  sad:{ q:'lo-fi sad', label:'Lo-Fi Sad' },
  excited:{ q:'electronic dance', label:'Electronic Dance' },
  motivated:{ q:'workout hip hop', label:'Workout Hip-Hop' },
  lonely:{ q:'indie folk', label:'Indie Folk' },
  hopeful:{ q:'uplifting acoustic', label:'Uplifting Acoustic' },
  anxious:{ q:'calming piano', label:'Calming Piano' },
  angry:{ q:'rock catharsis', label:'Rock Catharsis' },
  grateful:{ q:'gospel soul', label:'Gospel Soul' },
  neutral:{ q:'chillout', label:'Chillout' },
};

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  document.body.dataset.theme = state.theme;
  document.body.dataset.sound = state.soundOn ? 'on' : 'off';
  state.history = loadHistory();
  wireUI();
  setupParticles();
  setupCursorGlow();
  renderHistory();
  await fetchCsrfToken();
});

// Setup notice is shown reactively when a POST returns setupRequired.
// We no longer proactively probe /api/health because it returns only {ok:true}
// (readiness info is intentionally not exposed).

// ---------- UI wiring ----------
function wireUI() {
  // theme toggle
  $('#theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = state.theme;
    localStorage.setItem('lumora.theme', state.theme);
    playTone('tick');
  });

  // sound toggle
  $('#sound-toggle').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    document.body.dataset.sound = state.soundOn ? 'on' : 'off';
    localStorage.setItem('lumora.sound', state.soundOn ? 'on' : 'off');
    if (state.soundOn) playTone('chime');
    toast(state.soundOn ? 'Sound on' : 'Sound off');
  });

  // char counter
  const input = $('#feeling-input');
  input.addEventListener('input', () => {
    $('#char-count').textContent = input.value.length;
  });

  // ⌘/Ctrl + Enter to analyze
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); analyze(); }
  });

  // chips prefill
  $$('.chip').forEach(c => c.addEventListener('click', () => {
    input.value = c.dataset.prompt;
    $('#char-count').textContent = input.value.length;
    input.focus();
  }));

  // analyze button + ripple
  const analyzeBtn = $('#analyze-btn');
  analyzeBtn.addEventListener('click', (e) => {
    rippleAt(analyzeBtn, e);
    analyze();
  });
  analyzeBtn.addEventListener('mousemove', (e) => {
    const r = analyzeBtn.getBoundingClientRect();
    analyzeBtn.style.setProperty('--mx', `${e.clientX - r.left}px`);
    analyzeBtn.style.setProperty('--my', `${e.clientY - r.top}px`);
  });

  // reset
  $('#reset-btn').addEventListener('click', resetToHero);
  $('#pdf-btn').addEventListener('click', exportPDF);
  $('#share-btn').addEventListener('click', shareCard);
  $('#clear-history').addEventListener('click', clearHistory);

  // chat
  $('#chat-fab').addEventListener('click', () => toggleChat(true));
  $('#chat-close').addEventListener('click', () => toggleChat(false));
  $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
}

// ---------- Analyze flow ----------
async function analyze() {
  const text = $('#feeling-input').value.trim();
  if (text.length < 3) { toast(USER_ERRORS.input, 'err'); return; }

  playTone('chime');
  $('#analyzing').hidden = false;
  $('#dashboard').hidden = true;
  $('#analyzing').scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    const { r, j } = await apiPost('/api/analyze', { text });

    if (!r.ok) {
      if (j.setupRequired) {
        $('#setup-notice').hidden = false;
        toast(USER_ERRORS.setup, 'err');
      } else {
        toast(USER_ERRORS.analyze, 'err');
      }
      reportError('analyze', new Error(`HTTP ${r.status}`));
      return;
    }

    state.currentData = j.data;
    state.currentMood = j.data.mood;
    applyMoodTheme(j.data.mood);
    renderDashboard(j.data);
    saveToHistory(j.data);
    playTone('bloom');
  } catch (err) {
    reportError('analyze', err);
    toast(USER_ERRORS.analyze, 'err');
  } finally {
    $('#analyzing').hidden = true;
  }
}

// ---------- Render dashboard ----------
function renderDashboard(d) {
  const dash = $('#dashboard');
  dash.hidden = false;
  $('#mood-headline').textContent = `You feel ${d.mood}.`;
  $('#mood-explanation').textContent = d.explanation;
  $('#mood-emoji').textContent = d.emoji || MOOD_EMOJI[d.mood] || '✦';
  $('#mood-name').textContent = d.mood;
  const conf = Math.max(0, Math.min(100, d.confidence));
  $('#confidence-bar').style.width = conf + '%';
  animateNumber($('#confidence-text'), 0, conf, 1200, v => `${v}% confidence`);
  typeInto($('#ai-insight'), d.advice);
  typeInto($('#selfcare-tip'), d.selfCareTip);
  typeInto($('#breathing'), d.breathingExercise);
  $('#quote').textContent = `"${d.quote}"`;
  $('#quote-author').textContent = `— ${d.quoteAuthor || 'unknown'}`;
  typeInto($('#affirmation'), d.affirmation);
  $('#music').textContent = d.musicGenre;
  const m = MOOD_MUSIC[d.mood];
  if (m) {
    const link = $('#music-link');
    link.href = `https://open.spotify.com/search/${encodeURIComponent(m.q)}`;
    link.hidden = false;
  }
  typeInto($('#intention'), d.intention);
  setTimeout(() => dash.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
}

function resetToHero() {
  $('#dashboard').hidden = true;
  $('#feeling-input').value = '';
  $('#char-count').textContent = '0';
  applyMoodTheme('neutral');
  $('#analyze').scrollIntoView({ behavior: 'smooth' });
}

// ---------- Mood theme engine ----------
function applyMoodTheme(mood) {
  document.body.dataset.mood = mood in MOOD_EMOJI ? mood : 'neutral';
}

// ---------- History (localStorage) ----------
// Strict whitelist / regex validation so a tampered localStorage cannot inject
// unexpected values into the DOM or CSS variables.
const HEX_COLOR_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const VALID_MOODS = new Set(['happy','calm','sad','excited','motivated','lonely','hopeful','anxious','angry','grateful','neutral']);

function isValidHistoryItem(h) {
  if (!h || typeof h !== 'object') return false;
  if (typeof h.mood !== 'string' || !VALID_MOODS.has(h.mood)) return false;
  if (typeof h.emoji !== 'string' || [...h.emoji].length > 4) return false;
  if (typeof h.color !== 'string' || !HEX_COLOR_RE.test(h.color)) return false;
  if (typeof h.date !== 'string' || Number.isNaN(Date.parse(h.date))) return false;
  return true;
}

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem('lumora.history') || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(isValidHistoryItem).slice(0, 40);
  } catch { return []; }
}
function saveToHistory(d) {
  const entry = {
    mood: d.mood,
    emoji: d.emoji || MOOD_EMOJI[d.mood] || '✦',
    color: MOOD_COLOR[d.mood] || '#8b5cf6',
    date: new Date().toISOString(),
  };
  if (!isValidHistoryItem(entry)) return; // defensive: never save malformed
  state.history.unshift(entry);
  state.history = state.history.slice(0, 40);
  localStorage.setItem('lumora.history', JSON.stringify(state.history));
  renderHistory();
}
function clearHistory() {
  if (!state.history.length) return;
  state.history = [];
  localStorage.removeItem('lumora.history');
  renderHistory();
  toast('History cleared', 'ok');
}
function renderHistory() {
  const grid = $('#history-grid');
  // Safe DOM rebuild — no innerHTML with user/AI-derived data.
  while (grid.firstChild) grid.removeChild(grid.firstChild);

  if (!state.history.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.setAttribute('data-testid', 'history-empty');
    const mark = document.createElement('div');
    mark.className = 'empty__mark';
    mark.textContent = '✦';
    const p = document.createElement('p');
    p.textContent = 'Your constellation is empty. Take your first reading above.';
    empty.append(mark, p);
    grid.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  state.history.forEach((h, i) => {
    if (!isValidHistoryItem(h)) return; // never render invalid items

    const item = document.createElement('div');
    item.className = 'history-item';
    // Color-by-mood is handled via CSS on [data-item-mood="…"] — no inline style needed.
    item.setAttribute('data-item-mood', h.mood);
    item.setAttribute('data-testid', `history-item-${i}`);

    const emoji = document.createElement('div');
    emoji.className = 'history-item__emoji';
    emoji.textContent = h.emoji;

    const mood = document.createElement('div');
    mood.className = 'history-item__mood';
    mood.textContent = h.mood;

    const date = document.createElement('div');
    date.className = 'history-item__date';
    date.textContent = formatDate(h.date);

    item.append(emoji, mood, date);
    frag.appendChild(item);
  });
  grid.appendChild(frag);
}
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ---------- PDF Export ----------
function exportPDF() {
  if (!state.currentData) { toast('Analyze your mood first.', 'err'); return; }
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { toast('PDF library still loading, try again in a moment.', 'err'); return; }
  try {
    const d = state.currentData;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    doc.setFillColor(11, 7, 22); doc.rect(0, 0, W, H, 'F');
    const hex = MOOD_COLOR[d.mood] || '#8b5cf6';
    const rgb = hexToRgb(hex);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.circle(-40, -20, 220, 'F');
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.circle(W + 40, H + 20, 240, 'F');

    doc.setTextColor(244, 239, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text('✦ Lumora AI', 40, 60);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(207, 198, 229);
    doc.text(new Date().toLocaleString(), 40, 80);

    doc.setTextColor(244, 239, 255); doc.setFont('helvetica','bold'); doc.setFontSize(46);
    doc.text(`${d.emoji || ''}  ${cap(d.mood)}`, 40, 160);
    doc.setFont('helvetica','normal'); doc.setFontSize(11);
    doc.setTextColor(207,198,229);
    doc.text(`Confidence: ${Math.round(d.confidence)}%`, 40, 182);

    let y = 230;
    const section = (label, text) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text(label.toUpperCase(), 40, y);
      doc.setFont('helvetica','normal'); doc.setFontSize(12);
      doc.setTextColor(244,239,255);
      const lines = doc.splitTextToSize(text || '—', W - 80);
      doc.text(lines, 40, y + 16);
      y += 16 + lines.length * 15 + 16;
    };
    section('AI Insight', d.explanation);
    section('Advice', d.advice);
    section('Self-care', d.selfCareTip);
    section('Breathing', d.breathingExercise);
    section('Affirmation', d.affirmation);
    section('Quote', `"${d.quote}"  — ${d.quoteAuthor}`);
    section("Today's intention", d.intention);

    doc.setFontSize(9); doc.setTextColor(138,131,163);
    doc.text('Generated by Lumora AI · powered by Google Gemini', 40, H - 30);

    doc.save(`lumora-${d.mood}-${Date.now()}.pdf`);
    toast('PDF saved ✨', 'ok');
  } catch (err) {
    reportError('pdf', err);
    toast(USER_ERRORS.pdf, 'err');
  }
}
function hexToRgb(hex) {
  const s = hex.replace('#','');
  const n = parseInt(s.length===3 ? s.split('').map(c=>c+c).join('') : s, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function cap(s){ return (s||'').charAt(0).toUpperCase()+s.slice(1); }

// ---------- Share ----------
async function shareCard() {
  if (!state.currentData) { toast('Nothing to share yet.', 'err'); return; }
  const d = state.currentData;
  const text = `✦ Lumora AI\n\nI'm feeling ${d.mood} ${d.emoji||''}.\n"${d.quote}" — ${d.quoteAuthor}\n\n${d.affirmation}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'My Lumora mood', text }); return; }
    catch (err) { reportError('share', err); /* user cancelled or unsupported */ }
  }
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'ok'); }
  catch (err) { reportError('share', err); toast(USER_ERRORS.share, 'err'); }
}

// ---------- Chat ----------
function toggleChat(open) {
  const panel = $('#chat-panel');
  const fab = $('#chat-fab');
  panel.hidden = !open;
  fab.hidden = open;
  if (open) setTimeout(() => $('#chat-input').focus(), 100);
}

async function sendChat() {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  state.chat.push({ role: 'user', text });
  // Cap client-side chat history to the last 100 messages to prevent unbounded memory growth.
  if (state.chat.length > 100) state.chat = state.chat.slice(-100);
  appendChatMsg('user', text);
  const typing = appendChatMsg('bot', '', true);

  try {
    const { r, j } = await apiPost('/api/chat', {
      messages: state.chat.slice(-20),
      mood: state.currentMood,
    });
    typing.remove();
    if (!r.ok) {
      appendChatMsg('bot', USER_ERRORS.chat);
      reportError('chat', new Error(`HTTP ${r.status}`));
      return;
    }
    state.chat.push({ role: 'model', text: j.reply });
    if (state.chat.length > 100) state.chat = state.chat.slice(-100);
    appendChatMsg('bot', j.reply);
  } catch (err) {
    typing.remove();
    reportError('chat', err);
    appendChatMsg('bot', USER_ERRORS.chat);
  }
}
function appendChatMsg(who, text, typing = false) {
  const log = $('#chat-log');
  const div = document.createElement('div');
  div.className = `chat__msg chat__msg--${who}` + (typing ? ' chat__msg--typing' : '');
  if (typing) {
    // Static, developer-controlled markup (no user data) — build with DOM APIs anyway.
    for (let i = 0; i < 3; i++) div.appendChild(document.createElement('span'));
  } else {
    const p = document.createElement('p');
    p.textContent = String(text);
    div.appendChild(p);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

// ---------- Particles ----------
function setupParticles() {
  const canvas = $('#particles');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let mouse = { x: -9999, y: -9999 };

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
  }
  resize();
  window.addEventListener('resize', () => { ctx.setTransform(1,0,0,1,0,0); resize(); });
  window.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

  const N = Math.min(90, Math.max(40, Math.floor(window.innerWidth / 20)));
  for (let i = 0; i < N; i++) {
    particles.push({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: (Math.random()-0.5) * 0.3, vy: (Math.random()-0.5) * 0.3,
      r: Math.random() * 1.6 + 0.4,
      a: Math.random() * 0.5 + 0.2,
    });
  }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const glow = getComputedStyle(document.body).getPropertyValue('--hue-a').trim() || '#8b5cf6';
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = innerWidth; if (p.x > innerWidth) p.x = 0;
      if (p.y < 0) p.y = innerHeight; if (p.y > innerHeight) p.y = 0;
      // mouse repel
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx*dx + dy*dy;
      if (d2 < 12000) { const f = 80 / (d2 + 60); p.x += dx * f * 0.02; p.y += dy * f * 0.02; }
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(glow, p.a);
      ctx.shadowBlur = 12; ctx.shadowColor = glow;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
}
function hexToRgba(hex, a) {
  const h = hex.trim().replace('#','');
  const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// ---------- Cursor glow + parallax ----------
function setupCursorGlow() {
  const glow = $('#cursor-glow');
  window.addEventListener('pointermove', (e) => {
    glow.style.left = e.clientX + 'px';
    glow.style.top = e.clientY + 'px';
    const nx = (e.clientX / innerWidth - 0.5) * 8;
    const ny = (e.clientY / innerHeight - 0.5) * 8;
    document.querySelectorAll('.aurora__blob').forEach((b, i) => {
      b.style.transform = `translate(${nx * (i+1)}px, ${ny * (i+1)}px)`;
    });
  });
}

// ---------- Micro utils: ripple, typewriter, counter, toast, sound ----------
function rippleAt(el, e) {
  const r = el.querySelector('.btn__ripple'); if (!r) return;
  const rect = el.getBoundingClientRect();
  const x = (e.clientX ?? rect.left + rect.width/2) - rect.left;
  const y = (e.clientY ?? rect.top + rect.height/2) - rect.top;
  r.style.left = (x - 5) + 'px'; r.style.top = (y - 5) + 'px';
  r.style.width = r.style.height = '10px';
  r.classList.remove('animate'); void r.offsetWidth; r.classList.add('animate');
}

function typeInto(el, text, speed = 12) {
  if (!el) return;
  el.textContent = '';
  const chars = [...(text || '')];
  let i = 0;
  const step = () => {
    if (i >= chars.length) return;
    el.textContent += chars[i++];
    setTimeout(step, speed);
  };
  step();
}

function animateNumber(el, from, to, dur, fmt) {
  const start = performance.now();
  const frame = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = Math.round(from + (to - from) * eased);
    el.textContent = fmt ? fmt(v) : v;
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function toast(msg, kind = '') {
  const stack = $('#toast-stack');
  const t = document.createElement('div');
  t.className = `toast ${kind ? 'toast--' + kind : ''}`;
  t.textContent = msg;
  t.setAttribute('data-testid', 'toast');
  stack.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
}

// Web-Audio soft tones (only when sound is on)
let audioCtx = null;
function playTone(kind) {
  if (!state.soundOn) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const map = {
      tick:   { f: 880, d: 0.06, g: 0.05 },
      chime:  { f: 660, d: 0.35, g: 0.06 },
      bloom:  { f: 523, d: 0.9,  g: 0.08 },
    };
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    const cfg = map[kind] || map.tick;
    o.type = 'sine'; o.frequency.setValueAtTime(cfg.f, now);
    if (kind === 'bloom') o.frequency.exponentialRampToValueAtTime(cfg.f * 1.5, now + cfg.d);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(cfg.g, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + cfg.d);
    o.connect(g).connect(audioCtx.destination);
    o.start(now); o.stop(now + cfg.d + 0.05);
  } catch { /* ignore audio issues */ }
}
