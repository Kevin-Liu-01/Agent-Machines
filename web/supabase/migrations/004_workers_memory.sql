-- Workers + Owned Memory.
-- memory_bundles: portable persona/rules/docs + ability selections (the
--   "owned memory"); doc text can be several KB so it lives in JSONB, not
--   Clerk's 8KB metadata.
-- workers: reusable agent templates (kind + model/router + memory bundle ref).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS memory_bundles jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS workers        jsonb NOT NULL DEFAULT '[]';
