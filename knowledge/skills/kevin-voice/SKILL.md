---
name: kevin-voice
description: Write about Kevin Liu in his own voice. Credential-forward, third-person, fragment-style positioning. Use whenever the agent needs to describe Kevin to a reader (recruiter "Why this candidate" blurbs, LinkedIn headlines + About sections, conference bios, intro requests, cold outreach openers, "tell me about yourself" answers, X/site bios, panel descriptions, app submission profiles, founder intros). Triggers on "write a bio", "intro me", "Kevin in one line", "pitch me", "About section", "candidate blurb", "outreach opener", "describe me", or whenever copy is being authored that represents Kevin.
---

# Kevin Voice

Kevin's third-person positioning voice. Modeled on the credential-forward "Why?"
blurbs Sequoia / curated job platforms generate for him. Compresses real proof
points from the wiki into sentence fragments that earn the reader's attention
without sounding like a cover letter.

**Scope:** self-positioning only. Bios, blurbs, headlines, openers, About sections.
Also use for spoken interview answers when Kevin needs to sound like himself out
loud, not like a written profile.

- For social posts in Kevin's voice → `social-draft`
- For generic marketing copy → `copywriting`
- For job evaluation / CV tailoring → `career-ops`

## Source of Truth (read every time)

Before writing anything, load these wiki pages. Never invent a fact, company,
metric, or title. If the proof isn't here, ask Kevin or use a different angle.

| File | What it has |
|------|-------------|
| `wiki/USER.md` | Identity, current work, strengths, key people |
| `wiki/career/career-profile.md` | Positioning, target roles, differentiators, LinkedIn strategy |
| `wiki/career/resume.md` | Companies, dates, bullets, metrics, publications |

If any of these are stale or missing, run `npx tsx scripts/check-freshness.ts`
and surface the gap before writing.

## The Core Pattern (Why? blurb)

```
[CREDENTIAL NOUN] [optional CONTEXT TAG] with [PROOF NOUNS]
```

Examples that actually appear in his recruiting feed:

- "Founding engineer with full-stack and AI infrastructure proven"
- "Founding engineer at ideal YC company with agentic expertise"
- "Princeton CS founding engineer with infrastructure and systems experience"
- "Founding engineer with 0-to-1 shipping and full-stack capabilities"

Anatomy:

- **Credential noun** (lead): `Founding engineer`, `Princeton CS founding engineer`, `YC founding engineer`, `Bloomberg + AWS engineer`, `Agent infrastructure engineer`. Strongest single noun phrase first.
- **Context tag** (optional): `at YC AI company`, `at agent infrastructure startup`. Only add when it sharpens the fit for the audience.
- **Proof nouns** (the differentiation): comma- or `and`-joined nouns derived from real shipped work. `agentic expertise`, `0-to-1 shipping`, `multi-tenant auth`, `MCP-powered SDK`, `customer delivery experience`.
- **Length:** 10–22 words.
- **Person:** third-person fragment. No "I", no verb-led sentence.

## Length Variants

Pick the variant that matches the surface area, not the other way around.

| Variant | Words | Use for |
|---------|-------|---------|
| **Micro** | 6–10 | X bio, slack status, header tagline |
| **Why? blurb** | 10–22 | Recruiter cards, intro requests, app forms |
| **Two-line bio** | 30–55 | Conference bio, podcast intro, panel description |
| **Medium** | 80–140 | LinkedIn About first paragraph, recruiter outreach opener, "tell me about yourself" answer |
| **Long** | 200–350 | Full LinkedIn About, application personal statement |

## Voice Rules

**Lead with the strongest single credential.** "Founding engineer at Dedalus
(YC S25)" beats "20-year-old Princeton student". Audience-relevant noun first.

**Specificity > superlative.** `multi-tenant auth + microVM sandboxes` beats
`world-class infrastructure work`. Numbers from the resume are fair game
(`85% doc analysis reduction`, `4.6x relevance gain`, `$32k raised`).

**Proof must trace to a real shipped thing.** If you can't cite the resume bullet
or wiki page that produced the claim, rewrite the claim.

**One angle per blurb.** Don't try to land founding engineer + research + design
+ nonprofit in one sentence. Pick the one the audience cares about.

## Spoken Answer Mode

Use this mode for "tell me about yourself", recruiter calls, founder intros,
interview answers, and any answer Kevin will say out loud.

**Shorter breath units.** Prefer periods over long comma chains. If a sentence
needs two breaths, split it.

**Almost no colons or semicolons.** Written labels like `Listen for:` or
`Watch out for:` read like stage directions out loud. Turn them into sentences.

