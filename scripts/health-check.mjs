import { existsSync, readFileSync } from "node:fs";

const port = Number(process.env.PORT || 4173);
const baseUrl = process.env.APP_URL || readServerUrl() || `http://localhost:${port}`;

function readServerUrl() {
  if (!existsSync(".agent-server.json")) return "";
  try {
    const state = JSON.parse(readFileSync(".agent-server.json", "utf8"));
    return state.url || "";
  } catch {
    return "";
  }
}

const checks = [
  {
    name: "Frontend",
    run: async () => {
      const response = await fetch(baseUrl);
      return response.ok ? `OK ${response.status}` : `FAIL ${response.status}`;
    },
  },
  {
    name: "Agent API",
    run: async () => {
      const response = await fetch(`${baseUrl}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: { ideaInput: "健康检查：智能宠物喂食器样品，想做 Kickstarter。" },
          files: [],
          localAssessment: { total: 50 },
        }),
      });
      const data = await response.json();
      if (data.ok) return `OK model=${data.model}`;
      if (data.fallback) return `OK fallback=${data.error}`;
      return `FAIL ${data.error || "unknown error"}`;
    },
  },
];

for (const check of checks) {
  try {
    console.log(`${check.name}: ${await check.run()}`);
  } catch (error) {
    console.log(`${check.name}: FAIL ${error instanceof Error ? error.message : String(error)}`);
  }
}
