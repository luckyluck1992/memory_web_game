const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_sHyd85JZmrfw@ep-soft-cloud-as13do7f-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require" || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL fehlt.');
  process.exit(1);
}

const rankingFile = path.join(__dirname, '..', 'ranking-data.json');
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.moves !== b.moves) return a.moves - b.moves;
    if (a.seconds !== b.seconds) return a.seconds - b.seconds;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function bestPerPlayer(entries) {
  const best = new Map();
  for (const entry of sortEntries(entries)) {
    const key = String(entry.name || '').trim().toLowerCase();
    if (!key || best.has(key)) continue;
    best.set(key, entry);
  }
  return [...best.values()];
}

async function run() {
  const raw = fs.readFileSync(rankingFile, 'utf8');
  const rankings = JSON.parse(raw);

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

  let inserted = 0;

  for (const [theme, entries] of Object.entries(rankings)) {
    for (const entry of bestPerPlayer(Array.isArray(entries) ? entries : [])) {
      await pool.query(
        `
        INSERT INTO rankings (name, theme, theme_label, moves, seconds, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          String(entry.name || '').trim().slice(0, 24),
          String(entry.theme || theme).trim().slice(0, 40),
          String(entry.themeLabel || theme).trim().slice(0, 60),
          Math.max(0, Math.floor(Number(entry.moves) || 0)),
          Math.max(0, Math.floor(Number(entry.seconds) || 0)),
          Number(entry.createdAt) || Date.now(),
        ],
      );
      inserted += 1;
    }
  }

  console.log(`Import fertig. ${inserted} Bestwerte übernommen.`);
  await pool.end();
}

run().catch(async (error) => {
  console.error('Import fehlgeschlagen:', error);
  await pool.end();
  process.exit(1);
});
