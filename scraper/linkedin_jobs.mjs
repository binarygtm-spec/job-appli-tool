#!/usr/bin/env node
/************************************************************
 * LinkedIn job search → Airtable "Companies" table
 *
 * Works inside the search results page (two scroll panes):
 *   LEFT  pane: job list      → click each job card, scroll list for more
 *   RIGHT pane: job details   → scroll pane, expand "…more", capture
 *
 * Saving runs in parallel with clicking:
 *   • each job is written to Airtable the moment it's captured
 *   • the hiring company (About, Services, Posts) is scraped in a
 *     second tab and patched onto that job's row when ready
 *
 * Usage (via run.sh, which starts Chrome for you):
 *   bash run.sh --url "<search URL>" --email you@x.com --limit 10 [--posts 5] [--dry-run]
 ************************************************************/

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";

/* ------------------------- config ------------------------- */

const args = parseArgs(process.argv.slice(2));
const SEARCH_URL = args.url;
let USER_EMAIL = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
const USERS_TABLE = "tblOnYAjvsaDn9oOp"; // User Test
const LIMIT = Number(args.limit || 10);
const MAX_POSTS = Number(args.posts || 5);
const PROFILE_DIR = args.profile || path.join(os.homedir(), ".chrome-linkedin");
const DRY_RUN = Boolean(args["dry-run"]);

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = "appKwvv5s2XpX4etA";
const COMPANIES_TABLE = "tbla2BuSNY0G0GEBM";
const MAX_TEXT = 95000;

// Delays (ms, random within range) — ~75% shorter than v1
const T = {
  tap: [150, 350],      // after a click / "…more" expand
  scroll: [200, 400],   // between scroll steps
  load: [600, 1100],    // after opening a page
  between: [800, 1500], // between jobs
};

if (!SEARCH_URL) {
  console.error(`Usage:
  node linkedin_jobs.mjs --url "<LinkedIn job search URL>" [--email user@gmail.com] [--limit 10] [--posts 5] [--dry-run]
  (no --email → you pick the user from the User Test table)`);
  process.exit(1);
}
if (!DRY_RUN && !AIRTABLE_TOKEN) {
  console.error("Set AIRTABLE_TOKEN first:  export AIRTABLE_TOKEN=pat...   (or use --dry-run)");
  process.exit(1);
}

/* ------------------------- helpers ------------------------ */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = ([a, b]) => sleep(a + Math.random() * (b - a));
const clip = s => (s && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "…[truncated]" : s || "");
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const currentJobId = page => { try { return new URL(page.url()).searchParams.get("currentJobId"); } catch { return null; } };

