#!/bin/bash
# One-time setup of the Job Application Automation on a Mac (Apple Silicon or Intel).
# Run from Terminal:
#   curl -fsSL https://raw.githubusercontent.com/binarygtm-spec/job-appli-tool/add-relevance-tools-skill/setup-mac.sh -o setup-mac.sh && bash setup-mac.sh
# or, if the repo is already cloned:  bash setup-mac.sh
# Safe to re-run: every step checks what is already there.

set -e
REPO_URL="https://github.com/binarygtm-spec/job-appli-tool.git"
BRANCH="${BRANCH:-add-relevance-tools-skill}"
DEST="${DEST:-$HOME/job-appli-tool}"
say() { printf "\n\033[1;34m▶ %s\033[0m\n" "$1"; }
ok()  { printf "  \033[32m✓\033[0m %s\n" "$1"; }

say "1/7 Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$b" ]; then
    eval "$("$b" shellenv)"
    grep -q 'brew shellenv' ~/.zprofile 2>/dev/null || echo "eval \"\$($b shellenv)\"" >> ~/.zprofile
    break
  fi
done
ok "brew $(brew --version | head -1)"

say "2/7 Node.js, Git, GitHub CLI"
for pkg in node git gh; do
  command -v "$pkg" >/dev/null 2>&1 || brew install "$pkg"
done
ok "node $(node -v), git $(git --version | awk '{print $3}'), gh $(gh --version | head -1 | awk '{print $3}')"

say "3/7 Google Chrome (the scraper drives its own Chrome window)"
if [ ! -d "/Applications/Google Chrome.app" ]; then brew install --cask google-chrome; fi
ok "Chrome installed"

say "4/7 Get the code → $DEST"
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch -q origin && git -C "$DEST" checkout -q "$BRANCH" && git -C "$DEST" pull -q --ff-only origin "$BRANCH"
else
  if ! git clone -q -b "$BRANCH" "$REPO_URL" "$DEST" 2>/dev/null; then
    echo "  Repo is private: signing in to GitHub…"; gh auth login -h github.com -p https -w
    gh repo clone binarygtm-spec/job-appli-tool "$DEST" -- -b "$BRANCH" -q
  fi
fi
ok "code at $DEST (branch $BRANCH)"

say "5/7 Scraper dependencies"
cd "$DEST/scraper"
[ -d node_modules/playwright-core ] || npm install --silent
ok "playwright-core installed"

say "6/7 Secrets (.env, never committed)"
cd "$DEST"
[ -f .env ] || cp .env.example .env
setkey() { # setkey NAME "prompt"
  local cur; cur=$(grep -E "^$1=" .env | sed -E 's/^[^=]+="?([^"]*)"?$/\1/')
  if [ -z "$cur" ] || [[ "$cur" == *"<"* ]] || [[ "$cur" == *"xxx"* ]]; then
    read -r -s -p "  $2: " val; echo
    if [ -n "$val" ]; then grep -v -E "^$1=" .env > .env.tmp || true; echo "$1=\"$val\"" >> .env.tmp; mv .env.tmp .env; else echo "  (skipped)"; fi
  else ok "$1 already set"; fi
}
setkey AIRTABLE_TOKEN "Airtable personal access token (pat…)"
setkey RELEVANCE_AUTH_TOKEN "Relevance token (project_id:api_key, press Enter to skip)"
chmod 600 .env
ok ".env ready (only you can read it)"

say "7/7 Claude desktop app: Relevance tools (MCP)"
CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
TOKEN=$(grep -E '^RELEVANCE_AUTH_TOKEN=' .env | sed -E 's/^[^=]+="?([^"]*)"?$/\1/')
# Relevance often shows only the "sk-…" part: prefix the project ID so the token is project_id:api_key
case "$TOKEN" in sk-*)
  TOKEN="87c83726-444b-5ecb-bb93-f48503484fa5:$TOKEN"
  grep -v -E '^RELEVANCE_AUTH_TOKEN=' .env > .env.new; echo "RELEVANCE_AUTH_TOKEN=\"$TOKEN\"" >> .env.new; cat .env.new > .env; : > .env.new
  ok "added the Relevance project ID in front of the key";;
esac
if [ -n "$TOKEN" ] && [[ "$TOKEN" != *"<"* ]]; then
  mkdir -p "$(dirname "$CFG")"
  CFG="$CFG" TOKEN="$TOKEN" node -e '
    const fs=require("fs"),f=process.env.CFG;
    const c=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};
    const ids=require(process.cwd()+"/relevance/tools.json").tools.map(t=>t.id).join(",");
    c.mcpServers=c.mcpServers||{};
    c.mcpServers["relevanceai-mcp-server"]={command:"npx",args:["@relevanceai/relevanceai-mcp-server@latest","--region","d7b62b","--tools",ids],env:{RELEVANCE_AUTH_TOKEN:process.env.TOKEN}};
    fs.writeFileSync(f,JSON.stringify(c,null,2));'
  chmod 600 "$CFG"
  ok "Relevance MCP added to Claude desktop (restart the Claude app to load it)"
else
  echo "  Skipped (no Relevance token). Re-run this script later to add it."
fi

cat <<EOF

✅ Setup done.

Run a job search (first run: log in to LinkedIn in the Chrome window that opens):
  cd "$DEST/scraper"
  bash run.sh --url "<LinkedIn job search URL>" --email eassahashimev@gmail.com --limit 10

Then, in the Claude desktop app on this Mac:
  1. Install it from https://claude.ai/download if needed, and sign in.
  2. In a chat, + → Add folder → $DEST
  3. Say:  run the workflow for eassahashimev@gmail.com
EOF
