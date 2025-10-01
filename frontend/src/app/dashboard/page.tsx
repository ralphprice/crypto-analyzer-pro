// frontend/src/app/dashboard/page.tsx

'use client';
import { useEffect, useState } from 'react';
import { Container, Grid, Typography, Card, CardContent, Alert } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import TokenAnalyzer from '@/components/TokenAnalyzer';  // Import component
import RegulatoryAlerts from '@/components/RegulatoryAlerts';  // New import for the component

// Define interface for macro data items
interface MacroItem {
  period: string;
  value: number;
}

export default function DashboardPage() {
  const [macroData, setMacroData] = useState<MacroItem[]>([]);
  const [sentimentData, setSentimentData] = useState<{ fear_greed: number } | null>(null);
  const [alerts, setAlerts] = useState<{ type: string; data: { amount: number; token: string } }[]>([]);
  const [regulatoryData, setRegulatoryData] = useState(null);  // New state for regulatory data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Use fallback if env var is undefined
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

        // Fetch macro
        const macroRes = await axios.get(`${apiUrl}/fetch-macro`);
        setMacroData(macroRes.data.map((item: { period: string; value: string }) => ({
          period: item.period,
          value: parseFloat(item.value)
        })));

        // Fetch sentiment (example endpoint; add to backend if not present)
        const sentimentRes = await axios.get(`${apiUrl}/fetch-sentiment`);
        setSentimentData(sentimentRes.data);

        // New: Fetch standard regulatory data (EDGAR filings)
        const regulatoryRes = await axios.get(`${apiUrl}/fetch-standard-regulatory`);
        setRegulatoryData(regulatoryRes.data);

        // WebSocket for alerts - Safely handle with optional chaining and check
        if (!apiUrl) {
          console.error('API URL is undefined; skipping WebSocket connection.');
          return;
        }
        const wsUrl = apiUrl
          ?.replace('http://', 'ws://')
          ?.replace('https://', 'wss://');
        const ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          setAlerts(prev => [...prev, data]);
        };
        ws.onerror = (err) => console.error('WebSocket error:', err);

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('Failed to load dashboard data. Please check the backend connection.');
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  return (
    <Container maxWidth="xl">
      <Typography variant="h3" gutterBottom align="center" sx={{ mt: 4 }}>Crypto Analyzer Pro Dashboard</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <Typography>Loading data...</Typography> : (
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ bgcolor: 'background.paper', boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h5" color="primary">Macroeconomic Overview (CPI Trends)</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={macroData}>
                    <Line type="monotone" dataKey="value" stroke="#4caf50" dot={false} />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ bgcolor: 'background.paper', boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h5" color="primary">Market Sentiment Panel</Typography>
                {sentimentData && (
                  <Typography>Fear & Greed Index: {sentimentData.fear_greed} (Heatmap coming soon)</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ bgcolor: 'background.paper', boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h5" color="primary">Portfolio Tracker</Typography>
                {/* Add input for holdings; fetch values */}
                <Typography>Coming soon: Real-time values and risks</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ bgcolor: 'background.paper', boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h5" color="primary">Best Buys Feed</Typography>
                {/* Dynamic list from daily scans */}
                <ul>
                  <li>BTC: Score 8.5 (Bullish)</li>
                  {/* Fetch from backend */}
                </ul>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ bgcolor: 'background.paper', boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h5" color="primary">Alerts System</Typography>
                {alerts.map((alert, idx) => (
                  <Alert key={idx} severity="warning" sx={{ mb: 1 }}>
                    {alert.type}: {alert.data.amount} {alert.data.token}
                  </Alert>
                ))}
              </CardContent>
            </Card>
          </Grid>
          {/* New: Regulatory Alerts Widget */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ bgcolor: 'background.paper', boxShadow: 3 }}>
              <CardContent>
                <Typography variant="h5" color="primary">Regulatory Alerts</Typography>
                {regulatoryData ? (
                  <RegulatoryAlerts data={regulatoryData} />
                ) : (
                  <Typography>Loading regulatory alerts...</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TokenAnalyzer />
          </Grid>
        </Grid>
      )}
    </Container>
  );
}
