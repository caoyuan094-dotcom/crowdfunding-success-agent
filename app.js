const stages = [
  {
    id: "evaluation",
    title: "有产品没报告",
    desc: "先判断能不能做",
    deliverable: "可行性评估报告",
  },
  {
    id: "packaging",
    title: "有样品 / PPT",
    desc: "改造成海外表达",
    deliverable: "众筹包装方案",
  },
  {
    id: "prelaunch",
    title: "准备上线",
    desc: "上线前查漏补缺",
    deliverable: "上线前审核清单",
  },
  {
    id: "rescue",
    title: "上线数据不好",
    desc: "定位问题并救盘",
    deliverable: "救盘诊断方案",
  },
  {
    id: "fulfillment",
    title: "筹后履约",
    desc: "交付与复购承接",
    deliverable: "履约沟通计划",
  },
  {
    id: "selection",
    title: "还没确定产品",
    desc: "找适合众筹方向",
    deliverable: "选品机会清单",
  },
];

const stageNames = Object.fromEntries(stages.map((stage) => [stage.id, stage.title]));

const categoryScores = {
  outdoor: 3,
  "smart-hardware": 3,
  pet: 2,
  home: 2,
  tool: 2,
  creative: 2,
  fashion: 0,
  other: 1,
};

const form = document.querySelector("#assessmentForm");
const stageList = document.querySelector("#stageList");
const stageBadge = document.querySelector("#stageBadge");
const scoreValue = document.querySelector("#scoreValue");
const scoreRing = document.querySelector("#scoreRing");
const gradeValue = document.querySelector("#gradeValue");
const scoreSummary = document.querySelector("#scoreSummary");
const priorityList = document.querySelector("#priorityList");
const riskList = document.querySelector("#riskList");
const reportOutput = document.querySelector("#reportOutput");
const readinessTag = document.querySelector("#readinessTag");
const toast = document.querySelector("#toast");
const agentStatus = document.querySelector("#agentStatus");
const chatMessages = document.querySelector("#chatMessages");

let selectedStage = "evaluation";
let reportMode = "client";
let uploadedFiles = [];
let latestLocalAssessment = null;
let latestAgentResult = null;

function init() {
  renderStages();
  bindEvents();
  updateStageFields();
  setAgentStatus("文件只在本地整理；点击“开始评估”后生成对话式报告。", "");
}

function renderStages() {
  stageList.innerHTML = stages
    .map(
      (stage, index) => `
        <button class="stage-button ${stage.id === selectedStage ? "active" : ""}" type="button" data-stage="${stage.id}">
          <span class="stage-number">${index + 1}</span>
          <span>
            <span class="stage-title">${stage.title}</span>
            <span class="stage-desc">${stage.desc}</span>
          </span>
        </button>
      `,
    )
    .join("");
}

function bindEvents() {
  stageList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stage]");
    if (!button) return;
    selectedStage = button.dataset.stage;
    renderStages();
    updateStageFields();
    updateAssessment();
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      reportMode = button.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      updateAssessment();
    });
  });

  form.addEventListener("input", updateAssessment);
  form.addEventListener("change", updateAssessment);

  document.querySelector("#loadDemoBtn")?.addEventListener("click", loadDemo);
  document.querySelector("#resetBtn")?.addEventListener("click", resetForm);
  document.querySelector("#copyReportBtn")?.addEventListener("click", copyReport);
  document.querySelector("#copyReportTopBtn")?.addEventListener("click", copyReport);
  document.querySelector("#downloadBtn")?.addEventListener("click", downloadReport);
  document.querySelector("#fileInput").addEventListener("change", handleFiles);
  document.querySelector("#clearFilesBtn").addEventListener("click", clearFiles);
  document.querySelector("#analyzeIdeaBtn")?.addEventListener("click", analyzeIdea);
  document.querySelector("#runAgentBtn").addEventListener("click", submitConversation);

  chatMessages.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "copy-latest") copyReport();
    if (button.dataset.action === "download-latest") downloadReport();
  });
}

function updateStageFields() {
  stageBadge.textContent = stageNames[selectedStage];
  document.querySelectorAll("[data-stage-field]").forEach((field) => {
    const target = field.dataset.stageField;
    const visible =
      (target === "launch" && selectedStage === "rescue") ||
      (target === "fulfillment" && selectedStage === "fulfillment") ||
      (target === "selection" && selectedStage === "selection");
    field.classList.toggle("is-hidden", !visible);
  });
}

function getData() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.ideaInput = document.querySelector("#ideaInput").value;
  data.uploadedFiles = uploadedFiles;
  return data;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasText(value, min = 12) {
  return String(value || "").trim().length >= min;
}

function calculateAssessment(data) {
  const margin = calculateMargin(data);
  const dimensions = {
    product: scoreProduct(data),
    hardware: scoreHardware(data),
    pricing: scorePricing(data, margin),
    content: scoreContent(data),
    traffic: scoreTraffic(data),
    team: scoreTeam(data),
  };

  const hardRisks = getHardRisks(data, dimensions, margin);
  applyHardLimits(dimensions, hardRisks);

  const total = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  const cappedTotal = Math.max(0, Math.min(100, total));
  const grade = getGrade(cappedTotal, hardRisks);
  const riskItems = buildRisks(data, dimensions, hardRisks, margin);
  const missing = getMissingItems(data);
  const priorities = getPriorities(data, dimensions, hardRisks, missing);
  const readiness = getReadiness(cappedTotal, hardRisks, missing);

  return {
    total: cappedTotal,
    grade,
    dimensions,
    hardRisks,
    riskItems,
    missing,
    priorities,
    margin,
    readiness,
  };
}

