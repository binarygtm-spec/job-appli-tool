/************************************************************
 * AIRTABLE AUTOMATION — Companies row → Clay "Job Companies" table
 *
 * Trigger: When a record matches conditions (table: Companies)
 *   Prospect Status is empty
 *   AND Company LinkedIn URL is not empty
 *   AND User Email ID is not empty
 *
 * Action: Run script (this file)
 *   Input variable:  recordId → Airtable record ID (from trigger)
 *   Secrets:         CLAY_WEBHOOK_URL   (from the Clay table's webhook source)
 *                    CLAY_WEBHOOK_TOKEN (optional, if you enabled auth on the webhook)
 ************************************************************/

const { recordId } = input.config();
const WEBHOOK_URL = input.secret("CLAY_WEBHOOK_URL");
let WEBHOOK_TOKEN = "";
try { WEBHOOK_TOKEN = input.secret("CLAY_WEBHOOK_TOKEN"); } catch (e) { /* optional */ }

const table = base.getTable("tbla2BuSNY0G0GEBM"); // Companies
const r = await table.selectRecordAsync(recordId);
if (!r) throw new Error("Record not found: " + recordId);

const get = f => r.getCellValueAsString(f).trim();
const userEmail = get("User Email ID").toLowerCase();
const companyUrl = get("Company LinkedIn URL");
if (!userEmail) throw new Error("User Email ID is empty — every job must be tagged with the user who searched it.");
if (!companyUrl) throw new Error("Company LinkedIn URL is empty.");

const website = get("Company Website");
const domain = website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];

// Skip if prospects were already found for the same company + same user (another job row)
const all = await table.selectRecordsAsync({ fields: ["Company LinkedIn URL", "User Email ID", "Prospect Status", "Prospects"] });
const twin = all.records.find(x =>
  x.id !== recordId &&
  x.getCellValueAsString("Company LinkedIn URL").replace(/\/+$/, "") === companyUrl.replace(/\/+$/, "") &&
  x.getCellValueAsString("User Email ID").trim().toLowerCase() === userEmail &&
  x.getCellValueAsString("Prospect Status") === "Prospects found");
if (twin) {
  // Reuse the same prospects: link them to this job row too
  const links = (twin.getCellValue("Prospects") || []).map(p => ({ id: p.id }));
  await table.updateRecordAsync(recordId, { "Prospects": links, "Prospect Status": { name: "Prospects found" } });
  output.set("status", "reused prospects from " + twin.id);
  return;
}

const payload = {
  airtable_record_id: recordId,
  user_email_id: userEmail,
  company_name: get("Company Name"),
  company_linkedin_url: companyUrl,
  company_domain: domain,
  company_size: get("Company Size"),
  industry: get("Industry"),
  job_title: get("Job Title"),
  job_location: get("Job Location"),
  job_description: get("Job Description").slice(0, 4000),
};

const headers = { "Content-Type": "application/json" };
if (WEBHOOK_TOKEN) headers["x-clay-webhook-auth"] = WEBHOOK_TOKEN;

const res = await fetch(WEBHOOK_URL, { method: "POST", headers, body: JSON.stringify(payload) });
const text = await res.text();
if (!res.ok) throw new Error(`Clay webhook ${res.status}: ${text.slice(0, 300)}`);

output.set("status", "sent to Clay");
output.set("company", payload.company_name);
output.set("user", userEmail);
