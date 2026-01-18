-- 添加提供商类型字段
ALTER TABLE providers ADD COLUMN provider_type TEXT DEFAULT 'kiro';

-- 为 provider_type 创建索引以支持分组查询
CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(provider_type);