function scoreProduct(data) {
  let score = 0;
  const reasons = [];
  if (hasText(data.painPoint, 24) || hasText(data.ideaInput, 80)) score += 4;
  else reasons.push("海外用户痛点和差异化表达不足");

  const categoryScore = categoryScores[data.category] ?? 0;
  score += categoryScore;
  if (categoryScore <= 1) reasons.push("品类众筹天然适配度需要进一步验证");

  if (hasText(data.description, 40) || hasText(data.ideaInput, 120)) score += 3;
  else reasons.push("产品说明不够完整");

  if (hasText(data.competitors, 20)) score += 3;
  else reasons.push("缺少 Kickstarter / Indiegogo 竞品对标");

  if (data.targetMarket && data.targetMarket !== "unknown") score += 3;
  else reasons.push("目标市场不明确");

  return normalizeDimension("产品差异化与海外市场适配", score, 17, reasons);
}

function scoreHardware(data) {
  let score = 0;
  const reasons = [];
  const prototypeMap = { render: 1, appearance: 3, engineering: 5, production: 5 };
  const certMap = { none: 0, planned: 2, testing: 3, done: 3, "not-needed": 3 };
  const factoryMap = { unknown: 0, basic: 2, experienced: 3, ready: 5 };

  score += prototypeMap[data.prototype] || 0;
  if (!data.prototype || data.prototype === "render") reasons.push("缺少可演示工程样机");

  if (numberValue(data.bomCost) > 0) score += 3;
  else reasons.push("BOM 成本未提供");

  score += certMap[data.certification] || 0;
  if (!data.certification || data.certification === "none") reasons.push("认证计划不清晰");

  score += factoryMap[data.factoryStatus] || 0;
  if (!data.factoryStatus || data.factoryStatus === "unknown") reasons.push("工厂产能、MOQ、交期不清");

  if (selectedStage === "fulfillment" && hasText(data.fulfillmentData, 35)) score += 1;

  return normalizeDimension("样机成熟度与交付风险", score, 17, reasons);
}

function scorePricing(data, margin) {
  let score = 0;
  const reasons = [];
  const hasBom = numberValue(data.bomCost) > 0;
  const hasPrice = numberValue(data.earlyBirdPrice) > 0;
  const hasShipping = numberValue(data.shippingCost) > 0;

  if (hasBom && hasPrice) {
    if (margin >= 0.45) score += 5;
    else if (margin >= 0.3) {
      score += 3;
      reasons.push("毛利低于 45% 众筹安全线");
    } else {
      score += 1;
      reasons.push("毛利低于 30%，亏损风险高");
    }
  } else {
    reasons.push("缺少 BOM 或早鸟价，无法测算毛利");
  }

  if (hasShipping) score += 3;
  else reasons.push("物流、税费或平台费未测算");

  if (numberValue(data.fundingGoal) > 0 && numberValue(data.fundingGoal) <= 80000) score += 3;
  else if (numberValue(data.fundingGoal) > 80000) {
    score += 1;
    reasons.push("筹款目标偏高，可能影响达标速度");
  } else {
    reasons.push("筹款目标未提供");
  }

  if (hasPrice) score += 3;
  if (hasText(data.description, 70)) score += 2;

  return normalizeDimension("定价档位与盈利模型", score, 16, reasons);
}

function scoreContent(data) {
  let score = 0;
  const reasons = [];
  const videoMap = { none: 0, ppt: 2, draft: 5, ready: 7, tested: 8 };
  const proofMap = { none: 0, basic: 2, scenario: 5, media: 6 };

  score += videoMap[data.videoStatus] || 0;
  if (!data.videoStatus || data.videoStatus === "none" || data.videoStatus === "ppt") {
    reasons.push("视频和详情页转化素材不足");
  }

  score += proofMap[data.proofAssets] || 0;
  if (!data.proofAssets || data.proofAssets === "none") {
    reasons.push("缺少实测、对比、场景或背书素材");
  }

  const fileBonus = getFileEvidence(data).contentBonus;
  score += fileBonus;
  if (fileBonus > 0) reasons.push("已上传资料可作为素材证据，但仍需人工确认内容质量");

  if (hasText(data.painPoint, 45) || hasText(data.ideaInput, 120)) score += 2;
  else reasons.push("痛点、对比和证明链条不完整");

  return normalizeDimension("素材与转化内容储备", score, 16, reasons);
}

function scoreTraffic(data) {
  let score = 0;
  const reasons = [];
  const budget = numberValue(data.adBudget);
  const resourceMap = { none: 0, "some-kol": 4, prelaunch: 7, full: 10 };

  if (budget >= 30000) score += 5;
  else if (budget >= 10000) score += 3;
  else if (budget > 0) {
    score += 1;
    reasons.push("预热和广告预算偏低");
  } else {
    reasons.push("未提供预热和广告预算");
  }

  score += resourceMap[data.trafficResources] || 0;
  if (!data.trafficResources || data.trafficResources === "none") {
    reasons.push("缺少邮件池、KOL、媒体或预热页");
  }

  if (selectedStage === "rescue" && hasText(data.launchData, 40)) score += 2;
  else if (selectedStage === "rescue") reasons.push("救盘项目缺少访问量、收藏、转化、广告数据");

  return normalizeDimension("流量投放与预热资源", score, 17, reasons);
}

function scoreTeam(data) {
  let score = 0;
  const reasons = [];
  const teamMap = { none: 2, service: 6, past: 9, strong: 12 };
  const factoryMap = { unknown: 0, basic: 1, experienced: 2, ready: 3 };

  score += teamMap[data.teamExperience] || 0;
  if (!data.teamExperience || data.teamExperience === "none") {
    reasons.push("团队众筹经验、收款、售后和合规体系不足");
  }

  score += factoryMap[data.factoryStatus] || 0;
  if (data.certification === "done" || data.certification === "not-needed") score += 2;
  else if (!data.certification || data.certification === "none") reasons.push("认证和平台合规风险未兜底");

  return normalizeDimension("团队与合规兜底", score, 17, reasons);
}

function normalizeDimension(name, score, max, reasons) {
  const capped = Math.max(0, Math.min(max, Math.round(score)));
  return {
    name,
    score: capped,
    max,
    reasons: reasons.length ? reasons : ["当前资料显示该维度基础较完整"],
    color: capped >= max * 0.78 ? "green" : capped >= max * 0.5 ? "yellow" : "red",
  };
}

