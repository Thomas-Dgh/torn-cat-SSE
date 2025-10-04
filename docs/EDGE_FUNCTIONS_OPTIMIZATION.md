# Plan d'Optimisation Détaillé des Edge Functions

## 📊 Analyse de l'Architecture Actuelle

### Structure Existante
- **9 edge functions** individuelles
- Logique centralisée dans `/shared/functions.ts`
- `unified-war-data` fait déjà du batching partiel
- Pas de cache côté serveur implémenté

### Problèmes Identifiés
1. **Appels API redondants** vers Torn API et TornStats
2. **Requêtes DB non optimisées** (pas de vues matérialisées)
3. **Absence de cache serveur** pour les réponses
4. **Functions xanax dupliquées** (3 versions différentes)

## 🎯 Optimisations Phase 1 (Impact Immédiat)

### 1. Implémenter Cache Serveur dans unified-war-data

```typescript
// supabase/functions/unified-war-data/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "../shared/supabase-client.ts";

const cache = new Map();
const CACHE_TTL = {
  war_data: 5000,      // 5 secondes
  faction_data: 60000, // 1 minute
  targets: 10000,      // 10 secondes
};

serve(async (req: Request) => {
  const { faction_id, war_id } = await req.json();
  const cacheKey = `${faction_id}:${war_id}`;
  
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL.war_data) {
    return new Response(JSON.stringify(cached.data), {
      headers: { 
        "Content-Type": "application/json",
        "X-Cache": "HIT"
      },
    });
  }
  
  // Fetch fresh data
  const data = await getUnifiedWarData(faction_id, war_id);
  
  // Update cache
  cache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
  
  return new Response(JSON.stringify(data), {
    headers: { 
      "Content-Type": "application/json",
      "X-Cache": "MISS"
    },
  });
});
```

### 2. Optimiser les Requêtes Torn API

```typescript
// shared/functions.ts - Ajouter cache pour Torn API
const tornAPICache = new Map();

async function fetchTornAPI(endpoint: string, apiKey: string, ttl = 60000) {
  const cacheKey = `${endpoint}:${apiKey}`;
  const cached = tornAPICache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  
  const response = await fetch(`https://api.torn.com/${endpoint}?key=${apiKey}`);
  const data = await response.json();
  
  tornAPICache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
  
  return data;
}
```

## 🏗️ Optimisations Phase 2 (Consolidation)

### 1. Nouvelle Structure des Functions

```
supabase/functions/
├── war-api/
│   └── index.ts         # Unifie war-detection, get-targets, call-management
├── xanax-api/
│   └── index.ts         # Unifie les 3 functions xanax
├── swift-responder/     # Point d'entrée unique (garde existant)
└── _shared/
    ├── cache.ts         # Système de cache centralisé
    ├── torn-api.ts      # Client Torn API avec cache
    └── supabase.ts      # Client Supabase optimisé
```

### 2. Implémentation war-api Consolidée

```typescript
// war-api/index.ts
serve(async (req: Request) => {
  const { operation, ...params } = await req.json();
  
  switch(operation) {
    case 'detect':
      return detectWar(params);
    case 'targets':
      return getTargets(params);
    case 'calls':
      return manageCalls(params);
    case 'unified':
      return getUnifiedData(params);
    case 'batch':
      return batchOperations(params.operations);
  }
});
```

### 3. Vues Matérialisées SQL

```sql
-- Vue pour résumé de guerre (refresh toutes les 30s)
CREATE MATERIALIZED VIEW war_summary AS
SELECT 
  w.war_id,
  w.faction_a_id,
  w.faction_b_id,
  COUNT(DISTINCT ac.id) as active_calls_count,
  COUNT(DISTINCT t.target_id) as available_targets,
  MAX(ac.created_at) as last_call_time
FROM wars w
LEFT JOIN active_calls ac ON ac.war_id = w.war_id
LEFT JOIN targets t ON t.war_id = w.war_id AND t.is_available = true
WHERE w.is_active = true
GROUP BY w.war_id;

-- Index pour performances
CREATE INDEX idx_war_summary_faction ON war_summary(faction_a_id, faction_b_id);

-- Fonction de refresh automatique
CREATE OR REPLACE FUNCTION refresh_war_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY war_summary;
END;
$$ LANGUAGE plpgsql;

-- Scheduler pour refresh (via pg_cron ou trigger)
SELECT cron.schedule('refresh-war-summary', '*/30 * * * * *', 'SELECT refresh_war_summary()');
```

## 🚀 Optimisations Phase 3 (Architecture Temps Réel)

### 1. Migration SSE Complète

```typescript
// sse-api/index.ts - Endpoint SSE unifié
serve(async (req: Request) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  // Subscribe to database changes
  const subscription = supabase
    .channel('war-updates')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'active_calls'
    }, (payload) => {
      writer.write(encoder.encode(`event: call_update\ndata: ${JSON.stringify(payload)}\n\n`));
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'targets'
    }, (payload) => {
      writer.write(encoder.encode(`event: target_update\ndata: ${JSON.stringify(payload)}\n\n`));
    })
    .subscribe();
  
  // Keepalive
  const keepalive = setInterval(() => {
    writer.write(encoder.encode(':\n\n'));
  }, 20000);
  
  // Cleanup on disconnect
  req.signal.addEventListener('abort', () => {
    clearInterval(keepalive);
    subscription.unsubscribe();
    writer.close();
  });
  
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  });
});
```

### 2. Client WebSocket Optimisé

```javascript
// Dans torn-war-calling.user.js
class RealtimeWarSystem {
  constructor() {
    this.channel = supabase
      .channel('war-room')
      .on('presence', { event: 'sync' }, () => {
        this.updateActiveUsers();
      })
      .on('broadcast', { event: 'call' }, (payload) => {
        this.handleNewCall(payload);
      })
      .subscribe();
  }
  
  // Broadcast call sans passer par le serveur
  async makeCall(targetId) {
    await this.channel.send({
      type: 'broadcast',
      event: 'call',
      payload: {
        caller_id: this.userId,
        target_id: targetId,
        timestamp: new Date().toISOString()
      }
    });
  }
}
```

## 📈 Métriques de Performance Attendues

| Optimisation | Réduction Appels | Latence | Complexité |
|--------------|------------------|---------|------------|
| Cache Serveur | -40% | -50ms | ⭐ |
| Cache Torn API | -60% | -100ms | ⭐ |
| Consolidation | -30% | -20ms | ⭐⭐ |
| Vues Matérialisées | -50% | -80ms | ⭐⭐ |
| SSE/WebSocket | -95% | -900ms | ⭐⭐⭐ |

## 🛠️ Plan d'Implémentation

### Semaine 1
- [ ] Implémenter cache dans unified-war-data
- [ ] Ajouter cache Torn API dans shared/functions.ts
- [ ] Créer vues matérialisées SQL

### Semaine 2
- [ ] Consolider functions xanax → xanax-api
- [ ] Refactorer war functions → war-api
- [ ] Tester performances avec cache

### Semaine 3
- [ ] Déployer serveur SSE sur Render
- [ ] Migrer clients vers SSE
- [ ] Monitoring et ajustements

## 🔍 Monitoring

```sql
-- Query pour suivre les performances
SELECT 
  date_trunc('hour', created_at) as hour,
  COUNT(*) as api_calls,
  AVG(response_time_ms) as avg_latency,
  COUNT(DISTINCT user_id) as unique_users
FROM edge_function_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```