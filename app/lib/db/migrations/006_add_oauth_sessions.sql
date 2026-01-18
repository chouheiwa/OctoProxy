-- OAuth sessions 表
CREATE TABLE IF NOT EXISTS oauth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,  -- 'social', 'builder-id', 'identity-center'
    provider TEXT,       -- 'google', 'github' for social auth
    region TEXT NOT NULL DEFAULT 'us-east-1',
    code_verifier TEXT,
    redirect_uri TEXT,
    state TEXT,
    client_id TEXT,
    client_secret TEXT,
    client_secret_expires_at INTEGER,
    device_code TEXT,
    user_code TEXT,
    poll_interval INTEGER,
    expires_at INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'error', 'expired', 'timeout', 'cancelled'
    error TEXT,
    credentials TEXT,    -- JSON string
    start_url TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_session_id ON oauth_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_state ON oauth_sessions(state);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_status ON oauth_sessions(status);
