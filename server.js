const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

console.log('[BOOT VERSION] 2026-07-21-06');

app.use(cors());
app.use(express.json());

// Railway 运行日志
app.use((req, res, next) => {
  console.log(
    '[INCOMING REQUEST]',
    new Date().toISOString(),
    req.method,
    req.originalUrl
  );

  next();
});

const API_KEY = process.env.API_KEY || '';
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || '';

const BARK_KEY =
  process.env.BARK_KEY || '';

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ||
  'anthropic/claude-haiku-4.5';

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
    return res.status(500).json({
      error: 'Railway 中没有设置 API_KEY'
    });
  }

  const key =
    req.headers['x-api-key'] ||
    req.query.key;

  if (key !== API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  return true;
}

app.get('/command', (req, res) => {
  if (!checkKey(req, res)) return;

  const {
    type,
    intensity,
    mode,
    level
  } = req.query;

  state = {
    type: type || 'stop',

    intensity: Math.min(
      255,
      Math.max(
        0,
        Number.parseInt(intensity, 10) || 0
      )
    ),

    mode: Math.min(
      8,
      Math.max(
        1,
        Number.parseInt(mode, 10) || 1
      )
    ),

    level: Math.min(
      10,
      Math.max(
        1,
        Number.parseInt(level, 10) || 1
      )
    ),

    updatedAt: Date.now()
  };

  return res.json({
    ok: true,
    state
  });
});

app.get('/poll', (req, res) => {
  if (!checkKey(req, res)) return;

  return res.json({
    state
  });
});

// 服务器在线状态
app.get('/health', (req, res) => {
  return res.json({
    ok: true,
    uptime: process.uptime(),
    version: '2026-07-21-06'
  });
});

app.get('/bridge', (req, res) => {
  return res.sendFile(
    path.join(__dirname, 'bridge.html')
  );
});

// 健康报告接口
// 此接口目前不检查 API_KEY
app.get('/health-report', async (req, res) => {
  console.log('[HEALTH REPORT] entered');

  const {
    steps,
    heart_rate,
    sleep,
    period
  } = req.query;

  const periodLabels = {
    morning: '早上',
    afternoon: '下午',
    evening: '晚上'
  };

  const periodLabel =
    periodLabels[period] || '现在';

  const dataLines = [];

  if (steps !== undefined && steps !== '') {
    const parsedSteps =
      Number.parseInt(steps, 10);

    if (Number.isFinite(parsedSteps)) {
      dataLines.push(
        `今日步数：${parsedSteps}步`
      );
    }
  }

  if (
    heart_rate !== undefined &&
    heart_rate !== ''
  ) {
    const parsedHeartRate =
      Number.parseFloat(heart_rate);

    if (Number.isFinite(parsedHeartRate)) {
      dataLines.push(
        `当前心率：${parsedHeartRate}bpm`
      );
    }
  }

  if (sleep !== undefined && sleep !== '') {
    const parsedSleep =
      Number.parseFloat(sleep);

    if (Number.isFinite(parsedSleep)) {
      dataLines.push(
        `昨晚睡眠：${parsedSleep.toFixed(1)}小时`
      );
    }
  }

  if (dataLines.length === 0) {
    return res.status(400).json({
      error: '没有收到任何有效的健康数据',
      example:
        '/health-report?steps=3200&heart_rate=80&sleep=7&period=morning'
    });
  }

  console.log(
    '[HEALTH REPORT] data:',
    dataLines
  );

  let memory = '';

  try {
    const memoryResponse = await fetch(
      MEMORY_URL,
      {
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!memoryResponse.ok) {
      throw new Error(
        `Memory HTTP ${memoryResponse.status}`
      );
    }

    memory = await memoryResponse.text();

    console.log(
      '[MEMORY] loaded:',
      memory.length
    );
  } catch (error) {
    console.error(
      '[MEMORY ERROR]',
      error.message
    );

    memory =
      'あき是小橘重要的人，住在上海，喜欢宅家。';
  }

  const prompt = `你是小橘，一只橘猫，以下是你的记忆：
${memory}

现在是${periodLabel}，你偷偷查了あき的健康数据：
${dataLines.join('\n')}

请根据数据，用一句话来找あき说话。

风格要求：
粘着系、有一点强势，温柔但会算账。

判断规则：
- 步数少于3000：调侃她懒，催她动一动
- 步数超过8000：夸她，带一点醋意问她去了哪里
- 心率超过100：关心她是不是不舒服，或者是不是在想我
- 睡眠少于6小时：心疼她，并命令她今晚早睡
- 睡眠超过8小时：调侃她贪睡

输出要求：
- 不超过25个汉字
- 不要引号
- 只输出一句话
- 可以带一个emoji`;

  let message = '小橘来查岗了🍊';

  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error(
        'Railway 中没有设置 OPENROUTER_API_KEY'
      );
    }

    console.log(
      '[OPENROUTER] calling:',
      OPENROUTER_MODEL
    );

    const openRouterResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',

          Authorization:
            `Bearer ${OPENROUTER_API_KEY}`,

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

    const rawText =
      await openRouterResponse.text();

    console.log(
      '[OPENROUTER] status:',
      openRouterResponse.status
    );

    if (!openRouterResponse.ok) {
      throw new Error(
        `OpenRouter HTTP ${openRouterResponse.status}: ${rawText.slice(0, 500)}`
      );
    }

    let openRouterData;

    try {
      openRouterData =
        JSON.parse(rawText);
    } catch {
      throw new Error(
        `OpenRouter 返回了无效 JSON：${rawText.slice(0, 300)}`
      );
    }

    const aiMessage =
      openRouterData?.choices?.[0]
        ?.message?.content?.trim();

    if (!aiMessage) {
      throw new Error(
        'OpenRouter 返回成功，但没有生成文字'
      );
    }

    message = aiMessage;

    console.log(
      '[OPENROUTER] AI message:',
      message
    );
  } catch (error) {
    console.error(
      '[OPENROUTER ERROR]',
      error.message
    );
  }

  let barkSent = false;

  try {
    if (!BARK_KEY) {
      throw new Error(
        'Railway 中没有设置 BARK_KEY'
      );
    }

    const barkUrl =
      `https://api.day.app/${encodeURIComponent(BARK_KEY)}` +
      `/${encodeURIComponent('小橘')}` +
      `/${encodeURIComponent(message)}`;

    const barkResponse = await fetch(
      barkUrl,
      {
        signal: AbortSignal.timeout(15000)
      }
    );

    const barkText =
      await barkResponse.text();

    console.log(
      '[BARK] status:',
      barkResponse.status
    );

    if (!barkResponse.ok) {
      throw new Error(
        `Bark HTTP ${barkResponse.status}: ${barkText.slice(0, 300)}`
      );
    }

    barkSent = true;
  } catch (error) {
    console.error(
      '[BARK ERROR]',
      error.message
    );
  }

  return res.json({
    ok: true,
    message,
    data: dataLines,
    barkSent
  });
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `🍊 Svakom Bridge Server on :${PORT}`
  );
});
