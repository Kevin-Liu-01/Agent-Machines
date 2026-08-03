-- 007: substrate-migration state on machines.
--
-- MachineRef.migrationState (web/lib/user-config/schema.ts MigrationState)
-- mirrors bootstrap_state's shape: one jsonb column, written after every
-- migration step so the dashboard can poll real progress, terminal value
-- carries the full MigrationReport (moved / rederived / lost / skipped /
-- source disposition / newMachineId).
--
-- Writing this file does not apply it (the 006_mux_placements.sql rule):
-- someone with database access must run it. Until then the mirror's
-- migration_state writes are isolated in their own statement
-- (web/lib/supabase/machines.ts) so an unapplied migration degrades to
-- "migration progress not mirrored", never to a failed bootstrap-state write.

alter table machines
	add column if not exists migration_state jsonb;
