-- Insérer une guerre test si elle n'existe pas
INSERT INTO wars (war_id, faction_a_id, faction_b_id, faction_a_name, faction_b_name, is_active)
VALUES (1, 1000, 2000, 'Test Faction A', 'Test Faction B', true)
ON CONFLICT (war_id) DO NOTHING;

-- Vous pouvez maintenant insérer des calls avec war_id = 1