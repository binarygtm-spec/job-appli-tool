---
name: relevance-tools
description: Call the job pipeline's Relevance AI tools on demand — send a prospect's application email and LinkedIn invite from the right applicant's connected account (routed by User Email ID), WhatsApp, and LinkedIn profile/company/posts scraping. Use when asked to send, apply, invite, scrape, or run/list/check the Relevance tools.
---

# Relevance AI tools (on demand)

Region `d7b62b`, project `87c83726-444b-5ecb-bb93-f48503484fa5`. All 11 tools were verified on 2026-11-21 (`/studios/<id>/get` returned 200). `relevance/tools.json` holds each tool's id, alias, title, kind, owner, params and oauth account.

## Sender routing: who sends what

Each send goes out from the **applicant's own** connected account. The applicant is the prospect's `User Email ID` in Airtable. The mapping is in `relevance/senders.json`:

| User Email ID | Email tool (sends as) | LinkedIn invite tool | WhatsApp tool |
|---|---|---|---|
| eassahashimev@gmail.com | Eassa Gmail Send Email `1a3e6536…` (**eassahashim88@gmail.com**) | Eassa Linkedin Send Invite `5f3c0f8a…` | none |
| syed.munaza@gmail.com | Munaza Gmail Send Email - copy `8f08cea6…` | Munaza Linkedin Send Invite `d1137b03…` | Munaza Whatsapp New Chat `23a01c2b…` |
| lazimabedali@gmail.com | Lazim Gmail Send Email `08d256cb…` | Lazim Linkedin Send Invite `6a7c9f6c…` | Lazim Whatsapp New Chat `7325f61f…` |

Never send from another applicant's tool. If a User Email ID isn't in `senders.json`, stop and ask.

## Tool inputs

| Kind | Tools | Params |
|---|---|---|
| gmail | `*-gmail` | `email` (recipient), `subjectline`, `email_body` |
| linkedin_invite | `*-linkedin-invite` | `linkedin_url` |
| whatsapp | `*-whatsapp` | `mobile_no` (with country code), `message` |
| scrape | `linkedin-profile`, `linkedin-company`, `linkedin-posts` | `linkedin_url` |

## Sending an application (on demand)

```bash
# Preview (dry run, the default). Reads the Prospects record and picks the sender from User Email ID
node relevance/send_outreach.mjs --record <prospect recId>
# Send email + LinkedIn invite, only after the user says go
node relevance/send_outreach.mjs --record <prospect recId> --confirm
node relevance/send_outreach.mjs --record <recId> --only email --confirm      # or --only linkedin
# Without Airtable
node relevance/send_outreach.mjs --user eassahashimev@gmail.com --to x@co.com --subject "..." \
  --body-file body.txt --linkedin https://www.linkedin.com/in/x/ --confirm
```

What the script does:
- Reads `Prospect Email`, `Email Subject Line`, `Email Body` and `Prospect LinkedIn URL`.
- Skips the email when there is no verified address. `--allow-unverified` uses `Suggested Email (unverified)`, but only when the user explicitly agrees.
- Skips anything already sent (`Email Sent At` / `LinkedIn Invite Sent At`). `--force` resends.
- After a send, writes `Email Sent At`, `LinkedIn Invite Sent At` and `Outreach Log`, and sets `Contact Status` to "Contacted".

Inside Claude, the same tools can be called over MCP (`relevanceai-mcp-server__<Tool Title>`, loaded with ToolSearch `relevanceai`) or from the browser pane with `fetch` to `trigger_limited` when the sandbox has no network. The procedure is the same either way:
1. Show the user the exact To, Subject, Body and invite URL, and name the sending tool.
2. Get an explicit yes for those prospects.
3. Send.
4. Update the Airtable fields above.

## Other calls

```bash
node relevance/run_tool.mjs --list
node relevance/run_tool.mjs linkedin-profile '{"linkedin_url":"https://www.linkedin.com/in/eassahashim/"}'
```

Auth is `RELEVANCE_AUTH_TOKEN="<project_id>:<api_key>"` and `AIRTABLE_TOKEN`, both in `.env` (gitignored; copy `.env.example`). The API endpoint is `POST https://api-d7b62b.stack.tryrelevance.com/latest/studios/<id>/trigger_limited` with body `{project, params}`.

## Rules
- **Every send (Gmail, LinkedIn invite, WhatsApp) needs the user's explicit go-ahead.** Default to dry run.
- Only verified emails are sent automatically. Pattern guesses need the user's OK.
- Don't send "resume attached" emails while `Resume PDF URL` is empty. Add the link or reword the email first.
- A LinkedIn URL that returns 404 is stale. Ask the user for the right one.
- Never print, log or commit `RELEVANCE_AUTH_TOKEN`.
