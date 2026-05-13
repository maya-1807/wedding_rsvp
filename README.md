# NLPearl RSVP Webhooks

This project exposes 2 webhook endpoints for an outbound NLPearl RSVP campaign:

- `POST /webhooks/nlpearl/call`
- `POST /webhooks/nlpearl/lead`

It also keeps a guest list CSV and updates each guest row from NLPearl webhook results:

- `GET /guests.csv`
- `GET /debug/guests`

## Run locally

```bash
npm start
```

The server runs on `http://localhost:3000` by default.
If you want to force localhost-only binding during local development, run with `HOST=127.0.0.1 npm start`.

## Guest CSV

Edit [data/guests.csv](/Users/maya/CursorProjects/RSVP/data/guests.csv:1) with your real guest list.

Important mapping rule:

- Set `nlpearl_external_id` to a stable guest identifier such as `guest-001`
- When you upload leads to NLPearl, map that same value to NLPearl's `externalId`
- The webhook receiver uses `externalId` first, and falls back to `phoneNumber`, to update the correct row

Current NLPearl variables detected from your setup:

Pre-call:

- `firstName`
- `lastName`
- `emailAddress`
- `phoneNumber`
- `localPhoneNumber`
- `weddingVenue`
- `groomName`
- `brideName`
- `weddingDate`

Collected in-call:

- `rsvpStatus`
- `totalGuests`
- `dietaryNotes`
- `followUpRequired`
- `followUpDate`
- `airtableRecordId`

## NLPearl settings

Use `Version = V2`.

When you deploy this app to a public domain, set:

- `Call Webhook = https://YOUR-DOMAIN/webhooks/nlpearl/call`
- `Lead Webhook = https://YOUR-DOMAIN/webhooks/nlpearl/lead`
- `Credentials = false` for both, unless you intentionally add auth handling on your webhook receiver

To have NLPearl call all guests in the CSV:

1. Fill in `data/guests.csv`
2. Upload the guest rows to your NLPearl outbound campaign
3. Make sure each lead carries:
   - `phoneNumber` from `phone_number`
   - `externalId` from `nlpearl_external_id` or `guest_id`
   - optional call personalization fields such as `first_name`, `invite_group`, or `max_guests`
4. Start the outbound campaign
5. NLPearl webhooks will update the CSV as guests answer

## Local files

Incoming webhooks are appended to:

- `data/nlpearl-call-webhooks.jsonl`
- `data/nlpearl-lead-webhooks.jsonl`

Note: on platforms like Render, the local filesystem is ephemeral, so these files are useful for testing but not reliable long-term storage unless you add a persistent disk or move the data to a database or Google Sheet.
