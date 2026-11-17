-- OPS-31 P4 (M-OVL-down). Run only after stopping the application version that knows `next_waiting_viewer_display_name`.
-- An older application cannot read this source and the old CHECK would refuse the rows, so every widget that uses it is
-- retired in place: revoked, soft-deleted, its capability hash cleared (the OBS link stops working) and turned into an empty
-- `fixed_text` row. The queue link of those widgets is lost; nothing else (queues, entries, money) is touched.
-- Re-running the up migration afterwards restores the schema; those widgets must be created again.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

UPDATE "overlay_widgets"
SET "source_type" = 'fixed_text',
    "fixed_text" = '',
    "queue_id" = NULL,
    "capability_hash" = NULL,
    "capability_version" = "capability_version" + 1,
    "revoked_at" = COALESCE("revoked_at", now()),
    "deleted_at" = COALESCE("deleted_at", now()),
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "source_type" = 'next_waiting_viewer_display_name';

ALTER TABLE "overlay_widgets" DROP CONSTRAINT "overlay_widgets_source_scope_check";
ALTER TABLE "overlay_widgets" DROP CONSTRAINT "overlay_widgets_source_type_check";

ALTER TABLE "overlay_widgets" ADD CONSTRAINT "overlay_widgets_source_type_check" CHECK ("source_type" IN (
    'account_label',
    'queue_name',
    'queue_state',
    'queue_waiting_count',
    'called_viewer_display_name',
    'called_viewer_position',
    'in_service_viewer_display_name',
    'fixed_text'
));
ALTER TABLE "overlay_widgets" ADD CONSTRAINT "overlay_widgets_source_scope_check" CHECK (
    ("source_type" = 'fixed_text' AND "fixed_text" IS NOT NULL AND "queue_id" IS NULL)
    OR
    ("source_type" <> 'fixed_text' AND "fixed_text" IS NULL AND
        (("source_type" IN ('queue_name', 'queue_state', 'queue_waiting_count') AND "queue_id" IS NOT NULL)
        OR ("source_type" IN ('account_label', 'called_viewer_display_name', 'called_viewer_position', 'in_service_viewer_display_name') AND "queue_id" IS NULL)))
);
