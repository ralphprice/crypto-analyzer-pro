// backend/src/server.ts

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import cors from 'cors';
import userRoutes from './userRoutes';
import { fetchBLSCPI, fetchFREDInterestRates, fetchFiscalDataDeficits, fetchFearAndGreed, fetchLunarCrushSentiment, fetchCoinGeckoTokenData, fetchDeFiLlamaTVL, fetchWhales, fetchTokenUnlocks, fetchNewsAPI, fetchRegulatoryNews, fetchEDGARFilings, fetchEDGARFullTextSearch, fetchLaunchpadTokens, getCoinGeckoIdFromSymbol } from './cryptoDataAPI';

// Local extension for Request
interface AuthRequest extends Request {
  user?: jwt.JwtPayload | string;
}

dotenv.config();
console.log('DATABASE_URL from .env:', process.env.DATABASE_URL || 'not loaded');

const app = express();
const port = process.env.BACKEND_PORT || 3001;

// Database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000', methods: ['GET', 'POST'], credentials: true }));
app.use('/user', userRoutes);

// Log all incoming requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${JSON.stringify(req.query)}`);
  next();
});

// Middleware for JWT auth
const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.error('Authentication failed: No token provided');
    return res.sendStatus(401);
  }
  jwt.verify(token, process.env.JWT_SECRET as string, (err: jwt.VerifyErrors | null, user: jwt.JwtPayload | string | undefined) => {
    if (err) {
      console.error('Authentication failed: Invalid token');
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

// Resolve CoinGecko ID
app.get('/resolve-coin-id', async (req, res) => {
  const symbol = req.query.symbol as string;
  if (!symbol) {
    console.error('Resolve coin ID failed: Symbol is required');
    return res.status(400).json({ error: 'Symbol is required' });
  }

  try {
    // Check PostgreSQL cache
    const cacheQuery = 'SELECT id FROM coingecko_cache WHERE symbol = $1 AND cached_at > NOW() - INTERVAL \'1 day\'';
    const cacheResult = await pool.query(cacheQuery, [symbol.toUpperCase()]);
    if (cacheResult.rows.length > 0) {
      console.log(`Cache hit for CoinGecko ID of ${symbol}: ${cacheResult.rows[0].id}`);
      return res.json({ symbol: symbol.toUpperCase(), coinId: cacheResult.rows[0].id });
    }

    // Query CoinGecko
    const coinId = await getCoinGeckoIdFromSymbol(symbol);
    if (coinId) {
      // Cache the result
      const insertQuery = 'INSERT INTO coingecko_cache (symbol, id, cached_at) VALUES ($1, $2, NOW()) ON CONFLICT (symbol) DO UPDATE SET id = $2, cached_at = NOW()';
      await pool.query(insertQuery, [symbol.toUpperCase(), coinId]);
      console.log(`Resolved and cached CoinGecko ID for ${symbol}: ${coinId}`);
      return res.json({ symbol: symbol.toUpperCase(), coinId });
    }

    // Handle specific cases
    if (symbol.toUpperCase() === 'VIRAL-TOKEN') {
      console.warn('No CoinGecko ID found for VIRAL-TOKEN');
      return res.status(404).json({ error: 'No CoinGecko ID found for VIRAL-TOKEN' });
    }

    console.warn(`No CoinGecko ID found for symbol: ${symbol}`);
    return res.status(404).json({ error: `No CoinGecko ID found for symbol: ${symbol}` });
  } catch (error: any) {
    console.error(`Error resolving coin ID for ${symbol}:`, error.message);
    return res.status(500).json({ error: `Error resolving coin ID: ${error.message}` });
  }
});

// Macro endpoint
app.get('/fetch-macro', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'macro_data';
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      console.log('Cache hit for macro data');
      return res.json(cacheQuery.rows[0].data);
    }

    const cpi = await fetchBLSCPI();
    const rates = await fetchFREDInterestRates();
    const deficits = await fetchFiscalDataDeficits();

    const data = { cpi, rates, deficits };

    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    console.log('Fetched and cached macro data');
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-macro:', message);
    res.status(500).json({ error: message });
  }
});

