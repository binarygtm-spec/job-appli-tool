#!/usr/bin/env node
/**
 * Print everything that must be analysed before composing an application email for a prospect:
 * the 6 required inputs, the job, and the applicant identity/signature (chosen by User Email ID).
 * Exits 2 if any required input is missing, so composing can't start on incomplete research.
 *
 *   node relevance/email_context.mjs --record <prospect recId> [--json]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, loadContext, REQUIRED_INPUTS } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(here, "..", ".env"));
const i = process.argv.indexOf("--record");
const rec = i > 0 ? process.argv[i + 1] : null;
if (!rec) { console.error("Usage: node relevance/email_context.mjs --record <prospect recId> [--json]"); process.exit(1); }

const ctx = await loadContext(rec);
if (process.argv.includes("--json")) { console.log(JSON.stringify(ctx, null, 2)); process.exit(ctx.missing.length ? 2 : 0); }

console.log(`PROSPECT : ${ctx.prospect.name} — ${ctx.prospect.title}`);
console.log(`JOB      : ${ctx.job.title} @ ${ctx.job.company}  ${ctx.job.url}`);
console.log(`APPLICANT: ${ctx.applicant.name} <${ctx.applicant.userEmail}>`);
for (const [k] of REQUIRED_INPUTS) console.log(`\n=== ${k} ${ctx.inputs[k] ? "" : "(MISSING)"}\n${ctx.inputs[k]}`);
console.log(`\n=== Job Requirements\n${ctx.job.requirements}`);
console.log(`\n=== Job Match Summary\n${ctx.prospect.jobMatch}`);
console.log(`\n=== Signature (appended automatically)\n${ctx.applicant.signature}`);
console.log(`\nResume URL : ${ctx.applicant.resume || "(MISSING in User Test)"}\nLinkedIn   : ${ctx.applicant.linkedin}`);
if (ctx.missing.length) { console.error(`\n✗ Missing inputs: ${ctx.missing.join(", ")}. Research these before composing.`); process.exit(2); }
console.log("\n✓ All 6 inputs present.");
