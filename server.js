const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data");
const CALLS_LOG = path.join(DATA_DIR, "nlpearl-call-webhooks.jsonl");
const LEADS_LOG = path.join(DATA_DIR, "nlpearl-lead-webhooks.jsonl");
const GUESTS_CSV = path.join(DATA_DIR, "guests.csv");

const GUEST_COLUMNS = [
  "guest_id",
  "first_name",
  "last_name",
  "phone_number",
  "email",
  "max_guests",
  "invite_group",
  "notes",
  "nlpearl_external_id",
  "nlpearl_lead_id",
  "last_call_id",
  "lead_status",
  "call_status",
  "conversation_status",
  "attending",
  "rsvp_status",
  "guest_count",
  "meal_choice",
  "song_request",
  "dietary_restrictions",
  "follow_up_required",
  "follow_up_date",
  "airtable_record_id",
  "rsvp_notes",
  "last_summary",
  "last_updated_at",
  "raw_collected_data"
];

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(GUESTS_CSV)) {
  fs.writeFileSync(
    GUESTS_CSV,
    [
      GUEST_COLUMNS.join(","),
      [
        "guest-001",
        "Sarah",
        "Cohen",
        "+14155550101",
        "sarah@example.com",
        "2",
        "Cohen Family",
        "",
        "guest-001",
        "",
        "",
        "New",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ].join(","),
      [
        "guest-002",
        "David",
        "Levi",
        "+14155550102",
        "david@example.com",
        "1",
        "Levi Family",
        "",
        "guest-002",
        "",
        "",
        "New",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ].join(",")
    ].join("\n") + "\n"
  );
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
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

function csvEscape(value) {
  const stringValue = value == null ? "" : String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function loadGuests() {
  const raw = fs.readFileSync(GUESTS_CSV, "utf8").trim();

  if (!raw) {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    const guest = {};

    headers.forEach((header, index) => {
      guest[header] = values[index] || "";
    });

    return guest;
  });
}

function saveGuests(guests) {
  const lines = [GUEST_COLUMNS.join(",")];

  for (const guest of guests) {
    lines.push(GUEST_COLUMNS.map((column) => csvEscape(guest[column] || "")).join(","));
  }

  fs.writeFileSync(GUESTS_CSV, lines.join("\n") + "\n");
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["yes", "true", "attending", "confirmed"].includes(normalized)) {
      return "yes";
    }

    if (["no", "false", "declined", "not attending"].includes(normalized)) {
      return "no";
    }
  }

  return value == null ? "" : String(value);
}

function stringifyCollectedData(collectedData) {
  if (!collectedData || typeof collectedData !== "object") {
    return "";
  }

  return JSON.stringify(collectedData);
}

function updateGuestFromCollectedData(guest, collectedData) {
  if (!collectedData || typeof collectedData !== "object") {
    return;
  }

  if (collectedData.attending != null) {
    guest.attending = normalizeBoolean(collectedData.attending);
  }

  if (collectedData.rsvpStatus != null) {
    guest.rsvp_status = String(collectedData.rsvpStatus);

    const normalizedStatus = String(collectedData.rsvpStatus).trim().toLowerCase();
    if (["confirmed", "yes", "attending"].includes(normalizedStatus)) {
      guest.attending = "yes";
    } else if (["declined", "no", "not attending"].includes(normalizedStatus)) {
      guest.attending = "no";
    }
  }

  if (collectedData.guestCount != null) {
    guest.guest_count = String(collectedData.guestCount);
  }

  if (collectedData.totalGuests != null) {
    guest.guest_count = String(collectedData.totalGuests);
  }

  if (collectedData.mealChoice != null) {
    guest.meal_choice = String(collectedData.mealChoice);
  }

  if (collectedData.songRequest != null) {
    guest.song_request = String(collectedData.songRequest);
  }

  if (collectedData.dietaryRestrictions != null) {
    guest.dietary_restrictions = String(collectedData.dietaryRestrictions);
  }

  if (collectedData.dietaryNotes != null) {
    guest.dietary_restrictions = String(collectedData.dietaryNotes);
  }

  if (collectedData.followUpRequired != null) {
    guest.follow_up_required = normalizeBoolean(collectedData.followUpRequired);
  }

  if (collectedData.followUpDate != null) {
    guest.follow_up_date = String(collectedData.followUpDate);
  }

  if (collectedData.airtableRecordId != null) {
    guest.airtable_record_id = String(collectedData.airtableRecordId);
  }

  if (collectedData.notes != null) {
    guest.rsvp_notes = String(collectedData.notes);
  }
}

