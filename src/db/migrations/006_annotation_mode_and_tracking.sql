-- Migration: Add annotation mode and tracking fields
-- Adds mode, annotated_by, annotated_at columns to file_annotations table
-- Supports pre-commit checking and annotation tracking

ALTER TABLE file_annotations ADD COLUMN mode TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE file_annotations ADD COLUMN annotated_by TEXT;

ALTER TABLE file_annotations ADD COLUMN annotated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_annotations_mode ON file_annotations(mode);
