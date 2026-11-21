/************************************************************
 * USER TEST — LINKEDIN PROFILE → RESUME FIELDS
 * Airtable automation "Run script" → Relevance AI tool
 * Writes the parsed profile straight into the User Test record
 * (no "Update record" step needed).
 *
 * Input variables (left panel → Inputs):
 *   linkedinUrl  →  Trigger record › Linkedin URL
 *   recordId     →  Trigger record › Airtable record ID
 * Secret (left panel → Secrets):
 *   Propkee_API_Relevance
 *
 * Only non-empty scraped values are written, so anything
 * already typed in a field (e.g. Email) is never blanked out.
 ************************************************************/

const { linkedinUrl, recordId } = input.config();
const USER_TABLE_ID = "tblOnYAjvsaDn9oOp"; // User Test
const RELEVANCE_API_KEY = input.secret("Propkee_API_Relevance");

// ---- Relevance tool (from the tool's /build URL) ----------
// .../notebook/<REGION>/<PROJECT_ID>/<TOOL_ID>/build
const REGION = "d7b62b";
const PROJECT_ID = "87c83726-444b-5ecb-bb93-f48503484fa5";
const TOOL_ID = "2749eab9-a468-4a82-8027-e294f26e6de8";
// Alternate tool you shared (Propkee project):
// PROJECT_ID = "ccf11747-9ae5-5362-816d-a8be2633dc3c"
// TOOL_ID    = "82ca9452-07dc-413c-ab56-5b10b3265604"

const ENDPOINT = `https://api-${REGION}.stack.tryrelevance.com/latest/studios/${TOOL_ID}/trigger_limited`;
const MAX_TEXT = 95000; // Airtable long text limit is 100k chars
const MAX_PREVIOUS_JOBS = 6;

/* ----------------------- helpers ----------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseMaybeJson(v) {
  if (typeof v !== "string") return v;
  let s = v.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  if (s.startsWith("{") || s.startsWith("[")) {
    try { return JSON.parse(s); } catch (e) { /* not JSON */ }
  }
  return v;
}

function isEmpty(v) {
  return v === undefined || v === null || v === "" ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
}

// First non-empty value among keys (supports "a.b" paths)
function pick(obj, ...keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = k.split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), obj);
    if (!isEmpty(v)) return v;
  }
  return undefined;
}

function txt(v, sep = ", ") {
  if (isEmpty(v)) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(x => txt(x, sep)).filter(Boolean).join(sep);
  const named = pick(v, "name", "title", "text", "value", "skill", "label");
  if (named) return txt(named);
  return JSON.stringify(v);
}

function clip(s) {
  s = s || "";
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "…[truncated]" : s;
}

function fmtDate(d) {
  if (isEmpty(d)) return "";
  if (typeof d === "string") return d.trim();
  if (typeof d === "number") return String(d);
  const y = pick(d, "year", "y");
  const m = pick(d, "month", "m");
  if (!y) return "";
  const mNum = Number(m);
  const mName = mNum >= 1 && mNum <= 12 ? MONTHS[mNum - 1] : (m ? String(m) : "");
  return [mName, y].filter(Boolean).join(" ");
}

// Find the object in the response that most looks like a LinkedIn profile
function findProfile(root) {
  const signals = ["experiences", "experience", "positions", "position",
    "full_name", "fullName", "firstName", "first_name", "about", "summary",
    "headline", "skills", "educations", "education"];
  let best = null, bestScore = 0;
  const seen = new Set();
  const queue = [{ node: parseMaybeJson(root), depth: 0 }];
  while (queue.length) {
    const { node, depth } = queue.shift();
    if (!node || typeof node !== "object" || seen.has(node) || depth > 8) continue;
    seen.add(node);
    if (!Array.isArray(node)) {
      const score = signals.filter(k => !isEmpty(node[k])).length;
      if (score > bestScore) { best = node; bestScore = score; }
    }
    for (const v of Object.values(node)) {
      const p = parseMaybeJson(v);
      if (p && typeof p === "object") queue.push({ node: p, depth: depth + 1 });
    }
  }
  return best || {};
}

