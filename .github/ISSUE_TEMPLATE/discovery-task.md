---
name: 🤖 Discovery task for Copilot
about: Assign to @copilot to find new companies/boards/events to add
title: "[discovery] "
labels: discovery, copilot
---

<!-- 
  Fill in the task below, then assign this issue to @copilot.
  The clearer the brief, the better the PR Copilot opens.
-->

## Task

<!-- What do you want Copilot to find? Be specific. Examples:
  - Find 5 Bangalore robotics startups (NOT trainers/coaching) hiring freshers in 2026
  - Find Kerala-based medtech companies that have raised funding in the last 12 months
  - Find new VC portfolio job boards we haven't included
  - Find founder's office / chief-of-staff intern roles open right now in BLR
-->



## Schema

Each new entry must follow this exact shape inside `index.html` `DATA` array:

```js
{
  name: "Company Name",
  desc: "Short description, max 120 chars. Why a fresh grad cares.",
  url: "https://...",
  city: "blr" | "kochi" | "remote",
  type: "company" | "board" | "vc" | "incubator" | "community" | "event",
  tags: ["robotics" | "hardware" | "ev" | "space" | "medtech" | "ai" | "analytics" | "design" | "manufacturing" | "non-tech" | "general"],
  fresher: true   // optional, only if known fresher pipeline
}
```

If a verified `careers@` / `jobs@` / `join@` email is publicly listed by the company itself, add it to the `EMAILS` map below `DATA`.

## Hard rules

- **Verify each URL actually loads** before adding. Hit it with a real browser if uncertain.
- **No duplicates.** Check `DATA` for the company name AND the domain before adding.
- **Skip these categories entirely:**
  - "Robotics trainer" / kids-coaching / STEM-education shops
  - Generic IT body-shops with no product engineering
  - Companies whose websites don't load or domains don't resolve
  - Any Bangalore company whose careers URL has been removed in the past
- **Cite your source.** In the PR description, list each entry with a link to where you found it (TechCrunch, Inc42, YourStory, the company's own About page).
- **No personal HR emails.** Only generic published `careers@` style addresses.

## Anti-patterns from past discovery runs

- Re-suggesting companies that were deliberately removed (Botsync, Invento Robotics, Talented agency, NASSCOM 10000 Startups, AI Aerial Dynamics, Muziris Softech, ByteZora — these have dead domains, don't re-add)
- Listing companies from "Top 50 Bangalore Startups 2024" SEO listicles that quote each other
- Confidently inventing plausible-sounding startup names that don't actually exist
- Adding a company without checking if it already exists under a slightly different name

## Acceptance criteria

- [ ] PR opens with edits to `index.html` (NOT a separate `candidates.json`)
- [ ] Each new entry has been URL-verified
- [ ] PR description lists each addition with its `source` link
- [ ] No duplicates against existing DATA
- [ ] Code passes `node scripts/check-links.mjs` locally with no new broken links
