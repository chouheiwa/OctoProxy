-- 添加用量缓存字段
ALTER TABLE providers ADD COLUMN cached_usage_used REAL DEFAULT 0;
ALTER TABLE providers ADD COLUMN cached_usage_limit REAL DEFAULT 0;
ALTER TABLE providers ADD COLUMN cached_usage_percent REAL DEFAULT 0;
ALTER TABLE providers ADD COLUMN usage_exhausted INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN last_usage_sync TEXT;
