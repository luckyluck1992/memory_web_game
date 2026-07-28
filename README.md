# Memory Web Game

Ein einfaches Memory-Webspiel mit:
- mehreren Motiv-Packs
- Rangliste pro Pack
- Speicherung der besten Wertung pro Spielername
- Render-Deployment über Node.js

## Lokal starten

```bash
npm install
npm start
```

Dann läuft das Spiel standardmäßig auf `http://localhost:3200`.

## Render

Die App ist für Render vorbereitet:
- `package.json`
- `render.yaml`
- Server nutzt `process.env.PORT`