// Sentiment endpoint
app.get('/fetch-sentiment', async (req: Request, res: Response) => {
  const { tokenSymbol } = req.query;
  try {
    const cacheKey = tokenSymbol ? `sentiment_${tokenSymbol}` : 'sentiment_global';
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      console.log(`Cache hit for sentiment data (${cacheKey})`);
      return res.json(cacheQuery.rows[0].data);
    }

    const fearGreed = await fetchFearAndGreed();
    const tokenSentiment = tokenSymbol ? await fetchLunarCrushSentiment(tokenSymbol as string) : null;

    const data = { fearGreed, tokenSentiment };

    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    console.log(`Fetched and cached sentiment data (${cacheKey})`);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-sentiment:', message);
    res.status(500).json({ error: message });
  }
});

// Regulatory News endpoint
app.get('/fetch-regulatory', async (req, res) => {
  try {
    const news = await fetchRegulatoryNews();
    console.log(`Returning ${news.length} regulatory news articles`);
    res.json(news);
  } catch (error) {
    console.error('Error in fetch-regulatory:', error);
    res.status(500).json({ error: 'Failed to fetch regulatory news' });
  }
});

// Standard regulatory searches
app.get('/fetch-standard-regulatory', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM regulatory_searches');
    const searches = result.rows;
    const filingsData: { [key: string]: any[] } = {};

    const globalFilings = await fetchEDGARFullTextSearch('cryptocurrency OR ETF OR blockchain OR digital assets');
    const globalHits = globalFilings.map((hit: any) => ({
      filingDate: hit._source.file_date || '',
      form: hit._source.form_type || '',
      description: hit._source.description || hit._source.title || 'No description',
      cik: hit._source.cik
    }));

    for (const search of searches) {
      const filings = await fetchEDGARFilings(search.cik);
      const keywordList = search.keywords.split(',').map((kw: string) => kw.trim().toLowerCase());
      let displayFilings: any[] = [];
      let fallbackNote = '';

      if (filings && filings.filings && filings.filings.recent) {
        const recent = filings.filings.recent;
        const maxLength = Math.min(
          recent.form.length,
          recent.filingDate.length,
          recent.primaryDocDescription ? recent.primaryDocDescription.length : 0
        );

        for (let i = 0; i < maxLength; i++) {
          const description = (recent.primaryDocDescription && recent.primaryDocDescription[i] ? recent.primaryDocDescription[i] : '').toLowerCase();
          const form = (recent.form[i] || '').toLowerCase();
          if (
            keywordList.some((kw: string) => description.includes(kw) || form.includes(kw)) ||
            ['8-k', '10-q', '10-k'].includes(form)
          ) {
            displayFilings.push({
              filingDate: recent.filingDate[i] || '',
              form: recent.form[i] || '',
              description: recent.primaryDocDescription && recent.primaryDocDescription[i] ? recent.primaryDocDescription[i] : 'No description',
            });
          }
          if (displayFilings.length >= 10) break;
        }

        if (displayFilings.length === 0 && maxLength > 0) {
          const recentLimit = Math.min(5, maxLength);
          for (let i = 0; i < recentLimit; i++) {
            displayFilings.push({
              filingDate: recent.filingDate[i] || '',
              form: recent.form[i] || '',
              description: recent.primaryDocDescription && recent.primaryDocDescription[i] ? recent.primaryDocDescription[i] : 'No description',
            });
          }
          fallbackNote = ' (No crypto-specific matches; showing recent filings)';
        }
      }

      const companyGlobalFilings = globalHits.filter((hit: any) => hit.cik === search.cik.padStart(10, '0'));
      displayFilings = [...displayFilings, ...companyGlobalFilings].slice(0, 10);

      filingsData[search.company_name + fallbackNote] = displayFilings;
    }

    console.log(`Returning regulatory filings for ${Object.keys(filingsData).length} companies`);
    res.json(filingsData);
  } catch (error) {
    console.error('Error in fetch-standard-regulatory:', error);
    res.status(500).json({ error: 'Failed to fetch standard regulatory data' });
  }
});

// Launchpad tokens
app.get('/fetch-launchpad-tokens', async (req, res) => {
  try {
    const { platform = 'all', age = '30d' } = req.query;
    console.log(`Handling /fetch-launchpad-tokens with platform=${platform}, age=${age}`);
    const tokens = await fetchLaunchpadTokens(platform as string, age as string);
    console.log(`Returning ${tokens.length} tokens for platform=${platform}, age=${age}`);
    res.json(tokens);
  } catch (error) {
    console.error('Error in fetch-launchpad-tokens:', error);
    res.status(500).json({ error: 'Failed to fetch launchpad tokens' });
  }
});

