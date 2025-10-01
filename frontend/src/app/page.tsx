// frontend/src/app/page.tsx

'use client';
import { useEffect, useMemo, useState } from 'react';
import { Container, Grid, Typography, Card, CardContent, TextField, Button } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, LabelList, Cell } from 'recharts';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import axios from 'axios';
import { AxiosError } from 'axios';
import RegulatoryAlerts from '@/components/RegulatoryAlerts'; // New import for the component
import LaunchpadsBrowser from '@/components/LaunchpadsBrowser';

// Create Emotion cache for SSR consistency
const cache = createCache({ key: 'css', prepend: true });

// Define interfaces for data
interface MacroData {
  cpi: Array<{ period: string; value: string }>;
  rates: Array<{ date: string; value: string }>;
  deficits: Array<{ record_date: string; current_fytd_net_outly_amt: string }>;
}

interface SentimentData {
  fearGreed: { value: string; value_classification: string; timestamp: string };
  tokenSentiment?: { galaxy_score: number; alt_rank?: number; social_score?: number };
}

interface WhaleData {
  amount: number;
  symbol: string;
  timestamp: string;
}

interface NewsItem {
  title: string;
  publishedAt: string;
}

interface UnlockData {
  unlocks: Array<{ date: string; amount: number }>;
  allocations: Record<string, number>;
}

interface ChainTotal {
  chain: string;
  total: number;
}

