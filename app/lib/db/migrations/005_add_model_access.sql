-- Add account type and model access control fields to providers table

-- Account type: FREE, PRO, or UNKNOWN (default)
ALTER TABLE providers ADD COLUMN account_type TEXT DEFAULT 'UNKNOWN';

-- Allowed models: JSON array of model names, NULL means all models allowed
ALTER TABLE providers ADD COLUMN allowed_models TEXT DEFAULT NULL;

-- Index for account type queries
CREATE INDEX IF NOT EXISTS idx_providers_account_type ON providers(account_type);
