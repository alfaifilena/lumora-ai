// Lumora AI — static frontend server on :3000
// Serves /app/public/ with SPA fallback. Hardened with Helmet CSP tuned for our
// CDN dependencies (Google Fonts + jsPDF on cdnjs).

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_STATIC || 3000);

const app = express();
app.set('trust proxy', 1);

// ---------- Content Security Policy ----------
// - default-src 'self'          → block everything by default
// - script-src                  → self + jsPDF (cdnjs); no eval, no inline scripts
// - style-src                   → self + Google Fonts CSS + inline styles for dynamic
//                                   history colors (data-driven CSS custom properties)
// - font-src                    → self + Google Fonts CDN + data: URIs (SVG favicon)
// - img-src                     → self + data: (SVG icons, canvas exports)
// - connect-src                 → self only (all /api/* calls are same-origin via ingress)
// - frame-ancestors             → 'none' (clickjacking protection)
// - object-src                  → 'none' (no plugins)
// - base-uri                    → 'self'
// - form-action                 → 'self'
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src':      ["'self'"],
      'script-src':       ["'self'", 'https://cdnjs.cloudflare.com'],
      'style-src':        ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'style-src-elem':   ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src':         ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src':          ["'self'", 'data:', 'blob:'],
      'connect-src':      ["'self'"],
      'media-src':        ["'self'"],
      'frame-ancestors':  ["'none'"],
      'object-src':       ["'none'"],
      'base-uri':         ["'self'"],
      'form-action':      ["'self'"],
      'upgrade-insecure-requests': [],
    },
  },
  crossOriginEmbedderPolicy: false, // allow Google Fonts / cdnjs to load
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy:   { policy: 'same-origin' },
  referrerPolicy:            { policy: 'strict-origin-when-cross-origin' },
  frameguard:                { action: 'deny' },
  hidePoweredBy:             true,
  noSniff:                   true,
  strictTransportSecurity:   { maxAge: 15552000, includeSubDomains: true },
  xssFilter:                 true,
}));

// Permissions-Policy — deny sensor / device access we don't need.
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
  index: 'index.html',
}));

// SPA fallback for any non-file route
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`[Lumora Static] listening on 0.0.0.0:${PORT}`));
