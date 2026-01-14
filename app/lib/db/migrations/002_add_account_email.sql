-- 添加账户邮箱字段用于缓存 Kiro 账户信息
ALTER TABLE providers ADD COLUMN account_email TEXT;