function calculateMargin(data) {
  const price = numberValue(data.earlyBirdPrice);
  const bom = numberValue(data.bomCost);
  const shipping = numberValue(data.shippingCost);
  if (!price || !bom) return null;
  const platformFee = price * 0.1;
  return (price - bom - shipping - platformFee) / price;
}

function getHardRisks(data, dimensions, margin) {
  const risks = [];
  if (data.prototype === "render") risks.push({ level: "red", text: "只有渲染图，无可演示样机，最高 B 级。" });
  if (data.certification === "none") risks.push({ level: "red", text: "电子或硬件类项目无认证计划，最高 B 级。" });
  if (margin !== null && margin < 0.3) risks.push({ level: "red", text: "毛利低于 30%，亏损风险高。" });
  else if (margin !== null && margin < 0.45) risks.push({ level: "yellow", text: "毛利低于 45% 众筹安全线。" });
  if (data.trafficResources === "none" && numberValue(data.adBudget) === 0) {
    risks.push({ level: "red", text: "无预算、无邮件池、无 KOL、无预热计划，冷启动风险高。" });
  }
  if (!hasText(data.competitors, 20)) risks.push({ level: "yellow", text: "缺少竞品链接，市场对标可信度不足。" });
  if (data.factoryStatus === "unknown") risks.push({ level: "yellow", text: "工厂产能、MOQ、交付周期不清。" });
  if (selectedStage === "rescue" && !hasText(data.launchData, 40)) {
    risks.push({ level: "red", text: "已上线救盘缺少关键数据，不能准确判断转化问题。" });
  }
  if (selectedStage === "fulfillment" && !hasText(data.fulfillmentData, 35)) {
    risks.push({ level: "yellow", text: "筹后履约缺少生产、认证、物流和 Backer 更新资料。" });
  }
  if (selectedStage === "selection" && !hasText(data.supplyChain, 35)) {
    risks.push({ level: "yellow", text: "选品阶段缺少供应链能力和开发约束。" });
  }
  return risks;
}

function applyHardLimits(dimensions, hardRisks) {
  const noTraffic = hardRisks.some((risk) => risk.text.includes("冷启动风险"));
  if (noTraffic) dimensions.traffic.score = Math.min(dimensions.traffic.score, 8);
}

function getGrade(score, hardRisks) {
  const directC = hardRisks.some((risk) => risk.text.includes("亏损风险高") && score < 60);
  if (directC || score < 60) return "C级";
  if (score >= 90) return "S级";
  if (score >= 75) return "A级";
  return "B级";
}

function buildRisks(data, dimensions, hardRisks, margin) {
  const risks = [...hardRisks];
  Object.values(dimensions).forEach((dimension) => {
    if (dimension.color === "red") {
      risks.push({ level: "red", text: `${dimension.name}低分：${dimension.reasons[0]}` });
    } else if (dimension.color === "yellow") {
      risks.push({ level: "yellow", text: `${dimension.name}需优化：${dimension.reasons[0]}` });
    }
  });
  if (margin !== null && margin >= 0.45) risks.push({ level: "green", text: `毛利约 ${Math.round(margin * 100)}%，具备进一步设计档位的基础。` });
  if (data.prototype === "engineering" || data.prototype === "production") risks.push({ level: "green", text: "已有可演示或量产样机，可放大为信任背书。" });
  if (data.trafficResources === "full") risks.push({ level: "green", text: "预热资源较完整，可设计上线 72 小时冲量。" });
  return risks.slice(0, 9);
}

function getMissingItems(data) {
  const missing = [];
  const checks = [
    ["产品名称", data.productName],
    ["产品说明", data.description || data.ideaInput],
    ["海外痛点与差异化", data.painPoint],
    ["样机状态", data.prototype],
    ["认证计划", data.certification],
    ["BOM 成本", data.bomCost],
    ["早鸟价", data.earlyBirdPrice],
    ["物流税费", data.shippingCost],
    ["筹款目标", data.fundingGoal],
    ["视频与页面素材", data.videoStatus || getFileEvidence(data).hasPresentation],
    ["实测与背书素材", data.proofAssets],
    ["流量资源", data.trafficResources],
    ["工厂与交付", data.factoryStatus],
    ["竞品链接", data.competitors],
  ];
  checks.forEach(([label, value]) => {
    if (!String(value || "").trim()) missing.push(label);
  });
  if (selectedStage === "rescue" && !hasText(data.launchData, 20)) missing.push("上线数据");
  if (selectedStage === "fulfillment" && !hasText(data.fulfillmentData, 20)) missing.push("筹后履约数据");
  if (selectedStage === "selection" && !hasText(data.supplyChain, 20)) missing.push("供应链与选品条件");
  return missing;
}

function getPriorities(data, dimensions, hardRisks, missing) {
  const priorities = [];
  if (missing.length) priorities.push(`先补齐 ${missing.slice(0, 4).join("、")}，否则只能做保守判断。`);
  if (dimensions.hardware.color === "red") priorities.push("补齐工程样机、认证计划、BOM、MOQ、工厂交期，先降低交付风险。");
  if (dimensions.content.color === "red") priorities.push("重做视频前 15 秒和详情页首屏，补拍场景、实测、对比、开箱素材。");
  if (dimensions.traffic.color === "red") priorities.push("建立预热页、邮件池、KOL 清单和上线 72 小时冲量预算。");
  if (dimensions.pricing.color !== "green") priorities.push("重算 Early Bird、Regular、Bundle、Add-on 和美国/欧洲物流税费后的真实毛利。");
  if (dimensions.product.color !== "green") priorities.push("把国内功能介绍改成海外痛点、场景和差异化证明。");
  if (selectedStage === "rescue") priorities.unshift("先拿到访问量、收藏率、转化率、广告 CTR/CPC/CPA 和评论问题，再判断救盘动作。");
  if (selectedStage === "fulfillment") priorities.unshift("先确认生产排期、认证节点、物流方案和 Backer 更新节奏。");
  if (selectedStage === "selection") priorities.unshift("先锁定供应链能力、开发周期、认证难度和可做样机的品类边界。");
  return [...new Set(priorities)].slice(0, 5);
}

