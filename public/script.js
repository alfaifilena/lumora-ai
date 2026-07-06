/* ================================================================
   Lumora AI — script.js
   Frontend logic: analysis, mood theming, particles, chat, PDF, etc.
   ================================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// ---------- State ----------
const state = {
  currentMood: null,        // last detected mood string
  currentData: null,        // last full analysis payload
  history: loadHistory(),
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
document.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.theme = state.theme;
  document.body.dataset.sound = state.soundOn ? 'on' : 'off';
  wireUI();
  setupParticles();
  setupCursorGlow();
  renderHistory();
  checkHealth();
});

// ---------- Health check → show setup page if no key ----------
async function checkHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    if (!j.geminiConfigured) {
      $('#setup-notice').hidden = false;
    }
  } catch {
    // if API unreachable, still allow UI. Show gentle toast.
    toast('Cannot reach the Lumora server.', 'err');
  }
}

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
  if (text.length < 3) { toast('Please share a little more about how you feel.', 'err'); return; }

  playTone('chime');
  $('#analyzing').hidden = false;
  $('#dashboard').hidden = true;
  $('#analyzing').scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const j = await r.json();

    if (!r.ok) {
      if (j.setupRequired) $('#setup-notice').hidden = false;
      throw new Error(j.error || 'Something went wrong.');
    }

    state.currentData = j.data;
    state.currentMood = j.data.mood;
    applyMoodTheme(j.data.mood);
    renderDashboard(j.data);
    saveToHistory(j.data);
    playTone('bloom');
  } catch (err) {
    toast(err.message || 'Analysis failed.', 'err');
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
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('lumora.history') || '[]'); }
  catch { return []; }
}
function saveToHistory(d) {
  const entry = {
    mood: d.mood, emoji: d.emoji || MOOD_EMOJI[d.mood] || '✦',
    color: MOOD_COLOR[d.mood] || '#8b5cf6', date: new Date().toISOString(),
    quote: d.quote, confidence: d.confidence,
  };
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
  if (!state.history.length) {
    grid.innerHTML = `<div class="empty" data-testid="history-empty"><div class="empty__mark">✦</div><p>Your constellation is empty. Take your first reading above.</p></div>`;
    return;
  }
  grid.innerHTML = state.history.map((h, i) => `
    <div class="history-item" style="--item-color:${h.color}; --item-glow:${h.color}30" data-testid="history-item-${i}">
      <div class="history-item__emoji">${h.emoji}</div>
      <div class="history-item__mood">${h.mood}</div>
      <div class="history-item__date">${formatDate(h.date)}</div>
    </div>
  `).join('');
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
  const d = state.currentData;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Background wash
  doc.setFillColor(11, 7, 22); doc.rect(0, 0, W, H, 'F');
  const hex = MOOD_COLOR[d.mood] || '#8b5cf6';
  const rgb = hexToRgb(hex);
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.circle(-40, -20, 220, 'F');
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.circle(W + 40, H + 20, 240, 'F');

  // Header
  doc.setTextColor(244, 239, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('✦ Lumora AI', 40, 60);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(207, 198, 229);
  doc.text(new Date().toLocaleString(), 40, 80);

  // Mood
  doc.setTextColor(244, 239, 255); doc.setFont('helvetica','bold'); doc.setFontSize(46);
  doc.text(`${d.emoji || ''}  ${cap(d.mood)}`, 40, 160);
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.setTextColor(207,198,229);
  doc.text(`Confidence: ${Math.round(d.confidence)}%`, 40, 182);

  // Sections
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

  // Footer
  doc.setFontSize(9); doc.setTextColor(138,131,163);
  doc.text('Generated by Lumora AI · powered by Google Gemini', 40, H - 30);

  doc.save(`lumora-${d.mood}-${Date.now()}.pdf`);
  toast('PDF saved ✨', 'ok');
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
    try { await navigator.share({ title: 'My Lumora mood', text }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'ok'); }
  catch { toast('Could not share.', 'err'); }
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
  appendChatMsg('user', text);
  const typing = appendChatMsg('bot', '<span></span><span></span><span></span>', true);

  try {
    const r = await fetch('/api/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages: state.chat, mood: state.currentMood })
    });
    const j = await r.json();
    typing.remove();
    if (!r.ok) throw new Error(j.error || 'Chat unavailable');
    state.chat.push({ role: 'model', text: j.reply });
    appendChatMsg('bot', j.reply);
  } catch (err) {
    typing.remove();
    appendChatMsg('bot', `Hmm, ${err.message || "something's off"}. Try again in a moment.`);
  }
}
function appendChatMsg(who, html, typing = false) {
  const log = $('#chat-log');
  const div = document.createElement('div');
  div.className = `chat__msg chat__msg--${who}` + (typing ? ' chat__msg--typing' : '');
  if (typing) div.innerHTML = html;
  else { const p = document.createElement('p'); p.textContent = html; div.appendChild(p); }
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
