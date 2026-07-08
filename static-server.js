// Lumora AI — static frontend server on :3000 (v3 hardened)
// Strict CSP:
//   • default-src 'none' (deny by default)
//   • script-src / style-src / img-src / font-src / connect-src explicit
//   • no unsafe-inline in script-src or style-src-elem
//   • style-src-attr keeps 'unsafe-inline' ONLY because JS-driven animations
//     (cursor glow, aurora parallax, ripple, confidence bar) write to
//     element.style at runtime — style-attr XSS surface is minimal and
//     browsers don't allow nonces on attribute styles per CSP3.
//   • object-src 'none', base-uri 'none', frame-ancestors from env allow-list.

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_STATIC || 3000);

// Frame-ancestors from env — no wildcards, only trusted domains.
// FRAME_ANCESTORS is a whitespace-separated CSP source list.
// Default keeps preview embedding working; production should override.
const FRAME_ANCESTORS = (process.env.FRAME_ANCESTORS ||
  "'self' https://emotion-aura.preview.emergentagent.com")
  .split(/\s+/).filter(Boolean);

const app = express();
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src':      ["'none'"],
      'script-src':       ["'self'", 'https://cdnjs.cloudflare.com'],
      'script-src-elem':  ["'self'", 'https://cdnjs.cloudflare.com'],
      'script-src-attr':  ["'none'"],
      'style-src':        ["'self'", 'https://fonts.googleapis.com'],
      'style-src-elem':   ["'self'", 'https://fonts.googleapis.com'],
      'style-src-attr':   ["'unsafe-inline'"],   // required for JS-driven .style writes; documented above
      'font-src':         ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src':          ["'self'", 'data:', 'blob:'],
      'connect-src':      ["'self'"],
      'media-src':        ["'self'"],
      'frame-ancestors':  FRAME_ANCESTORS,
      'object-src':       ["'none'"],
      'base-uri':         ["'none'"],
      'form-action':      ["'self'"],
      'manifest-src':     ["'self'"],
      'worker-src':       ["'self'"],
      'upgrade-insecure-requests': [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy:   { policy: 'same-origin' },
  referrerPolicy:            { policy: 'strict-origin-when-cross-origin' },
  frameguard:                false, // CSP frame-ancestors is authoritative
  hidePoweredBy:             true,
  noSniff:                   true,
  strictTransportSecurity:   { maxAge: 15552000, includeSubDomains: true },
  xssFilter:                 true,
}));

app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
  index: 'index.html',
}));

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`[Lumora Static] listening on 0.0.0.0:${PORT}`));
