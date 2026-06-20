export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const config = getProviderConfig();
  if (!config.apiKey) {
    return response.status(200).json({
      ok: false,
      fallback: true,
      provider: "local-fallback",
      error: "OPENAI_API_KEY / YUNWU_API_KEY / LLM_API_KEY is not configured. The frontend can still use the local rule engine.",
    });
  }

  try {
    const payload = await readJsonBody(request);
    const result =
      config.style === "chat"
        ? await callChatCompletions(config, payload)
        : await callResponsesApi(config, payload);

    return response.status(200).json({
      ok: true,
      model: config.model,
      provider: config.provider,
      result,
    });
  } catch (error) {
    return response.status(200).json({
      ok: false,
      fallback: true,
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}

function getProviderConfig() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.YUNWU_API_KEY || process.env.LLM_API_KEY || "";
  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || process.env.YUNWU_API_BASE || "https://api.openai.com/v1");
  const model = process.env.OPENAI_MODEL || process.env.YUNWU_ANALYSIS_MODEL || "gpt-4.1-mini";
  const style = normalizeApiStyle(process.env.OPENAI_API_STYLE, baseUrl);
  return {
    apiKey,
    baseUrl,
    model,
    style,
    provider: style === "chat" ? `${redactHost(baseUrl)} chat-completions` : "openai responses",
  };
}

function normalizeBaseUrl(value) {
  return String(value || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function normalizeApiStyle(value, baseUrl) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "chat" || normalized === "chat-completions") return "chat";
  if (normalized === "responses" || normalized === "response") return "responses";
  return baseUrl.includes("api.openai.com") ? "responses" : "chat";
}

function redactHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "custom-provider";
  }
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !request.readable) return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function callResponsesApi(config, payload) {
  const apiResponse = await fetch(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: buildResponsesInput(payload),
      text: {
        format: {
          type: "json_schema",
          name: "crowdfunding_assessment",
          strict: true,
          schema: assessmentSchema,
        },
      },
    }),
  });

  const raw = await apiResponse.text();
  if (!apiResponse.ok) {
    throw new Error(`AI API error ${apiResponse.status}: ${formatProviderError(raw)}`);
  }

  const data = JSON.parse(raw);
  const text = extractResponseText(data);
  if (!text) throw new Error("AI response did not include parseable text.");
  return normalizeAssessmentResult(parseJsonObject(text));
}

async function callChatCompletions(config, payload) {
  const apiResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: buildChatMessages(payload),
    }),
  });

  const raw = await apiResponse.text();
  if (!apiResponse.ok) {
    throw new Error(`AI API error ${apiResponse.status}: ${formatProviderError(raw)}`);
  }

  const data = JSON.parse(raw);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("AI response did not include chat message content.");
  return normalizeAssessmentResult(parseJsonObject(text));
}

function buildPromptText(payload) {
  const project = payload?.project || {};
  const files = payload?.files || [];
  const localAssessment = payload?.localAssessment || {};

  return `
你是海外众筹成功率提升智能体。请基于用户输入、表单资料、附件摘要和本地规则评分，生成结构化评估。

核心目标：判断项目当前众筹成功率，并给出能提升成功率的具体执行动作。

必须遵守：
1. 不要承诺一定成功。
2. 缺失资料必须标注，不能脑补。
3. 未能读取正文的 PPT/PDF/Word/Excel 只能作为“已上传资料证据”，不能假设内容。
4. 每个低分项必须对应具体改进动作。
5. 输出客户可读的中文报告；英文只用于众筹标题、卖点、档位名称、视频脚本台词。
6. 视频资料暂不处理，除非用户只提供视频，则提醒补充图片/PPT/文档。

六大维度：
- 产品差异化与海外市场适配：17分
- 样机成熟度与交付风险：17分
- 定价档位与盈利模型：16分
- 素材与转化内容储备：16分
- 流量投放与预热资源：17分
- 团队与合规兜底：17分

硬风险：
- 只有渲染图、无样机：最高B级
- 毛利率低于30%：最高B级，严重时C级
- 电子产品无认证计划：最高B级
- 疑似侵权、仿牌、禁售品：直接C级
- 无预算、无私域、无KOL、无预热计划：流量维度不得高于8分

客户原始描述：
${project.ideaInput || "未提供"}

结构化表单资料：
${JSON.stringify(project, null, 2)}

附件摘要：
${JSON.stringify(files.map(stripLargeFilePayload), null, 2)}

本地规则引擎初评：
${JSON.stringify(localAssessment, null, 2)}
 
输出要求：
1. 只返回一个 JSON 对象，不要 Markdown 代码块，不要解释 JSON 外的文字。
2. JSON 字段必须包含：stage, stageReason, summary, score, grade, successBand, canLaunch, missingInfo, dimensions, risks, topBlockers, improvementPlan, stageDeliverable, nextQuestions, actionPlan, reportMarkdown。
3. reportMarkdown 必须是完整客户报告，包含：客户当前阶段判断、已提供资料与缺失资料、当前成功率判断、六大维度评分表、红黄绿风险清单、成功率低的核心原因、提升成功率方案、当前阶段专属交付物、客户下一步准备清单、7天/30天/上线前行动计划。
4. dimensions 必须正好 6 项，并按六大维度顺序输出。
`;
}

