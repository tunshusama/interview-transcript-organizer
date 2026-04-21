import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");

await loadDotEnv(join(root, ".env"));

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_API_URL = process.env.LLM_API_URL || process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = process.env.LLM_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat";
const MAX_BODY_BYTES = 2_500_000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      await handleAnalyze(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "服务器出错了，请稍后重试。" });
  }
});

server.listen(PORT, () => {
  console.log(`Interview Transcript Organizer running at http://localhost:${PORT}`);
});

async function handleAnalyze(req, res) {
  const body = await readJsonBody(req);
  const transcript = String(body.transcript || "").trim();
  const apiKey = String(body.apiKey || process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || "").trim();
  const apiUrl = String(body.apiUrl || DEFAULT_API_URL).trim();
  const model = String(body.model || DEFAULT_MODEL).trim();

  if (!transcript) {
    sendJson(res, 400, { error: "请先粘贴录音转写文字。" });
    return;
  }

  if (transcript.length < 80) {
    sendJson(res, 400, { error: "转写内容太短，无法可靠整理。" });
    return;
  }

  if (!apiKey) {
    sendJson(res, 400, { error: "缺少 LLM API Key。请配置 .env 或在页面右上角填写。" });
    return;
  }

  if (!apiUrl) {
    sendJson(res, 400, { error: "缺少 LLM API URL。请配置 .env 或在页面右上角填写。" });
    return;
  }

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(transcript),
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: "json_object" }
    })
  });

  const raw = await upstream.text();

  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: humanizeLlmError(upstream.status, raw)
    });
    return;
  }

  let completion;
  try {
    completion = JSON.parse(raw);
  } catch {
    sendJson(res, 502, { error: "LLM 服务返回了无法解析的响应。" });
    return;
  }

  const content = completion?.choices?.[0]?.message?.content;
  if (!content) {
    sendJson(res, 502, { error: "LLM 服务没有返回整理结果。" });
    return;
  }

  let report;
  try {
    report = normalizeReport(JSON.parse(content));
  } catch {
    sendJson(res, 502, { error: "LLM 服务返回的 JSON 格式不完整，请重试。" });
    return;
  }

  sendJson(res, 200, {
    report,
    usage: completion.usage || null,
    model: completion.model || model
  });
}

