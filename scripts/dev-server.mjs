import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import agentHandler from "../api/agent.js";

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
loadLocalEnv(root);
const preferredPort = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/api/agent") {
      patchVercelResponse(response);
      return agentHandler(request, response);
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(root, safePath);
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  } catch (error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function patchVercelResponse(response) {
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.json = (data) => {
    if (!response.headersSent) {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    response.end(JSON.stringify(data));
  };
}

const port = await listenWithFallback(server, preferredPort);
writeServerState(port);

console.log("海外众筹成功率提升智能体");
console.log(`Local URL: http://localhost:${port}`);
console.log(`API: http://localhost:${port}/api/agent`);
console.log(`OpenAI API: ${process.env.OPENAI_API_KEY ? "configured" : "not configured, local rule fallback enabled"}`);
console.log("Press Ctrl+C to stop.");

function loadLocalEnv(projectRoot) {
  for (const filename of [".env.local", ".env"]) {
    const filePath = join(projectRoot, filename);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

function writeServerState(port) {
  const state = {
    port,
    host,
    url: `http://localhost:${port}`,
    apiUrl: `http://localhost:${port}/api/agent`,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(join(root, ".agent-server.json"), `${JSON.stringify(state, null, 2)}\n`);
}

function listenWithFallback(serverInstance, startPort) {
  return new Promise((resolve, reject) => {
    const tryListen = (candidatePort, attemptsLeft) => {
      const onError = (error) => {
        serverInstance.off("listening", onListening);
        if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
          tryListen(candidatePort + 1, attemptsLeft - 1);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        serverInstance.off("error", onError);
        resolve(candidatePort);
      };
      serverInstance.once("error", onError);
      serverInstance.once("listening", onListening);
      serverInstance.listen(candidatePort, host);
    };
    tryListen(startPort, 20);
  });
}

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
