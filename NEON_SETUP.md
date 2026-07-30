# Neon Setup für Memory Web Game

## 1. In Neon ausführen

```sql
CREATE TABLE IF NOT EXISTS rankings (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  theme_label TEXT NOT NULL,
  moves INTEGER NOT NULL CHECK (moves >= 0),
  seconds INTEGER NOT NULL CHECK (seconds >= 0),
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS rankings_theme_idx ON rankings(theme);
CREATE INDEX IF NOT EXISTS rankings_theme_name_idx ON rankings(theme, lower(name));
```

## 2. In Render setzen

Environment Variable:

- `DATABASE_URL` = dein Neon Connection String

## 3. Alte Rangliste importieren

Lokal im Projektordner:

```bash
npm install
DATABASE_URL="dein_neon_connection_string" npm run import:rankings
```

## 4. Danach nach GitHub pushen und Render redeployen
