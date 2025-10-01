// frontend/src/components/LaunchpadsBrowser.tsx

import React, { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Button, Select, MenuItem, FormControl, InputLabel, Modal, Box, CircularProgress } from '@mui/material';
import axios, { AxiosError } from 'axios';

interface LaunchpadToken {
  symbol: string;
  platform: string;
  launchDate: string;
  marketCap: number;
  liquidity: number;
  revenue: number;
}

interface AnalysisResult {
  risk_score: number;
  recommendation: string;
  price_target: number;
  factor_scores: { [key: string]: number };
}

const LaunchpadsBrowser: React.FC = () => {
  const [tokens, setTokens] = useState<LaunchpadToken[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterAge, setFilterAge] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analyzedToken, setAnalyzedToken] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [analyzingTokens, setAnalyzingTokens] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const fetchLaunchpadTokens = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await axios.get(`${apiUrl}/fetch-launchpad-tokens`, {
          params: { platform: filterPlatform, age: filterAge }
        });
        setTokens(response.data);
        setLoading(false);
      } catch (err: unknown) {
        const message = err instanceof AxiosError ? err.response?.data?.error || err.message : 'Failed to load launchpad tokens';
        setError(message);
        setLoading(false);
        console.error('Fetch tokens error:', err);
      }
    };
    fetchLaunchpadTokens();
  }, [filterPlatform, filterAge]);

  const handleAnalyze = async (symbol: string) => {
    setAnalyzingTokens(prev => ({ ...prev, [symbol]: true }));
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const resolveResponse = await axios.get(`${apiUrl}/resolve-coin-id`, {
        params: { symbol }
      });
      const tokenId = resolveResponse.data.coinId;

      const analysisResponse = await axios.post('http://localhost:5000/score-token', {
        data: { id: tokenId, symbol },
        horizon: 'short'
      });
      setAnalysisResult(analysisResponse.data);
      setAnalyzedToken(symbol);
      setOpenModal(true);
    } catch (err: unknown) {
      const message = err instanceof AxiosError ? err.response?.data?.error || err.message : 'Analysis failed';
      setError(`Analysis failed for ${symbol}: {message}`);
      console.error('Analysis error:', err, { symbol, url: 'http://localhost:5000/score-token' });
    } finally {
      setAnalyzingTokens(prev => ({ ...prev, [symbol]: false }));
    }
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setAnalysisResult(null);
    setAnalyzedToken(null);
  };

  return (
    <Card sx={{ bgcolor: 'background.paper', boxShadow: 3, margin: '10px 0' }}>
      <CardContent>
        <Typography variant="h5" color="primary">Launchpads Browser</Typography>
        <FormControl sx={{ m: 1, minWidth: 120 }}>
          <InputLabel>Platform</InputLabel>
          <Select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="pump.fun">Pump.fun</MenuItem>
            <MenuItem value="letsbonk.fun">LetsBonk.fun</MenuItem>
            <MenuItem value="raydium">Raydium LaunchLab</MenuItem>
            <MenuItem value="believe.app">Believe.app</MenuItem>
            <MenuItem value="moonshot">Moonshot</MenuItem>
          </Select>
        </FormControl>
        <FormControl sx={{ m: 1, minWidth: 120 }}>
          <InputLabel>Age</InputLabel>
          <Select value={filterAge} onChange={(e) => setFilterAge(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="24h">Last 24h</MenuItem>
            <MenuItem value="7d">Last 7 Days</MenuItem>
            <MenuItem value="30d">Last 30 Days</MenuItem>
          </Select>
        </FormControl>
        {loading ? (
          <Typography>Loading...</Typography>
        ) : error ? (
          <Typography color="error">{error}</Typography>
        ) : (
          <div>
            {tokens.length > 0 ? (
              tokens.map((token, index) => (
                <Card key={`${token.symbol}-${token.platform}-${index}`} sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="h6">{token.symbol} ({token.platform})</Typography>
                    <Typography>Launched: {token.launchDate}</Typography>
                    <Typography>Market Cap: ${token.marketCap.toLocaleString()}</Typography>
                    <Typography>Liquidity: ${token.liquidity.toLocaleString()}</Typography>
                    <Typography>Revenue: ${token.revenue.toLocaleString()}</Typography>
                    <Button 
                      variant="contained" 
                      onClick={() => handleAnalyze(token.symbol)}
                      disabled={analyzingTokens[token.symbol]}
                    >
                      {analyzingTokens[token.symbol] ? <CircularProgress size={20} /> : 'Quick Analyze'}
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Typography>No tokens found for selected filters.</Typography>
            )}
          </div>
        )}
      </CardContent>

      <Modal open={openModal} onClose={handleCloseModal}>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, bgcolor: 'background.paper', boxShadow: 24, p: 4 }}>
          <Typography variant="h6">Analysis Result for {analyzedToken}</Typography>
          {analysisResult ? (
            <div>
              <Typography><strong>Risk Score:</strong> {analysisResult.risk_score}/10</Typography>
              <Typography><strong>Recommendation:</strong> {analysisResult.recommendation}</Typography>
              <Typography><strong>Short-Term Price Target:</strong> ${analysisResult.price_target.toFixed(2)}</Typography>
              <Typography><strong>Factor Scores:</strong></Typography>
              <ul>
                {Object.entries(analysisResult.factor_scores).map(([factor, score]) => (
                  <li key={factor}>{factor}: {score.toFixed(1)}</li>
                ))}
              </ul>
              <Button onClick={handleCloseModal}>Close</Button>
            </div>
          ) : (
            <Typography>Analysis loading...</Typography>
          )}
        </Box>
      </Modal>
    </Card>
  );
};

export default LaunchpadsBrowser;
