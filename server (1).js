// GoalCast AI — Backend Server
// This is what keeps your API-Football key SAFE (never visible in the app)
// and shares one cached feed across every user instead of burning your
// 100-requests-a-day limit per phone that opens the app.

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// ====== SETUP: paste your key here (or set as environment variable on Render) ======
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || 'PASTE_YOUR_KEY_HERE';
const API_BASE = 'https://v3.football.api-sports.io';

// Simple in-memory cache so we don't waste your daily request limit.
// Fixtures/live scores refresh every 2 minutes; that's plenty for a tips app.
let cache = { fixtures: null, fixturesTime: 0 };
const CACHE_MS = 2 * 60 * 1000; // 2 minutes

async function fetchFromApiFootball(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': API_FOOTBALL_KEY }
  });
  if (!res.ok) throw new Error(`API-Football error: ${res.status}`);
  return res.json();
}

// GET /api/fixtures/today — today's matches across major leagues
app.get('/api/fixtures/today', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.fixtures && (now - cache.fixturesTime) < CACHE_MS) {
      return res.json({ cached: true, ...cache.fixtures });
    }
    const today = new Date().toISOString().slice(0, 10);
    const data = await fetchFromApiFootball(`/fixtures?date=${today}`);
    cache.fixtures = data;
    cache.fixturesTime = now;
    res.json({ cached: false, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/live — matches currently in play
app.get('/api/live', async (req, res) => {
  try {
    const data = await fetchFromApiFootball('/fixtures?live=all');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/predictions/:fixtureId — API-Football's own prediction engine,
// which we blend with your AI-written analysis text on the frontend
app.get('/api/predictions/:fixtureId', async (req, res) => {
  try {
    const data = await fetchFromApiFootball(`/predictions?fixture=${req.params.fixtureId}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('GoalCast AI backend is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GoalCast AI backend running on port ${PORT}`));
