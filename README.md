# job-appli-tool

AI-assisted job application pipeline: **LinkedIn → Airtable → Clay → Relevance AI → personalised outreach**, for 3 applicants who share one Airtable base.

| Folder | What it is |
|---|---|
| `.claude/skills/job-prospect-research/` | Claude skill: find 5 decision makers per job, get emails and mobiles, research each person (profile, posts, company, job match) and draft an application email per prospect |
| `scraper/` | LinkedIn job-search scraper (Playwright + your Chrome profile) → Airtable Companies |
| `airtable-automations/` | Airtable "Run script" automations: applicant profile scrape (Relevance AI) and send-to-Clay webhook |
| `relevance/` | Verified Relevance AI tool catalog (`tools.json`), per-applicant sender routing (`senders.json`), on-demand runner (`run_tool.mjs`), outreach sender (`send_outreach.mjs`), MCP config example |
| `.claude/skills/relevance-tools/` | Claude skill: call any Relevance tool on demand |
| `docs/` | Setup guides |
| `CLAUDE.md` | Airtable map and rules for Claude |

## 1. Scrape jobs
```bash
cd scraper
bash run.sh --url "<LinkedIn job search URL>" --limit 10
```
- First run: Chrome opens. Log into LinkedIn, then press Enter in Terminal.
- It asks which user the search is for, then tags every job with that user's email (`User Email ID`).
- Add `--dry-run` to save to `output/` only, without writing to Airtable. The Airtable token is a PAT with `data.records:read` + `data.records:write`.

## 2. Research prospects and draft emails
In Claude (with the Airtable, Clay and Relevance AI connectors), say:
> "Run job-prospect-research for the MVP1 Ventures job"

The skill fills Prospects with 5 decision makers (HR/CHRO always included; 2 Primary with mobiles), plus a profile summary, post summary, company summary and job match summary, and a draft subject and body for each.

## 3. Send
Review the drafts and add resume URLs. Then send through Relevance AI from the Gmail that matches `User Email ID`.

## Relevance AI tools on demand
```bash
cp .env.example .env          # add RELEVANCE_AUTH_TOKEN
node relevance/list_tools.mjs # one-time: fill in tool names and inputs
node relevance/run_tool.mjs --list
node relevance/run_tool.mjs linkedin-profile '{"linkedin_url":"https://www.linkedin.com/in/..."}'
```

### Send an application to a prospect
Each send goes out from the applicant's own connected tool, chosen by the prospect's `User Email ID`. For example, `eassahashimev@gmail.com` sends email through the Eassa Gmail tool, as eassahashim88@gmail.com, and the invite through the Eassa LinkedIn tool. The routing is in `relevance/senders.json`.
```bash
node relevance/send_outreach.mjs --record <prospect recId>             # dry run: shows To/Subject/Body/invite
node relevance/send_outreach.mjs --record <prospect recId> --confirm   # sends email + LinkedIn invite
```
Before composing, `node relevance/email_context.mjs --record <recId>` checks for and prints the 6 required inputs. The send script refuses to email if any are missing, and adds the applicant's own signature, resume and LinkedIn link (template: `templates/application_email.md`). After a send it writes `Email Sent At`, `LinkedIn Invite Sent At` and `Outreach Log` back to Airtable.

## Set up a new Mac
```bash
curl -fsSL https://raw.githubusercontent.com/binarygtm-spec/job-appli-tool/add-relevance-tools-skill/setup-mac.sh -o setup-mac.sh && bash setup-mac.sh
```
Installs Homebrew, Node, Git, GitHub CLI and Chrome; clones this repo to `~/job-appli-tool`; installs the scraper; asks for the Airtable and Relevance tokens (saved to `.env`, mode 600); adds the Relevance tools to the Claude desktop app. Safe to re-run.

## Requirements
- Node 18+ (scraper), Google Chrome
- Airtable PAT, Clay (watch the separate **MCP credit limit**), Relevance AI
