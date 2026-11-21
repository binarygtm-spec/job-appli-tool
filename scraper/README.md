# LinkedIn jobs → Airtable Companies

Files:
- `run.sh`: starts the automation Chrome and runs the scraper (use this)
- `linkedin_jobs.mjs`: the scraper

## Run

```bash
cd scraper
bash run.sh --url "<LinkedIn job search URL>" --email "applicant@email.com" --limit 3 --dry-run
```

- First run: a new Chrome window opens. Log into LinkedIn there, then press Enter in Terminal.
- `--dry-run`: scrape only and save JSON to `output/`, without writing to Airtable
- Remove `--dry-run` to write to Airtable. It will ask for your Airtable token (pat…).
- `--limit N`: number of jobs; `--posts N`: number of company posts (default 5)

If you see "Chrome did not open port 9222": quit every Chrome window (Cmd+Q) and run it again.
