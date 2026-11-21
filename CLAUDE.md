# CLAUDE.md — Job Application Automation (end-to-end runbook)

**Trigger.** The user gives a **LinkedIn job search URL** and a **User Email ID**. Example:
`https://www.linkedin.com/jobs/search/?keywords=GTM%20Engineer&f_WT=2 eassahashimev@gmail.com`

Run every stage below in order for that user: **scrape jobs → find prospects → research → draft emails → (approval) → send → log**. Use a task list. After each stage, report what was produced and what is blocked.

---

## 0. Ground rules (learned the hard way, so follow them)

1. **Never send anything without an explicit go-ahead for that batch.** Covers email, LinkedIn invites and WhatsApp. First show To, Subject and the full Body of at least one email, a table of all recipients, and which address is verified and which is guessed. Then ask (AskUserQuestion). "Send email" alone is not approval of text the user hasn't seen.
2. **Verified emails only, by default.** Clay-verified addresses go in `Prospect Email`. Pattern guesses (e.g. `firstname@domain`, once one verified address confirms the pattern) go in `Suggested Email (unverified)`. Send to them only when the user approves that specifically. Log them as UNVERIFIED.
3. **Facts only.** Write summaries and emails from scraped data and the applicant's profile only. Don't invent metrics, dates or claims. If a fact isn't in the inputs, leave it out.
4. **Each applicant's identity stays separate.** The sending tool, signature, phone, resume link and LinkedIn URL all come from the prospect's `User Email ID`. Never mix two applicants.
5. **Secrets.** Never commit, print or log the Relevance or Airtable tokens. **Never search the user's files for keys.** If you need a token, ask the user to paste it. Afterwards, remind them to rotate it.
6. **Ignore the template tables:** Research Projects `tblhvuawoQCWrAzjh`, Research Methods `tbl609OL1Vj8l4ukQ`, Findings `tbl74DsegYcvdaWya`, Competitors `tblJ9lWIIgDE4PAkE`.

---

## 1. Systems map

| System | Used for | How to reach it from Claude |
|---|---|---|
| Airtable base `appKwvv5s2XpX4etA` (Market Research Hub) | All data | Airtable MCP (`list_records_for_table`, `update_records_for_table`, `create_field` …) |
| LinkedIn job scraper (`scraper/`) | Jobs + company About/Services/Posts → Companies | **Runs on the user's Mac only** (Playwright plus its own Chrome profile `~/.chrome-linkedin`). The user runs it, or you guide them. |
| Clay MCP | Decision-maker search, work email, mobile | `search-contacts`, `run_subroutine_direct`, `get-task-context` |
| Relevance AI, project `87c83726-444b-5ecb-bb93-f48503484fa5`, region `d7b62b` | Profile/post scrapes; Gmail, LinkedIn and WhatsApp sends | See §1a. |
| Built-in browser pane | Airtable UI and calls to the Relevance API | `mcp__remote-devices__Claude_Browser__*` |

### 1a. Calling Relevance tools (important)
- The cloud sandbox and the device VM **cannot reach** `api-d7b62b.stack.tryrelevance.com`. The **built-in browser pane can**. Open `https://app.relevanceai.com` with `preview_start`, then use `javascript_tool` to `fetch`:
  `POST https://api-d7b62b.stack.tryrelevance.com/latest/studios/<toolId>/trigger_limited`
  with headers `Authorization: <project_id>:<api_key>` and `Content-Type: application/json`, and body `{"project":"<project_id>","params":{...}}`. Success = HTTP 200 plus `output`. For Gmail sends, `output.gmail_message_id` and `raw_email` show the `From:` line.
- The **local `relevanceai-mcp-server` on the Mac may point at a different Relevance project**. Its `Send_Gmail_email` returned "No google OAuth Account found" for Eassa's account. Use only the tool IDs below, in project `87c83726…`.
- On a machine with network access, the CLI does the same thing: `node relevance/run_tool.mjs`, `node relevance/send_outreach.mjs` (token in `.env`, gitignored).

### 1b. Verified tools (2026-11-21) and per-user routing (`relevance/senders.json`)