function jobDates(exp) {
  let start = fmtDate(pick(exp, "starts_at", "start", "start_date", "startDate", "date.start"));
  let end = fmtDate(pick(exp, "ends_at", "end", "end_date", "endDate", "date.end"));
  if (!start && pick(exp, "start_year")) {
    start = fmtDate({ year: exp.start_year, month: exp.start_month });
  }
  if (!end && pick(exp, "end_year")) {
    end = fmtDate({ year: exp.end_year, month: exp.end_month });
  }
  const range = txt(pick(exp, "date_range", "dateRange", "duration", "period"));
  if ((!start || !end) && range.includes("-")) {
    const [s, e] = range.split(/\s+[-–]\s+/);
    if (!start && s) start = s.trim();
    if (!end && e) end = e.split("·")[0].trim();
  }
  const current = exp.is_current === true || exp.isCurrent === true ||
    /present|current/i.test(end || "");
  if (current || (start && !end)) end = "Present";
  return { start, end, current };
}

function mapJob(exp) {
  const d = jobDates(exp);
  return {
    title: txt(pick(exp, "title", "position", "job_title", "role")),
    company: txt(pick(exp, "company", "company_name", "companyName", "organization", "company.name")),
    start: d.start,
    end: d.end,
    current: d.current,
    type: txt(pick(exp, "job_type", "employment_type", "employmentType", "type", "workplace_type")),
    responsibilities: txt(pick(exp, "description", "summary", "responsibilities", "details"), "\n"),
  };
}

function degreeText(ed) {
  return [pick(ed, "degree", "degree_name", "degreeName"),
          pick(ed, "field_of_study", "fieldOfStudy", "field")]
    .map(x => txt(x)).filter(Boolean).join(", ");
}

/* ----------------------- validate ---------------------- */

const linkedin_url = String(linkedinUrl || "").trim();
if (!linkedin_url) throw new Error("LinkedIn Profile URL is missing");
if (!RELEVANCE_API_KEY) throw new Error("Relevance API key secret is missing");
if (!recordId) throw new Error("recordId input variable is missing");

/* ----------------------- call Relevance ---------------- */

console.log("Scraping:", linkedin_url);

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Authorization": `${PROJECT_ID}:${RELEVANCE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ project: PROJECT_ID, params: { linkedin_url } }),
});

