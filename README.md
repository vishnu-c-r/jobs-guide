# Jobs Guide — BLR + KOC

A curated jobs guide for recent engineering graduates. Bangalore + Kochi.
EEE · ECE · CS · MECH · EB.

**213 companies, job boards, VC portfolios, incubators, communities, events** —
all link-health-checked daily, organized by city, type, and domain.

**Live site:** https://vishnu-c-r.github.io/jobs-guide/

## Features

- Filter by **location** (Bangalore / Kochi / Remote)
- Filter by **type** (Companies / Boards / VC Portfolios / Incubators / Communities / Events & Meetups)
- Filter by **domain** (Robotics / Hardware-VLSI / EV / Space / MedTech / AI-SaaS / Analytics / Design / Manufacturing / Ops-Non-Tech)
- "FRESHER PROGRAMS ONLY" toggle — surfaces companies with structured graduate-hire pipelines
- Full-text search over company name and description
- Filter state lives in the URL hash — bookmarkable, shareable
- Verified company-published careers emails where available (no personal HR contacts harvested — that's spam-ware territory)
- "Playbook" tab: how to actually get hired (resume, portfolio, networking, scams to avoid)
- "Stack" tab: skills to build before applying, by role

## Daily link health check

A GitHub Actions workflow runs `scripts/check-links.mjs` daily at 06:00 UTC.
It pings every URL with a browser-like User-Agent, classifies the result
(`ok` / `gone` / `network-error` / `blocked-by-WAF`), and:

1. Writes a fresh `LINK_REPORT.md` to the repo root
2. Commits it back automatically
3. **If any links are truly broken** (404/410/DNS-dead — not just WAF blocks),
   it opens a GitHub issue tagged `link-rot`, with the broken URLs

You can also trigger the check manually:

- **Locally:** `node scripts/check-links.mjs`
- **In Actions:** Actions tab → "Daily Link Health Check" → Run workflow

Open `LINK_REPORT.md` any time to see current status.

## Deploy on GitHub Pages

1. Create a public repo on GitHub: `jobs-guide`
2. Push these files to it:
   ```
   index.html
   README.md
   LINK_REPORT.md
   scripts/check-links.mjs
   .github/workflows/check-links.yml
   ```
3. Settings → Pages → Source: `main` branch, root folder → Save
4. Live at `https://<your-username>.github.io/jobs-guide/` in ~30 seconds

The workflow needs `contents: write` and `issues: write` permissions —
already declared in the workflow file. Allow Actions to write to the repo:
Settings → Actions → General → Workflow permissions → "Read and write permissions" + "Allow GitHub Actions to create and approve pull requests".

## Updating the data

The data is a JSON-style array in `index.html` (search for `const DATA`).
Each entry:

```js
{
  name: "Company Name",
  desc: "Short description.",
  url: "https://...",
  city: "blr",            // "blr" | "kochi" | "remote"
  type: "company",        // "company" | "board" | "vc" | "incubator" | "community" | "event"
  tags: ["robotics"],     // any of: robotics, hardware, ev, space, medtech, ai, analytics, design, manufacturing, non-tech, general
  fresher: true           // optional — true if known to hire freshers / has structured grad program
}
```

For verified company-published careers emails, add an entry to the `EMAILS` map
just after `DATA`:

```js
const EMAILS = {
  "Company Name (must match exactly)": "careers@company.com",
};
```

**Don't add personal HR emails.** Generic published `careers@`/`jobs@`/`join@`
addresses only — and only if they're publicly listed by the company itself
on their careers page or footer.

Add, edit, commit, push. Pages and the next daily check both pick it up.

## What's not in scope

- Aggregator scraping (LinkedIn, Naukri APIs are paid; doable but heavy)
- "New jobs daily" feed — would need scrapers per company; the careers
  pages themselves are what we link to
- Personal HR email harvesting — privacy issue and low-success channel

## Contributing

Found a stale link? A closed company? A new startup worth adding?
Open an issue or PR.

## Credits

Built by Vishnu C R for the juniors.

- github.com/vishnu-c-r
- linkedin.com/in/vishnu-c-r

## License

MIT — fork it, adapt it for your city.
