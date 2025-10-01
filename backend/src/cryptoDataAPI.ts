// backend/src/cryptoDataAPI.ts

import axios from 'axios';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { gql, ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { DocumentNode } from 'graphql';

dotenv.config();

// Initialize PostgreSQL pool for caching
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

// Interface for LaunchpadToken
interface LaunchpadToken {
  symbol: string;
  platform: string;
  launchDate: string;
  marketCap: number;
  liquidity: number;
  revenue: number;
}

// Interface for CoinGecko coin data
interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  market_cap: number;
  total_volume: number;
  last_updated: string;
}

// Interface for Bitquery GraphQL DEXTrades response
interface BitqueryDEXTrade {
  Trade: {
    Buy: {
      Currency: {
        Name: string;
        Symbol: string;
        MintAddress: string;
      };
      PriceInUSD: number | null;
    };
    Block: {
      Time: string;
    };
    Transaction: {
      Signer: string;
    };
  };
}

interface BitqueryDEXResponse {
  Solana: {
    DEXTrades: BitqueryDEXTrade[];
  };
}

// Bitquery GraphQL client for Solana
const bitqueryClient = new ApolloClient({
  link: new HttpLink({
    uri: 'https://graphql.bitquery.io',
    headers: { 'X-API-KEY': process.env.BITQUERY_API_KEY || '' },
  }),
  cache: new InMemoryCache(),
});

// Helper: Get env var or return empty string
const getEnv = (key: string): string => process.env[key] || '';

// BLS CPI
export async function fetchBLSCPI(): Promise<any[]> {
  try {
    const BLS_KEY = getEnv('BLS_API_KEY');
    const response = await axios.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      seriesid: ['CUUR0000SA0'],
      startyear: new Date().getFullYear() - 1,
      endyear: new Date().getFullYear(),
      registrationkey: BLS_KEY || undefined,
    });
    const data = response.data?.Results?.series?.[0]?.data || [];
    console.log(`BLS CPI query returned ${data.length} items`);
    return Array.isArray(data) ? data.slice(0, 12) : [];
  } catch (error) {
    console.error('Error fetching BLS CPI:', error);
    return [];
  }
}

// FRED Interest Rates
export async function fetchFREDInterestRates(): Promise<any[]> {
  try {
    const FRED_KEY = getEnv('FRED_API_KEY');
    if (!FRED_KEY) {
      console.error('FRED_API_KEY not set');
      return [];
    }
    const response = await axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${FRED_KEY}&file_type=json&limit=12`);
    const data = response.data?.observations || [];
    console.log(`FRED rates query returned ${data.length} items`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching FRED rates:', error);
    return [];
  }
}

// FiscalData
export async function fetchFiscalDataDeficits(): Promise<any[]> {
  try {
    const response = await axios.get('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_1?fields=record_date,current_fytd_net_outly_amt&filter=record_date:gte:2024-01-01&sort=-record_date&page[number]=1&page[size]=12');
    const data = response.data?.data || [];
    console.log(`FiscalData deficits query returned ${data.length} items`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching FiscalData deficits:', error);
    return [];
  }
}

// Fear and Greed Index
export async function fetchFearAndGreed(): Promise<{ value: number; value_classification: string; timestamp: string }> {
  try {
    const response = await axios.get('https://api.alternative.me/fng/');
    const data = response.data?.data?.[0] || { value: 50, value_classification: 'Neutral', timestamp: new Date().toISOString() };
    console.log(`Fear and Greed query returned value: ${data.value}`);
    return data;
  } catch (error) {
    console.error('Error fetching Fear and Greed:', error);
    return { value: 50, value_classification: 'Neutral', timestamp: new Date().toISOString() };
  }
}

// EDGAR filings
export async function fetchEDGARFullTextSearch(keywords: string): Promise<any[]> {
  const url = `https://www.sec.gov/Archives/edgar/full-text-search`;
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'CryptoAnalyzerPro info@x.ai' },
      params: {
        q: keywords,
        from: '2024-09-30',
        size: 10,
      },
    });
    const data = response.data.hits?.hits || [];
    console.log(`EDGAR full-text search for "${keywords}" returned ${data.length} hits`);
    return data;
  } catch (error) {
    console.error('Error fetching EDGAR full-text search:', error);
    return [];
  }
}

