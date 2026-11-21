#!/usr/bin/env node
/**
 * Send a prospect's application email and/or LinkedIn invite from the APPLICANT's own
 * Relevance-connected accounts. The sender is chosen by the prospect's "User Email ID"
 * (see relevance/senders.json), e.g. eassahashimev@gmail.com -> Eassa Gmail tool
 * (sends as eassahashim88@gmail.com) + Eassa LinkedIn invite tool.
 *
 * DRY RUN by default. Nothing is sent unless you pass --confirm.
 *
 *   # From an Airtable Prospects record (needs AIRTABLE_TOKEN in .env)
 *   node relevance/send_outreach.mjs --record rec7bqm4zk1Mfn1P2                 # preview
 *   node relevance/send_outreach.mjs --record rec7bqm4zk1Mfn1P2 --confirm       # email + invite
 *   node relevance/send_outreach.mjs --record rec7bqm4zk1Mfn1P2 --only email --confirm
 *
 *   # Explicit arguments (no Airtable)
 *   node relevance/send_outreach.mjs --user eassahashimev@gmail.com --to jane@acme.com \
 *     --subject "..." --body-file body.txt --linkedin https://www.linkedin.com/in/jane/ --confirm
 *
 * Options: --only email|linkedin   --allow-unverified (use "Suggested Email (unverified)")
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(here, "..", ".env"));

const BASE = "appKwvv5s2XpX4etA";
const PROSPECTS = "tblzySJTB4rc1IRC8";
const F = {
  name: "Prospect Name",
  user: "User Email ID",
  email: "Prospect Email",
  suggested: "Suggested Email (unverified)",
  linkedin: "Prospect LinkedIn URL",
  subject: "Email Subject Line",
  body: "Email Body",
  status: "Contact Status",
  emailSentAt: "Email Sent At",
  inviteSentAt: "LinkedIn Invite Sent At",
  log: "Outreach Log",
};

const args = parseArgs(process.argv.slice(2));
const catalog = JSON.parse(fs.readFileSync(path.join(here, "tools.json"), "utf8"));
const { senders } = JSON.parse(fs.readFileSync(path.join(here, "senders.json"), "utf8"));
const TOKEN = process.env.RELEVANCE_AUTH_TOKEN;
const REGION = process.env.RELEVANCE_REGION || catalog.region;
const AT = process.env.AIRTABLE_TOKEN;
const confirm = !!args.confirm;
const only = args.only; // "email" | "linkedin" | undefined

// ---- 1. Gather the outreach ------------------------------------------------
let p; // { recordId?, name, user, to, linkedin, subject, body, log }
if (args.record) {
  if (!AT) die("Set AIRTABLE_TOKEN in .env to read Prospects records.");
  const r = await airtable(`GET`, `${PROSPECTS}/${args.record}`);
  const f = r.fields;
  let to = f[F.email];
  if (!to && args["allow-unverified"]) to = f[F.suggested];
  p = {
    recordId: r.id, name: f[F.name], user: (f[F.user] || "").trim().toLowerCase(),
    to, linkedin: f[F.linkedin], subject: f[F.subject], body: f[F.body], log: f[F.log] || "",
    alreadyEmailed: f[F.emailSentAt], alreadyInvited: f[F.inviteSentAt],
  };
} else {
  p = {
    name: args.name || args.to, user: (args.user || "").trim().toLowerCase(),
    to: args.to, linkedin: args.linkedin, subject: args.subject,
    body: args["body-file"] ? fs.readFileSync(args["body-file"], "utf8") : args.body,
  };
}

const sender = senders[p.user];
if (!sender) die(`No sender configured for User Email ID "${p.user}". Known: ${Object.keys(senders).join(", ")}`);

// ---- 2. Plan ---------------------------------------------------------------
const plan = [];
if (only !== "linkedin") {
  if (!p.to) console.warn(`! Skipping email: no verified Prospect Email${args.record ? " (use --allow-unverified to use the suggested one)" : ""}.`);
  else if (!p.subject || !p.body) console.warn("! Skipping email: subject or body is empty.");
  else if (p.alreadyEmailed && !args.force) console.warn(`! Skipping email: already sent ${p.alreadyEmailed} (use --force to resend).`);
  else plan.push({ kind: "email", tool: tool(sender.gmail), params: { email: p.to, subjectline: p.subject, email_body: p.body } });
}
if (only !== "email") {
  if (!sender.linkedin_invite) console.warn("! Skipping LinkedIn: no invite tool for this user.");
  else if (!p.linkedin) console.warn("! Skipping LinkedIn: no Prospect LinkedIn URL.");
  else if (p.alreadyInvited && !args.force) console.warn(`! Skipping LinkedIn: invite already sent ${p.alreadyInvited}.`);
  else plan.push({ kind: "linkedin", tool: tool(sender.linkedin_invite), params: { linkedin_url: p.linkedin } });
}

console.log(`\nProspect : ${p.name || "-"}${p.recordId ? ` (${p.recordId})` : ""}`);
console.log(`Applicant: ${sender.name} <${p.user}>  — email sends as ${sender.send_from_email}`);
for (const s of plan) {
  console.log(`\n[${s.kind}] via "${s.tool.title}" (${s.tool.id})`);
  if (s.kind === "email") {
    console.log(`  To     : ${s.params.email}\n  Subject: ${s.params.subjectline}\n  Body   :\n${indent(s.params.email_body)}`);
  } else console.log(`  Invite : ${s.params.linkedin_url}`);
}
if (!plan.length) die("\nNothing to send.");
if (!confirm) { console.log("\nDRY RUN — nothing sent. Re-run with --confirm to send."); process.exit(0); }
if (!TOKEN) die("Set RELEVANCE_AUTH_TOKEN (project_id:api_key) in .env.");

// ---- 3. Send ---------------------------------------------------------------
const now = new Date().toISOString();
const update = {};
let log = p.log || "";
let failed = false;
for (const s of plan) {
  try {
    const out = await runTool(s.tool.id, s.params);
    console.log(`✓ ${s.kind} sent via ${s.tool.title}`);
    if (s.kind === "email") update[F.emailSentAt] = now; else update[F.inviteSentAt] = now;
    log += `${now} ${s.kind} sent via ${s.tool.title} (${s.tool.id}) from ${sender.name}${s.kind === "email" ? ` to ${s.params.email}` : ""}\n`;
    if (args.verbose) console.log(JSON.stringify(out, null, 2).slice(0, 2000));
  } catch (e) {
    failed = true;
    console.error(`✗ ${s.kind} failed: ${e.message}`);
    log += `${now} ${s.kind} FAILED via ${s.tool.title}: ${e.message.slice(0, 200)}\n`;
  }
}
if (p.recordId && AT) {
  update[F.log] = log;
  if (update[F.emailSentAt]) update[F.status] = "Contacted";
  try { await airtable("PATCH", `${PROSPECTS}/${p.recordId}`, { fields: update, typecast: true }); console.log("✓ Airtable updated"); }
  catch (e) { console.error(`! Airtable update failed: ${e.message}`); }
}
process.exit(failed ? 1 : 0);

// ---- helpers ---------------------------------------------------------------
function tool(id) {
  const t = catalog.tools.find(t => t.id === id || t.alias === id);
  if (!t) die(`Tool ${id} not in tools.json`);
  return t;
}
async function runTool(id, params) {
  const project = TOKEN.split(":")[0];
  const res = await fetch(`https://api-${REGION}.stack.tryrelevance.com/latest/studios/${id}/trigger_limited`, {
    method: "POST",
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ project, params }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || json.status === "failed" || (Array.isArray(json.errors) && json.errors.length))
    throw new Error(JSON.stringify(json.errors || json).slice(0, 500));
  return json.output ?? json;
}
async function airtable(method, pathPart, body) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/${pathPart}`, {
    method, headers: { Authorization: `Bearer ${AT}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));
  return json;
}
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    if (a[i + 1] && !a[i + 1].startsWith("--")) o[k] = a[++i]; else o[k] = true;
  }
  return o;
}
function indent(s) { return String(s).split("\n").map(l => "    " + l).join("\n"); }
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
function die(msg) { console.error(msg); process.exit(1); }
