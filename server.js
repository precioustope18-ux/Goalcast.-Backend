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

// Curated list of major leagues to spend your daily request budget on.
// (League IDs from API-Football's /leagues endpoint. Add/remove as needed —
// search https://dashboard.api-football.com to find more league IDs.)
const FEATURED_LEAGUES = [
  39,   // Premier League (England)
  140,  // La Liga (Spain)
  135,  // Serie A (Italy)
  78,   // Bundesliga (Germany)
  61,   // Ligue 1 (France)
  2,    // Champions League
  332   // NPFL (Nigeria) — verify this ID in your dashboard; update if different
];

let insightsCache = { data: null, time: 0 };
const INSIGHTS_CACHE_MS = 60 * 60 * 1000; // 1 hour — predictions don't change fast

// GET /api/insights/today — a curated shortlist of matches with real
// AI-style analysis built from API-Football's prediction engine.
app.get('/api/insights/today', async (req, res) => {
  try {
    const now = Date.now();
    if (insightsCache.data && (now - insightsCache.time) < INSIGHTS_CACHE_MS) {
      return res.json({ cached: true, insights: insightsCache.data });
    }

    const today = new Date().toISOString().slice(0, 10);
    const fixturesData = await fetchFromApiFootball(`/fixtures?date=${today}`);
    const allFixtures = fixturesData.response || [];

    // Prefer featured leagues; fall back to whatever's available today
    let picked = allFixtures.filter(fx => FEATURED_LEAGUES.includes(fx.league?.id));
    if (picked.length === 0) picked = allFixtures;
    picked = picked.slice(0, 10); // stay well within the 100/day budget

    const insights = [];
    for (const fx of picked) {
      try {
        const predData = await fetchFromApiFootball(`/predictions?fixture=${fx.fixture.id}`);
        const p = predData.response?.[0];
        if (!p) continue;

        const percHome = parseInt(p.predictions?.percent?.home) || 0;
        const percDraw = parseInt(p.predictions?.percent?.draw) || 0;
        const percAway = parseInt(p.predictions?.percent?.away) || 0;
        const confidence = Math.max(percHome, percDraw, percAway);
        const advice = p.predictions?.advice || 'No strong lean either way';
        const underOver = p.predictions?.under_over;
        const comparison = p.comparison;

        let note = advice + '.';
        if (comparison?.form) {
          note += ` Form edge: ${fx.teams.home.name} ${comparison.form.home}, ${fx.teams.away.name} ${comparison.form.away}.`;
        }
        if (underOver) {
          note += ` Goals line leaning ${underOver}.`;
        }

        insights.push({
          fixtureId: fx.fixture.id,
          home: fx.teams.home.name,
          away: fx.teams.away.name,
          league: fx.league.name,
          kickoff: fx.fixture.date,
          confidence,
          percHome, percDraw, percAway,
          advice,
          note
        });
      } catch (innerErr) {
        console.log('Prediction fetch failed for fixture', fx.fixture.id, innerErr.message);
      }
    }

    insightsCache.data = insights;
    insightsCache.time = now;
    res.json({ cached: false, insights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('GoalCast AI backend is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GoalCast AI backend running on port ${PORT}`));