| User Email ID | Applicant | Gmail tool (sends as) | LinkedIn invite tool | WhatsApp tool |
|---|---|---|---|---|
| eassahashimev@gmail.com | Eassa Hashim | `1a3e6536-db49-449f-9f75-517504239b3c` (**eassahashim88@gmail.com**) | `5f3c0f8a-9af9-4cc1-898b-7b230346962c` | none |
| syed.munaza@gmail.com | Munaza Shah | `8f08cea6-4eb3-4586-acd5-e57d0db5554e` | `d1137b03-d66f-4404-b008-560c34108a81` | `23a01c2b-21fa-4396-bf13-93ee49f6ede3` |
| lazimabedali@gmail.com | Lazim Abed Ali | `08d256cb-2b21-469c-9daf-09f9e0cf3873` | `6a7c9f6c-e321-4449-915e-a5eca4363f24` | `7325f61f-66bf-4bc3-a7ec-f4b8d9e118de` |

Params: Gmail `{email, subjectline, email_body}`, where `email_body` takes HTML. LinkedIn `{linkedin_url}`. WhatsApp `{mobile_no, message}`.
Scrapers: profile `2749eab9-a468-4a82-8027-e294f26e6de8`, company `85b44884-7019-48fe-a2ff-cbe3f8f0970d`, posts `c0805467-59e2-4848-8fcc-f7996dd969a7`; each takes `{linkedin_url}`.
If the User Email ID isn't in this table, **stop and ask**.

---

## 2. Airtable tables and key fields

**User Test** `tblOnYAjvsaDn9oOp` (the applicants; match `Email` to User Email ID)
Full Name `fld6H6oro4wmtxOfd`, Email `fldmZNtC1virs0mCU`, Linkedin URL `fldWIaXIUlnx8tH6P`, Mobile Number `fldvkXpVUbXQqtYzE`, Profile Summary `fldUUbqJfs7HEwdzs`, Skills, Current/Previous Job 1–6 (title, company, dates, responsibilities), **Resume URL** `fldCv94321Wqtdlrp` (public link used in emails), **Resume File** `fldTNNp2Knpgq7cia` (PDF attachment), **Signature Email** `fldfzSfZuVt5dzNES`, **Email Signature** `fldGIkL5KmycLgK1o` (formula, auto-built).

**Companies** `tbla2BuSNY0G0GEBM` (one row per job)
Company Name `fldw1fEDxBKcVUKhI`, **User Email ID** `fldJBQSCks7jYPHs2`, Job URL `fldmjgULOJxsD3PAr`, Job Title `fldYLY5p0WJrtFhbr`, Job Location `fldrCPw2AXh39x2n1`, Job Description `fldEPf6Uz1gHfJbRZ`, Job Requirements `fldPI6BmhlzESCTpX`, Company LinkedIn URL `fldIjVO20wHrZdRWA`, Company Website `fldw0xFlF7lIyluaI`, Company About `fld2GaT3Y42iwKQTQ`, Recent Posts `fldBQJv4B666BVwz5`, Company Summary `fldS8jQPBuKFvIC6g`, **Company Post Summary** `fldbtXqOW6nb6Nfge`, Prospects (link) `fldYTFQ44scGBAGVF`, Prospect Status `fldrKV3TZxYObzSBU`.

**Prospects** `tblzySJTB4rc1IRC8` (5 per job, per applicant)
Prospect Name `fldtLkmYZk8FYioYH`, Company (link) `fldpi1499uk9swW4k`, **User Email ID** `fldHcESEAaG41jxzV`, Prospect Job Title `fldGhgibdQmAnYdV7`, Prospect LinkedIn URL `fldP8FiV3P3jvunm6`, Prospect Email `fldSWjjyy8GjiJqrd` (verified only), Suggested Email (unverified) `fldjO7pRPh7HCEKSD`, Prospect Mobile Number `fldPb11j2JclGGrfX`, Priority `fldai78FI0YiV5XFp`, Role Type `fldlAy2pibs6dWvmZ`, Contact Status `fldkeBhbgtg1bTnEs`, Prospect Summary `fldrl3o9BM7VtRqsG`, Post Summary `fldaEyZxqyW5oIbEJ`, Company Summary `fldaZzourVdi8uYDL`, **Company Post Summary** `fldCVJ6Hy0Ou00ifB`, Job Match Summary `fldVs5GB29f2NnrD4`, Email Subject Line `fld2tPLi7lsIDtN9r`, Email Body `fldUTHxXWz1xtrVAJ`, **Email Sent At** `fldymJe7CuWQGaUjX`, **LinkedIn Invite Sent At** `fldlBHZHl5tVD8bGE`, **Outreach Log** `fldkJrYeKA1e4orEJ`.

