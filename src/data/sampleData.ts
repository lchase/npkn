import { addDays, toISO } from '../core/dates'
import { markdownToPage } from '../core/markdown'
import type { Page } from '../core/types'

/**
 * A fictional notebook for trying out Ask. Everything is invented. It's written as Markdown with
 * OKF front matter and goes through the real importer, so it also exercises that path.
 *
 * Deliberate retrieval traps: a superseded decision, facts buried mid-note, the same quantity said
 * as "budget" in one place and "spend" in another, and todos with relative due dates.
 */

// Keep example questions OUT of the notes themselves: they would match real queries and skew retrieval.
const d = (n: number) => toISO(addDays(new Date(), n))
const F = '```'

interface Def {
  slug: string
  parent: string | null
  md: string
}

const DEFS: Def[] = [
  {
    slug: 'root',
    parent: null,
    md: `---
type: index
title: Sample notebook
description: Fictional notes for testing Ask. Delete this page to remove all of them.
tags: [sample]
---

Fictional notes about **Fernwood Labs**, a small company building **Lantern**, an offline-first inspection app for utility field crews. Delete this page to remove the whole sample.

The pages cover a project plan, decisions, meetings, a runbook, a budget, people, and some personal notes, with a mix of dated todos. Ask the bot about any of it.
`,
  },
  {
    slug: 'overview',
    parent: 'root',
    md: `---
type: project
title: Fernwood Labs overview
description: What the company does, team, and Q4 goals.
tags: [company, planning]
owner: Priya Raman
---

Fernwood Labs is a 14 person company in Portland. Our product is **Lantern**: field crews inspect poles, meters and substations on a tablet, mostly with no signal, and everything syncs when they are back in coverage.

## Team

- **Priya Raman**: engineering lead. Owns the roadmap and the v2.0 date.
- **Marcus Webb**: head of sales. Travels most weeks; reachable by text, not email.
- **Dana Okafor**: design. Runs the usability tests.
- **Sam Ito**: operations and on-call lead. Owns the deploy runbook.
- **Lena Park**: finance. Approves any spend over $5,000 together with Priya.

## Q4 goals

1. Ship **Lantern v2.0** with offline sync by **November 20**.
2. Reach **40 paying organizations**. We are at 31 today.
3. Keep the crash rate under **0.5%** of sessions.

## Context

Nearly all customers are rural utility co-ops. Their tablets are old: several run Android 9 and the battery is the number one complaint, which is why sync transport matters so much (see the sync decision).

- [ ] Send the Q4 goals summary to the board @work @${d(3)}
`,
  },
  {
    slug: 'v2-plan',
    parent: 'overview',
    md: `---
type: project
title: Lantern v2.0 plan
description: Milestones, owners and risks for the v2.0 release.
tags: [lantern, planning, release]
owner: Priya Raman
status: active
---

Target general availability: **November 20**. Freeze for features is **October 20**; beta goes to five friendly customers on **November 3**.

## Milestones

| Date | Milestone | Owner |
| --- | --- | --- |
| Oct 20 | Feature freeze | Priya |
| Nov 3 | Beta to five customers | Dana |
| Nov 10 | Performance sign-off on Android 9 | contractor + Sam |
| Nov 20 | General availability | Priya |

## Scope

- Offline sync with resumable cursors over WebSocket.
- Photo capture with automatic compression; customers want up to 500 photos a day per crew.
- CSV export of inspections.
- SSO through Okta for larger co-ops.

## Risks

The biggest risk is **Android 9 performance**. Photo compression is too slow on the oldest tablets and the app stalls for several seconds. We approved a contractor for this (see the September sync, decision section). If the sign-off on November 10 slips, the GA date moves to **December 4** because of the holiday deploy freeze.

Second risk: Okta SSO has never been tested against a customer's real directory. Dana to schedule a test with Tidewater.

- [ ] Confirm contractor start date for Android performance work @work @${d(-2)}
- [ ] Draft beta invitation email for five customers @work @${d(5)}
`,
  },
  {
    slug: 'decision-sync',
    parent: 'overview',
    md: `---
type: decision
title: Decision - sync transport
description: Why sync moved from polling to WebSocket with resumable cursors.
tags: [decision, sync, architecture]
status: accepted
supersedes: Decision - sync by polling
decided: ${d(-6)}
---

## Decision

Lantern v2.0 will sync over **WebSocket with resumable cursors**. This **replaces the earlier polling approach** (poll every 30 seconds), which is now superseded.

## Why

On the Android 9 tablets that most co-ops use, polling kept the radio awake. In our battery test over an 8 hour shift:

- polling every 30 seconds drained about **12%** of the battery on sync alone;
- WebSocket with resumable cursors drained about **4%**.

Resumable cursors also mean a crew that loses signal mid-upload picks up exactly where it stopped instead of resending the whole batch.

## Alternatives we rejected

- **Longer polling interval (5 minutes)**: battery was fine, but crews complained that changes took too long to show up on the supervisor's dashboard.
- **Push notifications as a wake-up**: not reliable on the devices we support.

## Consequences

- Server needs sticky connections; Sam to size the gateway.
- We keep the old polling endpoint for one release so v1 clients still work.
- Supersedes the polling decision from August.

- [ ] Size the WebSocket gateway for 3,000 concurrent crews @work @${d(1)}
`,
  },
  {
    slug: 'decision-db',
    parent: 'overview',
    md: `---
type: decision
title: Decision - database choices
description: SQLite on device, Postgres on the server.
tags: [decision, architecture, database]
status: accepted
decided: 2026-09-12
---

## Decision

- **On device:** SQLite. It is mature on Android and iOS, and works fully offline.
- **On the server:** Postgres 16, one primary and one read replica.

## Reasoning

We briefly considered running the same document store on both sides to share a schema. The sync story was attractive, but the team has far more Postgres experience and query tooling, and the device side never needs more than single-user access.

## Notes

Migrations on device run at app start and must finish in under 2 seconds on the oldest supported tablet. Anything heavier needs a background migration.
`,
  },
  {
    slug: 'meetings',
    parent: 'root',
    md: `---
type: index
title: Meetings
description: Meeting notes for the team and customers.
tags: [meetings]
---

Weekly syncs, customer calls and retrospectives live under this page.
`,
  },
  {
    slug: 'weekly-sync',
    parent: 'meetings',
    md: `---
type: meeting
title: Weekly sync, October 5
description: Updates, the WebSocket decision, and contractor approval.
tags: [meetings, weekly]
date: ${d(-6)}
attendees: [Priya Raman, Marcus Webb, Dana Okafor, Sam Ito]
---

## Updates

- **Priya:** v2.0 sync is feature complete on the server; client work continues. Crash rate is at 0.7%, above the 0.5% target, mostly photo capture on old tablets.
- **Marcus:** 31 paying organizations. Two more are in procurement; Tidewater is the biggest of them.
- **Dana:** usability test with six crews went well, except that the inspection form's photo button was missed by three of them. Moving it to the bottom bar.
- **Sam:** September infrastructure spend came in $4,100 over because log retention was set to 90 days instead of 30. Fixed.

## Decisions

1. Go with WebSocket sync (see the sync transport decision).
2. Approve a contractor for Android performance work, up to **$18,000** from the contractor budget.

## Action items

- [ ] Priya to write up the WebSocket decision @work @${d(-4)}
- [ ] Sam to cut log retention alerts to a weekly digest @ops @${d(0)}
- [ ] Dana to ship the moved photo button to the beta build @design @${d(2)}
- [ ] Marcus to send Tidewater the written quote @sales @${d(1)}

## Other

Marcus is out the week of the 19th. Priya prefers status updates in writing, posted to the engineering channel before the sync, and dislikes being pulled into calls she was not scheduled for.
`,
  },
  {
    slug: 'call-tidewater',
    parent: 'meetings',
    md: `---
type: meeting
title: Customer call, Tidewater Utilities Co-op
description: Requirements and pricing discussion with Tidewater.
tags: [meetings, customer, sales]
date: ${d(-3)}
customer: Tidewater Utilities Co-op
---

Call with Tidewater's operations director and their IT lead. Marcus led; Priya joined for the technical questions.

## What they asked for

- **Offline photo capture**, at least **500 photos per crew per day**, with no loss if the tablet reboots.
- **CSV export** of inspections for their own reporting.
- **SSO through Okta**. Their IT lead will not approve anything with its own passwords.
- A pilot with **60 seats** starting in January.

## Pricing

We quoted **$14 per seat per month**. For 60 seats that is **$840 per month**, billed annually. They asked about a volume discount above 100 seats; Marcus said we would think about it.

## Concerns

Their tablets are old: most run **Android 9** and some have 2 GB of memory. The IT lead asked directly whether the app will be usable on those. Priya said performance work is planned and she would confirm after the November 10 sign-off.

## Follow ups

- [ ] Send written quote and one page security summary @sales @${d(1)}
- [ ] Priya to confirm Android 9 support in writing after sign-off @work @${d(25)}
- [ ] Schedule Okta test against Tidewater's directory @design @${d(9)}
`,
  },
  {
    slug: 'retro',
    parent: 'meetings',
    md: `---
type: meeting
title: Retro, September launch
description: What went well and what hurt in the September v1.8 launch.
tags: [meetings, retro]
date: ${d(-14)}
---

## Numbers

- 1,240 inspections synced in the first week.
- 3 incidents, longest 47 minutes.
- Crash-free sessions: 98.9%.

## Went well

- Staged rollout caught the camera permission bug before it hit everyone.
- Support macros cut first response time by half.

## Went badly

- The release notes were written the night before and customers did not know the sync UI had changed.
- Two of the three incidents were the same root cause: an expired certificate nobody owned.

## Changes

- Certificates now have an owner in the runbook (Sam).
- Release notes are drafted at feature freeze, not at release.
`,
  },
  {
    slug: 'runbook',
    parent: 'root',
    md: `---
type: runbook
title: Runbook, deploy to production
description: How to deploy and roll back Lantern. Owner Sam Ito.
tags: [ops, runbook, deploy]
owner: Sam Ito
---

## When

Deploys happen **Tuesday and Thursday, 10:00 to 14:00 Pacific**. There is a **holiday freeze from November 23 to December 1**. Never deploy on a Friday.

## Steps

1. Check that CI is green on main and the staging smoke test passed.
2. Post in the deploy channel that you are starting.
3. Run the deploy:

${F}bash
lantern-cli deploy --env production --version <tag>
${F}

4. Watch the dashboard for 15 minutes: error rate, sync queue depth, WebSocket reconnects.
5. Post "deploy complete" with the version.

## Rollback

If error rate doubles or the sync queue grows for more than 5 minutes, roll back immediately:

${F}bash
lantern-cli rollback --to previous
${F}

Then open an incident. The previous version is always kept for 48 hours. Rolling back never touches the database; migrations are written to be backward compatible for one release.

## On call

Rotation is weekly, handed over on Monday. The pager channel is **#oncall-lantern**. If the primary does not respond in 10 minutes, page the secondary, then Priya.

## Certificates

The TLS certificates for the sync gateway expire every 90 days and renew automatically. If renewal fails the alert goes to Sam. This caused two incidents in September.
`,
  },
  {
    slug: 'budget',
    parent: 'root',
    md: `---
type: finance
title: Q4 budget
description: Fourth quarter spending plan by category and approval rules.
tags: [finance, planning, q4]
owner: Lena Park
---

Total approved for Q4: **$184,000**.

| Category | Budget |
| --- | --- |
| Contractors | $52,000 |
| Marketing | $41,500 |
| Infrastructure | $38,500 |
| Contingency | $28,000 |
| Travel | $14,800 |
| Tooling | $9,200 |

## Approval rules

Any single spend over **$5,000** needs sign-off from both **Priya** and **Lena Park**. Under that, team leads can approve their own category.

## Notes

- The contractor line already has the $18,000 Android performance engagement earmarked.
- September infrastructure spend was $4,100 over plan because of log retention, so we are watching the infra line closely.
- Travel is mostly Marcus's customer visits. The Tidewater site visit in January is not in this quarter.
- Marketing includes the regional utility conference booth in November.

- [ ] Reconcile October spend against the plan @work @${d(8)}
- [ ] Get Lena's sign-off on the conference booth invoice @work @${d(-1)}
`,
  },
  {
    slug: 'priya',
    parent: 'root',
    md: `---
type: person
title: Priya Raman
description: Engineering lead at Fernwood Labs.
tags: [people, team]
role: Engineering lead
---

Engineering lead. Owns the roadmap and the v2.0 date, and is the second approver for any spend over $5,000.

## Working with Priya

- **Prefers written updates**, posted ahead of time. Reads them before the sync and then uses the meeting for questions only.
- Does her deep work in the mornings; avoid scheduling anything before noon.
- Dislikes status meetings. If something is blocked, say so in writing with what you need.
- Direct about risk. If she says she is worried about a date, take it seriously.

## Currently cares about

The Android 9 performance work and the crash rate target. She asked to be told immediately if the crash rate goes above 1%.
`,
  },
  {
    slug: 'marcus',
    parent: 'root',
    md: `---
type: person
title: Marcus Webb
description: Head of sales.
tags: [people, team, sales]
role: Head of sales
---

Head of sales. On the road most weeks, so **text him rather than emailing**; he reads email in batches on Fridays.

## Accounts

- **Tidewater Utilities Co-op**: biggest open opportunity, 60 seat pilot planned for January.
- Two other co-ops in procurement, both expected to decide before the end of the quarter.

## Notes

Out the week of October 19. He likes concrete numbers in anything he forwards to a customer, and always asks for a one page summary he can attach.
`,
  },
  {
    slug: 'lisbon',
    parent: 'root',
    md: `---
type: note
title: Lisbon trip
description: Personal trip planning for November.
tags: [personal, travel]
---

A week in Lisbon, mostly walking and eating.

## Bookings

- **Flight:** TP 238, departs **November 6 at 08:15**, returns **November 13** in the evening.
- **Hotel:** Casa do Largo in Alfama, confirmation **LX-48213**, six nights.
- Tram 28 is crowded; go early or walk.

## Ideas

- A day trip to Sintra, buy tickets ahead for Pena Palace.
- Pastel de nata at Manteigaria, not the tourist places.
- LX Factory on Sunday for the market.

## To do before leaving

- [ ] Renew passport, it expires in January @personal @${d(10)}
- [ ] Book Sintra tickets @personal @${d(14)}
- [ ] Order a little euro cash @personal @${d(20)}
- [ ] Download offline maps @personal
`,
  },
  {
    slug: 'reading',
    parent: 'root',
    md: `---
type: list
title: Reading list
description: Books finished, in progress and queued.
tags: [personal, reading]
---

## In progress

- *Designing Data-Intensive Applications*, currently on chapter 7 (transactions). Notes: the part on write skew finally made snapshot isolation click.

## Queue

- *Staff Engineer* by Will Larson, recommended by Priya.
- *The Mom Test*, before the next round of customer calls.

## Finished

- *The Design of Everyday Things*. Reread; the bit about affordances is exactly the missed-photo-button problem from the usability test.

- [ ] Finish chapter 8 of DDIA @reading @${d(6)}
`,
  },
  {
    slug: 'this-week',
    parent: 'root',
    md: `---
type: tasks
title: This week
description: Loose todos for the week across work and personal.
tags: [todos]
---

Anything I do not want to forget.

- [ ] Reply to Lena about the conference invoice @work @${d(0)}
- [ ] Book dentist @personal @${d(4)}
- [ ] Review Dana's photo button designs @work @${d(1)}
- [ ] Renew domain for the status page @ops @${d(12)}
- [ ] Buy a birthday gift for mom @personal @${d(-1)}
- [x] Send board deck draft @work @${d(-3)}
- [x] Order new laptop stand @personal @${d(-5)}
`,
  },
]


export const sampleId = (slug: string) => `sample-${slug}`

/** The sample notebook as Page objects, with no storage involved. Used by the loader and the Ask benchmark. */
export function buildSamplePages(base = Date.now()): Page[] {
  return DEFS.map((def, i) => {
    const imp = markdownToPage(def.md, def.slug + '.md')
    return {
      id: sampleId(def.slug),
      parentId: def.parent ? sampleId(def.parent) : null,
      title: imp.title,
      content: imp.content,
      frontmatter: imp.frontmatter,
      createdAt: base + i,
      updatedAt: base + i,
    }
  })
}
