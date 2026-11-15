/** Page templates every workspace has. Saved templates are added next to these. */
export type BuiltInPageTemplate = {
  id: string;
  name: string;
  description: string;
  title: string;
  body: string;
};

export const PAGE_TEMPLATES: BuiltInPageTemplate[] = [
  {
    id: "brief",
    name: "Project brief",
    description: "Goal, scope, dates and how you'll know it's done.",
    title: "Project brief",
    body: `## Goal
What does done look like, in one sentence?

## Why it matters

## Scope
- In:
- Out:

## Key dates
| Date | What |
| --- | --- |
|  |  |

## Done when
- [ ] 
- [ ] 

## Risks and open questions
- 
`,
  },
  {
    id: "meeting",
    name: "Meeting notes",
    description: "Who, what was decided, and who does what next.",
    title: "Meeting notes, {date}",
    body: `**Date:** {date}
**With:** 

## Agenda
1. 

## Notes

## Decisions
- 

## Action items
- [ ] 
`,
  },
  {
    id: "decision",
    name: "Decision record",
    description: "The options you weighed, the pick, and why.",
    title: "Decision: ",
    body: `**Date:** {date}
**Status:** Proposed

## The question

## Options
### Option A
- Pros:
- Cons:

### Option B
- Pros:
- Cons:

## Decision

## Why

## What changes now
- [ ] 
`,
  },
  {
    id: "weekly",
    name: "Weekly review",
    description: "What got done, what slipped, and next week's focus.",
    title: "Weekly review, {date}",
    body: `## Done this week
- 

## Slipped, and why
- 

## Blocked on
- 

## Next week's top three
1. 
2. 
3. 
`,
  },
  {
    id: "trip",
    name: "Trip plan",
    description: "Dates, bookings, budget and a packing list.",
    title: "Trip plan",
    body: `## Dates
- Leave:
- Return:

## Bookings
| What | Booked? | Confirmation | Cost |
| --- | --- | --- | --- |
| Flights | no |  |  |
| Stay | no |  |  |

## Budget

## Before we go
- [ ] Passports valid 6 months past return
- [ ] Travel insurance
- [ ] Tell the bank

## Packing
- [ ] 
`,
  },
];

/** Fills {date} with today's date, written out. */
export function fillTemplate(text: string, today: string): string {
  return text.replaceAll("{date}", today);
}
