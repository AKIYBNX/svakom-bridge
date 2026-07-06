const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'changeMe123';

let state = {
  type: 'stop',
  intensity: 0,
  mode: 1,
  level: 1,
  updatedAt: Date.now()
};

function checkKey(req, res) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/command', (req, res) => {
  if (!checkKey(req, res)) return;
  const { type, intensity, mode, level } = req.query;
  state = {
    type: type || 'stop',
    intensity: Math.min(255, Math.max(0, parseInt(intensity) || 0)),
    mode: Math.min(8, Math.max(1, parseInt(mode) || 1)),
    level: Math.min(10, Math.max(1, parseInt(level) || 1)),
    updatedAt: Date.now()
  };
  console.log('[Command]', state);
  res.json({ ok: true, state });
});

app.get('/poll', (req, res) => {
  if (!checkKey(req, res)) return;
  res.json({ state });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/bridge', (req, res) => {
  res.sendFile(path.join(__dirname, 'bridge.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🍊 Svakom Bridge Server on :${PORT}`));