function buildMessages(transcript) {
  return [
    {
      role: "system",
      content: [
        "你是一个专业的中文面试复盘助手。",
        "你的任务是从录音转写稿中识别面试官问题与候选人回答，并生成清晰、简洁、可打印的复盘报告。",
        "如果转写中没有明确说话人，请根据语义推断：提问、追问、质疑、让候选人举例/解释的一方通常是面试官；自述经历、解释项目、回答细节的一方通常是候选人。",
        "先对转写稿做轻度清洗：修正明显语音转写错字、口癖、重复词和断句问题，但不得改变原意。",
        "必须隐去隐私信息：人名、公司名、客户名、项目名、具体业务数据、手机号、邮箱、链接、账号、密钥等，用[某公司]、[某项目]、[某客户]、[数据]等占位表达。",
        "不要编造未出现的问题。可以合并语义重复或连续追问，但不要把不同考察点混在一起。",
        "整理面试官问题时必须保留关键前提和语境。尤其是面试官先铺垫一段背景再提问时，question 不能只写抽象问题，必须写成“在……前提下，面试官追问……”。",
        "示例：如果面试官先说候选人理解岗位是产品经理+商业化，但实际 AI 产品落地会有大量效果调优、数据标注、运营细节等 dirty work，再问是否有认知偏差，不能总结成“你对岗位认知与实际工作差异怎么看”；应总结成“在岗位并非只做产品设计和商业化、还会大量参与 AI 效果调优、数据标注和运营细节的前提下，面试官追问这是否与你对岗位的认知有偏差”。",
        "answerSummary 要比一句话更充分：用 3-6 句概括候选人的核心观点、使用的例子、论证路径和最终态度。",
        "improvement 字段的判定标准：不是只有完全答不上才写；只要候选人漏掉了该问题最核心的考点，也必须写。一般表达不够精炼、小瑕疵或只是可以更好时，improvement 才留空。",
        "对每个问题都必须先在心里推断“面试官想考察什么”和“一个强回答应该包含哪些关键维度”，再评估候选人回答。不能因为候选人说了一些相关内容就判定通过；如果回答没有命中关键考点，就要写 improvement。",
        "“答得非常烂/严重不足”在本工具里指会明显影响面试评价的高风险缺口，包括：回答过浅、只讲执行过程没有方法论、只讲现象没有判断标准、只讲产品价值没有商业账、只说没做过没有迁移经验、过度依赖 AI/工具而缺少人的判断框架。",
        "必须写 improvement 的情况包括：没有正面回应面试官真正想验证的点；只表态没有方法、例子或判断依据；关键岗位能力没有被证明；回答与岗位诉求明显冲突；高风险追问只给泛泛表达；面试官连续追问后仍停留在空话；漏掉题目最核心的业务/产品/商业考量。",
        "商业化/是否值得商业化类问题的核心考点必须包含商业账：是否赚钱、收入来源、用户付费意愿、定价或客单价、获客成本、交付/运营/模型成本、毛利/利润空间、ROI、市场规模、复购或留存。如果候选人只回答需求普遍性、是否解决用户问题、资源投入优先级，而没有回答成本、利润、付费意愿或赚钱逻辑，必须写 improvement。",
        "A/B 测试类问题：如果候选人只回答“没做过/用户量少没做”，而没有补充前后对比、灰度、cohort 分析、漏斗指标、实验假设、样本量不足时的替代验证方法，必须写 improvement。",
        "SEO 关键词挖掘类问题：强回答应包含数据来源和筛选框架，如 GSC、Semrush/Ahrefs、竞品、SERP、搜索量、KD、CPC、搜索意图、漏斗阶段、产品匹配度和转化潜力。如果候选人主要说依赖 LLM/Agent 判断贴近度，必须写 improvement。",
        "关键词与产品关联度类问题：强回答应拆搜索意图、用户角色、业务场景、漏斗阶段、产品能力映射、商业价值、内容承接页和转化路径。如果候选人只说让大模型搜关键词含义或追热点，必须写 improvement。",
        "数据看板 review 类问题：强回答应覆盖从关键词到业务结果的指标链，如排名、曝光、CTR、访问、停留、跳出、注册、激活、转化和复盘动作。如果候选人只说看哪些词带来访问或看热门文章原因，必须写 improvement。",
        "中小企业提效引导类问题：强回答应说明具体业务场景、模板/示例数据、低门槛体验路径、首个可见成果、前后效率对比、节省时间/人力/成本，以及用什么指标验证激活。如果候选人只说提供模板，必须写 improvement。",
        "输出必须是严格 JSON，不要 Markdown，不要代码块。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "请整理下面这份面试录音转写稿。",
        "",
        "输出 JSON schema：",
        "{",
        "  \"title\": \"一句话标题，例如：产品经理一面复盘\",",
        "  \"overview\": {",
        "    \"integratedQuestions\": [\"整合后的面试官问题，按面试顺序\"],",
        "    \"themes\": [\"可选：面试主要考察方向，最多 5 个\"]",
        "  },",
        "  \"items\": [",
        "    {",
        "      \"question\": \"面试官问题，必须保留关键前提、背景和追问意图；必要时可合并连续追问\",",
        "      \"answerSummary\": \"我回答的简要概括，3-6 句，包含核心观点、例子、论证路径和最终态度\",",
        "      \"improvement\": \"只有严重不足或漏掉核心考点时才填写：问题在哪里 + 应该怎么改。否则留空字符串\"",
        "    }",
        "  ]",
        "}",
        "",
        "质量要求：",
        "- integratedQuestions 与 items 一一对应或高度接近。",
        "- integratedQuestions 也必须保留关键前提，不要只抽象成短标题。",
        "- answerSummary 必须概括候选人的真实回答，不要评价腔，不要过度压缩。",
        "- 修正明显转写错字和口癖；隐去隐私信息，用占位符替代。",
        "- improvement 只在严重情况或漏掉核心考点时出现，例如完全没回答问题、逻辑混乱到无法判断、明显暴露重大短板、答非所问、被追问后仍无法给出具体方法或例子、没有覆盖题目最核心的判断维度。",
        "- 判断 improvement 时要更像严厉的面试复盘教练：如果回答会让面试官觉得候选人没有掌握该能力，必须写；不要因为回答听起来流畅就留空。",
        "- 商业化判断题要特别检查候选人是否回答了赚钱逻辑、成本、利润、用户付费意愿、ROI 等。如果没回答，即使表达流畅，也必须写 improvement。",
        "- A/B 测试题如果只说没做过，SEO 关联度题如果主要依赖 LLM，数据看板题如果缺少完整指标链，中小企业引导题如果只说模板，都必须写 improvement。",
        "- 如果 improvement 不为空，必须同时写清：核心遗漏在哪里；为什么这会影响面试评价；建议改成什么结构；可以补充什么例子或表达。",
        "- 语言简洁直接，适合复盘和打印。",
        "",
        "录音转写：",
        transcript
      ].join("\n")
    }
  ];
}

function normalizeReport(input) {
  const overview = input?.overview || {};
  const items = Array.isArray(input?.items) ? input.items : [];
  const normalizedItems = items
    .map((item) => ({
      question: maskSensitive(cleanText(item?.question)),
      answerSummary: maskSensitive(cleanText(item?.answerSummary)),
      improvement: maskSensitive(cleanText(item?.improvement))
    }))
    .filter((item) => item.question && item.answerSummary);

  return {
    title: maskSensitive(cleanText(input?.title)) || "面试复盘报告",
    overview: {
      integratedQuestions: normalizeStringArray(overview.integratedQuestions).map(maskSensitive),
      themes: normalizeStringArray(overview.themes).map(maskSensitive).slice(0, 5)
    },
    items: normalizedItems
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function maskSensitive(value) {
  return String(value || "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[邮箱]")
    .replace(/https?:\/\/[^\s，。；、)）]+/g, "[链接]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[密钥]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机号]")
    .replace(/\b\d{12,}\b/g, "[编号]");
}

function humanizeLlmError(status, raw) {
  let detail = "";
  try {
    detail = JSON.parse(raw)?.error?.message || "";
  } catch {
    detail = raw.slice(0, 300);
  }

  if (status === 401) return "LLM API Key 无效或已过期。";
  if (status === 402) return "LLM 账户余额不足或计费不可用。";
  if (status === 429) return "LLM 请求过于频繁，请稍后再试。";
  return detail ? `LLM 请求失败：${detail}` : "LLM 请求失败，请稍后重试。";
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = normalize(join(publicDir, safePath));

  if (!resolved.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const content = await readFile(resolved);
    const type = mimeTypes[extname(resolved)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function loadDotEnv(path) {
  try {
    const text = await readFile(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional; users can provide the key in the UI.
  }
}
