// Lumora AI — static frontend server on :3000
// Serves /app/public/ with SPA fallback. The API on :8001 is a separate process.

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_STATIC || 3000);

const app = express();

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
}));

// SPA fallback for any non-file route
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`[Lumora Static] listening on 0.0.0.0:${PORT}`));