function extractCollectedDataFromCall(payload) {
  const collectedData = {};

  for (const item of payload.collectedInfo || []) {
    if (!item || !item.id) {
      continue;
    }

    collectedData[item.id] = item.value;
    if (item.name) {
      collectedData[item.name] = item.value;
    }
  }

  return collectedData;
}

function updateGuestFromLeadWebhook(payload) {
  const guests = loadGuests();
  const matchValue = payload.externalId || payload.phoneNumber;
  const guest = guests.find((entry) => {
    return (
      entry.nlpearl_external_id === matchValue ||
      entry.guest_id === matchValue ||
      entry.phone_number === payload.phoneNumber
    );
  });

  if (!guest) {
    return { updated: false, reason: "Guest not found in CSV" };
  }

  const collectedData = payload.collectedData || {};

  guest.nlpearl_external_id = payload.externalId || guest.nlpearl_external_id || guest.guest_id;
  guest.nlpearl_lead_id = payload.id || guest.nlpearl_lead_id;
  guest.lead_status = payload.status || guest.lead_status;
  guest.last_updated_at = new Date().toISOString();
  guest.raw_collected_data = stringifyCollectedData(collectedData);
  updateGuestFromCollectedData(guest, collectedData);

  saveGuests(guests);

  return {
    updated: true,
    guestId: guest.guest_id,
    leadStatus: guest.lead_status
  };
}

function updateGuestFromCallWebhook(payload) {
  const guests = loadGuests();
  const matchValue = payload.leadId || payload.to;
  const guest = guests.find((entry) => {
    return entry.nlpearl_lead_id === matchValue || entry.phone_number === payload.to;
  });

  if (!guest) {
    return { updated: false, reason: "Guest not found in CSV" };
  }

  const collectedData = extractCollectedDataFromCall(payload);

  guest.last_call_id = payload.id || guest.last_call_id;
  guest.call_status = payload.status || guest.call_status;
  guest.conversation_status = payload.conversationStatus || guest.conversation_status;
  guest.last_summary = payload.summary || guest.last_summary;
  guest.last_updated_at = new Date().toISOString();

  if (Object.keys(collectedData).length > 0) {
    guest.raw_collected_data = stringifyCollectedData(collectedData);
  }
  updateGuestFromCollectedData(guest, collectedData);

  saveGuests(guests);

  return {
    updated: true,
    guestId: guest.guest_id,
    callStatus: guest.call_status,
    conversationStatus: guest.conversation_status
  };
}

function handleNlpPearlWebhook(logFile, webhookType, req, res, onPayload) {
  parseJsonBody(req)
    .then((payload) => {
      appendWebhook(logFile, payload);
      const updateResult = onPayload ? onPayload(payload) : null;

      console.log(`[${new Date().toISOString()}] ${webhookType} webhook`, {
        id: payload.id,
        pearlId: payload.pearlId,
        leadId: payload.leadId,
        externalId: payload.externalId,
        phoneNumber: payload.phoneNumber,
        status: payload.status,
        conversationStatus: payload.conversationStatus,
        updateResult
      });

      // NLPearl expects a fast 200 OK acknowledgment.
      sendJson(res, 200, { ok: true, updateResult });
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

  if (req.method === "GET" && req.url === "/guests.csv") {
    const csv = fs.readFileSync(GUESTS_CSV, "utf8");
    sendText(res, 200, csv, "text/csv; charset=utf-8");
    return;
  }

  if (req.method === "GET" && req.url === "/debug/guests") {
    sendJson(res, 200, { guests: loadGuests() });
    return;
  }

  if (req.method === "POST" && req.url === "/webhooks/nlpearl/call") {
    handleNlpPearlWebhook(CALLS_LOG, "call", req, res, updateGuestFromCallWebhook);
    return;
  }

  if (req.method === "POST" && req.url === "/webhooks/nlpearl/lead") {
    handleNlpPearlWebhook(LEADS_LOG, "lead", req, res, updateGuestFromLeadWebhook);
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Webhook server listening on http://${HOST}:${PORT}`);
  console.log(`Call webhook: http://${HOST}:${PORT}/webhooks/nlpearl/call`);
  console.log(`Lead webhook: http://${HOST}:${PORT}/webhooks/nlpearl/lead`);
});
