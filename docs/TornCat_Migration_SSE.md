# 📄 Documentation TornCat — Migration Polling → SSE

## 🎯 Objectif
Remplacer le système actuel basé sur du polling (1 requête/seconde par utilisateur) par un flux temps réel via **Server-Sent Events (SSE)**. Cela réduira la charge et les coûts tout en offrant une actualisation instantanée des données "qui call qui".

## ⚙️ Architecture
[Torn API] → (poll centralisé toutes 5–10s) → [Supabase DB: target_calls] → (trigger pg_notify) → [SSE Server Render] → (connexion SSE persistante) → [Users Tampermonkey torn-war-caller.js]

## 🧩 Étape 1 — Trigger SQL Supabase
```sql
CREATE OR REPLACE FUNCTION notify_target_call() RETURNS trigger AS $$
DECLARE payload json;
BEGIN
  payload := json_build_object('id', NEW.id,'caller_id', NEW.caller_id,'target_id', NEW.target_id,'created_at', to_char(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ'));
  PERFORM pg_notify('target_calls', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_target_call ON target_calls;
CREATE TRIGGER trg_notify_target_call AFTER INSERT ON target_calls FOR EACH ROW EXECUTE FUNCTION notify_target_call();
```

## 🖥️ Étape 2 — Serveur SSE (Render)
Créer un dossier `sse-server` contenant :
```json
// package.json
{
  "name": "torncat-sse",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "cors": "^2.8.5"
  }
}
```
```js
// index.js
import express from "express";
import { Client } from "pg";
import cors from "cors";
const app = express();
app.use(cors({ origin: "https://www.torn.com", methods: ["GET"] }));
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
await pg.query("LISTEN target_calls");
let clients = new Set();
pg.on("notification", (msg) => {
  try {
    const data = JSON.parse(msg.payload);
    for (const res of clients) {
      res.write(`event: target_call\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  } catch (err) {
    console.error("Bad payload", err);
  }
});
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.write("retry: 10000\n\n");
  clients.add(res);
  const keepAlive = setInterval(() => res.write(":\n\n"), 20000);
  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ SSE server running on", PORT));
```
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

## ☁️ Étape 3 — Déploiement Render
1. Créer un Web Service sur [Render](https://render.com)
2. Source : repo GitHub (avec `sse-server`)
3. Runtime : Docker
4. Variables d’env : `DATABASE_URL` (conn. Supabase)
5. Déploiement → le flux SSE sera dispo sur `https://torncat-sse.onrender.com/events`

## 👩‍💻 Étape 4 — Modifier torn-war-caller.js
Remplacer le polling 1s par une connexion SSE :
```js
// ==UserScript==
// @name         Torn War Caller (Realtime)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Affiche en direct qui call qui via SSE backend Render
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==
(function() {
  'use strict';
  const SSE_URL = "https://torncat-sse.onrender.com/events";
  const evtSource = new EventSource(SSE_URL);
  evtSource.addEventListener("open", () => console.log("[TornCat] Connecté au flux SSE"));
  evtSource.addEventListener("error", (err) => console.warn("[TornCat] Erreur SSE", err));
  evtSource.addEventListener("target_call", (e) => {
    const data = JSON.parse(e.data);
    console.log("[TornCat] Nouveau call:", data);
    showNotification(`Target ${data.target_id} appelé par ${data.caller_id}`);
  });
  function showNotification(msg) {
    const div = document.createElement("div");
    div.textContent = msg;
    div.style = "position:fixed;bottom:20px;right:20px;background:#222;color:#fff;padding:10px 15px;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,0.4)";
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  }
})();
```

## 🔒 Étape 5 — Auth optionnelle
```js
app.get("/events", (req, res) => {
  const token = req.query.token;
  if (token !== process.env.SECRET_TOKEN) return res.status(401).end("Unauthorized");
  ...
});
```
Et côté userscript :
```js
const evtSource = new EventSource("https://torncat-sse.onrender.com/events?token=XYZ");
```

## 📊 Étape 6 — Scalabilité
- 3000 connexions SSE = supporté par Render (Node non bloquant)
- Keepalive (`:\n\n`) toutes 20s évite timeouts
- Si >50k users → Redis pub/sub pour broadcast multi-instances
- Logger le nombre de connexions actives

## ✅ Résultat attendu
Ancien système : 1 req/sec/user (~3 000 req/s, latence 1 s, coûts élevés)
Nouveau système : 1 connexion SSE persistante, latence ~100 ms, coûts quasi nuls, vraie diffusion temps réel.

## 🔧 Tâches à faire (pour Claude Code)
1. Créer `sse-server/` avec `package.json`, `index.js`, `Dockerfile`
2. Ajouter trigger SQL `notify_target_call()`
3. Modifier `torn-war-caller.js` (supprimer polling, ajouter EventSource)
4. Mettre à jour README avec les instructions SSE + Render
