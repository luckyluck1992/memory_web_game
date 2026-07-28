const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const PORT = process.env.PORT || 3200;
const rankingFile = path.join(root, 'ranking-data.json');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8',
};

function readRanking() {
  try {
    const raw = fs.readFileSync(rankingFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeRanking(data) {
  fs.writeFileSync(rankingFile, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.moves !== b.moves) return a.moves - b.moves;
    if (a.seconds !== b.seconds) return a.seconds - b.seconds;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function bestPerPlayer(entries) {
  const bestByName = new Map();

  for (const entry of sortEntries(entries)) {
    const key = String(entry.name || '').trim().toLowerCase();
    if (!key) continue;
    if (!bestByName.has(key)) {
      bestByName.set(key, entry);
    }
  }

  return sortEntries([...bestByName.values()]);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/rankings') {
    const rankings = readRanking();
    Object.keys(rankings).forEach((theme) => {
      rankings[theme] = bestPerPlayer(Array.isArray(rankings[theme]) ? rankings[theme] : []).slice(0, 50);
    });
    return sendJson(res, 200, rankings);
  }

  if (req.method === 'POST' && url.pathname === '/api/rankings') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.socket.destroy();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const name = String(payload.name || '').trim().slice(0, 24);
        const theme = String(payload.theme || '').trim().slice(0, 40);
        const themeLabel = String(payload.themeLabel || theme).trim().slice(0, 60);
        const moves = Number(payload.moves);
        const seconds = Number(payload.seconds);

        if (!name || !theme || !Number.isFinite(moves) || !Number.isFinite(seconds)) {
          return sendJson(res, 400, { error: 'Ungültige Ranking-Daten.' });
        }

        const rankings = readRanking();
        if (!Array.isArray(rankings[theme])) rankings[theme] = [];

        rankings[theme].push({
          name,
          theme,
          themeLabel,
          moves: Math.max(0, Math.floor(moves)),
          seconds: Math.max(0, Math.floor(seconds)),
          createdAt: Date.now(),
        });

        rankings[theme] = bestPerPlayer(rankings[theme]).slice(0, 50);
        writeRanking(rankings);
        return sendJson(res, 200, { ok: true, rankings });
      } catch {
        return sendJson(res, 400, { error: 'Konnte Ranking nicht speichern.' });
      }
    });
    return;
  }

  const cleanPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(root, cleanPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime[path.extname(filePath)] || 'text/plain; charset=utf-8',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Memory server läuft auf http://0.0.0.0:${PORT}`);
});