export default function Dashboard() {
  const [macroData, setMacroData] = useState<MacroData | null>(null);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [chainTotals, setChainTotals] = useState<ChainTotal[] | null>(null);
  const [grandTotal, setGrandTotal] = useState<number>(0);
  const [newsData, setNewsData] = useState<NewsItem[] | null>(null);
  const [unlocksData, setUnlocksData] = useState<UnlockData | null>(null);
  const [regulatoryData, setRegulatoryData] = useState(null); // New state for EDGAR filings
  const [tokenSymbol, setTokenSymbol] = useState<string>(''); // For user input
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Supported chains (bitcoin + top ETH-like chains from chainMap)
  const supportedChains = useMemo(() => ['bitcoin', 'ethereum', 'arbitrum', 'base', 'bsc', 'polygon', 'op', 'zksync', 'mantle', 'celo', 'avalanche'], []);

  // Subtle color shades for bars (blues, mauves, purples)
  const barColors = ['#2196f3', '#673ab7', '#9c27b0', '#3f51b5', '#7b1fa2', '#303f9f', '#6a1b9a', '#283593', '#512da8', '#1a237e'];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

        // Fetch macro data
        const macroResponse = await axios.get(`${apiUrl}/fetch-macro`);
        setMacroData(macroResponse.data);

        // Fetch sentiment data
        const sentimentResponse = await axios.get(`${apiUrl}/fetch-sentiment`);
        setSentimentData(sentimentResponse.data);

        // Fetch whale data for all supported chains
        const totals: ChainTotal[] = [];
        let totalAmount = 0;
        for (const chain of supportedChains) {
          const whalesResponse = await axios.get(`${apiUrl}/fetch-whales?chain=${chain}`);
          const data: WhaleData[] = Array.isArray(whalesResponse.data) ? whalesResponse.data : [];
          const chainTotal = data.reduce((sum, tx) => sum + tx.amount, 0);
          totals.push({ chain: chain.toUpperCase(), total: chainTotal });
          totalAmount += chainTotal;
        }
        setChainTotals(totals);
        setGrandTotal(totalAmount);

        // Fetch news data
        const newsResponse = await axios.get(`${apiUrl}/fetch-news`);
        setNewsData(Array.isArray(newsResponse.data) ? newsResponse.data : []);

        // New: Fetch standard regulatory data (EDGAR filings)
        const regulatoryResponse = await axios.get(`${apiUrl}/fetch-standard-regulatory`);
        setRegulatoryData(regulatoryResponse.data);

        setLoading(false);
      } catch (error: unknown) {
        const err = error as AxiosError;
        console.error('Full fetch error:', err);
        console.error('Error message:', err.message || 'No message');
        console.error('Error response:', err.response ? err.response.data : 'No response');
        setError(err.message || 'Failed to load data');
        setLoading(false);
      }
    };
    fetchData();
  }, [supportedChains]);

  const fetchUnlocks = async () => {
    if (!tokenSymbol) {
      setError('Please enter a token symbol');
      return;
    }
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const unlocksResponse = await axios.get(`${apiUrl}/fetch-unlocks?tokenSymbol=${tokenSymbol}`);
      setUnlocksData(unlocksResponse.data);
      setError(null);
    } catch (error: unknown) {
      const err = error as AxiosError;
      setError(err.message || 'Failed to load unlock data');
    }
  };

  const labelFormatter = (value: React.ReactNode) => {
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return value;
  };

  return (
    <CacheProvider value={cache}>
      <Container maxWidth="lg">
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        {error && <Typography color="error">{error}</Typography>}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Macroeconomic Overview (CPI)</Typography>
                {loading ? (
                  <p>Loading...</p>
                ) : macroData && macroData.cpi && macroData.cpi.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={macroData.cpi.map(item => ({
                      period: item.period,
                      value: parseFloat(item.value)
                    }))}>
                      <Line type="monotone" dataKey="value" stroke="#4caf50" />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p>No CPI data available.</p>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Sentiment Panel</Typography>
                {loading ? (
                  <p>Loading...</p>
                ) : sentimentData && sentimentData.fearGreed ? (
                  <>
                    <p>Fear & Greed: {sentimentData.fearGreed.value} ({sentimentData.fearGreed.value_classification})</p>
                    {sentimentData.tokenSentiment && (
                      <p>Galaxy Score: {sentimentData.tokenSentiment.galaxy_score || 'N/A'}</p>
                    )}
                  </>
                ) : (
                  <p>No sentiment data available.</p>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Whale Activity</Typography>
                {loading ? (
                  <p>Loading...</p>
                ) : chainTotals && chainTotals.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chainTotals}>
                        <Bar dataKey="total">
                          {chainTotals.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                          ))}
                          <LabelList dataKey="total" position="top" formatter={labelFormatter} />
                        </Bar>
                        <XAxis dataKey="chain" />
                        <YAxis />
                        <Tooltip formatter={(value: React.ReactNode) => labelFormatter(value)} />
                      </BarChart>
                    </ResponsiveContainer>
                    <Typography variant="subtitle1">Grand Total: {grandTotal.toFixed(2)}</Typography>
                  </>
                ) : (
                  <p>No recent whale activity across chains.</p>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Regulatory News</Typography>
                {loading ? (
                  <p>Loading...</p>
                ) : newsData && newsData.length > 0 ? (
                  <ul>
                    {newsData.map((article, index) => (
                      <li key={index}>{article.title}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No recent news available.</p>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Regulatory Alerts (SEC EDGAR Filings)</Typography>
                {loading ? (
                  <p>Loading...</p>
                ) : regulatoryData ? (
                  <RegulatoryAlerts data={regulatoryData} />
                ) : (
                  <p>No regulatory filings available.</p>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Token Unlocks</Typography>
                <TextField
                  label="Token Symbol (e.g., APT)"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value)}
                  variant="outlined"
                  size="small"
                  style={{ marginBottom: '1rem' }}
                />
                <Button variant="contained" onClick={fetchUnlocks}>Fetch Unlocks</Button>
                {loading ? (
                  <p>Loading...</p>
                ) : unlocksData && unlocksData.unlocks.length > 0 ? (
                  <>
                    <ul>
                      {unlocksData.unlocks.map((unlock, index) => (
                        <li key={index}>{unlock.amount} tokens unlock on {new Date(unlock.date).toLocaleDateString()}</li>
                      ))}
                    </ul>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={unlocksData.unlocks}>
                        <Line type="monotone" dataKey="amount" stroke="#ff7300" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <p>No unlock data available. Enter a token symbol.</p>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <LaunchpadsBrowser />
          </Grid>
        </Grid>
      </Container>
    </CacheProvider>
  );
}
