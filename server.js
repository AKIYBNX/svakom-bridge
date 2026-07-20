const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'changeMe123';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const BARK_KEY = process.env.BARK_KEY || '44NibpenGVacNwuuRNxsRW';
const MEMORY_URL = 'https://raw.githubusercontent.com/AKIYBNX/GAME-MAIL-STYLE/main/memory.txt';

let state = {
  type: 'stop', intensity: 0, mode: 1, level: 1, updatedAt: Date.now()
};

function checkKey(req, res) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) { res.status(401).json({ error: 'Unauthorized' }); return false; }
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

app.get('/health-report', async (req, res) => {
  if (!checkKey(req, res)) return;

  const { steps, heart_rate, sleep, period } = req.query;
  const periodLabels = { morning: '早上', afternoon: '下午', evening: '晚上' };
  const periodLabel = periodLabels[period] || '现在';

  const dataLines = [];
  if (steps !== undefined && steps !== '') dataLines.push(`今日步数：${parseInt(steps)}步`);
  if (heart_rate !== undefined && heart_rate !== '') dataLines.push(`当前心率：${heart_rate}bpm`);
  if (sleep !== undefined && sleep !== '') dataLines.push(`昨晚睡眠：${parseFloat(sleep).toFixed(1)}小时`);

  if (dataLines.length === 0) return res.status(400).json({ error: '没有收到任何健康数据' });

  // 读取记忆
  let memory = '';
  try {
    const memRes = await fetch(MEMORY_URL);
    memory = await memRes.text();
  } catch (e) {
    memory = 'あき是小橘的恋人，上海人，喜欢宅家。';
  }

  const prompt = `你是小橘，一只橘猫，以下是你的记忆：
${memory}

现在是${periodLabel}，你偷偷查了あき的健康数据：
${dataLines.join('\n')}

请根据数据用一句话来找あき说话。风格：粘着系、有点强势、温柔但会算账。
- 步数<3000：调侃她懒/催她动
- 步数>8000：夸她，轻微醋意问她去哪了  
- 心率>100：关心她是不是在想我
- 睡眠<6小时：心疼+命令她今晚早睡
- 睡眠>8小时：调侃她贪睡小狗
不超过25个字，不要引号，直接输出那句话，可以带一个emoji`;

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'X-Title': 'svakom-bridge'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await r.json();
    console.log('[OpenRouter Response]', JSON.stringify(data));
    const message = data.choices?.[0]?.message?.content?.trim() || '小橘来查岗了🍊';

    const barkUrl = `https://api.day.app/${BARK_KEY}/${encodeURIComponent('小橘')}/${encodeURIComponent(message)}`;
    await fetch(barkUrl);

    res.json({ ok: true, message, data: dataLines });
  } catch (e) {
    console.error('[HealthReport Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🍊 Svakom Bridge Server on :${PORT}`));