---

## 3. The workflow

### Stage 1: Validate the input
1. Find the User Test row whose `Email` = the User Email ID. If there's none, stop. The user needs to add the applicant: enter their LinkedIn URL, and the Airtable automation `airtable-automations/user_profile_scrape.js` fills in the profile.
2. Check the applicant's `Profile Summary`, `Resume URL`, `Mobile Number` and `Email Signature`. List any that are missing; emails can't be sent until they're filled.
3. Check that the User Email ID is in `relevance/senders.json`.

### Stage 2: Scrape jobs into Companies (user's Mac)
The scraper needs the user's own logged-in Chrome, so it **can't run in the cloud**. Give the user this command:
```bash
cd ~/Desktop/linkedin-jobs   # or the repo's scraper/ folder
bash run.sh --url "<SEARCH URL>" --email <USER EMAIL ID> --limit 10
```
- It asks for the Airtable token (paste it, it stays hidden), opens Chrome, and asks the user to log in to LinkedIn once.
- For each job it saves title, location, type, posted date, description and requirements, plus the company's About, Services and last 5 posts (`--posts N`). Every row is tagged with `User Email ID`. Rows are de-duplicated by Job URL + User Email ID.
- Then confirm in Airtable that the new Companies rows exist for that User Email ID and have a Job Description. Watch for failure modes fixed before: popups ("Are these results helpful?"), an empty description (the selector is `[id^='JobDetails_AboutTheJob'] [data-testid='expandable-text-box']`), and title/company read wrongly (taken from `document.title`).

### Stage 3: Find 5 decision makers per job (Clay)
Follow `.claude/skills/job-prospect-research/SKILL.md`, Steps 1–2. Key rules:
- 5 people: **always 1 HR / CHRO** (walk the HR ladder; at companies under about 50 staff, use the ops or hiring owner), the hiring manager for the role's function, the Founder or CEO, plus other leaders.
- Valid Clay `seniority` values: Founder, Owner, Board Member, Partner, C-suite, VP, Director. "CXO" is invalid.
- **Primary** (2 people) get a mobile number; Secondary people get email only.
- Get **at least 3 emails per job**. Fall back down the HR ladder: Recruitment Manager, Asst HR Manager, and so on.
- If you hit a "Monthly MCP credit limit" error: stop enrichment, set Contact Status = "Pending - Clay credits", and tell the user to raise the cap under **Clay → MCP settings**. That cap is separate from account credits. Once one email at the company is verified, you may fill `Suggested Email (unverified)` using the same pattern.
- Each prospect row gets `User Email ID` copied from the job, plus the Company link.

### Stage 4: Research (Relevance scrapers, then write the summaries)
For each prospect, scrape the profile (`2749eab9`) and posts (`c0805467`). If the LinkedIn URL returns 404, note it in Prospect Summary and ask the user for the correct URL. Don't guess one.
Write, from scraped data only:
1. **Prospect Summary**: role and tenure, past roles, education, location, and an `Outreach angle:` line.
2. **Post Summary**: how often they post, themes with dates, tone, and a `USE IT:` hook.
3. **Company Summary** (Companies and every prospect): Overview, What they do, Products & services, Achievements, Right now, Hiring signal.
4. **Company Post Summary** (Companies and every prospect): how often the company posts, `[date] what` for the last 3–5 posts, themes, and a `USE IT:` hook.
5. **Job Match Summary**: JOB, APPLICANT, FIT (labelled as an estimate), requirement → proof from the profile, gaps, strongest proof, and `PITCH TO <NAME>`.

### Stage 5: Draft the emails (gate first)
**Gate:** all 6 inputs must be present for the prospect: Prospect Summary, Prospect Post Summary, Company Summary, Company Post Summary, Job Description, and the applicant's Profile Summary. To check, run `node relevance/email_context.mjs --record <recId>`, or read the fields through MCP. If anything is missing, go back to Stage 4.

Format: `templates/application_email.md`, based on the approved Razorpay sample:
1. `Dear <First name>,`
2. "Having gone through your profile, I can see you're <role> — which is exactly why I wanted to reach out directly about the <Job Title> role at <Company>."
3. "After a quick look at <Company>, I noticed <1–2 specifics from the Company and Company Post Summaries> …"
4. 2–3 proof points from the applicant's profile, mapped to the job description.
5. "If you are not the right person for this, I'd genuinely appreciate it if you could point me to the right colleague — I'd be grateful for the introduction."
6. "Could we do 20 minutes to discuss how I can help <Company> <goal>, <First name>? {{RESUME_LINK}}"

