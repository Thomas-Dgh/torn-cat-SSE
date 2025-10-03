-- TORN CAT Supabase Schema
-- Extracted from API discovery and Edge Functions analysis

-- =====================================================
-- TABLES
-- =====================================================

-- Table: wars
-- Stores information about faction wars
CREATE TABLE IF NOT EXISTS wars (
    id BIGSERIAL PRIMARY KEY,
    faction_id BIGINT NOT NULL,
    enemy_faction_id BIGINT,
    status TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: war_script_version
-- Tracks script version information
CREATE TABLE IF NOT EXISTS war_script_version (
    id BIGSERIAL PRIMARY KEY,
    version TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: factions
-- Stores faction information
CREATE TABLE IF NOT EXISTS factions (
    faction_id BIGINT PRIMARY KEY,
    faction_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: active_calls
-- Tracks active target calls during wars
CREATE TABLE IF NOT EXISTS active_calls (
    id BIGSERIAL PRIMARY KEY,
    target_id BIGINT NOT NULL,
    faction_id BIGINT NOT NULL,
    war_id BIGINT REFERENCES wars(id),
    caller_id BIGINT,
    caller_name TEXT,
    called_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'active'
);

-- Table: faction_xanax_payments
-- Records xanax payments from faction members
CREATE TABLE IF NOT EXISTS faction_xanax_payments (
    id BIGSERIAL PRIMARY KEY,
    faction_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    sender_name TEXT,
    xanax_amount INTEGER NOT NULL,
    event_id TEXT UNIQUE,
    event_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: faction_licenses
-- Manages faction licenses and war credits
CREATE TABLE IF NOT EXISTS faction_licenses (
    faction_id BIGINT PRIMARY KEY,
    total_xanax_received INTEGER DEFAULT 0,
    wars_paid INTEGER DEFAULT 0,
    license_type TEXT DEFAULT 'free',
    script_enabled_for_wars BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: target_calls
-- Historical record of all target calls
CREATE TABLE IF NOT EXISTS target_calls (
    id BIGSERIAL PRIMARY KEY,
    war_id BIGINT REFERENCES wars(id),
    target_id BIGINT NOT NULL,
    target_name TEXT,
    faction_id BIGINT NOT NULL,
    caller_id BIGINT,
    caller_name TEXT,
    called_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uncalled_at TIMESTAMP WITH TIME ZONE,
    status TEXT
);

-- Table: users
-- Stores user information
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    username TEXT,
    faction_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: sync_updates
-- Tracks synchronization updates for the war calling script
CREATE TABLE IF NOT EXISTS sync_updates (
    id BIGSERIAL PRIMARY KEY,
    update_type TEXT NOT NULL,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- RPC FUNCTIONS (Stored Procedures)
-- =====================================================

-- Function: get_or_create_user
-- Creates or retrieves user information
CREATE OR REPLACE FUNCTION get_or_create_user(
    p_user_id BIGINT,
    p_username TEXT DEFAULT NULL,
    p_faction_id BIGINT DEFAULT NULL
) RETURNS TABLE (
    user_id BIGINT,
    username TEXT,
    faction_id BIGINT
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: get_active_calls
-- Retrieves currently active calls for a faction
CREATE OR REPLACE FUNCTION get_active_calls(
    p_faction_id BIGINT DEFAULT NULL
) RETURNS TABLE (
    id BIGINT,
    target_id BIGINT,
    faction_id BIGINT,
    war_id BIGINT,
    caller_id BIGINT,
    caller_name TEXT,
    called_at TIMESTAMP WITH TIME ZONE,
    status TEXT
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: process_xanax_payment
-- Processes xanax payments and updates war credits
CREATE OR REPLACE FUNCTION process_xanax_payment(
    p_faction_id BIGINT,
    p_sender_id BIGINT,
    p_sender_name TEXT,
    p_xanax_amount INTEGER,
    p_event_id TEXT,
    p_event_text TEXT
) RETURNS TABLE (
    success BOOLEAN,
    wars_activated INTEGER,
    error TEXT
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: uncall_target
-- Removes a call on a target
CREATE OR REPLACE FUNCTION uncall_target(
    p_target_id BIGINT,
    p_faction_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: get_or_create_faction
-- Creates or retrieves faction information
CREATE OR REPLACE FUNCTION get_or_create_faction(
    p_faction_id BIGINT,
    p_faction_name TEXT DEFAULT NULL
) RETURNS TABLE (
    faction_id BIGINT,
    faction_name TEXT
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: register_faction_for_xanax_monitoring
-- Registers a faction for xanax payment monitoring
CREATE OR REPLACE FUNCTION register_faction_for_xanax_monitoring(
    p_faction_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: call_target
-- Registers a call on a target
CREATE OR REPLACE FUNCTION call_target(
    p_target_id BIGINT,
    p_target_name TEXT,
    p_faction_id BIGINT,
    p_caller_id BIGINT,
    p_caller_name TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: consume_war_xanax
-- Consumes xanax credits to activate war mode
CREATE OR REPLACE FUNCTION consume_war_xanax(
    p_faction_id BIGINT
) RETURNS TABLE (
    success BOOLEAN,
    wars_remaining INTEGER,
    error TEXT
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: get_sync_updates
-- Retrieves synchronization updates for the script
CREATE OR REPLACE FUNCTION get_sync_updates(
    p_since TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
    id BIGINT,
    update_type TEXT,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: auto_uncall_hospitalized_targets
-- Automatically uncalls targets that are hospitalized
CREATE OR REPLACE FUNCTION auto_uncall_hospitalized_targets() 
RETURNS INTEGER AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: detect_war_status
-- Detects and updates war status for factions
CREATE OR REPLACE FUNCTION detect_war_status(
    p_faction_id BIGINT,
    p_enemy_faction_id BIGINT DEFAULT NULL
) RETURNS TABLE (
    war_id BIGINT,
    status TEXT,
    is_new BOOLEAN
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: end_war
-- Ends an active war
CREATE OR REPLACE FUNCTION end_war(
    p_war_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: get_or_create_faction_license
-- Gets or creates a faction license record
CREATE OR REPLACE FUNCTION get_or_create_faction_license(
    p_faction_id BIGINT
) RETURNS TABLE (
    faction_id BIGINT,
    total_xanax_received INTEGER,
    wars_paid INTEGER,
    license_type TEXT,
    script_enabled_for_wars BOOLEAN
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: reset_war_activation
-- Resets war activation for a faction
CREATE OR REPLACE FUNCTION reset_war_activation(
    p_faction_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- Function: process_war_payment
-- Processes war payment transactions
CREATE OR REPLACE FUNCTION process_war_payment(
    p_faction_id BIGINT,
    p_payment_amount INTEGER
) RETURNS TABLE (
    success BOOLEAN,
    wars_added INTEGER,
    error TEXT
) AS $$
BEGIN
    -- Implementation would go here
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES (Inferred from usage patterns)
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_wars_faction_id ON wars(faction_id);
CREATE INDEX IF NOT EXISTS idx_wars_status ON wars(status);
CREATE INDEX IF NOT EXISTS idx_active_calls_faction_id ON active_calls(faction_id);
CREATE INDEX IF NOT EXISTS idx_active_calls_target_id ON active_calls(target_id);
CREATE INDEX IF NOT EXISTS idx_faction_xanax_payments_faction_id ON faction_xanax_payments(faction_id);
CREATE INDEX IF NOT EXISTS idx_faction_xanax_payments_sender_id ON faction_xanax_payments(sender_id);
CREATE INDEX IF NOT EXISTS idx_target_calls_war_id ON target_calls(war_id);
CREATE INDEX IF NOT EXISTS idx_target_calls_faction_id ON target_calls(faction_id);
CREATE INDEX IF NOT EXISTS idx_users_faction_id ON users(faction_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Likely enabled
-- =====================================================
-- Note: RLS policies would need to be defined based on your security requirements