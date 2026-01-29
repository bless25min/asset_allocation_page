-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    picture_url TEXT,
    created_at INTEGER,
    last_login INTEGER
);

-- Simulations Table
CREATE TABLE IF NOT EXISTS simulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    input_data TEXT,       -- JSON
    allocation_data TEXT,  -- JSON
    metrics_data TEXT,     -- JSON
    created_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
