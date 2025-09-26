// frontend/src/app/token-detail/page.tsx

'use client';
import { useState } from 'react';
import { Box, Typography, Slider, Button } from '@mui/material';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

interface PredictiveToolsProps {
  tokenSymbol: string;
}

export default function PredictiveTools({ tokenSymbol }: PredictiveToolsProps) {
  const [variables, setVariables] = useState({ fedCut: 50 });  // Example: bps cut
  const [prediction, setPrediction] = useState(null);

  const handleSimulate = async () => {
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/predict-price`, {
        tokenSymbol,
        variables
      });
      setPrediction(response.data);  // Assume array of {date, price}
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Box>
      <Typography variant="h5">Scenario Simulator</Typography>
      <Slider
        value={variables.fedCut}
        onChange={(e, val) => setVariables({ fedCut: val as number })}
        valueLabelDisplay="auto"
        step={25}
        marks
        min={0}
        max={100}
        aria-label="Fed Cut (bps)"
      />
      <Button onClick={handleSimulate}>Simulate</Button>
      {prediction && (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={prediction}>
            <Area type="monotone" dataKey="price" stroke="#4caf50" fill="#4caf50" fillOpacity={0.3} />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Box>
  );
}
