"use strict";
// src/server.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
const axios_1 = __importDefault(require("axios"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ws_1 = __importDefault(require("ws"));
const cors_1 = __importDefault(require("cors"));
const userRoutes_1 = __importDefault(require("./userRoutes")); // Import user routes
const cryptoDataAPI_1 = require("./cryptoDataAPI");
dotenv_1.default.config();
console.log('DATABASE_URL from .env:', process.env.DATABASE_URL || 'not loaded'); // Log to check if env is read
const app = (0, express_1.default)();
const port = process.env.BACKEND_PORT || 3001;
const pool = new pg_1.Pool({
    user: 'cryptoanalyzeradmin',
    password: '695847',
    host: 'localhost',
    port: 5432,
    database: 'crypto_db'
});
app.use(express_1.default.json());
app.use((0, cors_1.default)({ origin: 'http://localhost:3000', methods: ['GET', 'POST'], credentials: true })); // Enhanced: Allow GET/POST, credentials if needed for auth
app.use('/user', userRoutes_1.default); // Mount user routes
// Middleware for JWT auth (basic for prototype)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.sendStatus(401);
    jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err)
            return res.sendStatus(403);
        req.user = user;
        next();
    });
};
// Macro endpoint (combine BLS, FRED, Fiscal)
app.get('/fetch-macro', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Cache check
        const cacheKey = 'macro_data';
        const cacheQuery = yield pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
        if (cacheQuery.rows.length > 0) {
            return res.json(cacheQuery.rows[0].data);
        }
        // Fetch data
        const cpi = yield (0, cryptoDataAPI_1.fetchBLSCPI)();
        const rates = yield (0, cryptoDataAPI_1.fetchFREDInterestRates)();
        const deficits = yield (0, cryptoDataAPI_1.fetchFiscalDataDeficits)();
        const data = { cpi, rates, deficits };
        // Cache for 1 hour
        yield pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);
        res.json(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// Sentiment (market + token-specific)
app.get('/fetch-sentiment', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tokenSymbol } = req.query;
    try {
        // Cache check (global or token-specific)
        const cacheKey = tokenSymbol ? `sentiment_${tokenSymbol}` : 'sentiment_global';
        const cacheQuery = yield pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
        if (cacheQuery.rows.length > 0) {
            return res.json(cacheQuery.rows[0].data);
        }
        // Fetch data
        const fearGreed = yield (0, cryptoDataAPI_1.fetchFearAndGreed)();
        const tokenSentiment = tokenSymbol ? yield (0, cryptoDataAPI_1.fetchLunarCrushSentiment)(tokenSymbol) : null;
        const data = { fearGreed, tokenSentiment };
        // Cache for 1 hour
        yield pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);
        res.json(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// Token data
app.get('/fetch-token-data', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tokenId } = req.query;
    if (!tokenId)
        return res.status(400).json({ error: 'tokenId required' });
    try {
        // Cache check
        const cacheKey = `token_data_${tokenId}`;
        const cacheQuery = yield pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
        if (cacheQuery.rows.length > 0) {
            return res.json(cacheQuery.rows[0].data);
        }
        // Fetch data
        const data = yield (0, cryptoDataAPI_1.fetchCoinGeckoTokenData)(tokenId);
        // Cache for 1 hour
        yield pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);
        res.json(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// DeFi TVL
app.get('/fetch-defi-tvl', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { protocol } = req.query;
    try {
        // Cache check
        const cacheKey = protocol ? `defi_tvl_${protocol}` : 'defi_tvl_global';
        const cacheQuery = yield pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
        if (cacheQuery.rows.length > 0) {
            return res.json(cacheQuery.rows[0].data);
        }
        // Fetch data
        const data = yield (0, cryptoDataAPI_1.fetchDeFiLlamaTVL)(protocol);
        // Cache for 1 hour
        yield pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);
        res.json(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// Whales
app.get('/fetch-whales', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Cache check
        const cacheKey = 'whales_data';
        const cacheQuery = yield pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
        if (cacheQuery.rows.length > 0) {
            return res.json(cacheQuery.rows[0].data);
        }
        // Fetch data
        const data = yield (0, cryptoDataAPI_1.fetchWhaleAlert)();
        // Cache for 10 minutes (real-time data)
        yield pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'10 minutes\'', [cacheKey, JSON.stringify(data)]);
        res.json(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// Unlocks
app.get('/fetch-unlocks', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tokenSymbol } = req.query;
    if (!tokenSymbol)
        return res.status(400).json({ error: 'tokenSymbol required' });
    try {
        // Cache check
        const cacheKey = `unlocks_${tokenSymbol}`;
        const cacheQuery = yield pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
        if (cacheQuery.rows.length > 0) {
            return res.json(cacheQuery.rows[0].data);
        }
        // Fetch data
        const data = yield (0, cryptoDataAPI_1.fetchTokenUnlocks)(tokenSymbol);
        // Cache for 1 hour
        yield pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);
        res.json(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// News
app.get('/fetch-news', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { query = 'cryptocurrency regulation' } = req.query;
    try {
        // Cache check
        const cacheKey = `news_${query}`;
        const cacheQuery = yield pool.query('SELECT data FROM cache WHERE key = $1 AND expires > NOW()', [cacheKey]);
        if (cacheQuery.rows.length > 0) {
            return res.json(cacheQuery.rows[0].data);
        }
        // Fetch data
        const data = yield (0, cryptoDataAPI_1.fetchNewsAPI)(query);
        // Cache for 1 hour
        yield pool.query('INSERT INTO cache (key, data, expires) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\') ON CONFLICT (key) DO UPDATE SET data = $2, expires = NOW() + INTERVAL \'1 hour\'', [cacheKey, JSON.stringify(data)]);
        res.json(data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// Route: Analyze token (calls analysis service)
app.post('/analyze-token', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tokenSymbol, horizon, customWeights } = req.body;
    try {
        // Fetch basic data from CoinGecko using new function
        const coinData = yield (0, cryptoDataAPI_1.fetchCoinGeckoTokenData)(tokenSymbol.toLowerCase());
        // Call Python analysis service
        const analysisResponse = yield axios_1.default.post(`http://localhost:${process.env.ANALYSIS_PORT}/score-token`, {
            data: coinData,
            horizon,
            weights: customWeights || {} // Default weights from spec
        });
        res.json(analysisResponse.data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// WebSocket for real-time updates (e.g., whale alerts)
if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(port, () => console.log(`Backend running on port ${port}`));
    const wss = new ws_1.default.Server({ server });
    wss.on('connection', (ws) => {
        // Simulate real-time data; in prod, subscribe to Whale Alert API
        const interval = setInterval(() => {
            ws.send(JSON.stringify({ type: 'whale_move', data: { amount: Math.random() * 1000, token: 'BTC' } }));
        }, 5000);
        ws.on('close', () => clearInterval(interval));
    });
}
exports.default = app;