**First person is allowed.** Spoken Kevin says "I'm Kevin", "I've been digging
into", and "I want to pressure-test". Do not force third person when the surface
is conversational.

**Questions should sound spoken.** If an answer has a questions section, don't
make it a list of labeled bullets. Write the questions as the actual thing Kevin
would ask.

**One flowing spine.** Replace arrow punctuation and stacked clause chains with
one sentence that carries the through-line. Then support it with short sentences.

**FDE framing.** When relevant, connect Dedalus forward-deployed work to personal
beliefs and growth: learning by owning messy surfaces, pressure-testing systems,
sharing tribal knowledge, and becoming useful across product, infra, design,
security, DevRel, and company operations.

**Stack-rank credentials by audience:**

| Audience | Lead with |
|----------|-----------|
| YC / agent startups | `Founding engineer at Dedalus (YC S25)` → MCP / microVM / dAuth proof |
| Big tech intern recruiting | `Princeton CS '28` → Bloomberg/AWS proof, then Dedalus |
| Research labs | `Princeton CS researcher with Danqi Chen` → CoTCodec, publications |
| Design-engineering roles | `Frontend-tasted full-stack engineer` → motion / 3D / design system proof |
| Founders / partners | `YC founding engineer at 20` → 0-to-1, OMMC nonprofit, distribution proof |

## Anti-Patterns (cut on sight)

Generic AI-application voice:

- "passionate about", "driven by", "thrilled to", "humbled to"
- "results-oriented", "self-starter", "team player", "fast learner"
- "leveraging", "synergy", "ecosystem", "unlock", "game-changer"
- "I am a Computer Science student at Princeton interested in..." (every CS undergrad on the planet)
- Vague proof: "experience with AI", "worked on infrastructure", "built systems"
- Fluffy openings: "As a founding engineer..." (just say founding engineer)
- Three-adjective stacks: "fast, scalable, reliable"
- Hedges: "some experience with", "exposure to", "familiar with"

If a sentence could describe any Princeton CS junior, rewrite it until it
can only describe Kevin.

### AI writing tells (hard cut)

Two patterns are signature AI writing tells. They make a blurb read as
machine-generated even when the proof is real. Cut both on sight. See
`wiki/people/STYLE.md` "Anti-AI-Tells" for the canonical rule.

- **No em dashes (`—`, `–`, `--`).** Use periods, commas, colons, or
  parentheses. The em dash creates the AI rhythm "X, and here's why, Y."
  Bios in Kevin's voice are fragment-style; periods do the work.
- **No negative parallelism.** Cut: "Not just X, but Y." / "It's not X, it's
  Y." / "X isn't the goal. Y is." Make the positive claim directly. The
  Why? blurb pattern is `[CREDENTIAL NOUN] with [PROOF NOUNS]`, not a
  rhetorical contrast.

Bad: "Not just a Princeton CS student, but a founding engineer at Dedalus (YC S25)."
Good: "Princeton CS founding engineer at Dedalus (YC S25)."

Bad: "Founding engineer at Dedalus (YC S25) — shipping MCP-powered SDK and microVM auth."
Good: "Founding engineer at Dedalus (YC S25) shipping MCP-powered SDK and microVM auth."

## Workflow

1. **Identify the surface.** What is being written, who reads it, what action do they take after.
2. **Pick the audience-stack-rank credential.** From the table above.
3. **Pull 1–3 proof nouns from the wiki.** Open `resume.md` if specific metrics are needed.
4. **Pick a length variant** matched to the surface.
5. **Draft 2–3 angles**, not just one. Different lead credentials, different proof.
6. **Cut anti-pattern words.** Run the cut list above as a final pass.
7. **Show variants to Kevin.** Let him pick or remix; never assume the first one wins.

## Default Deliverable

When asked to write about Kevin, return:

1. The requested-length variant (3 alternatives, different leading credential)
2. A micro version (8 words, X-bio-friendly) as a bonus
3. A note on which wiki facts each draft is grounded in

Format:

```
### Variant A: [angle, e.g., "founding engineer angle"]
[draft]
Grounded in: career-profile.md "Differentiators #1", resume.md "Dedalus bullet 1"

### Variant B: [angle]
...

### Micro
[8-word X bio]
```

## Reference Library

`references/why-blurb-examples.md` is the actual Sequoia blurbs that seeded
this skill, plus annotated rewrites.

`references/proof-bank.md` is pre-extracted proof nouns by domain (agent infra,
ML, full-stack, design, research, leadership). Pull from here for fast assembly.

## Maintenance

When Kevin ships a notable new project, lands a new role, or publishes new
work: update `references/proof-bank.md` with the new proof nouns. The skill
is only as sharp as the proof inventory.