const raw = await response.text();
let result;
try { result = JSON.parse(raw); }
catch (e) { throw new Error("Invalid API response: " + raw.slice(0, 500)); }

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ` + JSON.stringify(result).slice(0, 1000));
}
if (result.status === "failed" || (Array.isArray(result.errors) && result.errors.length)) {
  throw new Error("Tool failed: " + JSON.stringify(result.errors || result).slice(0, 1000));
}

/* ----------------------- parse profile ----------------- */

const profile = findProfile(result.output ?? result);
console.log("Profile keys found:", Object.keys(profile).join(", "));

// Name
const fullName = txt(pick(profile, "full_name", "fullName", "name")) ||
  [txt(pick(profile, "first_name", "firstName")), txt(pick(profile, "last_name", "lastName"))]
    .filter(Boolean).join(" ");

// Location → city + rest
let city = txt(pick(profile, "city", "geo.city", "location.city"));
let locationRest = [txt(pick(profile, "state", "geo.state")),
                    txt(pick(profile, "country", "country_full_name", "geo.country"))]
  .filter(Boolean).join(", ");
const locString = txt(pick(profile, "location", "geo.full", "locationName"));
if (locString && typeof pick(profile, "location") !== "object") {
  const parts = locString.split(",").map(s => s.trim()).filter(Boolean);
  if (!city && parts.length) city = parts[0];
  if (!locationRest) locationRest = parts.slice(1).join(", ") || parts[0] || "";
}

// Contact
const email = txt(pick(profile, "email", "emails", "contact_info.email", "personal_emails"));
const phone = txt(pick(profile, "phone", "phone_number", "phones", "mobile", "contact_info.phone"));

// Experience
const expRaw = pick(profile, "experiences", "experience", "positions", "position",
                    "work_experience", "workExperience") || [];
const jobs = (Array.isArray(expRaw) ? expRaw : [expRaw]).map(parseMaybeJson).map(mapJob)
  .filter(j => j.title || j.company);

let currentIdx = jobs.findIndex(j => j.current);
if (currentIdx === -1) currentIdx = 0;
const current = jobs[currentIdx] || {};
const previous = jobs.filter((_, i) => i !== currentIdx).slice(0, MAX_PREVIOUS_JOBS);

// Education (degree + field only — university intentionally skipped)
const eduRaw = pick(profile, "educations", "education") || [];
const edus = (Array.isArray(eduRaw) ? eduRaw : [eduRaw]).map(parseMaybeJson);
const MASTER_RE = /\b(master\w*|mba|pgdm|pgdba|pgd\w*|post[\s-]?graduat\w*|msc|m\.\s?sc|ms|m\.s\.|mtech|m\.\s?tech|mca|ma|m\.a\.|mcom|m\.\s?com|executive education)\b/i;
const BACHELOR_RE = /\b(bachelor\w*|btech|b\.\s?tech|be|b\.e\.|bsc|b\.\s?sc|bca|bba|bcom|b\.\s?com|ba|b\.a\.|undergraduat\w*)\b/i;
const eduText = e => [txt(pick(e, "degree", "degree_name", "degreeName")),
                      txt(pick(e, "field_of_study", "fieldOfStudy", "field"))].join(" ");
const masters = edus.find(e => MASTER_RE.test(eduText(e)));
const bachelors = edus.find(e => e !== masters && BACHELOR_RE.test(eduText(e)));

// Skills — profile-level list, else collect skills listed under each job
let skills = txt(pick(profile, "skills", "skill", "top_skills"), ", ");
if (!skills) {
  const fromJobs = (Array.isArray(expRaw) ? expRaw : [])
    .map(e => txt(pick(parseMaybeJson(e), "skills"), ", "))
    .join(", ").split(/\s*[,·|]\s*/).map(s => s.trim()).filter(Boolean);
  skills = [...new Set(fromJobs)].join(", ");
}
const achievements = [
  txt(pick(profile, "honors_and_awards", "honors", "awards", "accomplishments"), "\n"),
  txt(pick(profile, "certifications", "certificates"), "\n"),
].filter(Boolean).join("\n");
const interests = txt(pick(profile, "interests", "causes", "volunteer_causes"), ", ");

/* ----------------------- write to User Test ----------- */

const values = {
  "Full Name": fullName,
  "Profile Summary": txt(pick(profile, "about", "summary", "headline"), "\n"),
  "Email": email,
  "Mobile Number": phone,
  "Current City": city,
  "Current Location": locationRest,
  "Current Job Type": current.type || txt(pick(profile, "job_type", "employment_type")),
  "Skills": skills,
  "Current Job Title": current.title || txt(pick(profile, "job_title", "occupation")),
  "Current Company": current.company || txt(pick(profile, "company")),
  "Current Job Start Date": current.start ||
    fmtDate({ year: profile.current_company_join_year, month: profile.current_company_join_month }),
  "Current Job End Date": current.end || (current.title || profile.job_title ? "Present" : ""),
  "Current Job Responsibilities": current.responsibilities,
  "Master's Degree": masters ? degreeText(masters) : "",
  "Bachelor's Degree": bachelors ? degreeText(bachelors) : "",
  "Achievements": achievements,
  "Interests": interests,
  "Relevance Profile Output": JSON.stringify(result.output ?? result, null, 2),
};

for (let i = 0; i < MAX_PREVIOUS_JOBS; i++) {
  const j = previous[i] || {};
  const n = i + 1;
  values[`Previous Job ${n} Title`] = j.title;
  values[`Previous Job ${n} Company`] = j.company;
  values[`Previous Job ${n} Start Date`] = j.start;
  values[`Previous Job ${n} End Date`] = j.end;
  values[`Previous Job ${n} Responsibilities`] = j.responsibilities;
}

const table = base.getTable(USER_TABLE_ID);
const existing = await table.selectRecordAsync(recordId, { fields: ["Email"] });
if (!existing) throw new Error("User Test record not found: " + recordId);

// Never overwrite an Email the user already entered (it's the key that links jobs)
if (existing.getCellValueAsString("Email").trim()) delete values["Email"];

const update = {};
const filled = [], empty = [];
for (const [field, v] of Object.entries(values)) {
  const s = clip(typeof v === "string" ? v.trim() : txt(v));
  if (s) { update[field] = s; filled.push(field); } else { empty.push(field); }
}

await table.updateRecordAsync(recordId, update);

output.set("status", "success");
output.set("fieldsFilled", filled.length);
output.set("emptyFields", empty.join(", "));

console.log(`Done: ${fullName} | ${values["Current Job Title"] || "-"} @ ${values["Current Company"] || "-"} | ${previous.length} previous jobs`);
console.log(`Filled ${filled.length} fields. Not in scrape: ${empty.join(", ") || "none"}`);
