#!/usr/bin/env node
/**
 * Fill relevance/tools.json with each tool's title, description and input params,
 * read from your Relevance AI project. Run once (and again after you add or rename tools):
 *
 *   node relevance/list_tools.mjs
 *
 * Auth: RELEVANCE_AUTH_TOKEN="<project_id>:<api_key>" in .env or the shell.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const TOKEN = process.env.RELEVANCE_AUTH_TOKEN;
if (!TOKEN) { console.error("Set RELEVANCE_AUTH_TOKEN in .env first."); process.exit(1); }

const file = path.join(here, "tools.json");
const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
const base = `https://api-${catalog.region}.stack.tryrelevance.com/latest`;

const slug = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

for (const t of catalog.tools) {
  try {
    const res = await fetch(`${base}/studios/${t.id}/get`, { headers: { Authorization: TOKEN } });
    const json = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    const s = json.studio || json;
    const props = s.params_schema?.properties || {};
    const required = s.params_schema?.required || [];
    t.title = s.title || t.title;
    t.description = s.description || t.description;
    t.alias = t.alias || slug(t.title);
    t.params = Object.fromEntries(Object.entries(props).map(([k, v]) =>
      [k, `${v.type || "any"}${required.includes(k) ? " (required)" : ""}${v.description ? " - " + v.description.slice(0, 80) : ""}`]));
    console.log(`✓ ${t.id}  ${t.title}`);
  } catch (e) {
    console.log(`✗ ${t.id}  ${e.message}`);
  }
}
fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
console.log(`\nUpdated ${file}. Commit it so the skill knows every tool's name and inputs.`);
