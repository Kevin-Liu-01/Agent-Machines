---
name: career-ops
description: AI job search pipeline — evaluate offers, generate tailored CVs, scan 45+ company portals, track applications, interview prep, salary negotiation, and LinkedIn outreach. Use when the user asks to evaluate a job posting, generate a resume, scan for open roles, prep for interviews, or says "career-ops", "job search", "evaluate this role", "scan portals", "generate resume", "interview prep", or "salary negotiation."
---

# Career Ops

Based on [santifer/career-ops](https://github.com/santifer/career-ops) (18K+ GitHub stars).

Command-driven workflow for the full job search lifecycle.

## Capabilities

1. **Evaluate** — Score a job description across 10 weighted dimensions (A-F system, 4.0/5 threshold). Six evaluation blocks: role summary, CV match, level strategy, comp research, personalization (tailored resume bullets and cover angles), and interview prep.
2. **Generate** — ATS-optimized PDF resume tailored to a specific JD. Pulls from Kevin's master resume at `~/Documents/GitHub/kevin-wiki/raw/career/resume-kevin-liu.tex`.
3. **Scan** — Search 45+ company portals (Ashby, Greenhouse, Lever, Wellfound) for matching roles. Target companies from the career-profile wiki page tier table.
4. **Track** — Application status tracking with timeline and next-action prompts.
5. **Interview Prep** — STAR+R story generation from Kevin's experience, mapped to likely behavioral questions.
6. **Salary Negotiation** — Comp research, counter-offer framing, negotiation scripts.
7. **LinkedIn Outreach** — Draft personalized connection requests and InMails for target companies.

## Usage

```
/career-ops evaluate <JD-URL-or-paste>
/career-ops generate <JD-URL-or-paste>
/career-ops scan <company-name>
/career-ops track
/career-ops prep <company> <role>
/career-ops negotiate <offer-details>
/career-ops outreach <person-name> <company>
```

## Key Principle

Career-ops is a filter, not a spray tool. It finds the few offers worth pursuing out of hundreds. Quality over quantity. Always review AI-generated content before submitting.

## Integration

- Resume source: `~/Documents/GitHub/kevin-wiki/raw/career/resume-kevin-liu.tex`
- Target companies: `wiki/career/career-profile.md` tier table
- Interview stories cross-pollinate with content ideas for social posting
- Pairs with `kevin-voice` skill for candidate blurbs and outreach copy
