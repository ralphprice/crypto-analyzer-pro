// Settings.tsx
'use client';
import { useState, useEffect } from 'react';
import { Box, Typography, Slider, Button } from '@mui/material';
import axios from 'axios';

interface Weights {
  [key: string]: number;  // Dynamic keys for factors
}

export default function Settings() {
  const [weights, setWeights] = useState<Weights>({ macro: 35, sentiment: 20 /* Add all */ });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchWeights = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const token = localStorage.getItem('token');
        if (!token) return;  // Skip if not logged in
        const response = await axios.get(`${apiUrl}/custom-weights`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setWeights(response.data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchWeights();
  }, []);

  const handleWeightChange = (factor: string, value: number | number[]) => {
    setWeights(prev => ({ ...prev, [factor]: value as number }));
  };

  const saveWeights = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');
      if (!token) return;  // Skip if not logged in
      await axios.post(`${apiUrl}/custom-weights`, { weights }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSaved(true);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Box>
      <Typography variant="h4">Settings</Typography>
      {Object.keys(weights).map(factor => (
        <Box key={factor} sx={{ mb: 2 }}>
          <Typography>{factor.charAt(0).toUpperCase() + factor.slice(1)} Weight</Typography>
          <Slider
            value={weights[factor]}
            onChange={(e, val) => handleWeightChange(factor, val)}
            valueLabelDisplay="auto"
            step={5}
            min={0}
            max={100}
          />
        </Box>
      ))}
      <Button variant="contained" onClick={saveWeights}>Save</Button>
      {saved && <Typography color="success.main">Saved!</Typography>}
    </Box>
  );
}
