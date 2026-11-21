---
name: relevance-tools
description: Call any of the job pipeline's Relevance AI tools on demand (LinkedIn profile/company/posts scraping, Apollo lead gen and phone lookup, Gmail send, LinkedIn invitations, cover letter / resume builders, JD research, WhatsApp compose). Use when a task needs one of these tools, or when asked to run, list or check the Relevance tools.
---

# Relevance AI tools (on demand)

Region `d7b62b`, project `87c83726-444b-5ecb-bb93-f48503484fa5`. The 11 tools are listed in `relevance/tools.json`, with ID, alias, title, input params and Relevance build URL.

## Two ways to call a tool

**1. MCP (preferred inside Claude).** When the `relevanceai-mcp-server` is connected, its tools appear as `relevanceai-mcp-server__<Tool Title>` (on a cloud session linked to the user's Mac: `mcp__remote-devices__relevanceai-mcp-server__…`). Load them with ToolSearch (`relevanceai`) and call them directly. Server config: `relevance/mcp.example.json`. Paste the real token into the local config only.

**2. CLI (any terminal, any machine with network):**
```bash
node relevance/run_tool.mjs --list                       # every tool with its inputs
node relevance/run_tool.mjs <id | alias | title words> '<json params>'
node relevance/run_tool.mjs linkedin-profile '{"linkedin_url":"https://www.linkedin.com/in/eassahashim/"}'
```
Auth is the `RELEVANCE_AUTH_TOKEN="<project_id>:<api_key>"` env var, read from `.env` (gitignored; copy `.env.example`). The script calls `POST https://api-d7b62b.stack.tryrelevance.com/latest/studios/<id>/trigger_limited` and prints the tool output as JSON.

Run `node relevance/list_tools.mjs` once on a machine with network to fill in each tool's title, description and params in `tools.json`, then commit the file. Re-run it after adding or renaming tools in Relevance.

## Choosing a tool
Read `relevance/tools.json` and match the task against each tool's title and description. These are the tools in this project (titles as the MCP server shows them):

| Task | Tool (MCP title) | Inputs |
|---|---|---|
| Scrape a LinkedIn person profile (resume fields) | Get Linkedin Profile Data (`2749eab9…`, alias `linkedin-profile`) | `linkedin_url` |
| Person profile / posts, company profile / posts | RapidAPI - Get a LinkedIn Profile Company and Posts | `url`, `method` = Get User Profile \| Get User Posts \| Get Company Profile \| Get Company Posts |
| Research a job description | JD Researcher | see tools.json |
| Research a company from its domain | JD Company Research from domain | domain |
| Write a cover letter / application email | JD Cover Letter, Resume & Cover Letter Builder, Resume Builder | see tools.json |
| Find decision makers (Apollo, paid plan only) | Apollo Lead Gen (C/VP/Dir, Sr Manager) | `domain` |
| Mobile number from Apollo | Apollo Request Phone Number / Get Phone Numbers | `apollo_id` |
| Send email from a connected Gmail | Send Gmail email / Gmail Email | see tools.json |
| LinkedIn connection request | LinkedIn URL - Send Invitation | see tools.json |
| WhatsApp message draft | Whats Message Compose | see tools.json |

Not every one of these is among the 11 IDs in `tools.json`; the IDs are what the MCP server loads. When a title above isn't in `tools.json`, check `--list` or the MCP tool list before calling.

## Rules
- **Sending tools (Gmail, LinkedIn invitation, WhatsApp) need the user's explicit go-ahead for each send.** Send from the Gmail that matches the prospect's `User Email ID` in Airtable.
- Credits: a profile scrape costs about 2.75, a posts call about 5.5. Large post results are saved to a file; parse them instead of pasting them inline.
- The Apollo endpoints return 403 on Apollo's Free plan. Don't retry; tell the user.
- If a LinkedIn URL returns 404, the URL is stale. Ask the user for the right one.
- Never print, log or commit `RELEVANCE_AUTH_TOKEN`.
