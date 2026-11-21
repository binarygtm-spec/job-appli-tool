#!/bin/bash
# One-command runner: installs deps, then runs the scraper.
# The scraper opens its own Chrome window (profile: ~/.chrome-linkedin, LinkedIn login remembered).
# Usage: bash run.sh --url "<LinkedIn search URL>" [--email user@gmail.com] --limit 10
#        (leave out --email to pick the user from the User Test table)

cd "$(dirname "$0")" || exit 1

# 1. Dependency
if [ ! -d node_modules/playwright-core ]; then
  echo "Installing playwright-core…"
  npm init -y >/dev/null 2>&1
  npm i playwright-core || exit 1
fi

# 2. Close any old automation Chrome still using the LinkedIn profile (your normal Chrome is untouched)
if pgrep -f "chrome-linkedin" >/dev/null; then
  echo "Closing the old automation Chrome window…"
  pkill -f "chrome-linkedin"
  sleep 2
fi

# 3. Airtable token (needed to check which user is searching + to save jobs)
if [ -z "$AIRTABLE_TOKEN" ]; then
  read -r -s -p "Paste your Airtable token (pat…), or press Enter to skip for a --dry-run: " AIRTABLE_TOKEN; echo
  export AIRTABLE_TOKEN
fi

node linkedin_jobs.mjs "$@"
