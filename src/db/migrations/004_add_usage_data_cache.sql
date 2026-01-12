-- 添加完整用量数据缓存字段
ALTER TABLE providers ADD COLUMN cached_usage_data TEXT;
