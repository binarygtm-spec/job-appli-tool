# Planned: cloud prospect pipeline (Airtable → Clay tables → OpenAI → Airtable)

Runs the `job-prospect-research` step without a chat session. Clay does the people search and contact lookups; your OpenAI key (inside Clay AI columns) does the selecting, ranking and summary writing. Not built yet.

## 1. Connect OpenAI in Clay
Clay → Settings → Connections → OpenAI → paste your API key. If your plan doesn't support this, use an HTTP API column that calls `https://api.openai.com/v1/responses`.

## 2. Clay table "Job Companies" (webhook source)
- Create the table with **Import from Webhook** and copy the URL.
- Airtable automation on **Companies**:
  - **Trigger:** Prospect Status is empty AND Company LinkedIn URL is not empty AND User Email ID is not empty.
  - **Action:** Run script → `airtable-automations/send_to_clay.js`. Input `recordId`; secret `CLAY_WEBHOOK_URL`.

## 3. Columns in "Job Companies"
1. **Find People at Company**: current employees, max 25, with title keywords: CEO, Founder, COO, CRO, CMO, CTO, VP, Head of, Director, CHRO, Chief People Officer, HR, People, Talent Acquisition, Recruitment, Recruiter, HR Business Partner.
2. **AI "Select decision makers"** (OpenAI, JSON output). Returns up to 8 people with `rank` (1–5 core, 6–8 email fallbacks), `role_type` and `priority` (exactly 2 Primary). Follow the rules in the skill's Step 1: the HR ladder, hiring manager by function, and CEO only if the company has fewer than 1,000 employees.
3. **Write to table** → "Job Prospects": one row per person. Carry over `airtable_record_id`, `user_email_id`, `company_name`, `company_domain` and `job_title`.

## 4. Columns in "Job Prospects"
1. **Work Email**: run on all rows.
2. **Mobile Phone Number**: only run if `priority = Primary`.
3. **Enrich Person**: only run if `rank <= 5` or Work Email is found.
4. **AI "Prospect Summary"**: 3–5 factual sentences plus an `Outreach angle:` line. Use profile data only.
5. **Airtable Create Record → Prospects**: only run if `rank <= 5` OR Work Email is found. Map:
   - Prospect Name, Prospect Job Title, Prospect LinkedIn URL, Prospect Location
   - Prospect Email, Prospect Mobile Number
   - Priority, Role Type, Prospect Summary
   - User Email ID, Company (`airtable_record_id`)
   - Contact Status: "Enriched" if an email or mobile was found, else "No contact found"

## 5. Close the loop
In "Job Companies", add an Airtable **Update Record** column on Companies that sets Prospect Status to "Prospects found" or "None found".

## Costs
Emails, mobiles and Enrich Person use Clay credits. Clay's MCP credit limit is separate and doesn't apply to table runs. OpenAI only bills for the selecting, ranking and summary writing.
