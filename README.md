# NLPearl RSVP Webhooks

This project exposes 2 webhook endpoints for an outbound NLPearl RSVP campaign:

- `POST /webhooks/nlpearl/call`
- `POST /webhooks/nlpearl/lead`

## Run locally

```bash
npm start
```

The server runs on `http://localhost:3000` by default.
If you want to force localhost-only binding during local development, run with `HOST=127.0.0.1 npm start`.

## NLPearl settings

Use `Version = V2`.

When you deploy this app to a public domain, set:

- `Call Webhook = https://YOUR-DOMAIN/webhooks/nlpearl/call`
- `Lead Webhook = https://YOUR-DOMAIN/webhooks/nlpearl/lead`
- `Credentials = false` for both, unless you intentionally add auth handling on your webhook receiver

## Local files

Incoming webhooks are appended to:

- `data/nlpearl-call-webhooks.jsonl`
- `data/nlpearl-lead-webhooks.jsonl`

Note: on platforms like Render, the local filesystem is ephemeral, so these log files are useful for testing but not long-term storage.