function getReadiness(score, hardRisks, missing) {
  if (missing.length >= 8) return { label: "资料不足", text: "资料不足，建议先补充关键资料后再评估。", level: "blocked" };
  if (hardRisks.some((risk) => risk.level === "red")) return { label: "需整改", text: "存在红色硬风险，不建议直接上线。", level: "risk" };
  if (score >= 75) return { label: "可推进", text: "具备推进基础，建议先处理黄色短板。", level: "ready" };
  return { label: "需优化", text: "当前成功率偏低，应先完成关键改进。", level: "watch" };
}

function updateAssessment() {
  const data = getData();
  const assessment = calculateAssessment(data);
  latestLocalAssessment = summarizeLocalAssessment(assessment);
  latestAgentResult = null;
  renderInspector(assessment);
  reportOutput.textContent = generateReport(data, assessment);
  setAgentStatus("当前使用本地规则引擎；点击“开始评估”可生成对话式报告。", "");
}

function renderInspector(assessment) {
  const degrees = Math.round((assessment.total / 100) * 360);
  scoreValue.textContent = assessment.total;
  scoreRing.style.background = `radial-gradient(circle at center, #fff 0 55%, transparent 56%), conic-gradient(var(--accent) ${degrees}deg, #eee7dc ${degrees}deg)`;
  gradeValue.textContent = assessment.grade;
  scoreSummary.textContent = `${assessment.readiness.text} 当前阶段：${stageNames[selectedStage]}。`;
  readinessTag.textContent = assessment.readiness.label;

  priorityList.innerHTML = assessment.priorities.length
    ? assessment.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>填写资料后生成优先改进动作。</li>";

  riskList.innerHTML = assessment.riskItems.length
    ? assessment.riskItems
        .map(
          (risk) => `
          <div class="risk-item risk-${risk.level}">
            <span class="risk-dot"></span>
            <span>${escapeHtml(risk.text)}</span>
          </div>`,
        )
        .join("")
    : `<div class="risk-item"><span class="risk-dot"></span><span>暂无风险判断，等待资料输入。</span></div>`;
}

function generateReport(data, assessment) {
  const dims = Object.values(assessment.dimensions);
  const missingText = assessment.missing.length ? assessment.missing.join("、") : "暂无明显缺失";
  const marginText = assessment.margin === null ? "未能测算" : `${Math.round(assessment.margin * 100)}%`;
  const stage = stages.find((item) => item.id === selectedStage);
  const internalBlock =
    reportMode === "internal"
      ? `

## 服务商内部备注

- 当前优先判断：${assessment.readiness.text}
- 建议销售下一步：先让客户补齐 ${assessment.missing.slice(0, 5).join("、") || "竞品、预算、素材、履约资料"}。
- 建议策划下一步：围绕 ${assessment.priorities[0] || "低分项"} 制定整改任务。`
      : "";

  return `# 海外众筹成功率评估报告

## 1. 客户当前阶段判断

- 当前阶段：${stage.title}
- 本次服务重点：${stage.deliverable}
- 判断依据：根据已填写资料，项目应先完成“评估当前成功率 -> 处理低分项 -> 再推进下一阶段”的流程。

## 2. 已提供资料与缺失资料

- 产品名称：${data.productName || "未提供"}
- 产品品类：${formatCategory(data.category)}
- 目标市场：${formatMarket(data.targetMarket)}
- 样机状态：${formatPrototype(data.prototype)}
- 认证状态：${formatCertification(data.certification)}
- 竞品资料：${hasText(data.competitors, 20) ? "已提供" : "未提供或不足"}
- 客户原始描述：${hasText(data.ideaInput, 10) ? summarizeText(data.ideaInput, 140) : "未提供"}
- 已上传资料：${formatFilesForReport(data.uploadedFiles)}
- 缺失资料：${missingText}
- 资料完整性判断：${assessment.missing.length >= 8 ? "资料不足，只能做初步保守判断。" : "可做初步评估，但仍需补齐关键证据。"}

## 3. 当前成功率判断

- 当前总分：${assessment.total} / 100
- 项目评级：${assessment.grade}
- 成功率档位：${successBand(assessment.total)}
- 是否建议直接启动众筹：${assessment.readiness.level === "ready" ? "可以推进，但建议先优化黄色短板。" : "不建议直接上线，应先完成关键整改。"}
- 预估毛利：${marginText}
- 最大阻碍：${assessment.priorities[0] || "资料不足，暂无法判断最大阻碍。"}
- 最优先改进的 3 件事：
${assessment.priorities
  .slice(0, 3)
  .map((item, index) => `${index + 1}. ${item}`)
  .join("\n")}

## 4. 六大维度评分表

| 维度 | 满分 | 得分 | 风险 | 扣分原因 |
|---|---:|---:|---|---|
${dims.map((item) => `| ${item.name} | ${item.max} | ${item.score} | ${formatRiskColor(item.color)} | ${item.reasons.join("；")} |`).join("\n")}

## 5. 红黄绿风险清单

${formatRiskSection(assessment.riskItems)}

## 6. 成功率低的核心原因

${assessment.priorities.length ? assessment.priorities.map((item, index) => `${index + 1}. ${item}`).join("\n") : "资料不足，暂无法形成稳定结论。"}

## 7. 提升成功率的改进方案

### 产品层
- 将国内功能介绍重写为海外痛点、使用场景和差异化证明。
- 补充竞品对标，明确与 Kickstarter / Indiegogo 同类项目的胜出点。

### 定价层
- 重算 Early Bird、Regular、Bundle、Add-on 档位。
- 将 BOM、物流、关税、平台费、支付费和广告费纳入毛利测算。

### 素材层
- 补拍场景、实测、对比、开箱、耐久测试、工厂和创始人背书。
- 重构视频前 15 秒，先展示痛点和反差，再进入产品解决方案。

### 流量层
- 建立预热页、邮件池、KOL 清单、媒体名单和广告测试节奏。
- 单独设计上线 72 小时冲量计划。

### 履约层
- 补齐工程样机、认证计划、MOQ、工厂产能、交付周期和备选方案。
- 为认证、量产和物流设置交付缓冲。

### 合规层
- 检查平台规则、知识产权、认证、电池运输、售后、退款和客诉机制。

## 8. 当前阶段专属交付物

${stageSpecificOutput(selectedStage)}

## 9. 客户下一步准备清单

${assessment.missing.length ? assessment.missing.slice(0, 8).map((item, index) => `${index + 1}. ${item}`).join("\n") : "1. 补充更详细竞品和素材证据，用于进一步提高判断准确度。"}

## 10. 行动计划

### 未来 7 天
- 补齐缺失资料。
- 完成竞品对标和毛利重算。
- 明确样机、认证、素材和预热的负责人。

### 未来 30 天
- 完成众筹包装方案、视频脚本、详情页结构和素材补拍。
- 建立预热页、邮件池和 KOL / 媒体清单。
- 完成工程样机、认证、工厂交付计划确认。

### 上线前必须确认
- 样机可演示，认证计划明确。
- 价格、运费、关税、平台费和广告费测算完整。
- 视频、页面、FAQ、风险说明和售后政策完整。
- 上线 72 小时流量计划已经排期。
${internalBlock}
`;
}

