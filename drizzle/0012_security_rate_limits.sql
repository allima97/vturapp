-- Rate limit persistente compartilhado entre instâncias do Worker.
-- Substitui a tabela/RPC `security_rate_limits` do Supabase.
CREATE TABLE `security_rate_limits` (
  `scope` TEXT NOT NULL,
  `key_hash` TEXT NOT NULL,
  `window_start_ms` INTEGER NOT NULL,
  `expires_at_ms` INTEGER NOT NULL,
  `hits` INTEGER NOT NULL DEFAULT 0 CHECK (`hits` >= 0),
  PRIMARY KEY (`scope`, `key_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_security_rate_limits_expires_at`
  ON `security_rate_limits` (`expires_at_ms`);
