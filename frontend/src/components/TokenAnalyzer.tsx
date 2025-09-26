// TokenAnalyzer.tsx

'use client';
import { useState } from 'react';
import { TextField, Button, Box, Typography } from '@mui/material';
import axios from 'axios';

interface AnalysisResult {
  risk_score: number;
  recommendation: string;
  price_target: number;
}

export default function TokenAnalyzer() {
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');
      const response = await axios.post(`${apiUrl}/analyze-token`, {
        tokenSymbol,
        horizon: 'short',  // Or user select
        customWeights: {}  // From user settings
      }, { headers: { Authorization: `Bearer ${token || ''}` } });
      setResult(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Box>
      <TextField label="Token Symbol (e.g., BTC)" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} />
      <Button onClick={handleAnalyze}>Analyze</Button>
      {result && (
        <Typography>
          Risk Score: {result.risk_score} | Recommendation: {result.recommendation} | Price Target: ${result.price_target}
        </Typography>
      )}
    </Box>
  );
}