async function handleFiles(event) {
  const files = await Promise.all([...event.target.files].map(fileToRecord));
  uploadedFiles = mergeFiles(uploadedFiles, files);
  renderFiles();
  showToast(`已加入 ${files.length} 个附件`);
  event.target.value = "";
}

async function fileToRecord(file) {
  const ext = getFileExt(file.name);
  const record = {
    name: file.name,
    type: file.type || inferTypeFromName(file.name),
    size: file.size,
    ext,
    previewUrl: "",
    textPreview: "",
  };

  if (isImageFile(record) && file.size <= 6 * 1024 * 1024) {
    record.previewUrl = URL.createObjectURL(file);
    record.dataUrl = await fileToDataUrl(file);
  }

  if (isPlainTextFile(record) && file.size <= 512 * 1024) {
    record.textPreview = summarizeText(await file.text(), 800);
  }

  return record;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function clearFiles() {
  uploadedFiles = [];
  renderFiles();
  showToast("已清空附件");
}

function renderFiles() {
  const fileList = document.querySelector("#fileList");
  if (!uploadedFiles.length) {
    fileList.innerHTML = `<div class="empty-files">尚未上传资料</div>`;
    return;
  }
  fileList.innerHTML = uploadedFiles
    .map(
      (file) => `
      <div class="file-item">
        ${
          file.previewUrl
            ? `<img class="file-thumb" src="${file.previewUrl}" alt="" />`
            : `<span class="file-icon">${escapeHtml(file.ext || "FILE")}</span>`
        }
        <span>
          <span class="file-name">${escapeHtml(file.name)}</span>
          <span class="file-meta">${escapeHtml(formatFileKind(file))} · ${formatFileSize(file.size)}</span>
          ${file.textPreview ? `<span class="file-preview">${escapeHtml(file.textPreview)}</span>` : ""}
        </span>
      </div>`,
    )
    .join("");
}

function mergeFiles(existing, next) {
  const seen = new Set(existing.map((file) => `${file.name}-${file.size}`));
  const merged = [...existing];
  next.forEach((file) => {
    const key = `${file.name}-${file.size}`;
    if (!seen.has(key)) merged.push(file);
  });
  return merged.slice(0, 20);
}

function analyzeIdea() {
  const text = document.querySelector("#ideaInput").value.trim();
  if (!text && !uploadedFiles.length) {
    showToast("请先输入客户想法或上传资料");
    return;
  }

  const inferred = inferFromIdea(text, uploadedFiles);
  selectedStage = inferred.stage;
  renderStages();
  updateStageFields();

  Object.entries(inferred.fields).forEach(([key, value]) => {
    const element = form.elements[key];
    if (element && !element.value && value) element.value = value;
  });

  updateAssessment();
  showToast("已根据描述生成初评");
}

async function runAgentAssessment() {
  const button = document.querySelector("#runAgentBtn");
  const data = getData();
  const assessment = calculateAssessment(data);
  latestLocalAssessment = summarizeLocalAssessment(assessment);

  if (!hasText(data.ideaInput, 10) && assessment.missing.length >= 10) {
    showToast("请先输入客户想法或上传资料");
    return;
  }

  button.classList.add("is-loading");
  button.textContent = "评估中...";
  setAgentStatus("AI 智能体正在读取描述和附件摘要，生成结构化评估。", "");

  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: sanitizeProjectPayload(data),
        files: sanitizeFilesForAgent(uploadedFiles),
        localAssessment: latestLocalAssessment,
      }),
    });
    const result = await response.json();
    if (!result.ok) {
      setAgentStatus(result.error || "AI 智能体暂不可用，已保留本地规则报告。", "error");
      showToast("AI 暂不可用，已保留本地报告");
      return null;
    }
    latestAgentResult = result.result;
    renderAgentResult(result.result);
    setAgentStatus(`AI 智能体评估完成 · 模型：${result.model || "OpenAI"}`, "success");
    showToast("评估完成");
    return result.result.reportMarkdown;
  } catch (error) {
    setAgentStatus("AI 智能体请求失败，已保留本地规则报告。", "error");
    showToast("AI 请求失败");
    return null;
  } finally {
    button.classList.remove("is-loading");
    button.textContent = "开始评估";
  }
}

