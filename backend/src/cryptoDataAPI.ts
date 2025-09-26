// backend/src/cryptoDataAPI.ts

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Helper: Get env var or return empty string
const getEnv = (key: string) => process.env[key] || '';

// BLS CPI
export async function fetchBLSCPI() {
  try {
    const BLS_KEY = getEnv('BLS_API_KEY');
    const response = await axios.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      seriesid: ['CUUR0000SA0'],
      startyear: new Date().getFullYear() - 1,
      endyear: new Date().getFullYear(),
      registrationkey: BLS_KEY || undefined,
    });
    const data = response.data?.Results?.series?.[0]?.data || [];
    return Array.isArray(data) ? data.slice(0, 12) : [];
  } catch (error) {
    console.error('Error fetching BLS CPI:', error);
    return [];
  }
}

// FRED Interest Rates
export async function fetchFREDInterestRates() {
  try {
    const FRED_KEY = getEnv('FRED_API_KEY');
    const response = await axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${FRED_KEY}&file_type=json&limit=12`);
    const data = response.data?.observations || [];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching FRED rates:', error);
    return [];
  }
}

// FiscalData
export async function fetchFiscalDataDeficits() {
  try {
    const response = await axios.get('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_1?fields=record_date,current_fytd_net_outly_amt&filter=record_date:gte:2024-01-01&sort=-record_date&page[number]=1&page[size]=12');
    const data = response.data?.data || [];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching FiscalData deficits:', error);
    return [];
  }
}

// Fear and Greed Index
export async function fetchFearAndGreed() {
  try {
    const response = await axios.get('https://api.alternative.me/fng/');
    const data = response.data?.data?.[0] || { value: 50, value_classification: 'Neutral', timestamp: new Date().toISOString() };
    return data;
  } catch (error) {
    console.error('Error fetching Fear and Greed:', error);
    return { value: 50, value_classification: 'Neutral', timestamp: new Date().toISOString() };
  }
}

// LunarCrush
export async function fetchLunarCrushSentiment(tokenSymbol: string) {
  try {
    const LUNAR_KEY = getEnv('LUNARCRUSH_API_KEY');
    const response = await axios.get(`https://api.lunarcrush.com/v2?data=assets&key=${LUNAR_KEY}&symbol=${tokenSymbol.toUpperCase()}&data_points=30&interval=day`);
    const sentiment = response.data?.data?.[0] || {};
    return {
      galaxy_score: sentiment.galaxy_score || 50,
      alt_rank: sentiment.alt_rank || null,
      social_score: sentiment.social_score || null,
    };
  } catch (error) {
    console.error('Error fetching LunarCrush sentiment:', error);
    return { galaxy_score: 50, alt_rank: null, social_score: null };
  }
}

// CoinGecko
export async function fetchCoinGeckoTokenData(tokenId: string) {
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${tokenId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, {
      headers: { 'x-cg-demo-api-key': getEnv('COINGECKO_API_KEY') }
    });
    return {
      price: response.data?.market_data?.current_price?.usd || 0,
      market_cap: response.data?.market_data?.market_cap?.usd || 0,
      fdv: response.data?.market_data?.fully_diluted_valuation?.usd || 0,
      circulating_supply: response.data?.market_data?.circulating_supply || 0,
      total_supply: response.data?.market_data?.total_supply || 0,
    };
  } catch (error) {
    console.error('Error fetching CoinGecko data:', error);
    return { price: 0, market_cap: 0, fdv: 0, circulating_supply: 0, total_supply: 0 };
  }
}

// DeFi Llama
export async function fetchDeFiLlamaTVL(protocol: string = '') {
  try {
    const url = protocol ? `https://api.llama.fi/protocol/${protocol}` : 'https://api.llama.fi/protocols';
    const response = await axios.get(url);
    const data = protocol ? response.data?.tvl || [] : response.data || [];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching DeFi Llama:', error);
    return [];
  }
}

// Whale Alert (falls back to Etherscan)
export async function fetchWhaleAlert() {
  const WHALE_KEY = getEnv('WHALE_ALERT_API_KEY');
  if (!WHALE_KEY) {
    console.warn('WHALE_ALERT_API_KEY not set, falling back to Etherscan');
    return fetchEtherscanWhales();
  }
  try {
    const response = await axios.get(`https://api.whale-alert.io/v1/transactions?api_key=${WHALE_KEY}&min_value=1000000&limit=10`);
    const data = response.data?.transactions || [];
    return Array.isArray(data) ? data.map(item => ({
      amount: item.amount || 0,
      symbol: item.symbol || 'UNKNOWN',
      timestamp: item.timestamp || new Date().toISOString(),
    })) : [];
  } catch (error) {
    console.error('Error fetching Whale Alert:', error);
    return [];
  }
}

// Etherscan (free alternative for Ethereum whale transactions)
export async function fetchEtherscanWhales() {
  try {
    const ETHERSCAN_KEY = getEnv('ETHERSCAN_API_KEY');
    if (!ETHERSCAN_KEY) {
      console.error('ETHERSCAN_API_KEY not set');
      return [];
    }
    const blockResponse = await axios.get(`https://api.etherscan.io/api?module=proxy&action=eth_blockNumber&apikey=${ETHERSCAN_KEY}`);
    const latestBlock = parseInt(blockResponse.data.result, 16);

    const txResponse = await axios.get(`https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=${latestBlock.toString(16)}&boolean=true&apikey=${ETHERSCAN_KEY}`);
    const transactions = txResponse.data.result.transactions || [];

    const ethPrice = 2500; // Hardcoded for prototype; use CoinGecko for real-time
    const minValueWei = (1000000 / ethPrice) * 1e18; // $1M in Wei
    const whaleTxs = transactions.filter((tx: any) => parseInt(tx.value, 16) >= minValueWei);

    return whaleTxs.map((tx: any) => ({
      amount: parseInt(tx.value, 16) / 1e18, // Convert Wei to ETH
      symbol: 'ETH',
      timestamp: new Date(parseInt(txResponse.data.result.timestamp, 16) * 1000).toISOString(),
    })).slice(0, 10);
  } catch (error) {
    console.error('Error fetching Etherscan whales:', error);
    return [];
  }
}

// Token Unlocks
export async function fetchTokenUnlocks(tokenSymbol: string) {
  try {
    const response = await axios.get(`https://api.token.unlocks.app/v1/projects/${tokenSymbol.toLowerCase()}`);
    const data = response.data || { unlocks: [], allocations: {} };
    return {
      unlocks: Array.isArray(data.unlocks) ? data.unlocks : [],
      allocations: data.allocations || {},
    };
  } catch (error) {
    console.error('Error fetching Token Unlocks:', error);
    return { unlocks: [], allocations: {} };
  }
}

// NewsAPI
export async function fetchNewsAPI(query: string = 'cryptocurrency regulation') {
  try {
    const NEWS_KEY = getEnv('NEWSAPI_KEY');
    const response = await axios.get(`https://newsapi.org/v2/everything?q=${query}&apiKey=${NEWS_KEY}&pageSize=5&sortBy=publishedAt`);
    const data = response.data?.articles || [];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching NewsAPI:', error);
    return [];
  }
}
