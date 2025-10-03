# C.A.T - Combat Assistance Toolkit

## 🚨 Problème Critique

**707 587 edge function invocations en 4 jours avec seulement 30 utilisateurs**

- Moyenne actuelle : 5 896 appels/jour/utilisateur
- Projection à 3000 utilisateurs : 17,7 millions d'appels/jour
- Coût estimé : Explosion du budget Supabase

## 📊 Analyse des Appels Edge Functions

### Fonctions les plus appelées
1. **sync-updates** : Toutes les secondes (86 400 appels/jour/user)
2. **call-management** : Toutes les 2 secondes  
3. **unified-war-data** : Toutes les secondes
4. **get-war-targets** : Toutes les 3 minutes
5. **war-detection** : Toutes les minutes

### Architecture Actuelle
```
9 Edge Functions séparées:
├── war-detection/
├── call-management/
├── sync-updates/
├── get-war-targets/
├── unified-war-data/
├── swift-responder/
├── xanax-checker/
├── xanax-cron/
└── xanax-cron-simple/
```

## 🎯 Plan d'Optimisation

### Phase 1 : Quick Wins (Réduction 50%)
- [ ] Augmenter les intervalles de polling (1s → 5s minimum)
- [ ] Implémenter un cache côté client avec TTL
- [ ] Grouper les appels similaires

### Phase 2 : Refactoring (Réduction 80%)
- [ ] Consolider les 9 functions en 3 maximum
- [ ] Implémenter le batching des requêtes
- [ ] Utiliser des vues matérialisées PostgreSQL

### Phase 3 : Architecture (Réduction 95%)
- [ ] Migration vers Supabase Realtime (WebSockets)
- [ ] Implémenter un système de cache distribué
- [ ] Edge function unique avec routing interne

## 🛠️ Structure du Projet

```
torn-cat/
├── supabase/
│   ├── functions/
│   │   ├── _shared/        # Code partagé optimisé
│   │   ├── api/           # Nouvelle API unifiée
│   │   └── legacy/        # Anciennes functions (à migrer)
│   ├── migrations/
│   └── config.toml
├── scripts/
│   └── torn-war-calling.user.js
├── docs/
│   └── optimization/
└── README.md
```

## 📈 Métriques de Performance

| Métrique | Avant | Objectif | Réduction |
|----------|-------|----------|-----------|
| Appels/jour | 176 896 | < 10 000 | 94% |
| Latence moyenne | 200ms | < 50ms | 75% |
| Coût mensuel | $$$ | $ | 90% |

## 🚀 Getting Started

```bash
# Installation
npm install

# Development
npm run dev

# Deploy optimized functions
npm run deploy:functions
```

## 📝 Notes d'Optimisation

### Problèmes Identifiés
1. **Polling excessif** : Chaque utilisateur fait des appels toutes les secondes
2. **Duplication** : Même logique dans plusieurs functions
3. **Pas de cache** : Données statiques re-fetchées constamment
4. **Architecture fragmentée** : 9 functions pour une seule feature

### Solutions Prioritaires
1. **WebSockets** : Remplacer le polling par du push
2. **Cache intelligent** : localStorage + Redis
3. **API Gateway** : Une seule edge function qui route
4. **Batch requests** : Grouper les appels par fenêtre de temps

## Database Schema

### Tables:
- `wars` - War tracking
- `factions` - Faction information
- `faction_licenses` - License and payment management
- `faction_xanax_payments` - Payment records
- `active_calls` - Current target calls
- `target_calls` - Call history
- `users` - User data
- `sync_updates` - Synchronization events
- `war_script_version` - Version tracking

### RPC Functions:
- Payment processing functions
- War management functions
- User/faction management functions
- Synchronization functions

## API Endpoints

All Edge Functions are available at:
```
https://wdgvdggkhxeugyusaymo.supabase.co/functions/v1/{function-name}
```