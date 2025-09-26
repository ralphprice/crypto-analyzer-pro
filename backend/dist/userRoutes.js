"use strict";
// src/userRoutes.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pg_1 = require("pg");
const router = express_1.default.Router();
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
// Login route (prototype: simple username/password; hash in prod)
router.post('/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    try {
        const userQuery = yield pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]); // TODO: Hash password
        if (userQuery.rows.length === 0)
            return res.status(401).json({ error: 'Invalid credentials' });
        const user = userQuery.rows[0];
        if (!process.env.JWT_SECRET)
            throw new Error('JWT_SECRET not set');
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// Register route
router.post('/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password, email } = req.body;
    try {
        const insert = yield pool.query('INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id', [username, password, email]); // TODO: Hash
        res.json({ id: insert.rows[0].id });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
// Get/Set custom weights (stored in DB)
router.get('/custom-weights', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = req.user && typeof req.user !== 'string' ? req.user.id : undefined; // Safe access
    if (!userId)
        return res.sendStatus(403);
    try {
        const weightsQuery = yield pool.query('SELECT weights FROM user_settings WHERE user_id = $1', [userId]);
        res.json(((_a = weightsQuery.rows[0]) === null || _a === void 0 ? void 0 : _a.weights) || { macro: 35, sentiment: 20 }); // Defaults from spec
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
router.post('/custom-weights', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user && typeof req.user !== 'string' ? req.user.id : undefined;
    if (!userId)
        return res.sendStatus(403);
    const { weights } = req.body;
    try {
        yield pool.query('INSERT INTO user_settings (user_id, weights) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET weights = $2', [userId, weights]);
        res.json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: message });
    }
}));
exports.default = router;
