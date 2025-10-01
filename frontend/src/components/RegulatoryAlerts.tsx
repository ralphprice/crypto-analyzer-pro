// frontend/src/components/RegulatoryAlerts.tsx

import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface RegulatoryAlertsProps {
  data: { [key: string]: { filingDate: string; form: string; description: string }[] };
}

const RegulatoryAlerts: React.FC<RegulatoryAlertsProps> = ({ data }) => {
  // Prepare data for timeline chart
  const timelineData = Object.entries(data).flatMap(([company, filings]) =>
    filings.map((filing) => ({
      date: filing.filingDate,
      company,
      description: `${filing.form}: ${filing.description}`,
      eventCount: 1 // For plotting
    }))
  );

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', margin: '10px 0' }}>
      {Object.keys(data).length > 0 ? (
        <>
          <h3>Recent SEC EDGAR Filings</h3>
          {Object.keys(data).map((company) => (
            <div key={company}>
              <h4>{company}</h4>
              {data[company].length > 0 ? (
                <ul>
                  {data[company].map((filing, index) => (
                    <li key={index}>
                      <strong>{filing.filingDate}</strong> - {filing.form}: {filing.description}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No recent filings available for this company.</p>
              )}
            </div>
          ))}
          {/* Timeline Chart */}
          {timelineData.length > 0 && (
            <>
              <h4>Filing Timeline</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timelineData}>
                  <Line type="monotone" dataKey="eventCount" stroke="#8884d8" dot={{ r: 4 }} />
                  <XAxis dataKey="date" />
                  <YAxis hide />
                  <Tooltip formatter={(value, name, props) => [props.payload.description, props.payload.company]} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </>
      ) : (
        <p>No regulatory filings data available.</p>
      )}
    </div>
  );
};

export default RegulatoryAlerts;
