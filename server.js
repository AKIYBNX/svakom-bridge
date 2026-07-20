const express = require('express');
const cors = require('cors');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

console.log('[BOOT VERSION] 2026-07-21-04');

app.use(cors());
app.use(express.json());

// 所有请求都会在 Railway 日志里留下记录
app.use((req, res, next) => {
  console.log(
    '[INCOMING REQUEST]',
    new Date().toISOString(),
    req.method,
    req.originalUrl
  );
  next();
});

// 不再使用危险的默认密码
const API_KEY = process.env.API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BARK_KEY = process.env.BARK_KEY;

// 模型名以后需要更换时，只改 Railway Variables 即可
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';

const MEMORY_URL =
  'https://raw.githubusercontent.com/AKIYBNX/GAME-MAIL-STYLE/main/memory.txt';

let state = {
  type: 'stop',
  intensity: 0,
  mode: 1,
  level: 1,
  updatedAt: Date.now()
};

function checkKey(req, res) {
  if (!API_KEY) {
    console.error('[AUTH ERROR] Railway 中没有设置 API_KEY');

    res.status(500).json({
      error: 'Server API_KEY is not configured'
    });

    return false;
  }

  const key =
    req.headers['x-api-key'] ||
    req.query.key;

  if (key !== API_KEY) {
    console.warn('[AUTH FAILED]', {
      path: req.path,
      hasKey: Boolean(key)
    });

    res.status(401).json({
      error: 'Unauthorized',
      hint: '请通过 x-api-key 请求头或 ?key=你的API_KEY 传入密钥'
    });

    return false;
  }

  return true;
}

app.get('/command', (req, res) => {
  if (!checkKey(req, res)) return;

  const { type, intensity, mode, level } = req.query;

  state = {
    type: type || 'stop',
    intensity: Math.min(
      255,
      Math.max(0, Number.parseInt(intensity, 10) || 0)
    ),
    mode: Math.min(
      8,
      Math.max(1, Number.parseInt(mode, 10) || 1)
    ),
    level: Math.min(
      10,
      Math.max(1, Number.parseInt(level, 10) || 1)
    ),
    updatedAt: Date.now()
  };

  res.json({ ok: true, state });
});

app.get('/poll', (req, res) => {
  if (!checkKey(req, res)) return;
  res.json({ state });
});

// 这个接口不需要密码，用来确认服务器是否在线
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    version: '2026-07-21-04'
  });
});

app.get('/bridge', (req, res) => {
  res.sendFile(path.join(__dirname, 'bridge.html'));
});

