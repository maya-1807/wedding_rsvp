const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data");
const CALLS_LOG = path.join(DATA_DIR, "nlpearl-call-webhooks.jsonl");
const LEADS_LOG = path.join(DATA_DIR, "nlpearl-lead-webhooks.jsonl");

fs.mkdirSync(DATA_DIR, { recursive: true });

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function appendWebhook(logFile, payload) {
  const line = JSON.stringify({
    receivedAt: new Date().toISOString(),
    payload
  }) + "\n";

  fs.appendFile(logFile, line, (error) => {
    if (error) {
      console.error(`Failed to write webhook log: ${logFile}`, error);
    }
  });
}

function handleNlpPearlWebhook(logFile, webhookType, req, res) {
  parseJsonBody(req)
    .then((payload) => {
      appendWebhook(logFile, payload);

      console.log(`[${new Date().toISOString()}] ${webhookType} webhook`, {
        id: payload.id,
        pearlId: payload.pearlId,
        leadId: payload.leadId,
        status: payload.status,
        conversationStatus: payload.conversationStatus
      });

      // NLPearl expects a fast 200 OK acknowledgment.
      sendJson(res, 200, { ok: true });
    })
    .catch((error) => {
      console.error(`${webhookType} webhook error`, error.message);
      sendJson(res, 400, { ok: false, error: error.message });
    });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/webhooks/nlpearl/call") {
    handleNlpPearlWebhook(CALLS_LOG, "call", req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/webhooks/nlpearl/lead") {
    handleNlpPearlWebhook(LEADS_LOG, "lead", req, res);
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Webhook server listening on http://${HOST}:${PORT}`);
  console.log(`Call webhook: http://${HOST}:${PORT}/webhooks/nlpearl/call`);
  console.log(`Lead webhook: http://${HOST}:${PORT}/webhooks/nlpearl/lead`);
});
