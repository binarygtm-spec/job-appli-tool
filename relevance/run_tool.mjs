#!/usr/bin/env node
/**
 * Run any Relevance AI tool on demand.
 *
 *   node relevance/run_tool.mjs <tool-id | alias | title words> '<json params>'
 *   node relevance/run_tool.mjs linkedin-profile '{"linkedin_url":"https://www.linkedin.com/in/eassahashim/"}'
 *   node relevance/run_tool.mjs --list
 *
 * Auth: RELEVANCE_AUTH_TOKEN="<project_id>:<api_key>" (from .env or the shell). Never commit it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(here, "..", ".env"));

const catalog = JSON.parse(fs.readFileSync(path.join(here, "tools.json"), "utf8"));
const TOKEN = process.env.RELEVANCE_AUTH_TOKEN;
const REGION = process.env.RELEVANCE_REGION || catalog.region;

const [, , target, rawParams] = process.argv;

if (!target || target === "--list") {
  for (const t of catalog.tools) {
    console.log(`${t.id}  ${(t.alias || "-").padEnd(22)} ${t.title || "(run list_tools.mjs to fill in)"}`);
    if (t.params) console.log(`    params: ${JSON.stringify(t.params)}`);
  }
  process.exit(0);
}
if (!TOKEN) die("Set RELEVANCE_AUTH_TOKEN (project_id:api_key) in .env or your shell.");

const tool = findTool(target);
if (!tool) die(`No tool matches "${target}". Run with --list.`);

let params = {};
if (rawParams) {
  try { params = JSON.parse(rawParams); } catch { die("Params must be valid JSON, e.g. '{\"url\":\"...\"}'"); }
}

const project = TOKEN.split(":")[0];
const url = `https://api-${REGION}.stack.tryrelevance.com/latest/studios/${tool.id}/trigger_limited`;
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({ project, params }),
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { die(`HTTP ${res.status}: ${text.slice(0, 500)}`); }
if (!res.ok || json.status === "failed" || (Array.isArray(json.errors) && json.errors.length)) {
  console.error(JSON.stringify(json, null, 2).slice(0, 3000));
  process.exit(1);
}
console.log(JSON.stringify(json.output ?? json, null, 2));

function findTool(q) {
  const s = q.toLowerCase();
  return catalog.tools.find(t => t.id === q || t.id.startsWith(q))
    || catalog.tools.find(t => (t.alias || "").toLowerCase() === s)
    || catalog.tools.find(t => (t.title || "").toLowerCase().includes(s));
}
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
function die(msg) { console.error(msg); process.exit(1); }