// Token data
app.get('/fetch-token-data', async (req: Request, res: Response) => {
  const { tokenId } = req.query;
  if (!tokenId) {
    console.error('Fetch token data failed: tokenId required');
    return res.status(400).json({ error: 'tokenId required' });
  }
  try {
    const cacheKey = `token_data_${tokenId}`;
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      console.log(`Cache hit for token data (${tokenId})`);
      return res.json(cacheQuery.rows[0].data);
    }

    const data = await fetchCoinGeckoTokenData(tokenId as string);

    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    console.log(`Fetched and cached token data for ${tokenId}`);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-token-data:', message);
    res.status(500).json({ error: message });
  }
});

// DeFi TVL
app.get('/fetch-defi-tvl', async (req: Request, res: Response) => {
  const { protocol } = req.query;
  try {
    const cacheKey = protocol ? `defi_tvl_${protocol}` : 'defi_tvl_global';
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      console.log(`Cache hit for DeFi TVL (${cacheKey})`);
      return res.json(cacheQuery.rows[0].data);
    }

    const data = await fetchDeFiLlamaTVL(protocol as string);

    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    console.log(`Fetched and cached DeFi TVL (${cacheKey})`);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-defi-tvl:', message);
    res.status(500).json({ error: message });
  }
});

// Whales
app.get('/fetch-whales', async (req: Request, res: Response) => {
  const { chain = 'ethereum' } = req.query;
  try {
    const cacheKey = `whales_data_${chain}`;
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      console.log(`Cache hit for whales data (${chain})`);
      return res.json(cacheQuery.rows[0].data);
    }

    const data = await fetchWhales(chain as string);

    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'10 minutes\'', [cacheKey, JSON.stringify(data)]);

    console.log(`Fetched and cached whales data (${chain})`);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-whales:', message);
    res.status(500).json({ error: message });
  }
});

// Unlocks
app.get('/fetch-unlocks', async (req: Request, res: Response) => {
  const { tokenSymbol } = req.query;
  if (!tokenSymbol) {
    console.error('Fetch unlocks failed: tokenSymbol required');
    return res.status(400).json({ error: 'tokenSymbol required' });
  }
  try {
    const cacheKey = `unlocks_${tokenSymbol}`;
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      console.log(`Cache hit for unlocks (${tokenSymbol})`);
      return res.json(cacheQuery.rows[0].data);
    }

    const data = await fetchTokenUnlocks(tokenSymbol as string);

    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    console.log(`Fetched and cached unlocks for ${tokenSymbol}`);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-unlocks:', message);
    res.status(500).json({ error: message });
  }
});

// News
app.get('/fetch-news', async (req: Request, res: Response) => {
  const { query = 'cryptocurrency regulation' } = req.query;
  try {
    const cacheKey = `news_${query}`;
    const cacheQuery = await pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
    if (cacheQuery.rows.length > 0) {
      console.log(`Cache hit for news (${query})`);
      return res.json(cacheQuery.rows[0].data);
    }

    const data = await fetchNewsAPI(query as string);

    await pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);

    console.log(`Fetched and cached news for "${query}"`);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-news:', message);
    res.status(500).json({ error: message });
  }
});

// Analyze token
app.post('/analyze-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { tokenSymbol, horizon, customWeights } = req.body;
  try {
    console.log(`Handling /analyze-token for tokenSymbol=${tokenSymbol}, horizon=${horizon}`);
    const coinData = await fetchCoinGeckoTokenData(tokenSymbol.toLowerCase());
    const analysisResponse = await axios.post(`http://localhost:${process.env.ANALYSIS_PORT}/score-token`, {
      data: coinData,
      horizon,
      weights: customWeights || {}
    });
    console.log(`Analysis response for ${tokenSymbol}:`, analysisResponse.data);
    res.json(analysisResponse.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in analyze-token:', message);
    res.status(500).json({ error: message });
  }
});

// WebSocket
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => console.log(`Backend running on port ${port}`));
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    const interval = setInterval(() => {
      ws.send(JSON.stringify({ type: 'whale_move', data: { amount: Math.random() * 1000, token: 'BTC' } }));
    }, 5000);

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clearInterval(interval);
    });
  });
}

export default app;
