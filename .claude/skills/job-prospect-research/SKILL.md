---
name: job-prospect-research
description: For a job in the Airtable job pipeline, find 5 hiring decision makers (incl. HR/CHRO) with Clay, get emails/mobiles, research each prospect (profile, posts, company, job-vs-applicant match) and draft a personalised application email per prospect into the Prospects table. Use when asked to "find prospects", "research prospects", "prepare outreach" or "apply" for a job/company in the pipeline.
---

# Job prospect research → personalised application emails

Run this for one or more job rows in **Companies**. The output is 5 researched prospects per job in **Prospects**, each with a draft email ready to send from the applicant's Gmail.

**Never send an email yourself.** Drafting is the end of this skill. Sending happens in Relevance AI, from the Gmail that matches the prospect's `User Email ID`, and only after the user confirms.

## Tools
- **Airtable MCP**: base `appKwvv5s2XpX4etA`.
- **Clay MCP**: people search, work email, mobile.
- **Relevance AI MCP** (runs on the user's Mac, tools named `relevanceai-mcp-server__…`): `RapidAPI - Get a LinkedIn Profile Company and Posts` with method `Get User Profile` / `Get User Posts`. Costs about 2.75 credits per profile and 5.5 per posts call.

Load the tools with ToolSearch (`+Airtable`, `+Clay`, `relevanceai`).

## Airtable map
IGNORE these tables: Research Projects, Research Methods, Findings, Competitors.

**User Test** `tblOnYAjvsaDn9oOp`: the applicants (job seekers). Look up the applicant by `Email` = the job's `User Email ID`. You need: Full Name, Profile Summary, Skills, Current/Previous Job 1–6 (title, company, dates, responsibilities), degrees, and Relevance Profile Output (raw JSON).

**Companies** `tbla2BuSNY0G0GEBM` (one row per job posting)
- Company Name `fldw1fEDxBKcVUKhI`, User Email ID `fldJBQSCks7jYPHs2`, Job URL `fldmjgULOJxsD3PAr`, Job Title `fldYLY5p0WJrtFhbr`, Job Location `fldrCPw2AXh39x2n1`, Job Type `fldSp1z7yhNPNZHVv`, Job Posted `fldgLwUY37OdayeIX`
- Job Description `fldEPf6Uz1gHfJbRZ`, Job Requirements `fldPI6BmhlzESCTpX`
- Company LinkedIn URL `fldIjVO20wHrZdRWA`, Company Website `fldw0xFlF7lIyluaI`, Industry `fld4vQITiuIhi99os`, Company Size `fldVr5d5GI95ummiJ`, Company HQ `fldek0dKbvC2TsrKA`
- Company About `fld2GaT3Y42iwKQTQ`, Products & Services `fldwoRwxKjP36Vm2k`, Recent Posts `fldBQJv4B666BVwz5`, Recent Product Launches `fldCItRx6ywlt2H1G`, Recent Funding `fldWAe0wemSwYX40y`, Achievements & Milestones `fld1oYD0O05th0zJP`, Hiring Signals `fldwP20TECa3ez4Oi`
- Company Summary `fldS8jQPBuKFvIC6g`, Prospect Status `fldrKV3TZxYObzSBU` ("Prospects found" / "None found" / "Error")
- Prospects (link) `fldYTFQ44scGBAGVF`

**Prospects** `tblzySJTB4rc1IRC8`
- Prospect Name `fldtLkmYZk8FYioYH`, Company (link) `fldpi1499uk9swW4k`, **User Email ID** `fldHcESEAaG41jxzV` (always copy it from the job)
- Prospect Job Title `fldGhgibdQmAnYdV7`, Prospect LinkedIn URL `fldP8FiV3P3jvunm6`, Prospect Location `fld7Ff130qhZ3Q1kJ`
- Prospect Email `fldSWjjyy8GjiJqrd` (verified only), Suggested Email (unverified) `fldjO7pRPh7HCEKSD`, Prospect Mobile Number `fldPb11j2JclGGrfX`
- Priority `fldai78FI0YiV5XFp` ("Primary" / "Secondary"), Role Type `fldlAy2pibs6dWvmZ` ("Hiring Manager" / "Founder / CEO" / "HR / CHRO" / "Leadership"), Contact Status `fldkeBhbgtg1bTnEs` ("Enriched" / "No contact found" / "Pending - Clay credits")
- Prospect Summary `fldrl3o9BM7VtRqsG`, Post Summary `fldaEyZxqyW5oIbEJ`, Latest Posts `fldBjGdEV2Vv1E9Zc`, Company Summary `fldaZzourVdi8uYDL`, Job Match Summary `fldVs5GB29f2NnrD4`
- Email Subject Line `fld2tPLi7lsIDtN9r`, Email Body `fldUTHxXWz1xtrVAJ`, Resume PDF URL `fldFfsXPhxkhi8Kd7`, Resume Word URL `fldqUo9StBb7c2dFa`

**One set of prospects per applicant.** If two applicants target the same company, each gets their own prospect rows (dedupe key = LinkedIn URL + User Email ID).

## Step 1: Find 5 decision makers (Clay `search-contacts`, free)
Set `companyIdentifiers` to [Company LinkedIn URL, website domain]. All filters go inside `experiences.any(is_current = true and …)`. Valid `seniority` values: "Founder", "Owner", "Board Member", "Partner", "C-suite", "VP", "Director" (not "CXO").
1. **HR / CHRO (always 1).** Walk this ladder and take the most senior match: CHRO / Chief People Officer → VP or Head of HR/People → HR Director → Senior HR Manager → HR Manager → Talent Acquisition Head/Manager/Lead → Recruitment Manager → Senior Recruiter / Recruiter → HR Business Partner → Assistant HR Manager → HR Executive / Generalist. If nobody in HR exists (common under ~50 staff), use the person who runs operations or hiring (COO, Head of Operations or Business Operations) and still tag them "HR / CHRO".
2. **Hiring manager** for the job's function: sales → VP/Head of Sales or CRO; marketing → Head/VP Marketing or CMO; GTM/RevOps/growth → Head of GTM, RevOps or Growth, or CRO/COO; BD → Head of BD or Partnerships; product → VP/Head of Product; engineering/solutions → VP Engineering, Head of Solutions or CTO.
3. **Founder / CEO and leadership:** `seniority in ("Founder","Owner","C-suite","Partner")`.
4. If the results are thin, list current employees (`limit 25`, then `load-more-search-results`) and pick the most senior relevant people.

Pick 5 distinct people. **Primary** (gets a mobile) = hiring manager + Founder/CEO; at companies with more than 1,000 employees, use the hiring manager + the most senior HR person instead. Everyone else is **Secondary**.

## Step 2: Contact details (Clay, uses credits)
- **Work email for all 5:** `run_subroutine_direct` with `t_0tmmyw7u7v5x3zK8HvU` (Work Email); inputs `{Full Name, Company Domain, Company Name, Social Profile URL}`.
- **Mobile for the 2 Primary only:** `t_0tmmyw2RyUvmPAdHyB2` (Mobile Phone Number). Never request a mobile for Secondary people.
- Read the results with `get-task-context` (poll about every 30 s, for up to 3 min).
- **Minimum 3 emails per job:** if fewer than 3 of the 5 return an email, continue down the HR ladder and then other function leaders, one person at a time, until you have 3 emails or have tried 8 extra people. Save fallback people only if they produced an email, as Secondary.
- **If Clay errors with "credit limit" / "MCP credit limit":** stop all enrichment and set Contact Status = "Pending - Clay credits". Tell the user to raise the limit under Clay → MCP settings; that is a separate cap from account credits. Once one email at the company is verified (e.g. `chintan@mvp1.com.au`), you may fill **Suggested Email (unverified)** using the same pattern, and always label it unverified. Never put a guess in Prospect Email.
- The Apollo tools in Relevance (`26 - Apollo Lead Gen …`) need a paid Apollo plan. On the Free plan they return 403.

## Step 3: Research each prospect (Relevance AI)
- `Get User Profile` for every prospect; `Get User Posts` for every prospect too (prioritise Primary when credits are tight). Large post results are saved to a file. Parse them with a script, keep the latest ~7 posts, and note how many you read.
- If a LinkedIn URL returns 404 (Clay URLs are sometimes stale), say so in Prospect Summary and ask the user for the correct URL. Don't guess one.
- **Prospect Summary:** 3–5 factual sentences: current role and tenure, previous notable roles and companies, total experience, education/certifications, location. Then one line, `Outreach angle: …`, saying why this person matters for this job. Use only facts from the data.
- **Post Summary:** how often they post, the main themes with dates, tone, and a `USE IT:` line giving one specific hook for the email. If there are no posts, say so.
- **Latest Posts** (Primary): `[YYYY-MM-DD] short paraphrase` × 5.

## Step 4: Company Summary (same text for every prospect of the job; also write it to Companies → Company Summary)
Build it from Company About, Products & Services, Recent Posts, Achievements, Funding, Hiring Signals, size, HQ and industry. Use these labelled paragraphs:
**Overview**, **What they do**, **Products & services**, **Achievements**, **Right now** (events, launches, news, with dates), **Hiring signal** (why they're hiring this role).

## Step 5: Job Match Summary (job × applicant)
Read the job (Title, Description, Requirements, Location, Type, Posted) and the applicant's User Test record.
- Header lines: JOB, APPLICANT (name + User Email ID), and FIT, an estimate out of 10, labelled as an estimate.
- **REQUIREMENT → PROOF FROM PROFILE:** one bullet per requirement, citing the specific role, company, dates and outcome from the applicant's profile. If there's no evidence, say so.
- **GAPS TO ADDRESS:** missing tools or experience, short tenures, and the outcomes or demos the posting asks for, each with how to frame it.
- **STRONGEST PROOF:** the single best thing to show.
- Last line, personalised per prospect: `PITCH TO <NAME> (<role>): …`, combining their Post Summary hook with their role.

## Step 6: Draft the application email (one per prospect)
- **Subject:** specific to the job and the person, under 70 characters.
- **Body:** 120–180 words, written as the applicant. Open with one personal hook from the Post or Company Summary. Then 3–4 proof bullets mapped to the job's requirements (facts from the applicant's profile only, no invented metrics), one offer (e.g. a 10-minute walkthrough), one clear ask, and a sign-off with the applicant's name and LinkedIn.
- Adjust the angle by role: hiring manager = builder-to-builder; CEO = business outcome; CTO = technical depth; HR/ops = short and practical (role link, location, availability, ask for next steps); other leaders = their function's angle.
- If the body says a resume is attached, make sure Resume PDF URL / Resume Word URL are filled; if not, tell the user.
- Write the subject and body to Prospects. Do not send.

## Finish
Report for each job: the prospects (name, title, Role Type, Priority), email status (verified / suggested / pending), mobile status for Primary, which research is missing and why (404 URL, no posts, credits), and what the user must do before sending (raise the Clay MCP limit, add resume URLs, fix LinkedIn URLs).