Further rules:
- Save the body **without a sign-off**. The signature is added at send time.
- Never write "resume attached"; the Gmail tool sends no attachment.
- Never hand-type a resume link, phone number or LinkedIn URL.
- Adjust the angle to the role: hiring manager = builder to builder; CEO = business outcome; CTO = technical depth; HR/ops = short and practical; PM = product first.
- Subject under 70 characters. Body about 180–230 words.
- Write Email Subject Line and Email Body to Prospects.

### Stage 6: Approval (required)
Show the user a table (prospect, To, verified/guessed, subject), one email in full as it will arrive (with signature), and the sending account. Ask which recipients to send to. Wait for the answer.

### Stage 7: Send
For each approved prospect:
1. Build the final body. Replace `{{RESUME_LINK}}` with `[Download my resume](<Resume URL>)`, and `{{LINKEDIN_URL}}` / `{{APPLICANT_NAME}}` from User Test. Append the applicant's **Email Signature**.
2. **Convert to HTML**: paragraphs become `<p>`, line breaks become `<br>`, and markdown links become `<a href>`. Plain text would show raw `[text](url)`.
3. Run the identity check (`identityProblems` in `relevance/lib.mjs`). If another applicant's name, LinkedIn or resume link appears, or the body says "resume attached", block the send.
4. Call that applicant's Gmail tool (§1b) through the browser pane fetch (§1a). Send one email first to confirm the account works, then the rest in a single JS loop. Collect status, `gmail_message_id` and the `From:` line.
5. Send a LinkedIn invite only if the user asked for it: that applicant's LinkedIn tool, `{linkedin_url}`.

### Stage 8: Log and report
- For each sent prospect, update Airtable: `Email Sent At` (ISO time), `Contact Status` = "Contacted" (use typecast), and `Outreach Log` = `<time IST> email sent via <tool title> (<id>) from <sending address> to <recipient> (verified|UNVERIFIED) Gmail msg <id>`. Do the same with `LinkedIn Invite Sent At` for invites.
- Report to the user:
  - what was sent, and which recipients were guessed addresses;
  - to check for bounces in the sending inbox over the next hour;
  - anything still blocked: missing verified emails, 404 LinkedIn URLs, a missing resume or mobile;
  - to rotate the token if it was pasted in chat.

---

## 4. Known issues and gotchas
- **Airtable attachments.** The API only accepts files from a public URL. Making a Drive file public was blocked by the permission check. To attach a local file, put it in the user's connected folder and ask them to drop it into the field (built-in browser → record → field → Local Files).
- **The user's Chrome is signed into a different Airtable account** with no access to this base. Use the **built-in browser** for Airtable UI work.
- **The scraper only runs on the Mac.** Attaching over CDP to Chrome 157 failed; it uses `launchPersistentContext` with `channel: "chrome"` and the `~/.chrome-linkedin` profile.
- **Apollo via Relevance** returns 403 on the Free plan. Don't retry.
- **Relevance LinkedIn tool descriptions** all say "Lazim's account", but each tool uses a different OAuth account. Trust the IDs in §1b.
- **Missing applicant data:** Lazim and Munaza have no Resume URL or Mobile in User Test yet. Their signatures are incomplete, and the send gate blocks them until both are filled.
- **Open MVP1 items:** Jay Pandya's LinkedIn URL (`/in/zingify`) returns 404. Four MVP1 emails went to guessed addresses on 2026-11-21.

## 5. Files in this repo
- `scraper/`: LinkedIn jobs to Airtable (Mac).
- `.claude/skills/job-prospect-research/`: Stages 3–5 in detail.
- `.claude/skills/relevance-tools/`: tool catalog, routing and the send procedure.
- `relevance/tools.json`, `relevance/senders.json`: verified tool IDs and per-applicant routing.
- `relevance/lib.mjs`, `relevance/email_context.mjs`, `relevance/send_outreach.mjs`, `relevance/run_tool.mjs`.
- `templates/application_email.md`: the email format.
- `airtable-automations/`: applicant profile scrape, send-to-Clay webhook.
- `docs/clay-openai-pipeline.md`: planned cloud version (Clay tables + OpenAI).
