CREATE TABLE "overlay_widgets" (
    "id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "queue_id" UUID,
    "fixed_text" TEXT,
    "fallback_text" TEXT NOT NULL DEFAULT '',
    "style" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "capability_hash" TEXT,
    "capability_version" INTEGER NOT NULL DEFAULT 1,
    "revoked_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "overlay_widgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "overlay_widgets_capability_version_positive_check" CHECK ("capability_version" > 0),
    CONSTRAINT "overlay_widgets_version_positive_check" CHECK ("version" > 0),
    CONSTRAINT "overlay_widgets_capability_hash_format_check" CHECK ("capability_hash" IS NULL OR "capability_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "overlay_widgets_source_type_check" CHECK ("source_type" IN (
        'account_label',
        'queue_name',
        'queue_state',
        'queue_waiting_count',
        'called_viewer_display_name',
        'called_viewer_position',
        'in_service_viewer_display_name',
        'fixed_text'
    )),
    CONSTRAINT "overlay_widgets_source_scope_check" CHECK (
        ("source_type" = 'fixed_text' AND "fixed_text" IS NOT NULL AND "queue_id" IS NULL)
        OR
        ("source_type" <> 'fixed_text' AND "fixed_text" IS NULL AND
            (("source_type" IN ('queue_name', 'queue_state', 'queue_waiting_count') AND "queue_id" IS NOT NULL)
            OR ("source_type" IN ('account_label', 'called_viewer_display_name', 'called_viewer_position', 'in_service_viewer_display_name') AND "queue_id" IS NULL)))
    ),
    CONSTRAINT "overlay_widgets_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "overlay_widgets_capability_hash_key" ON "overlay_widgets"("capability_hash");
CREATE INDEX "overlay_widgets_queue_id_deleted_at_idx" ON "overlay_widgets"("queue_id", "deleted_at");