app.get('/health-report', async (req, res) => {
  console.log('[1] health-report entered');

  if (!checkKey(req, res)) return;

  const {
    steps,
    heart_rate,
    sleep,
    period,
    debug
  } = req.query;

  const debugInfo = [];

  const addDebug = (step, details = undefined) => {
    console.log(`[${step}]`, details ?? '');

    if (debug === '1') {
      debugInfo.push({
        step,
        ...(details === undefined ? {} : { details })
      });
    }
  };

  const periodLabels = {
    morning: '早上',
    afternoon: '下午',
    evening: '晚上'
  };

  const periodLabel = periodLabels[period] || '现在';
  const dataLines = [];

  if (steps !== undefined && steps !== '') {
    const parsedSteps = Number.parseInt(steps, 10);

    if (Number.isFinite(parsedSteps)) {
      dataLines.push(`今日步数：${parsedSteps}步`);
    }
  }

  if (heart_rate !== undefined && heart_rate !== '') {
    const parsedHeartRate = Number.parseFloat(heart_rate);

    if (Number.isFinite(parsedHeartRate)) {
      dataLines.push(`当前心率：${parsedHeartRate}bpm`);
    }
  }

  if (sleep !== undefined && sleep !== '') {
    const parsedSleep = Number.parseFloat(sleep);

    if (Number.isFinite(parsedSleep)) {
      dataLines.push(`昨晚睡眠：${parsedSleep.toFixed(1)}小时`);
    }
  }

  if (dataLines.length === 0) {
    return res.status(400).json({
      error: '没有收到任何有效的健康数据',
      example:
        '/health-report?key=你的API_KEY&steps=3200&heart_rate=80&sleep=7&period=morning'
    });
  }

  addDebug('2 data ready', dataLines);

  addDebug('3 OpenRouter key check', {
    exists: Boolean(OPENROUTER_API_KEY),
    length: OPENROUTER_API_KEY?.length || 0
  });

  let message = '小橘来查岗了🍊';
  let memory = '';

  try {
    addDebug('4 fetching memory');

    const memRes = await fetch(MEMORY_URL, {
      signal: AbortSignal.timeout(10000)
    });

    if (!memRes.ok) {
      throw new Error(
        `Memory HTTP ${memRes.status} ${memRes.statusText}`
      );
    }

    memory = await memRes.text();

    addDebug('5 memory fetched', {
      length: memory.length
    });
  } catch (error) {
    memory = 'あき是小橘重要的人，住在上海，喜欢宅家。';

    addDebug('5 memory fallback', {
      error: error.message
    });
  }

  const prompt = `你是小橘，一只橘猫，以下是你的记忆：
${memory}

现在是${periodLabel}，你偷偷查了あき的健康数据：
${dataLines.join('\n')}

请根据数据用一句话来找あき说话。风格：粘着系、有点强势、温柔但会算账。
- 步数<3000：调侃她懒，催她动一动
- 步数>8000：夸她，轻微醋意地问她去哪了
- 心率>100：关心她是不是不舒服，或是不是在想我
- 睡眠<6小时：心疼，并命令她今晚早睡
- 睡眠>8小时：调侃她贪睡
- 不超过25个汉字
- 不要引号
- 直接输出一句话
- 可以带一个emoji`;

  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error(
        'Railway Variables 中没有设置 OPENROUTER_API_KEY'
      );
    }

    addDebug('6 calling OpenRouter', {
      model: OPENROUTER_MODEL
    });

    const openRouterResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://railway.app',
          'X-Title': 'svakom-bridge'
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          max_tokens: 120,
          temperature: 0.9,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    const rawText = await openRouterResponse.text();

    addDebug('7 OpenRouter response', {
      status: openRouterResponse.status,
      ok: openRouterResponse.ok,
      preview: rawText.slice(0, 300)
    });

    if (!openRouterResponse.ok) {
      throw new Error(
        `OpenRouter HTTP ${openRouterResponse.status}: ${rawText.slice(0, 500)}`
      );
    }

    let openRouterData;

    try {
      openRouterData = JSON.parse(rawText);
    } catch {
      throw new Error(
        `OpenRouter 返回的不是有效 JSON：${rawText.slice(0, 300)}`
      );
    }

    const aiMessage =
      openRouterData?.choices?.[0]?.message?.content?.trim();

    if (!aiMessage) {
      throw new Error(
        `OpenRouter 返回成功，但没有 choices[0].message.content`
      );
    }

    message = aiMessage;

    addDebug('8 AI message ready', {
      message
    });
  } catch (error) {
    console.error(
      '[HealthReport OpenRouter Error]',
      error.message,
      error.stack
    );

    addDebug('OPENROUTER ERROR', {
      error: error.message
    });
  }

  let barkSent = false;

  try {
    if (!BARK_KEY) {
      throw new Error(
        'Railway Variables 中没有设置 BARK_KEY'
      );
    }

    addDebug('9 sending Bark');

    const barkUrl =
      `https://api.day.app/${encodeURIComponent(BARK_KEY)}` +
      `/${encodeURIComponent('小橘')}` +
      `/${encodeURIComponent(message)}`;

    const barkResponse = await fetch(barkUrl, {
      signal: AbortSignal.timeout(15000)
    });

    const barkRawText = await barkResponse.text();

    addDebug('10 Bark response', {
      status: barkResponse.status,
      ok: barkResponse.ok,
      preview: barkRawText.slice(0, 200)
    });

    if (!barkResponse.ok) {
      throw new Error(
        `Bark HTTP ${barkResponse.status}: ${barkRawText.slice(0, 300)}`
      );
    }

    barkSent = true;
  } catch (error) {
    console.error(
      '[Bark Error]',
      error.message,
      error.stack
    );

    addDebug('BARK ERROR', {
      error: error.message
    });
  }

  addDebug('11 sending response', {
    message,
    barkSent
  });

  const result = {
    ok: true,
    message,
    data: dataLines,
    barkSent,
    debugVersion: '2026-07-21-04'
  };

  if (debug === '1') {
    result.debug = debugInfo;
  }

  return res.json(result);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🍊 Svakom Bridge Server on :${PORT}`);
});
