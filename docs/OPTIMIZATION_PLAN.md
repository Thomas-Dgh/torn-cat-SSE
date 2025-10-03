# Plan d'Optimisation des Edge Functions

## 🎯 Objectif : Réduire de 95% les appels Edge Functions

### Situation Actuelle
- **707 587 appels en 4 jours** (30 users)
- **5 896 appels/jour/user**
- Projection 3000 users : **17,7M appels/jour**

## 📋 Actions Immédiates (Phase 1)

### 1. Augmenter les Intervalles de Polling
**Fichier:** `torn-war-calling.user.js`

```javascript
// AVANT (1 seconde)
this.activeSyncTimer = setInterval(() => {
  this.syncUnifiedWarData();
}, 1000);

// APRÈS (5 secondes minimum)
this.activeSyncTimer = setInterval(() => {
  this.syncUnifiedWarData();
}, 5000);
```

**Impact:** -80% d'appels sur sync-updates et unified-war-data

### 2. Implémenter un Cache Client
```javascript
class EdgeFunctionCache {
  constructor() {
    this.cache = new Map();
    this.ttl = {
      'war-detection': 60000,      // 1 minute
      'get-war-targets': 30000,    // 30 secondes
      'faction-data': 300000,      // 5 minutes
    };
  }
  
  async get(key, fetcher) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl[key]) {
      return cached.data;
    }
    
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }
}
```

### 3. Batching des Requêtes
```javascript
// AVANT - 4 appels séparés
await fetch('/war-detection');
await fetch('/get-war-targets');
await fetch('/call-management');
await fetch('/sync-updates');

// APRÈS - 1 seul appel
await fetch('/unified-war-data', {
  body: JSON.stringify({
    operations: ['war-detection', 'targets', 'calls', 'sync']
  })
});
```

## 🏗️ Refactoring Architecture (Phase 2)

### 1. Consolidation des Edge Functions

**Structure actuelle:** 9 functions
**Structure cible:** 3 functions

```
supabase/functions/
├── war-api/          # Toutes les opérations de guerre
├── xanax-api/        # Monitoring xanax
└── _shared/          # Code partagé
```

### 2. Nouvelle Edge Function Unifiée

```typescript
// war-api/index.ts
export async function handler(req: Request) {
  const { operation, data } = await req.json();
  
  switch(operation) {
    case 'detect-war':
      return detectWar(data);
    case 'get-targets':
      return getTargets(data);
    case 'manage-calls':
      return manageCalls(data);
    case 'sync':
      return sync(data);
    case 'batch':
      return batchOperations(data);
  }
}
```

### 3. Optimisation Database

```sql
-- Vue matérialisée pour les données de guerre
CREATE MATERIALIZED VIEW war_summary AS
SELECT 
  w.*,
  COUNT(DISTINCT ac.target_id) as active_calls,
  COUNT(DISTINCT t.target_id) as total_targets
FROM wars w
LEFT JOIN active_calls ac ON ac.war_id = w.war_id
LEFT JOIN targets t ON t.war_id = w.war_id
GROUP BY w.war_id;

-- Refresh automatique toutes les 30 secondes
CREATE OR REPLACE FUNCTION refresh_war_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY war_summary;
END;
$$ LANGUAGE plpgsql;
```

## 🚀 Architecture Temps Réel (Phase 3)

### 1. Migration vers Supabase Realtime

```javascript
// Remplacer le polling par des WebSockets
const channel = supabase
  .channel('war-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'active_calls'
  }, (payload) => {
    updateUI(payload);
  })
  .subscribe();
```

### 2. Server-Sent Events pour les Updates

```typescript
// Edge function pour SSE
export async function handler(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Envoyer updates en temps réel
      const subscription = supabase
        .from('war_updates')
        .on('*', (payload) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        })
        .subscribe();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```

## 📊 Métriques de Succès

| Optimisation | Réduction Attendue | Difficulté |
|--------------|-------------------|------------|
| Intervalles polling | -80% | ⭐ |
| Cache client | -60% | ⭐⭐ |
| Batching | -70% | ⭐⭐ |
| Consolidation | -50% | ⭐⭐⭐ |
| Realtime | -95% | ⭐⭐⭐⭐ |

## 🔧 Implementation Checklist

### Semaine 1
- [ ] Augmenter tous les intervalles à 5s minimum
- [ ] Implémenter cache localStorage
- [ ] Créer endpoint batch dans unified-war-data

### Semaine 2
- [ ] Consolider les functions xanax
- [ ] Créer war-api unifiée
- [ ] Implémenter vues matérialisées

### Semaine 3
- [ ] Setup Supabase Realtime
- [ ] Migrer premier endpoint vers WebSockets
- [ ] Monitoring et ajustements

## 💡 Tips d'Optimisation

1. **Debouncing:** Grouper les actions utilisateur
2. **Lazy Loading:** Ne charger que les données visibles
3. **Compression:** Gzip sur toutes les réponses
4. **CDN:** Assets statiques sur Cloudflare
5. **Rate Limiting:** Côté client pour protéger le backend