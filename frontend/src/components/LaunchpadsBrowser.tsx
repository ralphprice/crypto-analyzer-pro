// LaunchpadsBrowser.tsx

'use client';
import { useState, useEffect } from 'react';
import { Box, Typography, Button, Grid, Card, CardContent, Select, MenuItem } from '@mui/material';
import axios from 'axios';
import { SelectChangeEvent } from '@mui/material/Select';  // Import for onChange type

interface Launch {
  name: string;
  symbol: string;
  marketCap: number;
  liquidity: number;
}

interface Analysis {
  risk_score: number;
  // Add other fields from response
}

interface SelectedToken extends Launch {
  analysis: Analysis;
}

interface Filters {
  age: string;
  liquidity: string;
}

export default function LaunchpadsBrowser() {
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [filters, setFilters] = useState<Filters>({ age: 'new', liquidity: 'high' });
  const [selectedToken, setSelectedToken] = useState<SelectedToken | null>(null);

  useEffect(() => {
    const fetchLaunches = async () => {
      try {
        // Example: Call backend for Pump.fun etc.; use Solana RPC or scrapers
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/fetch-launchpads`, { params: filters });
        setLaunches(response.data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchLaunches();
  }, [filters]);

  const handleFilterChange = (e: SelectChangeEvent) => {
    setFilters({ ...filters, [e.target.name as string]: e.target.value });
  };

  const analyzeToken = async (token: Launch) => {
    // Integrate with TokenAnalyzer logic
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/analyze-token`, { tokenSymbol: token.symbol });
      setSelectedToken({ ...token, analysis: response.data as Analysis });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Launchpads Browser</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6 }}>
          <Select name="age" value={filters.age} onChange={handleFilterChange} fullWidth>
            <MenuItem value="new">Newest</MenuItem>
            <MenuItem value="hot">Heating Up</MenuItem>
          </Select>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <Select name="liquidity" value={filters.liquidity} onChange={handleFilterChange} fullWidth>
            <MenuItem value="high">High Liquidity</MenuItem>
            <MenuItem value="low">Low Liquidity</MenuItem>
          </Select>
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        {launches.map((launch, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={idx}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent>
                <Typography variant="h6">{launch.name} ({launch.symbol})</Typography>
                <Typography>Market Cap: ${launch.marketCap}</Typography>
                <Typography>Liquidity: ${launch.liquidity}</Typography>
                <Button variant="contained" onClick={() => analyzeToken(launch)}>Quick Analyze</Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {selectedToken && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5">Analysis for {selectedToken.symbol}</Typography>
          <Typography>Risk: {selectedToken.analysis.risk_score}</Typography>
          {/* Add charts, risks */}
        </Box>
      )}
    </Box>
  );
}