function renderAgentResult(result) {
  scoreValue.textContent = result.score;
  const degrees = Math.round((Number(result.score || 0) / 100) * 360);
  scoreRing.style.background = `radial-gradient(circle at center, #fff 0 55%, transparent 56%), conic-gradient(var(--accent) ${degrees}deg, #eee7dc ${degrees}deg)`;
  gradeValue.textContent = result.grade;
  scoreSummary.textContent = result.summary;
  readinessTag.textContent = result.canLaunch.includes("不建议") ? "需整改" : "可推进";
  priorityList.innerHTML = (result.topBlockers || [])
    .slice(0, 5)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  riskList.innerHTML = (result.risks || [])
    .slice(0, 8)
    .map(
      (risk) => `
      <div class="risk-item risk-${riskLevelToClass(risk.level)}">
        <span class="risk-dot"></span>
        <span>${escapeHtml(risk.text)}</span>
      </div>`,
    )
    .join("");
  reportOutput.textContent = result.reportMarkdown;
}

async function submitConversation() {
  const text = document.querySelector("#ideaInput").value.trim();
  if (!text && !uploadedFiles.length) {
    showToast("请先输入想法或上传资料");
    return;
  }

  addMessage("user", formatUserMessage(text, uploadedFiles));
  inferAndFillFromConversation(text);
  const data = getData();
  const localAssessment = calculateAssessment(data);
  latestLocalAssessment = summarizeLocalAssessment(localAssessment);
  const localReport = generateReport(data, localAssessment);
  reportOutput.textContent = localReport;

  addMessage("assistant", "我已收到资料，正在评估项目阶段、成功率和关键风险。", { loading: true });
  const aiReport = await runAgentAssessment();
  removeLoadingMessage();

  const finalReport = aiReport || localReport;
  reportOutput.textContent = finalReport;
  addMessage("assistant", finalReport, { report: true });
  document.querySelector("#ideaInput").value = "";
}

function inferAndFillFromConversation(text) {
  const inferred = inferFromIdea(text, uploadedFiles);
  selectedStage = inferred.stage;
  renderStages();
  updateStageFields();
  Object.entries(inferred.fields).forEach(([key, value]) => {
    const element = form.elements[key];
    if (element && value) element.value = value;
  });
}

function formatUserMessage(text, files) {
  const fileSummary = files.length
    ? `\n\n已上传资料：${files.map((file) => `${file.name}（${formatFileKind(file)}）`).join("；")}`
    : "";
  return `${text || "已上传资料，请基于附件先做初步判断。"}${fileSummary}`;
}

