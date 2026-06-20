# 海外众筹成功率提升智能体

> Commercial use: this repository is published for portfolio/demo evaluation. Commercial use or resale requires written permission. See `COMMERCIAL_USE.md`.


这是一套“对话式网页 App + 无代码智能体资料包”，用于评估 Kickstarter / Indiegogo 海外众筹项目的成功率，并输出改进方案。

智能体目标不是单纯生成报告，而是帮助客户提高 Kickstarter / Indiegogo 众筹成功率。客户只需要在对话框里输入产品想法，再上传图片、PPT、PDF、文档等资料；系统会判断客户阶段、评估当前成功率，并以对话形式输出可以执行的改进方案。

当前版本的文件上传会把图片、TXT、Markdown、CSV 的可读摘要交给智能体；PPT、PDF、Word、Excel 先作为附件证据进入评估，暂不强行读取正文。视频资料暂不作为重点处理，后续可以再接入视频转写、关键帧抽取和文档解析。

## 当前交互能力

- 前端只保留一个对话框和一个资料上传入口。
- 客户可以输入产品想法、当前进度和困惑。
- 可以上传图片、PPT、PDF、Word、Excel、CSV、TXT、Markdown。
- 图片会在本地显示缩略图。
- TXT、Markdown、CSV 会在本地读取摘要并写入报告。
- PPT、PDF、Word、Excel 当前作为附件证据进入资料清单，暂不读取正文。
- 配置 `OPENAI_API_KEY` 后，点击“开始评估”，由后端智能体读取客户描述、图片和附件摘要，生成结构化评估报告。
- API 同时支持官方 OpenAI Responses API 和 OpenAI 兼容 Chat Completions 网关。
- 视频暂不重点处理，后续再单独接入视频转写或关键帧分析。

## 后续 AI 版本方向

- 接入模型 API，自动读取客户上传的 PPT、PDF、图片和产品文档。
- 自动抽取产品功能、BOM、价格、认证、交付、竞品和素材信息。
- 支持多轮对话追问缺失资料。
- 将评估报告从规则模板升级为 AI 生成的客户版咨询报告。
- 增加项目历史记录、团队协作和 Vercel 后端存储。

## 文件结构

- `index.html`：可部署到 Vercel 的交互式评估网页。
- `styles.css`：网页样式。
- `app.js`：本地规则引擎、对话初评、附件清单和报告生成逻辑。
- `package.json`：本地启动和检查命令。
- `scripts/start-local.sh`：一键本地启动脚本。
- `scripts/check.sh`：静态检查脚本。
- `agent/master-prompt.md`：可直接复制的主提示词。
- `agent/scoring-rules.md`：100 分评估体系、硬风险规则、评分口径。
- `templates/stage-input-templates.md`：六类客户阶段的输入模板。
- `templates/report-output-template.md`：客户报告输出结构。
- `knowledge-base/case-knowledge-framework.md`：公众号、竞品和历史项目知识库整理框架。
- `tests/test-cases.md`：测试用例，用来检查智能体是否按预期工作。
- `examples/sample-run.md`：一份示例输入和示例输出，方便团队理解报告颗粒度。

## 本地运行

一键启动：

```bash
npm run start:agent
```

macOS 也可以直接双击：

```text
启动众筹评估智能体.command
```

首次启动会自动创建 `.env.local`。如果使用官方 OpenAI，请打开 `.env.local` 填入：

```text
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
```

如果使用 Yunwu 等 OpenAI 兼容网关，请使用：

```text
OPENAI_API_KEY=你的网关 Key
OPENAI_BASE_URL=https://yunwu.ai/v1
OPENAI_MODEL=gpt-4o
OPENAI_API_STYLE=chat
```

启动脚本会自动加载 `.env.local`，并从 `4173` 开始寻找可用端口。

当前 API 部署状态：

- 本地 API 路由：`/api/agent`
- 本地健康检查：`npm run health`
- 未配置 `OPENAI_API_KEY` 时，API 会返回 fallback，前端继续使用本地规则引擎。
- 配置 `OPENAI_API_KEY` 后，“开始评估”会调用 AI 模型生成结构化报告。

开发启动：

```bash
npm run dev
```

默认打开：

```text
http://localhost:4173
```

如需临时用命令行环境运行 AI 智能体，可以先设置环境变量：

```bash
export OPENAI_API_KEY=你的 OpenAI API Key
export OPENAI_MODEL=gpt-4.1-mini
npm run dev
```

未设置 `OPENAI_API_KEY` 时，网页仍可使用本地规则评估；点击“开始评估”会提示后端未配置 Key 并返回本地规则报告。

如果端口被占用，可以指定端口：

```bash
PORT=4180 npm run dev
```

## 检查

```bash
npm run check
```

启动服务后，可以运行：

```bash
npm run health
```

它会检查前端页面和 `/api/agent` 是否可用。

## Vercel 部署

项目包含静态前端和 Vercel Serverless API。没有配置 API Key 时，前端仍可用本地规则引擎；配置 API Key 后可运行 AI 智能体。

推荐流程：

1. 将本目录推到 GitHub 仓库。
2. 在 Vercel 选择 `New Project`。
3. 导入该仓库。
4. Framework Preset 选择 `Other`。
5. Build Command 留空或不设置。
6. Output Directory 留空。
7. 在 Vercel 项目环境变量里添加官方 OpenAI 配置：

```text
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
```

或添加 OpenAI 兼容网关配置：

```text
OPENAI_API_KEY=你的网关 Key
OPENAI_BASE_URL=https://yunwu.ai/v1
OPENAI_MODEL=gpt-4o
OPENAI_API_STYLE=chat
```

8. 部署完成后即可分享链接给客户或团队使用。

## AI 智能体接口

```text
POST /api/agent
```

输入：

- 客户原始描述
- 当前表单字段
- 本地规则引擎初评
- 图片 Data URL
- 文本文档摘要
- PPT/PDF/Word/Excel 文件名、类型和大小

输出：

- 客户阶段
- 成功率评分
- S/A/B/C 评级
- 红黄绿风险
- 缺失资料追问
- 六大维度改进方案
- Markdown 客户报告

## 无代码智能体使用方式

1. 在 Claude、豆包、Coze、GPTs 或企业内部平台新建智能体。
2. 将 `agent/quick-copy-prompt.md` 或 `agent/master-prompt.md` 作为系统提示词。
3. 将 `agent/scoring-rules.md`、`templates/stage-input-templates.md`、`templates/report-output-template.md` 作为知识库或长期上下文。
4. 后续逐步把公众号文章、过往项目案例、KS/IGG 项目拆解整理进 `knowledge-base/case-knowledge-framework.md`。
5. 用 `tests/test-cases.md` 检查输出是否稳定。

## 第一版边界

- 适用于硬件创新类产品的海外众筹评估、改进、包装、上线、救盘和筹后履约。
- 默认面向 Kickstarter 和 Indiegogo，目标市场以欧美为主。
- 不承诺众筹一定成功，只输出成功率判断、风险诊断和提升方案。
- 对未验证来源的公众号或案例内容，只能作为待学习素材，不能作为事实依据写入客户报告。
