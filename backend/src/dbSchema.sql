-- dbSchema.sql
-- Cache table for API responses
-- 
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  data JSONB,
  expires TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,  -- Hash in prod
  email TEXT UNIQUE NOT NULL
);

-- User settings (e.g., custom weights, portfolios)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  weights JSONB,
  portfolio JSONB
);

-- Historical analyses (for reports)
CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token_symbol TEXT,
  analysis_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
