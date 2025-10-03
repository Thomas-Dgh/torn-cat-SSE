# TORN CAT Edge Functions Documentation

## Overview
This project contains several Deno Edge Functions for managing war-related operations in Torn City.

## Edge Functions

### 0. **swift-responder**
- **Purpose**: Multi-function router that handles multiple endpoints
- **Endpoint**: `/functions/v1/swift-responder`
- **Features**:
  - Routes to war-detection, call-management, sync-updates, or get-war-targets
  - Based on the path in the URL
  - Default fallback to war-detection

### 1. **xanax-checker**
- **Purpose**: Processes xanax payments from faction members
- **Endpoint**: `/functions/v1/xanax-checker`
- **Method**: POST
- **Input**: `{ faction_id: number }`
- **Features**:
  - Detects xanax payments in faction events
  - Validates sender is from same faction
  - Updates faction license and war credits
  - Returns payment statistics

### 2. **xanax-cron**
- **Purpose**: Scheduled job for processing xanax payments
- **Endpoint**: `/functions/v1/xanax-cron`
- **Features**:
  - Automated periodic checking
  - Processes multiple factions

### 3. **xanax-cron-simple**
- **Purpose**: Simplified version of xanax-cron
- **Endpoint**: `/functions/v1/xanax-cron-simple`
- **Features**:
  - Lighter weight processing
  - Basic payment detection

### 4. **war-detection**
- **Purpose**: Detects when factions enter or exit wars
- **Endpoint**: `/functions/v1/war-detection`
- **Features**:
  - Monitors faction war status
  - Creates/updates war records
  - Triggers war-related events

### 5. **get-war-targets**
- **Purpose**: Retrieves targets for ongoing wars
- **Endpoint**: `/functions/v1/get-war-targets`
- **Features**:
  - Lists available targets
  - Filters by faction and status
  - Provides target information

### 6. **call-management**
- **Purpose**: Manages target calling during wars
- **Endpoint**: `/functions/v1/call-management`
- **Features**:
  - Call/uncall targets
  - Track active calls
  - Prevent duplicate calls

### 7. **unified-war-data**
- **Purpose**: Aggregates all war-related data
- **Endpoint**: `/functions/v1/unified-war-data`
- **Features**:
  - Combines war status
  - Active calls
  - Target information
  - License status

### 8. **sync-updates**
- **Purpose**: Provides synchronization updates for the userscript
- **Endpoint**: `/functions/v1/sync-updates`
- **Features**:
  - Real-time updates
  - Change notifications
  - State synchronization

## Environment Variables Required

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TORN_FULL_ACCESS_API_KEY=your_torn_api_key
```

## Database Tables Used

- `wars`: Active and historical wars
- `factions`: Faction information
- `faction_licenses`: License and payment tracking
- `faction_xanax_payments`: Payment records
- `active_calls`: Current target calls
- `target_calls`: Historical calls
- `users`: User information
- `sync_updates`: Synchronization events
- `war_script_version`: Script version tracking

## RPC Functions

- `get_or_create_user`: User management
- `get_or_create_faction`: Faction management
- `get_or_create_faction_license`: License management
- `process_xanax_payment`: Payment processing
- `call_target`: Register target call
- `uncall_target`: Remove target call
- `consume_war_xanax`: Activate war mode
- `detect_war_status`: Check war status
- `end_war`: Terminate war
- `get_active_calls`: List active calls
- `get_sync_updates`: Get sync events
- `auto_uncall_hospitalized_targets`: Cleanup hospitalized targets
- `register_faction_for_xanax_monitoring`: Enable monitoring
- `reset_war_activation`: Reset war state
- `process_war_payment`: Handle war payments