function buildResponsesInput(payload) {
  const files = payload?.files || [];
  const content = [{ type: "input_text", text: buildPromptText(payload) }];

  files
    .filter((file) => file.dataUrl && String(file.type || "").startsWith("image/"))
    .slice(0, 6)
    .forEach((file) => {
      content.push({
        type: "input_image",
        image_url: file.dataUrl,
      });
    });

  return [
    {
      role: "user",
      content,
    },
  ];
}

function buildChatMessages(payload) {
  const files = payload?.files || [];
  const content = [{ type: "text", text: buildPromptText(payload) }];

  files
    .filter((file) => file.dataUrl && String(file.type || "").startsWith("image/"))
    .slice(0, 6)
    .forEach((file) => {
      content.push({
        type: "image_url",
        image_url: { url: file.dataUrl },
      });
    });

  return [
    {
      role: "system",
      content: "你是严谨的海外众筹项目顾问。你必须输出可解析 JSON，不得输出 JSON 之外的内容。",
    },
    {
      role: "user",
      content,
    },
  ];
}

function stripLargeFilePayload(file) {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    ext: file.ext,
    kind: file.kind,
    textPreview: file.textPreview || "",
    hasImagePayload: Boolean(file.dataUrl),
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = data.output || [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonObject(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("AI response was not valid JSON.");
  }
}

function normalizeAssessmentResult(result) {
  if (!result || typeof result !== "object") throw new Error("AI result was not a JSON object.");

  const score = clampNumber(result.score, 0, 100, 0);
  const grade = result.grade || gradeFromScore(score);
  const successBand = result.successBand || successBandFromScore(score);
  const dimensions = Array.isArray(result.dimensions) ? result.dimensions : [];
  const risks = Array.isArray(result.risks) ? result.risks : [];
  const missingInfo = Array.isArray(result.missingInfo) ? result.missingInfo : [];
  const topBlockers = Array.isArray(result.topBlockers) ? result.topBlockers : [];
  const nextQuestions = Array.isArray(result.nextQuestions) ? result.nextQuestions : [];

  return {
    ...result,
    score,
    grade,
    successBand,
    canLaunch: result.canLaunch || "需要补充关键信息后再判断是否适合启动众筹。",
    missingInfo,
    dimensions,
    risks,
    topBlockers,
    nextQuestions,
    improvementPlan: normalizePlan(result.improvementPlan),
    actionPlan: normalizeActionPlan(result.actionPlan),
    reportMarkdown: result.reportMarkdown || buildFallbackMarkdown({ ...result, score, grade, successBand, dimensions, risks, missingInfo, topBlockers }),
  };
}

function normalizePlan(plan = {}) {
  return {
    product: arrayOfStrings(plan.product),
    pricing: arrayOfStrings(plan.pricing),
    content: arrayOfStrings(plan.content),
    traffic: arrayOfStrings(plan.traffic),
    fulfillment: arrayOfStrings(plan.fulfillment),
    compliance: arrayOfStrings(plan.compliance),
  };
}

function normalizeActionPlan(plan = {}) {
  return {
    sevenDays: arrayOfStrings(plan.sevenDays),
    thirtyDays: arrayOfStrings(plan.thirtyDays),
    beforeLaunch: arrayOfStrings(plan.beforeLaunch),
  };
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function gradeFromScore(score) {
  if (score >= 90) return "S级";
  if (score >= 75) return "A级";
  if (score >= 60) return "B级";
  return "C级";
}

function successBandFromScore(score) {
  if (score >= 75) return "高";
  if (score >= 60) return "中";
  return "低";
}

function buildFallbackMarkdown(result) {
  const dimensionRows = result.dimensions
    .map((item) => `| ${item.name || "-"} | ${item.score ?? "-"} / ${item.max ?? "-"} | ${item.riskColor || "-"} | ${item.reason || "-"} |`)
    .join("\n");
  const riskRows = result.risks.map((item) => `- ${item.level || "黄色"}：${item.text || item}`).join("\n");
  return `# 海外众筹成功率评估报告

## 1. 当前成功率判断
${result.summary || "当前资料不足，需要先补齐关键信息再做最终判断。"}

- 总分：${result.score} / 100
- 评级：${result.grade}
- 成功率档位：${result.successBand}
- 是否适合启动：${result.canLaunch || "暂不建议直接启动"}

## 2. 六大维度评分表
| 维度 | 得分 | 风险 | 说明 |
| --- | ---: | --- | --- |
${dimensionRows || "| - | - | - | - |"}

## 3. 风险清单
${riskRows || "- 黄色：资料不足，需补充后再判断。"}

## 4. 最高优先级改进
${result.topBlockers?.map((item) => `- ${item}`).join("\n") || "- 先补充样机、成本、定价、认证、素材和流量资料。"}
`;
}

function formatProviderError(raw) {
  const parsed = safeJson(raw);
  if (parsed?.error?.message) return parsed.error.message;
  if (parsed?.message) return parsed.message;
  return String(raw || "").slice(0, 600);
}

const assessmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "stage",
    "stageReason",
    "summary",
    "score",
    "grade",
    "successBand",
    "canLaunch",
    "missingInfo",
    "dimensions",
    "risks",
    "topBlockers",
    "improvementPlan",
    "stageDeliverable",
    "nextQuestions",
    "actionPlan",
    "reportMarkdown",
  ],
  properties: {
    stage: { type: "string" },
    stageReason: { type: "string" },
    summary: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    grade: { type: "string", enum: ["S级", "A级", "B级", "C级"] },
    successBand: { type: "string", enum: ["高", "中", "低"] },
    canLaunch: { type: "string" },
    missingInfo: {
      type: "array",
      items: { type: "string" },
    },
    dimensions: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "max", "score", "riskColor", "reason"],
        properties: {
          name: { type: "string" },
          max: { type: "integer" },
          score: { type: "integer" },
          riskColor: { type: "string", enum: ["红色", "黄色", "绿色"] },
          reason: { type: "string" },
        },
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "text"],
        properties: {
          level: { type: "string", enum: ["红色", "黄色", "绿色"] },
          text: { type: "string" },
        },
      },
    },
    topBlockers: {
      type: "array",
      items: { type: "string" },
    },
    improvementPlan: {
      type: "object",
      additionalProperties: false,
      required: ["product", "pricing", "content", "traffic", "fulfillment", "compliance"],
      properties: {
        product: { type: "array", items: { type: "string" } },
        pricing: { type: "array", items: { type: "string" } },
        content: { type: "array", items: { type: "string" } },
        traffic: { type: "array", items: { type: "string" } },
        fulfillment: { type: "array", items: { type: "string" } },
        compliance: { type: "array", items: { type: "string" } },
      },
    },
    stageDeliverable: { type: "string" },
    nextQuestions: {
      type: "array",
      items: { type: "string" },
    },
    actionPlan: {
      type: "object",
      additionalProperties: false,
      required: ["sevenDays", "thirtyDays", "beforeLaunch"],
      properties: {
        sevenDays: { type: "array", items: { type: "string" } },
        thirtyDays: { type: "array", items: { type: "string" } },
        beforeLaunch: { type: "array", items: { type: "string" } },
      },
    },
    reportMarkdown: { type: "string" },
  },
};
