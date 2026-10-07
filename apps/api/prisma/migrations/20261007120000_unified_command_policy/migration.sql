WITH previous AS (
  SELECT key,
    CASE
      WHEN jsonb_typeof(value->'revision') = 'number' THEN (value->>'revision')::integer
      WHEN jsonb_typeof(value->'version') = 'number' THEN (value->>'version')::integer
      ELSE 1
    END AS previous_revision
  FROM settings
  WHERE key = 'chat_command_policies'
    AND value->>'schemaVersion' IS DISTINCT FROM '3'
), updated AS (
  UPDATE settings AS setting
  SET value = jsonb_build_object(
    'schemaVersion', 3,
    'revision', previous.previous_revision + 1,
    'policies', '{}'::jsonb
  ), updated_at = now()
  FROM previous
  WHERE setting.key = previous.key
  RETURNING previous.previous_revision + 1 AS revision
)
INSERT INTO audit_logs (id, event, actor_id, origin, reason, safe_detail, created_at)
SELECT gen_random_uuid(), 'command.permission_policy_migrated', NULL, 'migration', 'unified_access_rules',
  jsonb_build_object('schemaVersion', 3, 'revision', updated.revision), now()
FROM updated;