export async function fetchEDGARFilings(cik: string): Promise<any> {
  const paddedCik = cik.padStart(10, '0');
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

  const cacheQuery = `
    SELECT data, cached_at
    FROM edgar_cache
    WHERE cik = $1 AND cached_at > NOW() - INTERVAL '1 hour'
  `;
  try {
    const cacheResult = await pool.query(cacheQuery, [paddedCik]);
    if (cacheResult.rows.length > 0) {
      console.log(`Returning cached EDGAR filings for CIK ${paddedCik}`);
      return cacheResult.rows[0].data;
    }
  } catch (cacheError) {
    console.error(`Error checking cache for CIK ${paddedCik}:`, cacheError);
  }

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'CryptoAnalyzerPro info@x.ai' },
    });

    const cutoffDate = new Date('2024-09-30');
    if (response.data.filings && response.data.filings.recent) {
      const recent = response.data.filings.recent;
      const filteredRecent = {
        ...recent,
        filingDate: recent.filingDate.filter((date: string) => new Date(date) >= cutoffDate),
        form: recent.form.slice(0, recent.filingDate.length),
        primaryDocDescription: recent.primaryDocDescription ? recent.primaryDocDescription.slice(0, recent.filingDate.length) : [],
      };
      response.data.filings.recent = filteredRecent;
    }

    const cacheInsert = `
      INSERT INTO edgar_cache (cik, data, cached_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (cik) DO UPDATE SET data = $2, cached_at = NOW()
    `;
    await pool.query(cacheInsert, [paddedCik, response.data]);

    console.log(`Fetched EDGAR filings for CIK ${paddedCik}: ${response.data.filings.recent.filingDate.length} recent filings`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching EDGAR filings for CIK ${paddedCik}:`, error);
    return null;
  }
}

export async function fetchRegulatoryNews(): Promise<any[]> {
  const apiKey = getEnv('NEWSAPI_KEY');
  if (!apiKey) {
    throw new Error('NEWSAPI_KEY not set in .env');
  }

  const query = 'crypto+regulation+SEC+CFTC';
  const url = `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&apiKey=${apiKey}&pageSize=10`;
  try {
    const response = await axios.get(url);
    const data = response.data.articles;
    console.log(`Regulatory news query returned ${data.length} articles`);
    return data;
  } catch (error) {
    console.error('Error fetching regulatory news:', error);
    return [];
  }
}

export async function fetchLunarCrushSentiment(tokenSymbol: string): Promise<{ galaxy_score: number; alt_rank: number | null; social_score: number | null }> {
  try {
    const LUNAR_KEY = getEnv('LUNARCRUSH_API_KEY');
    const response = await axios.get(`https://api.lunarcrush.com/v2?data=assets&key=${LUNAR_KEY}&symbol=${tokenSymbol.toUpperCase()}&data_points=30&interval=day`);
    const sentiment = response.data?.data?.[0] || {};
    console.log(`LunarCrush sentiment for ${tokenSymbol}: galaxy_score=${sentiment.galaxy_score}`);
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

export async function fetchCoinGeckoTokenData(tokenId: string): Promise<{ price: number; market_cap: number; fdv: number; circulating_supply: number; total_supply: number }> {
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${tokenId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, {
      headers: { 'x-cg-demo-api-key': getEnv('COINGECKO_API_KEY') },
    });
    const data = {
      price: response.data?.market_data?.current_price?.usd || 0,
      market_cap: response.data?.market_data?.market_cap?.usd || 0,
      fdv: response.data?.market_data?.fully_diluted_valuation?.usd || 0,
      circulating_supply: response.data?.market_data?.circulating_supply || 0,
      total_supply: response.data?.market_data?.total_supply || 0,
    };
    console.log(`CoinGecko data for ${tokenId}: price=${data.price}, market_cap=${data.market_cap}`);
    return data;
  } catch (error) {
    console.error('Error fetching CoinGecko data:', error);
    return { price: 0, market_cap: 0, fdv: 0, circulating_supply: 0, total_supply: 0 };
  }
}

