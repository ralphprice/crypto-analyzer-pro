import request from 'supertest';
import app from '../src/server';
import axios from 'axios';  // Import to mock
import { Pool } from 'pg';  // Import to mock
import jwt from 'jsonwebtoken';  // Import for mocking

jest.mock('axios');
jest.mock('pg', () => {
  const mClient = { query: jest.fn() };
  return { Pool: jest.fn(() => mClient) };
});

describe('Server Routes', () => {
  let mockPool: any;

  beforeEach(() => {
    mockPool = new Pool();
    mockPool.query.mockReset();
    (axios as jest.Mocked<typeof axios>).post.mockReset();
    (axios.get as jest.Mock).mockReset();  // Add for GET mocks
  });

  test('GET /fetch-macro - success with cache miss and API fetch', async () => {
    // Mock cache miss
    mockPool.query.mockResolvedValueOnce({ rows: [] });  // First query: no cache

    // Mock BLS API response
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: {
        Results: {
          series: [{ data: [{ period: 'M01', value: '300' }] }]
        }
      }
    });

    // Mock cache insert
    mockPool.query.mockResolvedValueOnce({});  // Second query: insert cache

    const response = await request(app).get('/fetch-macro');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toEqual([{ period: 'M01', value: '300' }]);
  });

  test('GET /fetch-macro - success with cache hit', async () => {
    // Mock cache hit
    mockPool.query.mockResolvedValueOnce({ rows: [{ data: [{ period: 'M01', value: '300' }] }] });

    const response = await request(app).get('/fetch-macro');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('GET /fetch-macro - handles error', async () => {
    // Mock cache miss
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    // Mock API error
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('API failure'));

    const response = await request(app).get('/fetch-macro');
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'API failure');
  });

  test('POST /analyze-token - success with valid input', async () => {
    // Mock auth middleware (assume token valid; in full tests, mock jwt.verify)
    const mockUser = { id: 1, username: 'test' };
    // @ts-ignore - Bypass overload type check for mock in tests
    jest.spyOn(jwt, 'verify').mockImplementation((token, secret, cb) => cb(null, mockUser));

    // Mock CoinGecko fetch
    (axios.get as jest.Mock).mockResolvedValueOnce({ data: { id: 'bitcoin', symbol: 'btc' } });

    // Mock analysis service call
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { risk_score: 8, recommendation: 'buy' } });

    const response = await request(app)
      .post('/analyze-token')
      .set('Authorization', 'Bearer fake-token')
      .send({ tokenSymbol: 'BTC', horizon: 'short' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('risk_score', 8);
  });

  test('POST /analyze-token - unauthorized without token', async () => {
    const response = await request(app).post('/analyze-token').send({ tokenSymbol: 'BTC' });
    expect(response.status).toBe(401);
  });

  test('POST /analyze-token - handles API error', async () => {
    // Mock auth
    const mockUser = { id: 1, username: 'test' };
    // @ts-ignore - Bypass overload type check for mock in tests
    jest.spyOn(jwt, 'verify').mockImplementation((token, secret, cb) => cb(null, mockUser));

    // Mock CoinGecko error
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('CoinGecko failure'));

    const response = await request(app)
      .post('/analyze-token')
      .set('Authorization', 'Bearer fake-token')
      .send({ tokenSymbol: 'BTC' });

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'CoinGecko failure');
  });
});
