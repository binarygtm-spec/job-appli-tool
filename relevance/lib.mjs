// Shared helpers: Airtable access, the 6 required email inputs, and per-applicant identity/signature.
import fs from "node:fs";
import path from "node:path";

export const BASE = "appKwvv5s2XpX4etA";
export const T = { users: "tblOnYAjvsaDn9oOp", companies: "tbla2BuSNY0G0GEBM", prospects: "tblzySJTB4rc1IRC8" };

// The 6 inputs that must be analysed (and non-empty) before an email is composed or sent.
export const REQUIRED_INPUTS = [
  ["Prospect Summary", "prospect"],
  ["Prospect Post Summary", "prospect"],
  ["Company Summary", "company"],
  ["Company Post Summary", "company"],
  ["Job Description", "company"],
  ["Applicant Profile Summary", "user"],
];

export function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export async function airtable(method, pathPart, body) {
  const AT = process.env.AIRTABLE_TOKEN;
  if (!AT) throw new Error("Set AIRTABLE_TOKEN in .env");
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/${pathPart}`, {
    method, headers: { Authorization: `Bearer ${AT}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));
  return json;
}

const s = v => (Array.isArray(v) ? v.join("\n") : v == null ? "" : String(v)).trim();

/** Everything needed to compose or send for one prospect, plus which required inputs are missing. */
export async function loadContext(prospectId) {
  const p = (await airtable("GET", `${T.prospects}/${prospectId}`)).fields;
  const companyId = (p["Company"] || [])[0];
  const c = companyId ? (await airtable("GET", `${T.companies}/${companyId}`)).fields : {};
  const userEmail = s(p["User Email ID"]).toLowerCase();
  const formula = encodeURIComponent(`LOWER(TRIM({Email}))='${userEmail.replace(/'/g, "")}'`);
  const users = (await airtable("GET", `${T.users}?filterByFormula=${formula}&maxRecords=1`)).records;
  const u = users[0]?.fields || {};

  const inputs = {
    "Prospect Summary": s(p["Prospect Summary"]),
    "Prospect Post Summary": s(p["Post Summary"]),
    "Company Summary": s(p["Company Summary"]) || s(c["Company Summary"]),
    "Company Post Summary": s(p["Company Post Summary"]) || s(c["Company Post Summary"]),
    "Job Description": s(c["Job Description"]),
    "Applicant Profile Summary": s(u["Profile Summary"]),
  };
  const applicant = {
    recordId: users[0]?.id,
    userEmail,
    name: s(u["Full Name"]),
    mobile: s(u["Mobile Number"]),
    signatureEmail: s(u["Signature Email"]) || s(u["Email"]),
    linkedin: s(u["Linkedin URL"]),
    resume: s(u["Resume URL"]),
    signature: s(u["Email Signature"]),
  };
  return {
    prospect: {
      id: prospectId, name: s(p["Prospect Name"]), title: s(p["Prospect Job Title"]),
      email: s(p["Prospect Email"]), suggested: s(p["Suggested Email (unverified)"]),
      linkedin: s(p["Prospect LinkedIn URL"]), subject: s(p["Email Subject Line"]), body: s(p["Email Body"]),
      jobMatch: s(p["Job Match Summary"]), log: s(p["Outreach Log"]),
      emailSentAt: p["Email Sent At"], inviteSentAt: p["LinkedIn Invite Sent At"],
    },
    job: { id: companyId, company: s(c["Company Name"]), title: s(c["Job Title"]), url: s(c["Job URL"]), requirements: s(c["Job Requirements"]) },
    inputs,
    missing: Object.entries(inputs).filter(([, v]) => !v).map(([k]) => k),
    applicant,
  };
}

/**
 * Final email body for an applicant:
 *  - {{RESUME_LINK}} / {{LINKEDIN_URL}} / {{APPLICANT_NAME}} placeholders are filled from User Test
 *  - any existing sign-off ("Best regards," … to the end) is replaced by the applicant's own signature
 */
export function finaliseBody(body, a) {
  let out = String(body)
    .replaceAll("{{RESUME_LINK}}", a.resume ? `[Download my resume](${a.resume})` : "")
    .replaceAll("{{LINKEDIN_URL}}", a.linkedin)
    .replaceAll("{{APPLICANT_NAME}}", a.name);
  const idx = out.search(/\n\s*(best regards|kind regards|regards|thanks|thank you|cheers|warm regards|sincerely),?\s*\n/i);
  if (idx >= 0) out = out.slice(0, idx);
  return `${out.trimEnd()}\n\n${a.signature}`;
}

/** Problems that must block a send: other applicants' identity in the email, missing identity, placeholders. */
export function identityProblems(finalBody, a, allSenders) {
  const problems = [];
  if (!a.name) problems.push("applicant not found in User Test (check User Email ID)");
  if (!a.signature) problems.push("applicant has no Email Signature");
  if (!a.resume) problems.push("applicant has no Resume URL in User Test");
  if (/\{\{[A-Z_]+\}\}/.test(finalBody)) problems.push("unfilled {{placeholder}} left in body");
  if (/resume attached|attached (my|the) resume/i.test(finalBody)) problems.push('body says "resume attached" but the Gmail tool sends no attachment; use {{RESUME_LINK}}');
  for (const [email, other] of Object.entries(allSenders)) {
    if (email === a.userEmail) continue;
    for (const marker of [email, other.send_from_email?.split(" ")[0], ...(other.identity_markers || [])].filter(Boolean)) {
      if (finalBody.toLowerCase().includes(marker.toLowerCase())) problems.push(`body contains another applicant's detail: ${marker}`);
    }
  }
  return problems;
}

export function readJson(here, f) { return JSON.parse(fs.readFileSync(path.join(here, f), "utf8")); }
