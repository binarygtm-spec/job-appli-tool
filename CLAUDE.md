# CLAUDE.md: Job Application Automation

Airtable base: `appKwvv5s2XpX4etA` (Market Research Hub)

## ALWAYS IGNORE these tables
These are template leftovers. Never read, edit or analyse them:
- Research Projects (`tblhvuawoQCWrAzjh`)
- Research Methods (`tbl609OL1Vj8l4ukQ`)
- Findings (`tbl74DsegYcvdaWya`)
- Competitors (`tblJ9lWIIgDE4PAkE`)

## Working tables (pipeline order)
1. **User Test** (`tblOnYAjvsaDn9oOp`): the applicants. Each applicant's resume-style profile is scraped from LinkedIn via Relevance AI. `Email` identifies the user.
2. **Companies** (`tbla2BuSNY0G0GEBM`): one row per job posting plus company research, tagged with **User Email ID** (who searched for it).
3. **Prospects** (`tblzySJTB4rc1IRC8`): 5 decision makers per job, with contacts, research and a draft email, tagged with **User Email ID**.
4. **Application**, **Engagement**: not designed yet.

## Users
There are 3 applicants (see User Test). Every job and every prospect carries the searching user's `User Email ID`. Relevance AI uses it to pick which connected Gmail sends the email.

## Pipeline
1. **Applicant profile:** User Test → Linkedin URL → Airtable automation `airtable-automations/user_profile_scrape.js` (Relevance AI) → resume fields.
2. **Jobs:** `scraper/` (Playwright, the user's own Chrome profile) opens a LinkedIn job search, asks which user it's for, and captures each job plus company About/Services/Posts into Companies.
3. **Prospects and research:** the `job-prospect-research` skill (`.claude/skills/job-prospect-research/SKILL.md`): Clay people search and enrichment, Relevance profile and posts, company summary, job-match summary, and a draft email per prospect.
4. **Sending** (not built yet): Relevance AI Gmail tools, chosen by User Email ID, after the user confirms.
5. **Planned:** a cloud version on Clay tables plus an OpenAI key, triggered by an Airtable automation (`airtable-automations/send_to_clay.js`, `docs/clay-openai-pipeline.md`).

## Rules
- Never send emails or messages without the user's explicit go-ahead.
- Only verified emails go in `Prospect Email`. Pattern guesses go in `Suggested Email (unverified)`.
- Write summaries from scraped data only. Never invent metrics or facts.
- Clay has a separate **MCP credit limit** (Clay → MCP settings). "Monthly MCP credit limit" errors mean raising that cap, not adding account credits.
