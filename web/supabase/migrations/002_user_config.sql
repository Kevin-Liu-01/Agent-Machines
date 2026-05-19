-- Move user config arrays from Clerk publicMetadata to Supabase.
-- Clerk's 8KB metadata limit causes "Unprocessable Entity" errors
-- once loadout configs contain 161+ skill IDs. JSONB columns have
-- no practical size limit and are faster to read.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS agent_profiles     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS gateway_profiles   jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS environment_profiles jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS bootstrap_presets  jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS custom_loadout     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS loadout_sources    jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS loadout_presets    jsonb NOT NULL DEFAULT '[]';
