# Migration SSE TornCat 🚀

## Vue d'ensemble

Cette migration remplace le système de polling (1 req/sec/user) par Server-Sent Events (SSE) pour une diffusion temps réel des calls. Réduction attendue : **-95% d'appels API**.

## Changements Implémentés

### 1. Optimisations Immédiates ✅
- ✅ Intervalles de polling augmentés (500ms → 5s)
- ✅ Configuration Supabase mise à jour
- ✅ Cache client EdgeFunctionCache implémenté
- ✅ Script SSE créé (torn-war-caller-sse.user.js)

### 2. Fichiers Créés
```
sse-server/
├── package.json      # Dependencies Node.js
├── index.js          # Serveur SSE principal
└── Dockerfile        # Container Docker pour Render

sql/
└── create_sse_trigger.sql  # Trigger PostgreSQL pour notifications

scripts/
├── torn-war-caller-sse.user.js  # Version SSE du userscript
└── EdgeFunctionCache.js          # Classe de cache
```

### 3. Configuration Mise à Jour
- **Nouveau Supabase Project ID**: `vcxzqgrivbgwewmaaiye`
- **Nouveaux intervalles**:
  - syncInterval: 500ms → 5000ms
  - warCheckInterval: 30s → 60s
  - targetStatusRefreshInterval: 1s → 5s
  - ownFactionRefreshInterval: 5s → 30s

## Instructions de Déploiement

### Étape 1: Exécuter le trigger SQL dans Supabase
```bash
# Se connecter à Supabase Dashboard
# Aller dans SQL Editor
# Copier/coller le contenu de sql/create_sse_trigger.sql
# Exécuter
```

### Étape 2: Déployer le serveur SSE sur Render
1. Push le dossier `sse-server` vers GitHub
2. Créer un nouveau Web Service sur [Render](https://render.com)
3. Connecter au repo GitHub
4. Configurer:
   - **Runtime**: Docker
   - **Variable d'environnement**: `DATABASE_URL` (connection string Supabase)
5. Déployer

### Étape 3: Tester la connexion SSE
```javascript
// Console navigateur
const evtSource = new EventSource("https://torncat-sse.onrender.com/events");
evtSource.addEventListener("target_call", (e) => console.log(JSON.parse(e.data)));
```

### Étape 4: Migrer les utilisateurs
- Les utilisateurs peuvent utiliser `torn-war-caller-sse.user.js` pour tester
- L'ancien script continue de fonctionner avec les optimisations

## Prochaines Optimisations

### Edge Functions (Phase 2)
- Consolider 9 functions → 3 functions
- Implémenter batching des requêtes
- Créer vue matérialisée pour war_summary

### Architecture Temps Réel (Phase 3)
- Migration complète vers WebSockets Supabase
- Suppression du polling restant
- Dashboard temps réel

## Métriques Attendues

| Optimisation | Réduction | Status |
|-------------|-----------|--------|
| Intervalles | -80% | ✅ Fait |
| Cache client | -60% | ✅ Fait |
| SSE Migration | -95% | 🔄 En cours |
| Batching | -70% | 📋 Planifié |
| Consolidation | -50% | 📋 Planifié |

## Support

Pour toute question sur la migration:
- Discord: [Canal #dev-torncat]
- Issues: GitHub Issues du projet