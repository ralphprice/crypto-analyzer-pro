// src/server.ts

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import cors from 'cors';
import userRoutes from './userRoutes';  // Import user routes
import { fetchBLSCPI, fetchFREDInterestRates, fetchFiscalDataDeficits, fetchFearAndGreed, fetchLunarCrushSentiment, fetchCoinGeckoTokenData, fetchDeFiLlamaTVL, fetchWhaleAlert, fetchTokenUnlocks, fetchNewsAPI } from './cryptoDataAPI';

// Local extension for Request (fallback if d.ts not working)
interface AuthRequest extends Request {
  user?: jwt.JwtPayload | string;  // Adjust to your user shape
}

dotenv.config();
console.log('DATABASE_URL from .env:', process.env.DATABASE_URL || 'not loaded');  // Log to check if env is read

const app = express();
const port = process.env.BACKEND_PORT || 3001;

const pool = new Pool({
  user: 'cryptoanalyzeradmin',
  password: '695847',
  host: 'localhost',
  port: 5432,
  database: 'crypto_db'
});

app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000', methods: ['GET', 'POST'], credentials: true }));  // Enhanced: Allow GET/POST, credentials if needed for auth
app.use('/user', userRoutes);  // Mount user routes

// Middleware for JWT auth (basic for prototype)
const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET as string, (err: jwt.VerifyErrors | null, user: jwt.JwtPayload | string | undefined) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Macro endpoint (combine BLS, FRED, Fiscal)
app.get('/fetch-macro', async (req: Request, res: Response) => {
  try {
    // Cache check
    const cacheKey = 'macro_data';
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      return res.json(cacheQuery.rows[0].data);
    }

    // Fetch data
    const cpi = await fetchBLSCPI();
    const rates = await fetchFREDInterestRates();
    const deficits = await fetchFiscalDataDeficits();

    const data = { cpi, rates, deficits };

    // Cache for 1 hour
    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Sentiment (market + token-specific)
app.get('/fetch-sentiment', async (req: Request, res: Response) => {
  const { tokenSymbol } = req.query;
  try {
    // Cache check (global or token-specific)
    const cacheKey = tokenSymbol ? `sentiment_${tokenSymbol}` : 'sentiment_global';
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      return res.json(cacheQuery.rows[0].data);
    }

    // Fetch data
    const fearGreed = await fetchFearAndGreed();
    const tokenSentiment = tokenSymbol ? await fetchLunarCrushSentiment(tokenSymbol as string) : null;

    const data = { fearGreed, tokenSentiment };

    // Cache for 1 hour
    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Token data
app.get('/fetch-token-data', async (req: Request, res: Response) => {
  const { tokenId } = req.query;
  if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
  try {
    // Cache check
    const cacheKey = `token_data_${tokenId}`;
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      return res.json(cacheQuery.rows[0].data);
    }

    // Fetch data
    const data = await fetchCoinGeckoTokenData(tokenId as string);

    // Cache for 1 hour
    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// DeFi TVL
app.get('/fetch-defi-tvl', async (req: Request, res: Response) => {
  const { protocol } = req.query;
  try {
    // Cache check
    const cacheKey = protocol ? `defi_tvl_${protocol}` : 'defi_tvl_global';
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      return res.json(cacheQuery.rows[0].data);
    }

    // Fetch data
    const data = await fetchDeFiLlamaTVL(protocol as string);

    // Cache for 1 hour
    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Whales
app.get('/fetch-whales', async (req: Request, res: Response) => {
  try {
    // Cache check
    const cacheKey = 'whales_data';
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      return res.json(cacheQuery.rows[0].data);
    }

    // Fetch data
    const data = await fetchWhaleAlert();

    // Cache for 10 minutes (real-time data)
    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'10 minutes\'', [cacheKey, JSON.stringify(data)]);

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Unlocks
app.get('/fetch-unlocks', async (req: Request, res: Response) => {
  const { tokenSymbol } = req.query;
  if (!tokenSymbol) return res.status(400).json({ error: 'tokenSymbol required' });
  try {
    // Cache check
    const cacheKey = `unlocks_${tokenSymbol}`;
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      return res.json(cacheQuery.rows[0].data);
    }

    // Fetch data
    const data = await fetchTokenUnlocks(tokenSymbol as string);

    // Cache for 1 hour
    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// News
app.get('/fetch-news', async (req: Request, res: Response) => {
  const { query = 'cryptocurrency regulation' } = req.query;
  try {
    // Cache check
    const cacheKey = `news_${query}`;
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      return res.json(cacheQuery.rows[0].data);
    }

    // Fetch data
    const data = await fetchNewsAPI(query as string);

    // Cache for 1 hour
    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Route: Analyze token (calls analysis service)
app.post('/analyze-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { tokenSymbol, horizon, customWeights } = req.body;
  try {
    // Fetch basic data from CoinGecko using new function
    const coinData = await fetchCoinGeckoTokenData(tokenSymbol.toLowerCase());

    // Call Python analysis service
    const analysisResponse = await axios.post(`http://localhost:${process.env.ANALYSIS_PORT}/score-token`, {
      data: coinData,
      horizon,
      weights: customWeights || {} // Default weights from spec
    });

    res.json(analysisResponse.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// WebSocket for real-time updates (e.g., whale alerts)
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => console.log(`Backend running on port ${port}`));
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    // Simulate real-time data; in prod, subscribe to Whale Alert API
    const interval = setInterval(() => {
      ws.send(JSON.stringify({ type: 'whale_move', data: { amount: Math.random() * 1000, token: 'BTC' } }));
    }, 5000);

    ws.on('close', () => clearInterval(interval));
  });
}

export default app;
