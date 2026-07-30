const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const root = __dirname;
const PORT = process.env.PORT || 3200;
const DATABASE_URL = process.env.DATABASE_URL;
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

if (!DATABASE_URL) {
  console.error('DATABASE_URL fehlt. Bitte Neon-Connection-String als Environment Variable setzen.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rankings (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      theme TEXT NOT NULL,
      theme_label TEXT NOT NULL,
      moves INTEGER NOT NULL CHECK (moves >= 0),
      seconds INTEGER NOT NULL CHECK (seconds >= 0),
      created_at BIGINT NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rankings_theme_idx ON rankings(theme);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rankings_theme_name_idx ON rankings(theme, lower(name));
  `);
}

async function getRankingsByTheme() {
  const { rows } = await pool.query(`
    WITH ranked AS (
      SELECT
        id,
        name,
        theme,
        theme_label,
        moves,
        seconds,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY theme, lower(name)
          ORDER BY moves ASC, seconds ASC, created_at ASC
        ) AS player_rank
      FROM rankings
    )
    SELECT id, name, theme, theme_label, moves, seconds, created_at
    FROM ranked
    WHERE player_rank = 1
    ORDER BY theme ASC, moves ASC, seconds ASC, created_at ASC
  `);

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.theme]) grouped[row.theme] = [];
    grouped[row.theme].push({
      name: row.name,
      theme: row.theme,
      themeLabel: row.theme_label,
      moves: row.moves,
      seconds: row.seconds,
      createdAt: Number(row.created_at),
    });
  }

  Object.keys(grouped).forEach((theme) => {
    grouped[theme] = grouped[theme].slice(0, 50);
  });

  return grouped;
}

async function upsertBestRanking({ name, theme, themeLabel, moves, seconds }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `
      SELECT id, moves, seconds, created_at
      FROM rankings
      WHERE theme = $1 AND lower(name) = lower($2)
      ORDER BY moves ASC, seconds ASC, created_at ASC
      LIMIT 1
      `,
      [theme, name],
    );

    const now = Date.now();
    const normalized = {
      name,
      theme,
      themeLabel,
      moves: Math.max(0, Math.floor(moves)),
      seconds: Math.max(0, Math.floor(seconds)),
      createdAt: now,
    };

    if (existing.rows.length === 0) {
      await client.query(
        `
        INSERT INTO rankings (name, theme, theme_label, moves, seconds, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [normalized.name, normalized.theme, normalized.themeLabel, normalized.moves, normalized.seconds, normalized.createdAt],
      );
    } else {
      const best = existing.rows[0];
      const isBetter = normalized.moves < best.moves
        || (normalized.moves === best.moves && normalized.seconds < best.seconds)
        || (normalized.moves === best.moves && normalized.seconds === best.seconds && normalized.createdAt < Number(best.created_at));

      if (isBetter) {
        await client.query(
          `
          UPDATE rankings
          SET name = $1, theme_label = $2, moves = $3, seconds = $4, created_at = $5
          WHERE id = $6
          `,
          [normalized.name, normalized.themeLabel, normalized.moves, normalized.seconds, normalized.createdAt, best.id],
        );
      }
    }

    await client.query(
      `
      DELETE FROM rankings
      WHERE theme = $1
        AND lower(name) = lower($2)
        AND id NOT IN (
          SELECT id FROM rankings
          WHERE theme = $1 AND lower(name) = lower($2)
          ORDER BY moves ASC, seconds ASC, created_at ASC
          LIMIT 1
        )
      `,
      [theme, name],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getRankingsByTheme();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/rankings') {
    getRankingsByTheme()
      .then((rankings) => sendJson(res, 200, rankings))
      .catch((error) => {
        console.error('GET /api/rankings fehlgeschlagen:', error);
        sendJson(res, 500, { error: 'Konnte Rankings nicht laden.' });
      });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/rankings') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.socket.destroy();
    });
    req.on('end', async () => {
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

        const rankings = await upsertBestRanking({ name, theme, themeLabel, moves, seconds });
        return sendJson(res, 200, { ok: true, rankings });
      } catch (error) {
        console.error('POST /api/rankings fehlgeschlagen:', error);
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

ensureSchema()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Memory server läuft auf http://0.0.0.0:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Schema-Initialisierung fehlgeschlagen:', error);
    process.exit(1);
  });
