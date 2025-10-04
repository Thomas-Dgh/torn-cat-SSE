-- Trigger function for SSE notifications on target_calls table
CREATE OR REPLACE FUNCTION notify_target_call() 
RETURNS trigger AS $$
DECLARE 
  payload json;
BEGIN
  payload := json_build_object(
    'id', NEW.id,
    'caller_id', NEW.caller_id,
    'target_id', NEW.target_id,
    'created_at', to_char(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ')
  );
  
  PERFORM pg_notify('target_calls', payload::text);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_notify_target_call ON target_calls;

-- Create new trigger
CREATE TRIGGER trg_notify_target_call 
AFTER INSERT ON target_calls 
FOR EACH ROW 
EXECUTE FUNCTION notify_target_call();