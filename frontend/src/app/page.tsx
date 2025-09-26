// frontend/src/app/page.tsx

'use client';
import { useEffect, useState } from 'react';
import { Container, Grid, Typography, Card, CardContent } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { AxiosError } from 'axios';

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
}

interface NewsItem {
  title: string;
  publishedAt: string;
}

export default function Dashboard() {
  const [macroData, setMacroData] = useState<MacroData | null>(null);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [whalesData, setWhalesData] = useState<WhaleData[] | null>(null);
  const [newsData, setNewsData] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Fetch whale data
        const whalesResponse = await axios.get(`${apiUrl}/fetch-whales`);
        setWhalesData(Array.isArray(whalesResponse.data) ? whalesResponse.data : []);

        // Fetch news data
        const newsResponse = await axios.get(`${apiUrl}/fetch-news`);
        setNewsData(Array.isArray(newsResponse.data) ? newsResponse.data : []);

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
  }, []);

  return (
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
                <p>No CPI data available. Check backend logs for errors.</p>
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
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6">Whale Activity</Typography>
              {loading ? (
                <p>Loading...</p>
              ) : whalesData && whalesData.length > 0 ? (
                <ul>
                  {whalesData.map((whale, index) => (
                    <li key={index}>{whale.amount} {whale.symbol} moved</li>
                  ))}
                </ul>
              ) : (
                <p>No recent whale activity.</p>
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
      </Grid>
    </Container>
  );
}
