-- dbSchema.sql
-- Cache table for API responses
-- psql -U cryptoanalyzeradmin -d crypto_db -f backend/src/dbSchema.sql
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

-- Drop existing tables to clear old data
DROP TABLE IF EXISTS regulatory_searches;
DROP TABLE IF EXISTS edgar_cache;
DROP TABLE IF EXISTS coingecko_cache;

-- Create regulatory_searches table
CREATE TABLE IF NOT EXISTS regulatory_searches (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    cik VARCHAR(10) NOT NULL,
    keywords TEXT
);

-- Seed with updated keywords
INSERT INTO regulatory_searches (company_name, cik, keywords)
VALUES
    ('Coinbase Global, Inc.', '1679788', 'cryptocurrency, crypto, digital assets, regulation, ETF, stablecoin, blockchain, digital securities, custody, crypto trading, token, exchange'),
    ('MicroStrategy Inc.', '1050446', 'bitcoin, btc, treasury, regulation, crypto accounting, digital assets, blockchain, crypto'),
    ('Riot Platforms, Inc.', '1167419', 'bitcoin mining, btc, energy, regulation, cryptocurrency, blockchain, crypto'),
    ('Galaxy Digital Holdings', '1771140', 'crypto assets, ETF, regulation, digital securities, blockchain, crypto, token'),
    ('Robinhood Markets, Inc.', '1783879', 'crypto trading, cryptocurrency, regulation, digital assets, blockchain, crypto, exchange');

-- Create edgar_cache table
CREATE TABLE IF NOT EXISTS edgar_cache (
    cik VARCHAR(10) PRIMARY KEY,
    data JSONB NOT NULL,
    cached_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS coingecko_cache (
  symbol VARCHAR(50) PRIMARY KEY,
  id VARCHAR(100) NOT NULL,
  cached_at TIMESTAMP NOT NULL
);

