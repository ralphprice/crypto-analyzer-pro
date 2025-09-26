// src/userRoutes.ts

import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

// Local extension for Request
interface AuthRequest extends Request {
  user?: jwt.JwtPayload | string;
}

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Login route (prototype: simple username/password; hash in prod)
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  try {
    const userQuery = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]); // TODO: Hash password
    if (userQuery.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = userQuery.rows[0];
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set');
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Register route
router.post('/register', async (req: Request, res: Response) => {
  const { username, password, email } = req.body;
  try {
    const insert = await pool.query('INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id', [username, password, email]); // TODO: Hash
    res.json({ id: insert.rows[0].id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get/Set custom weights (stored in DB)
router.get('/custom-weights', async (req: AuthRequest, res: Response) => {
  const userId = req.user && typeof req.user !== 'string' ? req.user.id : undefined; // Safe access
  if (!userId) return res.sendStatus(403);
  try {
    const weightsQuery = await pool.query('SELECT weights FROM user_settings WHERE user_id = $1', [userId]);
    res.json(weightsQuery.rows[0]?.weights || { macro: 35, sentiment: 20 }); // Defaults from spec
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/custom-weights', async (req: AuthRequest, res: Response) => {
  const userId = req.user && typeof req.user !== 'string' ? req.user.id : undefined;
  if (!userId) return res.sendStatus(403);
  const { weights } = req.body;
  try {
    await pool.query('INSERT INTO user_settings (user_id, weights) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET weights = $2', [userId, weights]);
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