function companyBase(url) {
  const m = (url || "").match(/linkedin\.com\/(company|school|showcase)\/([^/?#]+)/i);
  return m ? `https://www.linkedin.com/${m[1]}/${m[2]}/` : "";
}

function withScheme(u) {
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^\/+/, "")}`;
}

function assertLoggedIn(page) {
  if (/\/(login|authwall|checkpoint|uas\/login)/.test(page.url())) {
    throw new Error("LinkedIn is not logged in in this Chrome window (or asked for a checkpoint). Log in, then re-run.");
  }
}

// Click every "…more" / "see more" toggle inside a scope (never menus)
async function expandMore(page, scope = "main") {
  for (let pass = 0; pass < 4; pass++) {
    const clicked = await page.evaluate((scopeSel) => {
      const root = document.querySelector(scopeSel) || document.querySelector("main") || document.body;
      let n = 0;
      for (const b of root.querySelectorAll("button, [role='button']")) {
        const t = (b.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
        const a = (b.getAttribute("aria-label") || "").toLowerCase();
        if (b.getAttribute("aria-haspopup") || b.getAttribute("aria-expanded") === "true") continue;
        if (/show all|see all|more jobs|more options|more actions|control menu|load more|show more results|dismiss/.test(t + " " + a)) continue;
        const isMore =
          /^(…|\.\.\.)?\s*(see |show )?more$/.test(t) ||
          /(see more|show more|click to see more)/.test(a) ||
          (a.includes("more") && a.includes("description"));
        if (!isMore || b.offsetParent === null) continue;
        b.click();
        n++;
      }
      return n;
    }, scope).catch(() => 0);
    if (!clicked) break;
    await wait(T.tap);
  }
}

async function scrollPage(page, times = 2) {
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, 900 + Math.random() * 400);
    await wait(T.scroll);
  }
}

// Close any LinkedIn modal/popup: click outside it, then Escape, then its close/Cancel button
async function dismissPopups(page) {
  for (let i = 0; i < 3; i++) {
    const open = await page.evaluate(() => {
      const visible = el => el && el.offsetParent !== null && el.getBoundingClientRect().height > 50;
      return [...document.querySelectorAll("[role='dialog'], [role='alertdialog'], .artdeco-modal")].some(visible);
    }).catch(() => false);
    if (!open) return;
    const vp = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (i === 0) await page.mouse.click(8, Math.round(vp.height * 0.6)).catch(() => {});      // click outside
    else if (i === 1) await page.keyboard.press("Escape").catch(() => {});
    else await page.evaluate(() => {
      const d = [...document.querySelectorAll("[role='dialog'], [role='alertdialog'], .artdeco-modal")].find(el => el.offsetParent !== null);
      const btn = d && [...d.querySelectorAll("button")].find(b =>
        /dismiss|close|cancel|not now|no thanks/i.test((b.getAttribute("aria-label") || "") + " " + (b.innerText || "")));
      btn?.click();
    }).catch(() => {});
    await wait(T.tap);
  }
}

/* -------------- search page: find the two panes ------------- */

// Tags the job-details scroller (right) and the job-list scroller (left)
async function markPanes(page) {
  return page.evaluate(() => {
    for (const a of ["data-cl-detail", "data-cl-detail-root", "data-cl-list"]) {
      document.querySelectorAll(`[${a}]`).forEach(el => el.removeAttribute(a));
    }
    const main = document.querySelector("main") || document.body;
    const scrollers = [...main.querySelectorAll("*")].filter(el =>
      el.scrollHeight > el.clientHeight + 80 && el.clientHeight > 200 &&
      /(auto|scroll)/.test(getComputedStyle(el).overflowY));

    const detail = scrollers
      .filter(el => /about the job/i.test(el.innerText || ""))
      .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];

    const jobRefs = el => el.querySelectorAll("a[href*='/jobs/view/'], a[href*='currentJobId'], [data-job-id], [data-occludable-job-id]").length;
    const list = scrollers
      .filter(el => el !== detail && !(detail && (el.contains(detail) || detail.contains(el))))
      .sort((a, b) => (jobRefs(b) - jobRefs(a)) || (b.querySelectorAll("li").length - a.querySelectorAll("li").length))[0];

    if (detail) {
      detail.setAttribute("data-cl-detail", "1");
      // widen to the whole right column (title/company may sit above the scroller)
      let root = detail;
      while (root.parentElement && root.parentElement !== main &&
             !(list && root.parentElement.contains(list))) root = root.parentElement;
      root.setAttribute("data-cl-detail-root", "1");
    }
    if (list) list.setAttribute("data-cl-list", "1");
    return { detail: !!detail, list: !!list };
  });
}

// Job cards currently rendered in the left list (tags each with data-cl-card)
async function listCards(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-cl-list]") || document.querySelector("main") || document.body;
    const detailRoot = document.querySelector("[data-cl-detail-root]");
    const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h).toString(36); };
    const lines = el => (el.innerText || "").split("\n").map(x => x.trim()).filter(Boolean);
    const junk = el => {
      const t = (el.innerText || "").trim();
      return /are these results helpful|your feedback helps|results not helpful|get job alerts|job alert/i.test(t) ||
        /^\s*(next|previous)\s*$/i.test(t) || /^[\d\s…]+$/.test(t) ||
        !!el.closest("nav, [aria-label*='agination'], [class*='pagination']") ||
        !!el.querySelector("button[aria-label*='helpful' i], button[aria-label*='thumb' i]");
    };
    const looksLikeCard = el => { const l = lines(el); return l.length >= 2 && (el.innerText || "").length > 25 && !junk(el); };
    const out = [];
    const seen = new Set();
    const add = (el, id) => {
      if (!el || (detailRoot && detailRoot.contains(el)) || !looksLikeCard(el)) return;
      const key = id ? "id-" + id : "t-" + hash(lines(el).slice(0, 3).join("|"));
      if (seen.has(key)) return;
      seen.add(key);
      el.setAttribute("data-cl-card", key);
      out.push({ key, id: id || null });
    };
    const idOf = el => {
      const a = el.matches?.("a[href]") ? el : el.querySelector?.("a[href*='/jobs/view/'], a[href*='currentJobId']");
      const m = a && (a.href.match(/\/jobs\/view\/(\d+)/) || a.href.match(/currentJobId=(\d+)/));
      return m ? m[1] : null;
    };

    // A) classic UI: ids in markup
    root.querySelectorAll("[data-job-id], [data-occludable-job-id]").forEach(el =>
      add(el, el.getAttribute("data-job-id") || el.getAttribute("data-occludable-job-id")));
    root.querySelectorAll("a[href*='/jobs/view/'], a[href*='currentJobId']").forEach(a =>
      add(a.closest("li") || a.parentElement, idOf(a)));
    if (out.length >= 3) return out;

    // B) new AI-search UI: the container with the most card-like children is the job list
    let best = null, bestN = 0;
    root.querySelectorAll("ul, ol, div").forEach(c => {
      if (detailRoot && detailRoot.contains(c)) return;
      const n = [...c.children].filter(looksLikeCard).length;
      if (n > bestN) { best = c; bestN = n; }
    });
    if (best && bestN >= 2) [...best.children].forEach(k => add(k, idOf(k)));
    return out;
  });
}

async function nextResultsPage(page) {
  await dismissPopups(page);
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("main button, main a")].find(b =>
      /^next$/i.test((b.innerText || "").trim()) || /view next page|^next$/i.test(b.getAttribute("aria-label") || ""));
    if (!btn || btn.disabled) return false;
    btn.scrollIntoView({ block: "center" });
    btn.click();
    return true;
  });
  if (clicked) { await wait(T.load); await sleep(800); }
  return clicked;
}

async function scrollList(page) {
  const atEnd = await page.evaluate(() => {
    const el = document.querySelector("[data-cl-list]");
    if (!el) { window.scrollBy(0, window.innerHeight * 0.9); return false; }
    el.scrollBy(0, el.clientHeight * 0.9);
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
  });
  await wait(T.load);
  return atEnd;
}

async function scrollDetail(page) {
  for (let i = 0; i < 15; i++) {
    await dismissPopups(page);
    const done = await page.evaluate(() => {
      const el = document.querySelector("[data-cl-detail]");
      if (!el) return true;
      el.scrollBy(0, el.clientHeight * 0.8);
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
    });
    await wait(T.scroll);
    if (i === 1) await expandMore(page, "[data-cl-detail-root]"); // "…more" under description
    if (done) break;
  }
  await expandMore(page, "[data-cl-detail-root]");
}

async function detailTitle(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-cl-detail-root]") || document.querySelector("main");
    return (root?.querySelector("h1")?.innerText || root?.querySelector("a[href*='/jobs/view/']")?.innerText || "").trim();
  });
}

/* ------------- job extraction (runs inside the page) ------------- */

function extractJobInPage(rootSel) {
  const clean = s => (s || "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const main = document.querySelector("main") || document.body;
  const root = document.querySelector(rootSel) || main;

  const firstLine = s => clean(s).split("\n").map(x => x.trim()).filter(Boolean)[0] || "";
  const tab = document.title.replace(/^\(\d+\)\s*/, "").split(" | ").map(x => x.trim());
  const tabTitle = tab.length >= 3 && /linkedin/i.test(tab[tab.length - 1]) ? tab[0] : "";
  const tabCompany = tab.length >= 3 && /linkedin/i.test(tab[tab.length - 1]) ? tab[1] : "";
  const titleLink = root.querySelector("a[href*='/jobs/view/']");
  const title = tabTitle || firstLine(root.querySelector("h1")?.innerText) || firstLine(titleLink?.innerText) ||
    [...root.querySelectorAll("h2, h3")].map(h => clean(h.innerText))
      .find(t => t && !/^(about the (job|company)|meet the hiring team|people you can reach|set alert|use ai|job search smarter|your profile)/i.test(t)) || "";

  const compLinks = [...root.querySelectorAll('a[href*="/company/"]')];
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const compA = (tabCompany && compLinks.find(a => norm(firstLine(a.innerText)) === norm(tabCompany))) ||
    (tabCompany && compLinks.find(a => norm(a.innerText).includes(norm(tabCompany)))) ||
    compLinks.find(a => firstLine(a.innerText) && firstLine(a.innerText).length < 80) || compLinks[0];
  const companyName = tabCompany || firstLine(compA?.innerText) || firstLine(root.querySelector("[class*='company-name']")?.innerText);
  const companyUrl = compA ? compA.href.split("?")[0] : "";

  // Description: new UI = [id^=JobDetails_AboutTheJob] → expandable-text-box; classic UI = #job-details
  let descEl =
    root.querySelector("[id^='JobDetails_AboutTheJob'] [data-testid='expandable-text-box']") ||
    root.querySelector("[componentkey^='JobDetails_AboutTheJob'] [data-testid='expandable-text-box']") ||
    root.querySelector("#job-details, .jobs-description__content, .jobs-box__html-content, [class*='jobs-description-content']") ||
    root.querySelector("[id^='JobDetails_AboutTheJob'], [componentkey^='JobDetails_AboutTheJob']");
  if (!descEl) {
    const h = [...root.querySelectorAll("h2, h3")].find(x => /about the job/i.test(x.innerText));
    let el = h;
    while (el && el !== root && (el.innerText || "").length < 300) el = el.parentElement; // climb to the block that holds the text
    descEl = el && el !== root ? el : null;
  }
  // Structure-preserving text (works even if LinkedIn still has the text visually clamped)
  const toText = el => {
    if (!el) return "";
    const c = el.cloneNode(true);
    c.querySelectorAll("button, [role='button'], svg, h2").forEach(n => n.remove());
    c.querySelectorAll("br").forEach(b => b.replaceWith("\n"));
    c.querySelectorAll("li").forEach(li => li.prepend("• "));
    c.querySelectorAll("p, li, ul, ol, div, h1, h3, h4, h5, h6").forEach(n => { n.prepend("\n"); n.append("\n"); });
    [...c.querySelectorAll("strong, b")].filter(n => !n.closest("p, li")).forEach(n => { n.prepend("\n"); n.append("\n"); });
    return (c.textContent || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
  };
  let description = toText(descEl);
  description = description.replace(/^about the job\s*/i, "").replace(/\s*(…|\.\.\.)?\s*(see |show )?(more|less)\s*$/i, "").trim();

  const shortTexts = [...root.querySelectorAll("span, div, p")].slice(0, 2000)
    .filter(el => !descEl || !descEl.contains(el))
    .map(el => clean(el.innerText))
    .filter(t => t && t.length < 200);
  const meta = shortTexts.filter(t => /·/.test(t) && /(ago|reposted|applicant)/i.test(t))
    .sort((a, b) => a.length - b.length)[0] || "";
  const parts = meta.split("·").map(s => s.trim()).filter(Boolean);
  const postedRe = /(reposted\s+)?\d+\s+(minute|hour|day|week|month|year)s?\s+ago|over\s+\d+\s+(applicants|people clicked apply)|\d+\s+(applicants|people clicked apply)|be an early applicant/gi;
  const posted = [...new Set((meta.match(postedRe) || []).map(x => x.trim()))].join(" · ");
  const sticky = companyName && shortTexts.find(t => t.startsWith(companyName) && /[•·]/.test(t) && t.length < 120 && !/ago/i.test(t));
  const location = (sticky ? sticky.split(/[•·]/)[1]?.trim() : "") || (parts[0] && !/ago|applicant/i.test(parts[0]) ? parts[0] : "");

  const words = ["Remote", "On-site", "Hybrid", "Full-time", "Part-time", "Contract", "Temporary", "Internship"];
  const types = new Set();
  root.querySelectorAll("button, span, li").forEach(el => {
    if (descEl && descEl.contains(el)) return;
    const t = clean(el.innerText).replace(/^✓\s*/, "");
    if (words.includes(t)) types.add(t);
    const m = t.match(/(?:workplace type|job type) is ([A-Za-z-]+)/i);
    if (m && words.map(w => w.toLowerCase()).includes(m[1].toLowerCase())) types.add(m[1]);
  });

  return { title, companyName, companyUrl, description, location, posted, jobType: [...types].join(", ") };
}

function splitRequirements(desc) {
  if (!desc) return "";
  const head = /\n[^\S\n]*(what we are looking for|what we['’]re looking for|what you['’]ll (?:need|bring)|what you bring|requirements|minimum requirements|qualifications|basic qualifications|preferred qualifications|who you are|about you|must[- ]haves?|you (?:have|bring|should have)|skills (?:&|and) experience|ideal candidate|key skills)[^\n]{0,30}\n/i;
  const m = desc.match(head);
  if (!m) return "";
  let rest = desc.slice(m.index + m[0].length);
  const stop = rest.search(/\n[^\S\n]*(what we offer|benefits|perks|why join|why you['’]ll love|compensation|salary|about (?:us|the company)|how to apply|equal opportunity|what['’]s in it for you)[^\n]{0,40}\n/i);
  if (stop > 0) rest = rest.slice(0, stop);
  return rest.trim();
}

/* ----------------- capture one job (search page) ----------------- */

async function captureFromSearch(page, card, prev) {
  await dismissPopups(page);
  const loc = page.locator(`[data-cl-card="${card.key}"]`).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  // click the job title link if there is one, else the card itself
  const titleLink = loc.locator("a[href*='/jobs/view/'], a[href*='currentJobId']").first();
  if (await titleLink.count().catch(() => 0)) await titleLink.click({ timeout: 4000 }).catch(() => loc.click({ timeout: 4000 }).catch(() => {}));
  else await loc.click({ timeout: 4000, position: { x: 140, y: 22 } }).catch(() => loc.click({ timeout: 4000 }).catch(() => {}));
  await sleep(250);
  await dismissPopups(page);

  // wait for the right pane to switch to this job (tab title = "<Job> | <Company> | LinkedIn")
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    if (/\/jobs\/view\//.test(page.url())) break;
    const dt = await page.title().catch(() => "");
    const id = currentJobId(page);
    const changed = dt && dt !== prev.docTitle && dt.split(" | ").length >= 3;
    if (card.id ? (id === card.id && (changed || i >= 8)) : (changed || (id && id !== prev.id && i >= 6))) break;
  }
  await sleep(300);

  // Some layouts open the job as a full page instead of the right pane
  if (/\/jobs\/view\//.test(page.url())) {
    const id = page.url().match(/\/jobs\/view\/(\d+)/)?.[1];
    await scrollPage(page, 2);
    await expandMore(page, "main");
    const job = await page.evaluate(extractJobInPage, "main");
    job.id = id;
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    await wait(T.load);
    return job;
  }

  await markPanes(page);
  await scrollDetail(page);
  await dismissPopups(page);
  const job = await page.evaluate(extractJobInPage, "[data-cl-detail-root]");
  job.id = currentJobId(page) || card.id;
  return job;
}

// Fallback: open each job page directly (used if the panes can't be found)
async function scrapeJobPage(page, jobId) {
  await page.goto(`https://www.linkedin.com/jobs/view/${jobId}/`, { waitUntil: "domcontentloaded" });
  assertLoggedIn(page);
  await page.waitForSelector("main h1", { timeout: 15000 }).catch(() => {});
  await wait(T.load);
  await scrollPage(page, 2);
  await expandMore(page, "main");
  const job = await page.evaluate(extractJobInPage, "main");
  job.id = jobId;
  return job;
}

/* ---------------------- company pages ---------------------- */

// page.evaluate that survives LinkedIn's in-page redirects
async function safeEval(page, fn, arg) {
  for (let i = 0; i < 3; i++) {
    try { return await page.evaluate(fn, arg); }
    catch (e) {
      if (i === 2 || !/context was destroyed|navigat|Target closed/i.test(e.message)) throw e;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await sleep(1200);
    }
  }
}

async function gotoSettled(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load", { timeout: 8000 }).catch(() => {});
  await wait(T.load);
}

async function scrapeCompany(page, companyUrl) {
  const base = companyBase(companyUrl);
  if (!base) return {};
  const company = { linkedinUrl: base };

  // About
  await gotoSettled(page, base + "about/");
  assertLoggedIn(page);
  
  await expandMore(page, "main");
  Object.assign(company, await safeEval(page, () => {
    const clean = s => (s || "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const main = document.querySelector("main") || document.body;
    const tagline = clean(main.querySelector("[class*='tagline']")?.innerText);
    let overview = "";
    const h = [...main.querySelectorAll("h2, h3")].find(x => /^overview$/i.test(clean(x.innerText)));
    if (h) {
      const sec = h.closest("section") || h.parentElement;
      overview = clean(sec.querySelector("p")?.innerText) || clean(sec.innerText.replace(/^overview/i, ""));
    }
    const facts = {};
    main.querySelectorAll("dl").forEach(dl => {
      let label = "";
      [...dl.children].forEach(el => {
        if (el.tagName === "DT") label = clean(el.innerText).toLowerCase();
        else if (el.tagName === "DD" && label) {
          const v = clean(el.innerText);
          if (v && !/associated members|on linkedin/i.test(v)) facts[label] = facts[label] ? facts[label] + " " + v : v;
        }
      });
    });
    const f = k => Object.entries(facts).find(([key]) => key.includes(k))?.[1] || "";
    return {
      tagline, overview,
      website: f("website"),
      industry: f("industry"),
      size: (f("company size").match(/[\d,]+\s*[-–+]\s*[\d,]*\s*employees|[\d,]+\+?\s*employees/i) || [f("company size")])[0],
      hq: f("headquarters"),
      founded: f("founded"),
      specialties: f("specialties"),
    };
  }));

  // Home → Services
  await gotoSettled(page, base);
  
  await scrollPage(page, 2);
  await expandMore(page, "main");
  company.services = await safeEval(page, () => {
    const clean = s => (s || "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const h = [...document.querySelectorAll("main h2, main h3")].find(x => /^services$/i.test(clean(x.innerText)));
    if (!h) return "";
    const sec = h.closest("section") || h.parentElement.parentElement;
    return clean(sec.innerText).replace(/^services\s*/i, "")
      .replace(/\n?(request services|show all services.*|(…|\.\.\.)?\s*see (more|less))\s*/gi, "\n").trim();
  });

  // Posts
  await gotoSettled(page, base + "posts/?feedView=all");
  
  let posts = [];
  for (let round = 0; round < 5 && posts.length < MAX_POSTS; round++) {
    await expandMore(page, "main");
    posts = await safeEval(page, () => {
      const clean = s => (s || "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
      const seen = new Set();
      const out = [];
      document.querySelectorAll("main div.feed-shared-update-v2, main [data-urn*='urn:li:activity']").forEach(el => {
        const urn = el.getAttribute("data-urn") || el.closest("[data-urn]")?.getAttribute("data-urn") || "";
        if (!urn || seen.has(urn)) return;
        seen.add(urn);
        const textEl = el.querySelector(".update-components-text, .feed-shared-inline-show-more-text, .feed-shared-update-v2__description");
        const text = clean(textEl?.innerText).replace(/\s*(…|\.\.\.)?\s*(see )?(more|less)\s*$/i, "");
        const sub = clean(el.querySelector(".update-components-actor__sub-description, [class*='actor__sub-description']")?.innerText);
        const age = (sub.match(/^\s*(\d+\s*(?:s|m|h|d|w|mo|yr)s?)\b/i) || [])[1] || sub.split("•")[0].trim();
        if (text) out.push({ age, text, url: `https://www.linkedin.com/feed/update/${urn}/` });
      });
      return out;
    });
    if (posts.length < MAX_POSTS) await scrollPage(page, 2);
  }
  company.posts = posts.slice(0, MAX_POSTS);
  return company;
}

const SIGNALS = {
  launches: /\b(launch(?:ed|ing)?|introduc(?:e|ing)|announc(?:e|ing)|now live|new feature|release[ds]?|unveil|rolled out|product update|beta)\b/i,
  funding: /\b(raised|funding|seed round|series [a-f]|pre-seed|investors?|backed by|valuation|venture capital|\$\s?\d+(?:\.\d+)?\s?(?:m|mn|million|b|bn|billion)\b)/i,
  milestones: /\b(milestone|award(?:ed)?|winner|won|recogni[sz]ed|featured in|ranked|certified|iso \d+|anniversary|celebrat|partnership|partnered|customers?|clients?|growth|record|exhibit|stand [a-z]?\d+|conference|summit|show)\b/i,
  hiring: /\b(we['’]re hiring|hiring|join (?:our|the) team|open roles?|open positions?|now recruiting|looking for (?:a|an)|careers? page|apply now)\b/i,
};

function tagPosts(posts) {
  const pick = re => posts.filter(p => re.test(p.text))
    .map(p => `[${p.age}] ${p.text.split("\n").find(l => re.test(l)) || p.text.slice(0, 280)}\n${p.url}`)
    .join("\n\n");
  return { launches: pick(SIGNALS.launches), funding: pick(SIGNALS.funding),
           milestones: pick(SIGNALS.milestones), hiring: pick(SIGNALS.hiring) };
}

/* ------------------------- Airtable ------------------------- */

async function airtable(method, query = "", body) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${COMPANIES_TABLE}${query}`, {
    method,
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}

// Serialize Airtable calls (5 req/s base limit) while the browser keeps working
let atChain = Promise.resolve();
function at(method, query, body) {
  const p = atChain.then(() => airtable(method, query, body));
  atChain = p.catch(() => {}).then(() => sleep(220));
  return p;
}

async function upsertJob(fields) {
  const esc = s => s.replace(/'/g, "\\'");
  const formula = `AND({Job URL}='${esc(fields["Job URL"])}', LOWER({User Email ID})='${esc(fields["User Email ID"].toLowerCase())}')`;
  const found = await at("GET", `?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`);
  if (found.records?.length) {
    const id = found.records[0].id;
    await at("PATCH", "", { records: [{ id, fields }], typecast: true });
    return { id, action: "updated" };
  }
  const created = await at("POST", "", { records: [{ fields }], typecast: true });
  return { id: created.records[0].id, action: "created" };
}

const compact = o => { for (const k of Object.keys(o)) if (!o[k]) delete o[k]; return o; };

function jobFields(job) {
  return compact({
    "Company Name": job.companyName,
    "User Email ID": USER_EMAIL,
    "Job URL": job.jobUrl,
    "Job Title": job.title,
    "Job Location": job.location,
    "Job Type": job.jobType,
    "Job Posted": job.posted,
    "Job Description": clip(job.description),
    "Job Requirements": clip(job.requirements),
    "Company LinkedIn URL": companyBase(job.companyUrl),
  });
}

function companyFields(company) {
  const posts = company.posts || [];
  const tags = tagPosts(posts);
  return compact({
    "Company Website": withScheme(company.website),
    "Industry": company.industry,
    "Company Size": company.size,
    "Company HQ": company.hq,
    "Company About": clip([company.tagline, company.overview, company.founded && `Founded: ${company.founded}`].filter(Boolean).join("\n\n")),
    "Products & Services": clip([company.services, company.specialties && `Specialties: ${company.specialties}`].filter(Boolean).join("\n\n")),
    "Recent Posts": clip(posts.map(p => `[${p.age}] ${p.text}\n${p.url}`).join("\n\n---\n\n")),
    "Recent Product Launches": clip(tags.launches),
    "Recent Funding": clip(tags.funding),
    "Achievements & Milestones": clip(tags.milestones),
    "Hiring Signals": clip(tags.hiring),
  });
}

/* --------------------------- main --------------------------- */

// ---- Who is searching? Match against User Test → Email ----
async function identifyUser() {
  if (!AIRTABLE_TOKEN) {
    if (!USER_EMAIL) { console.error("Give --email (or set AIRTABLE_TOKEN so you can pick the user from the list)."); process.exit(1); }
    log(`User: ${USER_EMAIL} (not verified: no Airtable token in dry-run)`);
    return;
  }
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?fields%5B%5D=Email&fields%5B%5D=Full%20Name`, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error("Couldn't read User Test: " + JSON.stringify(json).slice(0, 300));
  const users = (json.records || [])
    .map(r => ({ email: String(r.fields.Email || "").trim().toLowerCase(), name: r.fields["Full Name"] || "" }))
    .filter(u => u.email);
  if (USER_EMAIL) {
    const u = users.find(x => x.email === USER_EMAIL);
    if (!u) {
      console.error(`❌ ${USER_EMAIL} is not in the User Test table. Users: ${users.map(x => x.email).join(", ")}`);
      process.exit(1);
    }
    log(`User: ${u.name} <${u.email}>`);
    return;
  }
  console.log("\nWho is this job search for?");
  users.forEach((u, i) => console.log(`  ${i + 1}. ${u.name} <${u.email}>`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question("Enter number: ")).trim();
  rl.close();
  const u = users[Number(ans) - 1];
  if (!u) { console.error("Invalid choice."); process.exit(1); }
  USER_EMAIL = u.email;
  log(`User: ${u.name} <${u.email}>`);
}
await identifyUser();

// Start Google Chrome ourselves with the dedicated LinkedIn profile (login is remembered)
let context;
try {
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: null,
    chromiumSandbox: true,                       // removes the "--no-sandbox" warning bar
    ignoreDefaultArgs: ["--enable-automation", "--no-sandbox"],
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--start-maximized",
    ],
  });
} catch (e) {
  console.error("Couldn't start Chrome: " + e.message.split("\n")[0]);
  console.error("The automation Chrome is probably still open. Close it (or run: pkill -f chrome-linkedin) and try again.");
  process.exit(1);
}
let page = context.pages()[0] || await context.newPage();

async function ensureLoggedIn(url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  if (/\/(login|authwall|checkpoint|uas\/login|signup)/.test(page.url()) ||
      await page.locator("form.login__form, a[href*='/login']").first().isVisible().catch(() => false) && !/\/jobs\//.test(page.url())) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("\n👉 Log into LinkedIn in the Chrome window that just opened (keep the window open), then press Enter here… ");
    rl.close();
    // the original tab may have been closed/replaced during login — use any open tab
    if (page.isClosed()) {
      page = context.pages().find(p => !p.isClosed()) || await context.newPage().catch(() => null);
      if (!page) throw new Error("The automation Chrome window was closed. Run again and keep the window open while logging in.");
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }
}

// Company research runs in its own tab, one company at a time, in parallel with job clicking
let companyPage = null;
let companyChain = Promise.resolve();
const companyCache = new Map();
function companyFor(url) {
  const key = companyBase(url);
  if (!key) return Promise.resolve({});
  if (!companyCache.has(key)) {
    const p = companyChain.then(async () => {
      if (!companyPage) { companyPage = await context.newPage(); await page.bringToFront(); }
      log(`   🏢 researching ${key}`);
      const c = await scrapeCompany(companyPage, url);
      log(`   🏢 done ${key} — ${c.industry || "-"} | ${c.size || "-"} | ${c.posts?.length || 0} posts`);
      return c;
    }).catch(e => { log(`   ⚠ company ${key}: ${e.message}`); return {}; });
    companyChain = p;
    companyCache.set(key, p);
  }
  return companyCache.get(key);
}

const entries = [];
const tasks = [];

function handleJob(job) {
  job.jobUrl = `https://www.linkedin.com/jobs/view/${job.id}/`;
  job.requirements = splitRequirements(job.description);
  const entry = { job: jobFields(job), company: {} };
  entries.push(entry);
  const companyP = companyFor(job.companyUrl);

  tasks.push((async () => {
    let recId = null;
    if (!DRY_RUN) {
      const r = await upsertJob(entry.job);
      recId = r.id;
      log(`   💾 Airtable ${r.action}: ${job.title}`);
    }
    entry.company = companyFields(await companyP);
    if (!DRY_RUN && recId && Object.keys(entry.company).length) {
      await at("PATCH", "", { records: [{ id: recId, fields: entry.company }], typecast: true });
      log(`   💾 company data added → ${job.title} @ ${job.companyName}`);
    }
  })().catch(e => log(`   ⚠ Airtable (${job.title}): ${e.message}`)));
}

try {
  log("Opening search:", SEARCH_URL);
  await ensureLoggedIn(SEARCH_URL);
  assertLoggedIn(page);
  await wait(T.load);
  await page.waitForSelector("main", { timeout: 15000 }).catch(() => {});
  await sleep(800);

  await dismissPopups(page);
  const panes = await markPanes(page);
  log(`Panes found — list: ${panes.list ? "yes" : "no"}, details: ${panes.detail ? "yes" : "no"}`);
  if (args.debug) {
    fs.mkdirSync("output", { recursive: true });
    const html = await page.evaluate(() => ({
      list: document.querySelector("[data-cl-list]")?.outerHTML || "",
      detail: document.querySelector("[data-cl-detail-root]")?.outerHTML || "",
    }));
    fs.writeFileSync("output/debug-list.html", html.list);
    fs.writeFileSync("output/debug-detail.html", html.detail);
    log("Saved output/debug-list.html and output/debug-detail.html");
  }

  const processed = new Set();
  const prev = { id: currentJobId(page), title: "", docTitle: await page.title().catch(() => "") };
  const seenJobIds = new Set();
  let count = 0;

  if (panes.detail) {
    // ---- two-pane mode: click cards in the list, read the right pane ----
    let idle = 0;
    while (count < LIMIT && idle < 4) {
      await markPanes(page);
      const cards = (await listCards(page)).filter(c => !processed.has(c.key) && !(c.id && seenJobIds.has(c.id)));
      if (args.debug) log(`   list shows ${cards.length} new cards`);
      if (!cards.length) {
        const end = await scrollList(page);
        idle++;
        if (end && idle >= 2) {
          if (await nextResultsPage(page)) { log("→ next page of results"); idle = 0; continue; }
          break;
        }
        continue;
      }
      idle = 0;
      for (const card of cards) {
        if (count >= LIMIT) break;
        processed.add(card.key);
        try {
          const job = await captureFromSearch(page, card, prev);
          if (!job?.title || !job.id) { log(`   ⚠ couldn't read card ${card.key}`); continue; }
          if (job.id) processed.add("id-" + job.id);
          prev.id = job.id; prev.title = job.title; prev.docTitle = await page.title().catch(() => "");
          if (seenJobIds.has(job.id)) { log(`   (already captured ${job.title})`); continue; }
          seenJobIds.add(job.id);
          count++;
          log(`(${count}/${LIMIT}) ${job.title} @ ${job.companyName} — ${job.location}${job.jobType ? " (" + job.jobType + ")" : ""}`);
          handleJob(job);
        } catch (e) {
          log(`   ⚠ ${e.message}`);
          if (/not logged in|checkpoint/i.test(e.message)) throw e;
        }
        await wait(T.between);
      }
      if (count < LIMIT) await scrollList(page);
    }
  } else {
    // ---- fallback: collect ids, open each job page ----
    log("Two-pane layout not detected — opening job pages one by one.");
    const ids = new Set();
    if (prev.id) ids.add(prev.id);
    for (let r = 0; r < 8 && ids.size < LIMIT; r++) {
      (await listCards(page)).forEach(c => c.id && ids.add(c.id));
      await scrollList(page);
    }
    for (const id of [...ids].slice(0, LIMIT)) {
      try {
        const job = await scrapeJobPage(page, id);
        count++;
        log(`(${count}/${LIMIT}) ${job.title} @ ${job.companyName} — ${job.location}`);
        handleJob(job);
      } catch (e) { log(`   ⚠ job ${id}: ${e.message}`); }
      await wait(T.between);
    }
  }

  log(`Captured ${count} jobs. Finishing company research & Airtable writes…`);
  await Promise.allSettled(tasks);
} finally {
  const outDir = path.resolve("output");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `jobs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(entries.map(e => ({ ...e.job, ...e.company })), null, 2));
  log(`Saved ${entries.length} jobs → ${file}`);
  if (companyPage) await companyPage.close().catch(() => {});
  await context.close().catch(() => {}); // closes the automation Chrome window
}