function addMessage(role, content, options = {}) {
  const article = document.createElement("article");
  article.className = `chat-message ${role}${options.loading ? " loading-message" : ""}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "客户" : "顾问";
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (options.report) {
    const pre = document.createElement("pre");
    pre.textContent = content;
    bubble.appendChild(pre);
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML = `
      <button class="ghost-btn" type="button" data-action="copy-latest">复制报告</button>
      <button class="ghost-btn" type="button" data-action="download-latest">下载 Markdown</button>
    `;
    bubble.appendChild(actions);
  } else {
    const paragraph = document.createElement("p");
    paragraph.textContent = content;
    bubble.appendChild(paragraph);
  }

  article.appendChild(avatar);
  article.appendChild(bubble);
  chatMessages.appendChild(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeLoadingMessage() {
  document.querySelector(".loading-message")?.remove();
}

function riskLevelToClass(level) {
  if (level === "红色") return "red";
  if (level === "黄色") return "yellow";
  return "green";
}

function sanitizeProjectPayload(data) {
  const clone = { ...data };
  clone.uploadedFiles = undefined;
  return clone;
}

function sanitizeFilesForAgent(files) {
  return files.slice(0, 20).map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    ext: file.ext,
    kind: formatFileKind(file),
    textPreview: file.textPreview || "",
    dataUrl: file.dataUrl && isImageFile(file) ? file.dataUrl : "",
  }));
}

function summarizeLocalAssessment(assessment) {
  return {
    total: assessment.total,
    grade: assessment.grade,
    readiness: assessment.readiness,
    missing: assessment.missing,
    priorities: assessment.priorities,
    margin: assessment.margin,
    dimensions: Object.values(assessment.dimensions).map((dimension) => ({
      name: dimension.name,
      score: dimension.score,
      max: dimension.max,
      color: dimension.color,
      reasons: dimension.reasons,
    })),
    hardRisks: assessment.hardRisks,
  };
}

function setAgentStatus(message, type) {
  agentStatus.textContent = message;
  agentStatus.classList.toggle("success", type === "success");
  agentStatus.classList.toggle("error", type === "error");
}

function inferFromIdea(text, files) {
  const lower = text.toLowerCase();
  const fields = {};
  let stage = selectedStage;

  if (matchAny(text, ["上线", "已经上", "转化", "广告", "筹了", "backer", "救盘"]) && matchAny(text, ["不好", "差", "低", "没起量", "花了"])) {
    stage = "rescue";
  } else if (matchAny(text, ["众筹成功", "已经成功", "延期", "发货", "履约", "生产", "backer更新", "客诉"])) {
    stage = "fulfillment";
  } else if (matchAny(text, ["还没有产品", "找产品", "选品", "供应链", "工厂能力", "开发方向"])) {
    stage = "selection";
  } else if (matchAny(text, ["准备上线", "草稿页", "页面", "视频", "两周后", "上线前"])) {
    stage = "prelaunch";
  } else if (matchAny(text, ["样品", "样机", "ppt", "包装", "怎么表达", "怎么包装"]) || files.some(isPresentationFile)) {
    stage = "packaging";
  } else {
    stage = "evaluation";
  }

  fields.description = text;
  if (!fields.productName) fields.productName = extractProductName(text);
  if (matchAny(text, ["露营", "户外", "储能", "便携电源", "营地"])) fields.category = "outdoor";
  else if (matchAny(text, ["宠物", "猫", "狗", "喂食"])) fields.category = "pet";
  else if (matchAny(text, ["智能", "电子", "diy", "机器人", "硬件"])) fields.category = "smart-hardware";
  else if (matchAny(text, ["小家电", "家居", "厨房"])) fields.category = "home";
  else if (matchAny(text, ["工具", "桌面", "效率"])) fields.category = "tool";

  if (matchAny(text, ["美国", "北美"])) fields.targetMarket = "us";
  else if (matchAny(text, ["欧洲", "欧盟", "德国", "法国"])) fields.targetMarket = "eu";
  else if (matchAny(text, ["日本"])) fields.targetMarket = "jp";
  else if (matchAny(text, ["欧美", "海外"])) fields.targetMarket = "global";

  if (matchAny(text, ["渲染图", "效果图"])) fields.prototype = "render";
  else if (matchAny(text, ["外观样机"])) fields.prototype = "appearance";
  else if (matchAny(text, ["工程样机", "可演示", "功能样机"])) fields.prototype = "engineering";
  else if (matchAny(text, ["量产", "试产", "小批量"])) fields.prototype = "production";

  if (matchAny(text, ["没有认证", "无认证"])) fields.certification = "none";
  else if (matchAny(text, ["认证计划", "fcc", "ce", "ul"])) fields.certification = "planned";
  else if (matchAny(text, ["认证中", "测试中"])) fields.certification = "testing";
  else if (matchAny(text, ["认证完成", "已认证"])) fields.certification = "done";

  const bom = extractMoney(text, ["bom", "成本"]);
  const price = extractMoney(text, ["早鸟", "售价", "价格"]);
  const budget = extractMoney(text, ["预算", "广告"]);
  const goal = extractMoney(text, ["目标", "筹款"]);
  if (bom) fields.bomCost = bom;
  if (price) fields.earlyBirdPrice = price;
  if (budget) fields.adBudget = budget;
  if (goal) fields.fundingGoal = goal;

  if (files.some(isPresentationFile)) fields.videoStatus = "ppt";
  if (files.some(isImageFile)) fields.proofAssets = "basic";
  if (matchAny(text, ["视频", "页面"])) fields.videoStatus = "draft";
  if (matchAny(text, ["实拍", "实测", "对比", "测评"])) fields.proofAssets = "scenario";
  if (matchAny(text, ["邮件池", "预热页", "kol", "媒体"])) fields.trafficResources = "prelaunch";
  else if (matchAny(text, ["几个kol", "少量kol", "社媒"])) fields.trafficResources = "some-kol";

  if (matchAny(text, ["无众筹经验"])) fields.teamExperience = "none";
  else if (matchAny(text, ["服务商", "你们介入"])) fields.teamExperience = "service";
  if (matchAny(text, ["工厂", "产能", "moq", "交期"])) fields.factoryStatus = "basic";

  return { stage, fields };
}

function stageSpecificOutput(stage) {
  const outputs = {
    evaluation: "- 输出可行性评估、当前成功率、六大维度评分、是否建议推进、优先改进事项。",
    packaging: "- 输出海外卖点重塑、众筹标题与副标题、视频脚本、详情页框架、档位设计、素材补拍清单。",
    prelaunch: "- 输出上线前审核清单、视频前 15 秒修改建议、首屏和转化路径修改、价格与档位审核、上线 72 小时冲量方案。",
    rescue: "- 先补齐访问量、收藏率、转化率、广告 CTR/CPC/CPA 和评论问题，再输出页面、价格、素材、流量救盘动作。",
    fulfillment: "- 输出生产排期、认证和物流排查、Backer 更新节奏、延期说明模板、客诉处理方案、私域和复购承接。",
    selection: "- 输出适合众筹的品类方向、工厂能力匹配、开发周期、认证难度、差异化机会和优先验证方向。",
  };
  return outputs[stage];
}

function formatRiskSection(risks) {
  const groups = {
    red: risks.filter((risk) => risk.level === "red"),
    yellow: risks.filter((risk) => risk.level === "yellow"),
    green: risks.filter((risk) => risk.level === "green"),
  };
  return `### 红色风险
${groups.red.length ? groups.red.map((risk) => `- ${risk.text}`).join("\n") : "- 暂未识别，但仍需人工复核。"}

### 黄色风险
${groups.yellow.length ? groups.yellow.map((risk) => `- ${risk.text}`).join("\n") : "- 暂未识别。"}

### 绿色优势
${groups.green.length ? groups.green.map((risk) => `- ${risk.text}`).join("\n") : "- 暂未形成明确优势。"}
`;
}

function successBand(score) {
  if (score >= 85) return "高";
  if (score >= 65) return "中";
  return "低";
}

function formatRiskColor(color) {
  return color === "green" ? "绿色" : color === "yellow" ? "黄色" : "红色";
}

function formatCategory(value) {
  const map = {
    outdoor: "户外 / 露营 / 储能",
    "smart-hardware": "智能硬件 / 电子 DIY",
    pet: "宠物用品",
    home: "小家电 / 家居工具",
    tool: "小工具 / 桌面效率",
    creative: "文创 / 漫画 / 游戏周边",
    fashion: "服饰 / 白标消费品",
    other: "其他",
  };
  return map[value] || "未提供";
}

function formatMarket(value) {
  const map = { us: "美国", eu: "欧洲", jp: "日本", global: "欧美为主", unknown: "未明确" };
  return map[value] || "未提供";
}

function formatPrototype(value) {
  const map = { render: "仅渲染图", appearance: "外观样机", engineering: "可演示工程样机", production: "小批量试产 / 量产样机" };
  return map[value] || "未提供";
}

function formatCertification(value) {
  const map = { none: "无认证计划", planned: "已规划认证", testing: "认证测试中", done: "关键认证已完成", "not-needed": "暂不涉及强制认证" };
  return map[value] || "未提供";
}

function matchAny(text, keywords) {
  const value = String(text || "").toLowerCase();
  return keywords.some((keyword) => value.includes(String(keyword).toLowerCase()));
}

function extractProductName(text) {
  const value = String(text || "").trim();
  const patterns = [
    /(?:产品|项目|有一款|有一个|做一个|做一款)(?:叫|是|：|:)?\s*([A-Za-z0-9\u4e00-\u9fa5]{2,18})/,
    /([A-Za-z0-9\u4e00-\u9fa5]{2,18})(?:，|,|。).*?(?:Kickstarter|众筹|出海)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1].replace(/[，。,.]/g, "");
  }
  return "";
}

function extractMoney(text, anchors) {
  const value = String(text || "");
  for (const anchor of anchors) {
    const pattern = new RegExp(`${anchor}[^0-9$￥¥]{0,12}(?:[$￥¥])?\\s*(\\d+(?:\\.\\d+)?)\\s*(万|w|k|千|美金|美元|usd)?`, "i");
    const match = value.match(pattern);
    if (match) {
      let amount = Number(match[1]);
      const unit = String(match[2] || "").toLowerCase();
      if (unit === "万" || unit === "w") amount *= 10000;
      if (unit === "k" || unit === "千") amount *= 1000;
      return String(Math.round(amount));
    }
  }
  return "";
}

function summarizeText(text, maxLength) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function getFileEvidence(data) {
  const files = data.uploadedFiles || [];
  return {
    hasPresentation: files.some(isPresentationFile),
    hasImage: files.some(isImageFile),
    hasDocument: files.some(isDocumentFile),
    contentBonus: Math.min(
      3,
      (files.some(isPresentationFile) ? 1 : 0) +
        (files.some(isImageFile) ? 1 : 0) +
        (files.some(isDocumentFile) ? 1 : 0),
    ),
  };
}

function formatFilesForReport(files = []) {
  if (!files.length) return "未上传";
  return files
    .map((file) => {
      const preview = file.textPreview ? `，摘要：${file.textPreview}` : "";
      return `${file.name}（${formatFileKind(file)}，${formatFileSize(file.size)}${preview}）`;
    })
    .join("；");
}

function getFileExt(name) {
  const ext = String(name || "").split(".").pop();
  return ext && ext !== name ? ext.slice(0, 5).toUpperCase() : "FILE";
}

function inferTypeFromName(name) {
  const ext = getFileExt(name).toLowerCase();
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
  };
  return map[ext] || "application/octet-stream";
}

function formatFileKind(file) {
  if (isImageFile(file)) return "图片";
  if (isPresentationFile(file)) return "PPT";
  if (String(file.ext).toLowerCase() === "pdf") return "PDF";
  if (isSpreadsheetFile(file)) return "表格";
  if (isDocumentFile(file)) return "文档";
  return "资料";
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImageFile(file) {
  return String(file.type || "").startsWith("image/");
}

function isPresentationFile(file) {
  const ext = String(file.ext || "").toLowerCase();
  return ext === "ppt" || ext === "pptx" || String(file.type || "").includes("presentation");
}

function isSpreadsheetFile(file) {
  const ext = String(file.ext || "").toLowerCase();
  return ["xls", "xlsx", "csv"].includes(ext) || String(file.type || "").includes("spreadsheet");
}

function isDocumentFile(file) {
  const ext = String(file.ext || "").toLowerCase();
  return ["pdf", "doc", "docx", "txt", "md"].includes(ext) || String(file.type || "").includes("pdf") || String(file.type || "").includes("word");
}

function isPlainTextFile(file) {
  const ext = String(file.ext || "").toLowerCase();
  return ["txt", "md", "csv"].includes(ext) || String(file.type || "").startsWith("text/");
}

function loadDemo() {
  selectedStage = "packaging";
  renderStages();
  updateStageFields();
  document.querySelector("#ideaInput").value =
    "我们有一个智能露营灯，已经有外观样机和中文PPT，想做 Kickstarter，目标市场美国。BOM 大概 28 美金，早鸟价 69 美金，预算 2 万美金，有几个户外 KOL 可以联系，但还没有拍视频。";
  uploadedFiles = [
    { name: "智能露营灯_产品介绍.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", size: 2400000, ext: "PPTX" },
    { name: "外观样机_营地场景.jpg", type: "image/jpeg", size: 860000, ext: "JPG" },
  ];
  renderFiles();
  const demo = {
    productName: "LumaCamp 智能露营灯",
    category: "outdoor",
    targetMarket: "us",
    description: "一款面向美国露营用户的多功能营地灯，集照明、移动电源、蓝牙音箱和 SOS 提醒于一体，目前有外观样机和中文 PPT。",
    painPoint: "夜间露营经常遇到照明不足、手机没电、营地氛围弱、紧急情况下缺少可见求救提醒等问题。产品希望用一个设备覆盖夜间照明、应急供电和营地氛围。",
    prototype: "appearance",
    certification: "planned",
    bomCost: "28",
    earlyBirdPrice: "69",
    shippingCost: "12",
    fundingGoal: "30000",
    videoStatus: "ppt",
    proofAssets: "basic",
    adBudget: "20000",
    trafficResources: "some-kol",
    factoryStatus: "basic",
    teamExperience: "service",
    competitors: "参考：Kickstarter 露营灯、便携电源、户外蓝牙音箱类项目，待补充具体链接。",
  };
  Object.entries(demo).forEach(([key, value]) => {
    const element = form.elements[key];
    if (element) element.value = value;
  });
  updateAssessment();
  showToast("已载入示例项目");
}

function resetForm() {
  form.reset();
  document.querySelector("#ideaInput").value = "";
  uploadedFiles = [];
  renderFiles();
  selectedStage = "evaluation";
  renderStages();
  updateStageFields();
  updateAssessment();
  showToast("已清空");
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportOutput.textContent);
    showToast("报告已复制");
  } catch (error) {
    showToast("复制失败，请手动选择报告");
  }
}

function downloadReport() {
  const blob = new Blob([reportOutput.textContent], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const data = getData();
  a.href = url;
  a.download = `${data.productName || "crowdfunding-report"}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
