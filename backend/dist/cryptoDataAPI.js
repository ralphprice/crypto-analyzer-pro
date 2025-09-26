"use strict";
// backend/src/cryptoDataAPI.ts
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
exports.fetchBLSCPI = fetchBLSCPI;
exports.fetchFREDInterestRates = fetchFREDInterestRates;
exports.fetchFiscalDataDeficits = fetchFiscalDataDeficits;
exports.fetchFearAndGreed = fetchFearAndGreed;
exports.fetchLunarCrushSentiment = fetchLunarCrushSentiment;
exports.fetchCoinGeckoTokenData = fetchCoinGeckoTokenData;
exports.fetchDeFiLlamaTVL = fetchDeFiLlamaTVL;
exports.fetchWhaleAlert = fetchWhaleAlert;
exports.fetchTokenUnlocks = fetchTokenUnlocks;
exports.fetchNewsAPI = fetchNewsAPI;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Helper: Get env var or throw
const getEnv = (key) => process.env[key] || '';
// BLS CPI (assuming series ID for CPI-U: CUUR0000SA0)
function fetchBLSCPI() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const BLS_KEY = getEnv('BLS_API_KEY');
            const response = yield axios_1.default.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
                seriesid: ['CUUR0000SA0'],
                startyear: new Date().getFullYear() - 1,
                endyear: new Date().getFullYear(),
                registrationkey: BLS_KEY || undefined, // Public if no key
            });
            const data = response.data.Results.series[0].data;
            return data.slice(0, 12); // Last 12 months
        }
        catch (error) {
            console.error('Error fetching BLS CPI:', error);
            return null;
        }
    });
}
// FRED Interest Rates (Fed Funds Rate)
function fetchFREDInterestRates() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const FRED_KEY = getEnv('FRED_API_KEY');
            const response = yield axios_1.default.get(`https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${FRED_KEY}&file_type=json&limit=12`);
            return response.data.observations;
        }
        catch (error) {
            console.error('Error fetching FRED rates:', error);
            return null;
        }
    });
}
// FiscalData (US Deficits, e.g., Monthly Treasury Statement)
function fetchFiscalDataDeficits() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_1?fields=record_date,current_fytd_net_outly_amt&filter=record_date:gte:2024-01-01&sort=-record_date&page[number]=1&page[size]=12');
            return response.data.data;
        }
        catch (error) {
            console.error('Error fetching FiscalData deficits:', error);
            return null;
        }
    });
}
// Fear and Greed Index (Market-wide sentiment)
function fetchFearAndGreed() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get('https://api.alternative.me/fng/');
            return response.data.data[0]; // {value, value_classification, timestamp}
        }
        catch (error) {
            console.error('Error fetching Fear and Greed:', error);
            return null;
        }
    });
}
// LunarCrush (Token-specific sentiment)
function fetchLunarCrushSentiment(tokenSymbol) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const LUNAR_KEY = getEnv('LUNARCRUSH_API_KEY');
            const response = yield axios_1.default.get(`https://api.lunarcrush.com/v2?data=assets&key=${LUNAR_KEY}&symbol=${tokenSymbol.toUpperCase()}&data_points=30&interval=day`);
            const sentiment = response.data.data[0]; // Includes galaxy_score, alt_rank, social_impact_score
            return {
                galaxy_score: sentiment.galaxy_score,
                alt_rank: sentiment.alt_rank,
                social_score: sentiment.social_score,
            };
        }
        catch (error) {
            console.error('Error fetching LunarCrush sentiment:', error);
            return null;
        }
    });
}
// CoinGecko (Token data: price, supply, market cap)
function fetchCoinGeckoTokenData(tokenId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get(`https://api.coingecko.com/api/v3/coins/${tokenId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
            return {
                price: response.data.market_data.current_price.usd,
                market_cap: response.data.market_data.market_cap.usd,
                fdv: response.data.market_data.fully_diluted_valuation.usd,
                circulating_supply: response.data.market_data.circulating_supply,
                total_supply: response.data.market_data.total_supply,
            };
        }
        catch (error) {
            console.error('Error fetching CoinGecko data:', error);
            return null;
        }
    });
}
// DeFi Llama (TVL, restaking metrics for protocols)
function fetchDeFiLlamaTVL() {
    return __awaiter(this, arguments, void 0, function* (protocol = '') {
        try {
            const url = protocol ? `https://api.llama.fi/protocol/${protocol}` : 'https://api.llama.fi/protocols';
            const response = yield axios_1.default.get(url);
            return protocol ? response.data.tvl : response.data; // TVL history or list
        }
        catch (error) {
            console.error('Error fetching DeFi Llama:', error);
            return null;
        }
    });
}
// Whale Alert (Recent whale transactions)
function fetchWhaleAlert() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const WHALE_KEY = getEnv('WHALE_ALERT_API_KEY');
            const response = yield axios_1.default.get(`https://api.whale-alert.io/v1/transactions?api_key=${WHALE_KEY}&min_value=1000000&limit=10`);
            return response.data.transactions;
        }
        catch (error) {
            console.error('Error fetching Whale Alert:', error);
            return null;
        }
    });
}
// Token Unlocks (Unlock schedule for token)
function fetchTokenUnlocks(tokenSymbol) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get(`https://api.token.unlocks.app/v1/projects/${tokenSymbol.toLowerCase()}`);
            return response.data; // Vesting, unlocks, allocations
        }
        catch (error) {
            console.error('Error fetching Token Unlocks:', error);
            return null;
        }
    });
}
// NewsAPI (Geopolitics/Regulatory news)
function fetchNewsAPI() {
    return __awaiter(this, arguments, void 0, function* (query = 'cryptocurrency regulation') {
        try {
            const NEWS_KEY = getEnv('NEWSAPI_KEY');
            const response = yield axios_1.default.get(`https://newsapi.org/v2/everything?q=${query}&apiKey=${NEWS_KEY}&pageSize=5&sortBy=publishedAt`);
            return response.data.articles;
        }
        catch (error) {
            console.error('Error fetching NewsAPI:', error);
            return null;
        }
    });
}
// TODO: Add more like Glassnode, Bittensor, etc., with similar patterns
