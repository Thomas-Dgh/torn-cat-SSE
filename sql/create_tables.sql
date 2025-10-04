-- Table pour stocker les guerres actives
CREATE TABLE IF NOT EXISTS wars (
  id SERIAL PRIMARY KEY,
  war_id INTEGER UNIQUE NOT NULL,
  faction_a_id INTEGER NOT NULL,
  faction_b_id INTEGER NOT NULL,
  faction_a_name VARCHAR(255),
  faction_b_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les cibles disponibles
CREATE TABLE IF NOT EXISTS targets (
  id SERIAL PRIMARY KEY,
  war_id INTEGER REFERENCES wars(war_id),
  target_id INTEGER NOT NULL,
  target_name VARCHAR(255),
  target_level INTEGER,
  target_status VARCHAR(50),
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les calls actifs
CREATE TABLE IF NOT EXISTS target_calls (
  id SERIAL PRIMARY KEY,
  war_id INTEGER REFERENCES wars(war_id),
  caller_id INTEGER NOT NULL,
  caller_name VARCHAR(255),
  target_id INTEGER NOT NULL,
  target_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour performances
CREATE INDEX idx_wars_active ON wars(is_active);
CREATE INDEX idx_targets_war ON targets(war_id);
CREATE INDEX idx_calls_war ON target_calls(war_id);
CREATE INDEX idx_calls_created ON target_calls(created_at);

-- Trigger pour mise à jour automatique du timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_wars_updated_at BEFORE UPDATE ON wars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_targets_updated_at BEFORE UPDATE ON targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();