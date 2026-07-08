// Lumora AI — static frontend server on :3000 (v2 hardened)
// Split CSP: style-src-elem strict (no unsafe-inline), style-src-attr keeps
// 'unsafe-inline' only for JS-driven .style.property writes on transient effects.

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_STATIC || 3000);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src':      ["'self'"],
      // Scripts: strict — no inline execution allowed anywhere. SRI enforces integrity on the CDN script.
      'script-src':       ["'self'", 'https://cdnjs.cloudflare.com'],
      'script-src-elem':  ["'self'", 'https://cdnjs.cloudflare.com'],
      'script-src-attr':  ["'none'"],
      // Styles: NO unsafe-inline on style-src-elem (no <style> blocks in HTML).
      // style-src-attr keeps 'unsafe-inline' for JS-driven .style.property writes on transient effects
      // (cursor glow position, aurora parallax transform, ripple, confidence bar width).
      'style-src':        ["'self'", 'https://fonts.googleapis.com'],
      'style-src-elem':   ["'self'", 'https://fonts.googleapis.com'],
      'style-src-attr':   ["'unsafe-inline'"],
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
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy:   { policy: 'same-origin' },
  referrerPolicy:            { policy: 'strict-origin-when-cross-origin' },
  frameguard:                { action: 'deny' },
  hidePoweredBy:             true,
  noSniff:                   true,
  strictTransportSecurity:   { maxAge: 15552000, includeSubDomains: true },
  xssFilter:                 true,
}));

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

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`[Lumora Static] listening on 0.0.0.0:${PORT}`));