export async function getCoinGeckoIdFromSymbol(symbol: string): Promise<string | null> {
  try {
    const apiKey = getEnv('COINGECKO_API_KEY');
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${symbol.toLowerCase()}`, {
      headers: { 'x-cg-demo-api-key': apiKey },
    });
    if (response.data.length > 0) {
      const id = response.data[0].id;
      console.log(`Resolved CoinGecko ID for ${symbol}: ${id}`);
      return id;
    }
    console.warn(`No CoinGecko ID found for symbol: ${symbol}`);
    return null;
  } catch (error: any) {
    console.error(`Error resolving CoinGecko ID for ${symbol}:`, error.message);
    return null;
  }
}

export async function fetchDeFiLlamaTVL(protocol: string = ''): Promise<any[]> {
  try {
    const url = protocol ? `https://api.llama.fi/protocol/${protocol}` : 'https://api.llama.fi/protocols';
    const response = await axios.get(url);
    const data = protocol ? response.data?.tvl || [] : response.data || [];
    console.log(`DeFi Llama TVL query for ${protocol || 'global'} returned ${data.length} items`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching DeFi Llama:', error);
    return [];
  }
}

interface WhaleTx {
  amount: number;
  symbol: string;
  timestamp: string;
}

export async function fetchWhales(chain: string = 'ethereum'): Promise<WhaleTx[]> {
  if (chain === 'bitcoin') {
    return fetchMempoolWhales('bitcoin');
  } else {
    return fetchScanWhales(chain);
  }
}

export async function fetchMempoolWhales(chain: string = 'bitcoin', minValueUsd = 1000000, limit = 10): Promise<WhaleTx[]> {
  try {
    const whaleTxs: WhaleTx[] = [];
    const priceData = await fetchCoinGeckoTokenData('bitcoin');
    const price = priceData.price || 60000;
    const minValueSatoshis = (minValueUsd / price) * 1e8;

    const heightResponse = await axios.get(`https://mempool.space/api/blocks/tip/height`);
    let latestHeight = heightResponse.data;
    console.log(`Mempool tip height: ${latestHeight}`);

    for (let i = 0; i < 20 && whaleTxs.length < limit; i++) {
      const blockHeight = latestHeight - i;
      const blockResponse = await axios.get(`https://mempool.space/api/block-height/${blockHeight}`);
      const blockHash = blockResponse.data;
      console.log(`Fetching txs for block ${blockHeight} (${blockHash})`);

      const txsResponse = await axios.get(`https://mempool.space/api/block/${blockHash}/txs`);
      const transactions = txsResponse.data || [];

      for (const tx of transactions) {
        if (whaleTxs.length >= limit) break;
        const txValue = tx.vout.reduce((sum: number, vout: { value: number }) => sum + (vout.value || 0), 0);
        if (txValue >= minValueSatoshis) {
          whaleTxs.push({
            amount: txValue / 1e8,
            symbol: 'BTC',
            timestamp: new Date(tx.status.block_time * 1000).toISOString(),
          });
        }
      }
    }

    console.log(`Mempool whales query returned ${whaleTxs.length} transactions`);
    return whaleTxs;
  } catch (error) {
    console.error('Error fetching Mempool whales:', error);
    return [];
  }
}

export async function fetchScanWhales(chain: string = 'ethereum', minValueUsd = 1000000, limit = 10): Promise<WhaleTx[]> {
  try {
    const ETHERSCAN_KEY = getEnv('ETHERSCAN_API_KEY');
    if (!ETHERSCAN_KEY) {
      console.error('ETHERSCAN_API_KEY not set');
      return [];
    }
    const chainMap: { [key: string]: { chainId: number; coinId: string } } = {
      ethereum: { chainId: 1, coinId: 'ethereum' },
      arbitrum: { chainId: 42161, coinId: 'ethereum' },
      base: { chainId: 8453, coinId: 'ethereum' },
      bsc: { chainId: 56, coinId: 'binancecoin' },
      polygon: { chainId: 137, coinId: 'matic-network' },
      op: { chainId: 10, coinId: 'ethereum' },
      zksync: { chainId: 324, coinId: 'ethereum' },
      mantle: { chainId: 5000, coinId: 'ethereum' },
    };
    const { chainId, coinId } = chainMap[chain.toLowerCase()] || { chainId: 1, coinId: 'ethereum' };

    const priceData = await fetchCoinGeckoTokenData(coinId);
    const price = priceData.price || 1;
    const minValueWei = (minValueUsd / price) * 1e18;

    const blockResponse = await axios.get(`https://api.etherscan.io/v2/api?chainid=${chainId}&module=proxy&action=eth_blockNumber&apikey=${ETHERSCAN_KEY}`);
    let latestBlock = parseInt(blockResponse.data.result, 16);
    console.log(`Etherscan block number for ${chain}: ${latestBlock}`);

    const whaleTxs: WhaleTx[] = [];
    for (let i = 0; i < 10 && whaleTxs.length < limit; i++) {
      const blockNumberHex = '0x' + latestBlock.toString(16);
      const txResponse = await axios.get(`https://api.etherscan.io/v2/api?chainid=${chainId}&module=proxy&action=eth_getBlockByNumber&tag=${blockNumberHex}&boolean=true&apikey=${ETHERSCAN_KEY}`);
      const transactions: Array<{ value: string }> = txResponse.data.result.transactions || [];

      console.log(`Fetched ${transactions.length} transactions for block ${latestBlock} on ${chain}`);

      const blockWhales = transactions.filter((tx) => parseInt(tx.value, 16) >= minValueWei);
      blockWhales.forEach((whale) => {
        if (whaleTxs.length < limit) {
          whaleTxs.push({
            amount: parseInt(whale.value, 16) / 1e18,
            symbol: chain.toUpperCase(),
            timestamp: new Date(parseInt(txResponse.data.result.timestamp, 16) * 1000).toISOString(),
          });
        }
      });

      latestBlock--;
    }

    console.log(`Scan whales query for ${chain} returned ${whaleTxs.length} transactions`);
    return whaleTxs;
  } catch (error) {
    console.error('Error fetching Scan whales:', error);
    return [];
  }
}

export async function fetchTokenUnlocks(tokenSymbol: string): Promise<{ unlocks: any[]; allocations: Record<string, any> }> {
  try {
    const response = await axios.get(`https://api.token.unlocks.app/v1/projects/${tokenSymbol.toLowerCase()}`);
    const data = response.data || { unlocks: [], allocations: {} };
    console.log(`Token Unlocks query for ${tokenSymbol} returned ${data.unlocks.length} unlocks`);
    return {
      unlocks: Array.isArray(data.unlocks) ? data.unlocks : [],
      allocations: data.allocations || {},
    };
  } catch (error) {
    console.error('Error fetching Token Unlocks:', error);
    return { unlocks: [], allocations: {} };
  }
}

export async function fetchNewsAPI(query: string = 'cryptocurrency regulation'): Promise<any[]> {
  try {
    const NEWS_KEY = getEnv('NEWSAPI_KEY');
    const response = await axios.get(`https://newsapi.org/v2/everything?q=${query}&apiKey=${NEWS_KEY}&pageSize=5&sortBy=publishedAt`);
    const data = response.data?.articles || [];
    console.log(`NewsAPI query for "${query}" returned ${data.length} articles`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching NewsAPI:', error);
    return [];
  }
}

export async function fetchLaunchpadTokens(platform: string, age: string): Promise<LaunchpadToken[]> {
  console.log(`Starting fetchLaunchpadTokens for platform=${platform}, age=${age}`);
  const tokens: LaunchpadToken[] = [];
  const now = new Date();
  const ageMap: { [key: string]: number } = { '24h': 1, '7d': 7, '30d': 30, 'all': 365 };
  const cutoff = new Date(now.setDate(now.getDate() - (ageMap[age] || 30)));

  // Check cache
  const cacheQuery = `
    SELECT data, cached_at
    FROM token_cache
    WHERE platform = $1 AND age = $2 AND cached_at > NOW() - INTERVAL '1 hour'
  `;
  try {
    const cacheResult = await pool.query(cacheQuery, [platform, age]);
    if (cacheResult.rows.length > 0) {
      console.log(`Cache hit for ${platform} (${age}): ${cacheResult.rows[0].data.length} tokens`);
      return cacheResult.rows[0].data;
    }
    console.log(`No cache hit for ${platform} (${age})`);
  } catch (cacheError) {
    console.error(`Error checking cache for ${platform} (${age}):`, cacheError);
  }

  try {
    const apiKey = getEnv('COINGECKO_API_KEY');
    if (!apiKey) {
      console.error('COINGECKO_API_KEY not set in .env');
    }

    // Fetch from CoinGecko (multiple pages to cover more tokens)
    const response1 = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false', {
      headers: { 'x-cg-demo-api-key': apiKey },
    });
    const response2 = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2&sparkline=false', {
      headers: { 'x-cg-demo-api-key': apiKey },
    });
    const coinGeckoData: CoinGeckoCoin[] = [...(response1.data || []), ...(response2.data || [])];
    console.log(`CoinGecko returned ${coinGeckoData.length} tokens`);

    const platformMap: { [key: string]: string[] } = {
      'pump.fun': ['solana', 'bonk', 'dogwifhat'],
      'letsbonk.fun': ['bonk'],
      'raydium': ['raydium', 'serum'],
      'believe.app': ['solana', 'bonk', 'dogwifhat', 'jito'],
      'moonshot': ['solana'],
    };

    let matchedCount = 0;
    if (platform === 'all' || platformMap[platform]) {
      coinGeckoData.forEach((token) => {
        const tokenPlatforms = platform === 'all' ? Object.keys(platformMap) : [platform];
        tokenPlatforms.forEach((plat) => {
          if (platformMap[plat].includes(token.id)) {
            console.log(`Matched token: ${token.id} (${token.symbol}) for platform ${plat}, marketCap: ${token.market_cap}`);
            tokens.push({
              symbol: token.symbol.toUpperCase(),
              platform: plat,
              launchDate: token.last_updated,
              marketCap: token.market_cap || 1000000,
              liquidity: token.total_volume || 500000,
              revenue: token.total_volume * 0.01 || 10000,
            });
            matchedCount++;
          }
        });
      });
      console.log(`CoinGecko matched ${matchedCount} tokens`);
    }

    // Direct fetch for specific tokens if no matches
    if (matchedCount === 0) {
      console.log('No CoinGecko matches; attempting direct fetch for specific tokens');
      const specificTokens = [
        { id: 'moon', platforms: ['pump.fun'] },
        { id: 'bonk', platforms: ['letsbonk.fun', 'pump.fun', 'believe.app'] },
        { id: 'raydium', platforms: ['raydium'] },
      ];
      for (const { id, platforms } of specificTokens) {
        try {
          const tokenData = await fetchCoinGeckoTokenData(id);
          if (tokenData.market_cap > 0) {
            platforms.forEach((plat) => {
              console.log(`Direct fetch matched: ${id} (market cap: ${tokenData.market_cap}) for ${plat}`);
              tokens.push({
                symbol: id.toUpperCase(),
                platform: plat,
                launchDate: new Date().toISOString(),
                marketCap: tokenData.market_cap,
                liquidity: tokenData.market_cap * 0.5,
                revenue: tokenData.market_cap * 0.01,
              });
            });
          }
        } catch (error) {
          console.error(`Direct fetch error for ${id}:`, error);
        }
      }
    }

    // Fetch from DEX Screener
    if (tokens.length < 10 && (platform === 'pump.fun' || platform === 'raydium' || platform === 'moonshot' || platform === 'all')) {
      const dexMap: { [key: string]: string } = {
        'pump.fun': 'pump',
        'raydium': 'raydium',
        'moonshot': 'solana',
      };
      const dexId = dexMap[platform] || 'solana';
      try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/solana`, {
          headers: { 'User-Agent': 'CryptoAnalyzerPro info@x.ai' },
        });
        console.log(`DEX Screener for solana pairs: ${response.data.pairs ? response.data.pairs.length : 0} pairs found`);
        if (response.data.pairs) {
          let dexMatchedCount = 0;
          response.data.pairs.slice(0, 10 - tokens.length).forEach((token: any) => {
            console.log(`DEX token: ${token.baseToken?.symbol} (dexId: ${token.dexId}, createdAt: ${token.createdAt})`);
            if (platform === 'all' || token.dexId === dexId) {
              console.log(`DEX matched token: ${token.baseToken?.symbol} for ${platform}`);
              tokens.push({
                symbol: token.baseToken?.symbol?.toUpperCase() || `${platform.toUpperCase()}-TOKEN`,
                platform,
                launchDate: token.createdAt,
                marketCap: token.marketCap || 1000000,
                liquidity: token.liquidity?.usd || 500000,
                revenue: token.volume?.h24 || 10000,
              });
              dexMatchedCount++;
            }
          });
          console.log(`DEX Screener matched ${dexMatchedCount} tokens`);
        } else {
          console.error(`${platform}: No pairs data from DEX Screener. Response:`, JSON.stringify(response.data));
        }
      } catch (dexError: any) {
        console.error(`${platform} DEX Screener error:`, dexError.message, dexError.response?.data);
      }
    }

    // Fetch from Bitquery
    const apiKeyBitquery = getEnv('BITQUERY_API_KEY');
    if (apiKeyBitquery && tokens.length < 10 && (platform === 'pump.fun' || platform === 'raydium' || platform === 'all')) {
      const PUMP_QUERY: DocumentNode = gql`
        query GetPumpTokens($since: ISO8601DateTime) {
          Solana {
            DEXTrades(
              where: { Trade: { Dex: { ProgramAddress: { is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" } }, Block: { Time: { since: $since } } } }
              limit: { count: 5 }
              orderBy: { descending: Block_Time }
            ) {
              Trade {
                Buy {
                  Currency { Name Symbol MintAddress }
                  PriceInUSD(maximum: Block_Time)
                }
                Block { Time }
                Transaction { Signer }
              }
            }
          }
        }
      `;
      const RAYDIUM_QUERY: DocumentNode = gql`
        query GetRaydiumTokens($since: ISO8601DateTime) {
          Solana {
            DEXTrades(
              where: { Trade: { Dex: { ProgramAddress: { is: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8" } }, Block: { Time: { since: $since } } } }
              limit: { count: 5 }
              orderBy: { descending: Block_Time }
            ) {
              Trade {
                Buy {
                  Currency { Name Symbol MintAddress }
                  PriceInUSD(maximum: Block_Time)
                }
                Block { Time }
              }
            }
          }
        }
      `;
      const queries = [
        { platform: 'pump.fun', query: PUMP_QUERY },
        { platform: 'raydium', query: RAYDIUM_QUERY },
      ];

      for (const { platform: plat, query } of queries) {
        if (platform === plat || platform === 'all') {
          try {
            const result = await bitqueryClient.query<BitqueryDEXResponse>({
              query,
              variables: { since: cutoff.toISOString() },
            });
            console.log(`${plat}: Bitquery returned ${result.data?.Solana?.DEXTrades?.length || 0} trades`);
            if (result.data?.Solana?.DEXTrades) {
              let bitqueryMatchedCount = 0;
              result.data.Solana.DEXTrades.forEach((trade: BitqueryDEXTrade) => {
                console.log(`Bitquery matched trade: ${trade.Trade.Buy.Currency.Symbol} for ${plat}`);
                tokens.push({
                  symbol: trade.Trade.Buy.Currency.Symbol?.toUpperCase() || `${plat.toUpperCase()}-TOKEN`,
                  platform: plat,
                  launchDate: trade.Trade.Block.Time,
                  marketCap: (trade.Trade.Buy.PriceInUSD || 1) * 1000000,
                  liquidity: (trade.Trade.Buy.PriceInUSD || 1) * 500000,
                  revenue: (trade.Trade.Buy.PriceInUSD || 1) * 10000,
                });
                bitqueryMatchedCount++;
              });
              console.log(`Bitquery matched ${bitqueryMatchedCount} tokens`);
            } else {
              console.error(`${plat}: No DEXTrades data from Bitquery. Response:`, JSON.stringify(result.data));
            }
          } catch (bitqueryError: any) {
            console.error(`${plat} Bitquery error:`, bitqueryError.message, bitqueryError.response?.data);
          }
        }
      }
    }

    // Cache results
    if (tokens.length > 0) {
      const cacheInsert = `
        INSERT INTO token_cache (platform, age, data, cached_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (platform, age) DO UPDATE SET data = $3, cached_at = NOW()
      `;
      await pool.query(cacheInsert, [platform, age, tokens]);
      console.log(`Cached ${tokens.length} real tokens for ${platform} (${age})`);
      return tokens.slice(0, 10);
    }

    console.error('No tokens fetched from any source; returning mock data');
    return [
      { symbol: 'MOON', platform: 'pump.fun', launchDate: '2025-09-28', marketCap: 1000000, liquidity: 500000, revenue: 10000 },
      { symbol: 'BONK', platform: 'letsbonk.fun', launchDate: '2025-09-25', marketCap: 500000, liquidity: 200000, revenue: 5000 },
      { symbol: 'RAY', platform: 'raydium', launchDate: '2025-09-20', marketCap: 2000000, liquidity: 800000, revenue: 20000 },
    ];
  } catch (error: any) {
    console.error('Error fetching launchpad tokens:', error.message, error.response?.data);
    return [
      { symbol: 'MOON', platform: 'pump.fun', launchDate: '2025-09-28', marketCap: 1000000, liquidity: 500000, revenue: 10000 },
      { symbol: 'BONK', platform: 'letsbonk.fun', launchDate: '2025-09-25', marketCap: 500000, liquidity: 200000, revenue: 5000 },
      { symbol: 'RAY', platform: 'raydium', launchDate: '2025-09-20', marketCap: 2000000, liquidity: 800000, revenue: 20000 },
    ];
  }
}
