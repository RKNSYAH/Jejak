# Jejak HCI and User-Flow Summary

## Purpose

Jejak helps someone decide where to move for study, work, or both. The product should guide a high-stakes decision without forcing the user to understand every dataset, score, map layer, or AI process at once.

The experience follows one simple progression:

```text
Set the situation → See suitable cities → Inspect local areas → Compare trade-offs → Save a plan
```

The product should present four decision dimensions first. Detailed variables stay behind progressive disclosure:

1. **Opportunity**: jobs, wages, universities, training, and relevant sectors.
2. **Affordability**: rent, food, transport, total monthly cost, and purchasing power.
3. **Access**: commute, transit, distance to destinations, internet, healthcare, and public services.
4. **Daily life**: area character, facilities, local knowledge, and practical considerations.

## Recommended route tree

The tree includes user-facing pages, important utility routes, and interaction states. Map selections and filters should remain query state or drawers where possible so users do not lose their geographic context.

```text
Jejak
├── Public
│   ├── /
│   │   └── Landing page with “Mulai Jejakmu” CTA
│   ├── /how-it-works
│   ├── /about
│   ├── /help
│   ├── /accessibility
│   ├── /privacy
│   └── /terms
│
├── Authentication
│   ├── /auth/sign-in
│   ├── /auth/sign-up
│   ├── /auth/forgot-password
│   ├── /auth/reset-password
│   └── /auth/callback
│
├── Relocation setup
│   ├── /start
│   │   └── State-aware entry router after the landing CTA
│   ├── /start/goal
│   │   └── Study, work, or study and work
│   ├── /start/context
│   │   └── Field, education level, career stage, and current situation
│   ├── /start/destination
│   │   └── Open search, fixed city, campus, workplace, or region
│   ├── /start/budget
│   │   └── Monthly budget, rent limit, and one-time moving budget
│   ├── /start/housing
│   │   └── Housing type, privacy, furnishing, and household needs
│   ├── /start/mobility
│   │   └── Transport mode, commute tolerance, and regular destinations
│   ├── /start/priorities
│   │   └── Opportunity, affordability, access, and daily-life priorities
│   ├── /start/review
│   │   └── Confirm hard constraints and soft preferences
│   └── /start/resume
│       └── Resume an unfinished profile
│
├── Discovery
│   ├── /discover
│   │   └── Personalized city shortlist
│   ├── /discover/cities/[cityId]
│   │   └── City overview and fit explanation
│   ├── /discover/compare
│   │   └── Compare shortlisted cities
│   └── /discover/no-results
│       └── Explain constraints and offer safe ways to broaden them
│
├── Explore workspace
│   ├── /explore
│   │   └── Main map and list workspace
│   │       ├── City summary drawer
│   │       ├── Zone detail drawer
│   │       ├── Evidence and source drawer
│   │       ├── Layer selector
│   │       ├── Search and destination picker
│   │       ├── Filter and preference drawer
│   │       ├── Compare tray
│   │       └── AI refinement drawer
│   ├── /explore/[cityId]
│   │   └── Deep-linked city map state
│   ├── /explore/[cityId]/[zoneId]
│   │   └── Deep-linked zone detail state
│   └── /explore/shared/[shareId]
│       └── Read-only shared exploration
│
├── Decision pages
│   ├── /areas/[zoneId]
│   │   └── Shareable local-area profile
│   ├── /areas/[zoneId]/compare
│   │   └── Compare nearby areas
│   ├── /compare
│   │   └── Compare selected cities or areas
│   ├── /saved
│   │   └── Saved cities, areas, and comparisons
│   ├── /saved/[listId]
│   │   └── Saved shortlist
│   ├── /plans
│   │   └── Relocation plans and scenarios
│   └── /plans/[planId]
│       └── Plan summary, assumptions, shortlist, and next steps
│
├── User controls
│   ├── /profile
│   ├── /profile/preferences
│   ├── /profile/notifications
│   ├── /settings
│   ├── /settings/data-and-privacy
│   └── /settings/delete-account
│
└── System states
    ├── /404
    ├── /403
    ├── /500
    ├── /offline
    ├── /maintenance
    └── /unsupported-browser
```

### Landing CTA and entry routing

`/` is always the public landing page. Its main action should use a direct label such as **Mulai Jejakmu**. “Mulai Jejak Selanjutnya” can work as campaign copy, but it sounds like the user has already completed an earlier journey. The button should lead to `/start`, which resolves the user’s state without showing an unnecessary intermediate screen:

```text
/  Landing page
  → Mulai Jejakmu
  → /start
      ├── No account
      │   ├── /auth/sign-up?next=/start
      │   └── After registration → /start/goal
      │
      ├── Account exists, onboarding not started
      │   └── /start/goal
      │
      ├── Account exists, onboarding unfinished
      │   └── /start/resume
      │
      ├── Account exists, onboarding skipped
      │   └── /explore
      │
      └── Account exists, onboarding completed
          └── /explore
```

The router should preserve a guest’s unfinished inputs locally when possible. Registration should not erase the profile already entered. If guest onboarding is allowed, `/start` may offer **Lanjut sebagai tamu** beside registration; saving, syncing, and sharing can request an account later.

Returning users should go to the map with their last active plan, city, zone, and map state when those values exist. Otherwise, send them to the default `/explore` state.

### Recommended query state for `/explore`

Use query parameters for reversible exploration instead of creating a route for every map action:

```text
/explore/[cityId]
  ?zone=[zoneId]
  &layer=opportunity|affordability|access|daily-life
  &destination=[placeId]
  &mode=map|list|split
  &compare=[id,id]
  &profile=[profileId]
```

This preserves browser history, supports sharing, and lets the user return to the same map context.

## Primary user flow

```text
Landing (/)
  → Mulai Jejakmu
  → State-aware entry (/start)
  ├── New or unfinished user
  │   → Register or resume onboarding
  │   → Choose relocation goal
  │   → Add only decision-changing context
  │   → Choose open discovery or fixed destination
  │   → Set budget, housing, and mobility limits
  │   → Set priorities
  │   → Review hard constraints and preferences
  │   → See city shortlist or selected-destination result
  │   → Open city overview
  └── Completed or skipped onboarding
      → Open the map with the last active plan

After either branch:
  → Explore local areas on map or list
  → Inspect evidence and trade-offs
  → Compare areas or cities
  → Save shortlist or relocation plan
  → Refine assumptions and recalculate when needed
```

### Branches

```text
Destination already fixed
  → Skip broad city discovery
  → Evaluate the selected city or destination
  → Explore nearby zones and commute bands

User wants to discover everything
  → Ask goal and minimum constraints
  → Show a city shortlist
  → Continue into city and zone exploration

No suitable result
  → Explain which hard constraint filtered results
  → Let the user relax one constraint at a time
  → Preview the effect before applying the change

User is not ready to decide
  → Save profile or scenario
  → Return later without losing inputs
```

## Page responsibilities

| Route | User question | Primary action | HCI requirement |
|---|---|---|---|
| `/` | Can Jejak help me? | Mulai Jejakmu | Keep one dominant CTA and explain the outcome before asking for personal details |
| `/start` | Where should I continue? | Follow the resolved next step | Route by account and onboarding state without displaying a blank intermediate page |
| `/start/*` | What matters for my move? | Continue or go back | One decision per screen, visible progress, saved input, clear examples |
| `/start/review` | Did Jejak understand me? | Confirm profile | Separate hard constraints from flexible preferences |
| `/discover` | Which cities deserve attention? | Open a city | Explain fit, trade-offs, evidence coverage, and why a result appears |
| `/discover/cities/[cityId]` | Is this city realistic for me? | Explore local areas | Keep city context visible while exposing local variation |
| `/explore` | Which area fits my life? | Select an area or layer | Pair map with an equivalent list view and keep controls discoverable |
| `/areas/[zoneId]` | What would living here be like? | Save or compare | Use a stable summary before detailed evidence |
| `/compare` | What changes between options? | Choose or save | Keep indicators aligned and show differences, not isolated scores |
| `/saved` | What did I already consider? | Resume a decision | Preserve the profile, timestamp, assumptions, and data freshness |
| `/plans/[planId]` | What should I do next? | Refine or act | Convert research into a practical shortlist and checklist |
| `/profile/preferences` | What does Jejak assume about me? | Edit preferences | Give direct control over stored data and recommendation weights |
| `/help` | How do I use or interpret this? | Find an answer | Use task-based help, examples, and recovery guidance |

## Navigation model

Keep the global navigation small:

```text
Explore · Discover · Saved · Plans · Profile
```

Use a persistent app shell after onboarding:

- A clear page title and current city or plan context.
- One primary action per page.
- A stable back action that preserves form and map state.
- Breadcrumbs or a compact context trail on deep pages.
- A profile or plan switcher that does not hide inside the main task.
- Mobile bottom navigation for the five top-level destinations.
- Desktop side navigation or a compact top navigation with the same labels.

Do not place every data category in the main navigation. Jobs, universities, housing, cost, commute, and public services belong inside the four decision dimensions and the Explore workspace.

## HCI requirements

### Shneiderman’s eight golden rules

1. **Consistency**: Use the same labels for cities, zones, layers, fit, trade-offs, sources, save, compare, and back actions.
2. **Universal usability**: Support beginners with guided setup and support experienced users with saved profiles, keyboard shortcuts, search, and direct map controls.
3. **Informative feedback**: Confirm profile saves, recalculation, layer changes, compare actions, and failed data requests.
4. **Dialog closure**: End onboarding with a review and confirmation. End saving with a clear saved state and a path to continue.
5. **Error prevention**: Validate impossible budgets, incomplete destinations, invalid ranges, and conflicting constraints before submission.
6. **Easy reversal**: Let users undo filters, remove saved items, clear layers, edit assumptions, and return to the previous step without losing work.
7. **Internal locus of control**: Treat AI as an assistant. The user controls constraints, priorities, destinations, map layers, and final decisions.
8. **Reduce short-term memory**: Repeat the active profile summary, show score components beside scores, preserve map position, and show what changed after recalculation.

### Nielsen’s ten usability heuristics

| Heuristic | Jejak implementation |
|---|---|
| Visibility of system status | Progress indicators, loading labels, last-updated dates, calculation status, and save confirmation |
| Match with the real world | Use plain terms such as “monthly rent,” “commute time,” “near this campus,” and “what you may compromise” |
| User control and freedom | Back, undo, edit profile, remove filter, cancel AI refinement, and reset view |
| Consistency and standards | Familiar search, filter, tabs, drawers, breadcrumbs, buttons, and form patterns |
| Error prevention | Inline validation, constraint previews, confirmation before deletion, and safe defaults |
| Recognition over recall | Visible profile chips, layer labels, recent searches, examples, and selected destinations |
| Flexibility and efficiency | Guest exploration, saved profiles, keyboard access, direct search, and optional natural-language refinement |
| Aesthetic and minimalist design | Show the four dimensions first; reveal detailed metrics only when relevant |
| Help users recover from errors | State what failed, what remains available, and one or two recovery actions |
| Help and documentation | Task-based Help, definitions for unfamiliar indicators, source notes, and examples |

### Fitts’s law and target design

- Make primary buttons large and easy to reach. Use at least a 44 by 44 CSS-pixel target, with 48 pixels preferred for primary touch actions.
- Keep the main action near the user’s current task: “Explore areas” beside the city summary, “Save” in the area header, and “Compare” in the selection tray.
- Keep map controls grouped, visible, and separated from destructive actions.
- Make the full result card clickable when the card opens the same destination as its button.
- Use sufficiently large map markers and clusters. Provide a list alternative for dense or inaccessible maps.
- Keep frequent mobile actions within thumb reach. Use a bottom action bar for Save, Compare, and Continue when appropriate.
- Do not make users target tiny text links for essential actions.

## Onboarding and form design

- Ask only for information that changes a recommendation.
- Use one main question or decision per screen.
- Show a progress indicator such as “Step 3 of 7” and allow Back.
- Mark optional questions clearly and provide safe defaults.
- Give examples for unfamiliar inputs such as rent, commute, or city type.
- Use sliders only for rough preferences. Use numeric fields when precision matters.
- Keep hard constraints and soft preferences visually separate.
- Summarize the interpreted profile before ranking locations.
- If the user gives a natural-language request, show the extracted values and let them correct them.
- Allow guest exploration. Ask for an account when saving, syncing, or sharing becomes useful.
- Support save-and-resume without forcing account creation at the first screen.

## Recommendation and AI interaction

Recommendations must support judgment rather than replace it.

Every recommendation should expose:

- Why it matches the user’s profile.
- Which hard constraints it satisfies.
- The score or evidence behind the main dimensions.
- The main trade-off, such as higher wages with higher rent.
- Source, geographic level, observation period, and data coverage.
- Uncertainty or missing evidence.
- What would change if the user adjusted a constraint.

Use language such as “strong fit for your stated priorities” instead of “best city.” Do not present an AI explanation as a source. The system should retrieve the supporting data first, then generate a concise explanation grounded in that data.

For conversational refinement:

```text
User request
  → Interpret preferences
  → Show extracted changes
  → Ask for confirmation when the change affects ranking
  → Recalculate
  → Explain the difference
```

The AI must not invent job counts, rent, wages, commute times, vacancies, or university information. When evidence is weak, say so and offer a safer next action.

## Map and data-exploration requirements

- Pair every map view with a list or table view.
- Give every layer a plain-language purpose and unit.
- Group layers into Opportunity, Affordability, Access, and Daily Life.
- Start with one recommended layer. Let users add more only when needed.
- Use a legend with ranges, units, source date, and a short interpretation.
- Keep selected zone, active destination, and active profile visible.
- Use clusters for dense points and provide search for named places.
- Never encode meaning through color alone. Use labels, patterns, icons, or a list.
- Preserve zoom, map position, selected layers, and open drawers when the user returns.
- Use a data-coverage badge when a city or zone has weaker evidence than another.
- Distinguish official statistics, modeled estimates, observed listings, and AI-generated summaries.

## Accessibility and responsive behavior

Use WCAG 2.2 AA as the baseline.

- Provide visible keyboard focus and a logical tab order.
- Ensure every control has a programmatic name.
- Use semantic headings, landmarks, labels, and form errors.
- Maintain readable contrast. Do not use color as the only signal.
- Provide a non-map alternative for all geographic information.
- Announce loading, save, recalculation, and error states to assistive technology.
- Support zoom and reflow without hiding essential actions.
- Respect reduced-motion preferences and avoid animation that communicates information by motion alone.
- Keep touch targets large enough for mobile use and separate adjacent actions.
- Test with keyboard navigation, screen readers, small screens, poor connectivity, and localization to Indonesian and English.

## Required system states

Every data-dependent page should define these states before implementation:

```text
Default
Loading
Partial data
No results
No data for selected area
Stale data
Network failure
Permission failure
Offline
Successful save
Successful recalculation
Destructive-action confirmation
```

Each state must tell the user:

1. What happened.
2. Whether their input or saved work remains safe.
3. What action they can take next.

Avoid blank screens, unexplained spinners, and generic “Something went wrong” messages.

## Usability acceptance checklist

- A first-time user can start without knowing Jejak’s data model.
- A user can finish a basic profile without seeing all optional variables.
- A user can tell why a city or zone appears in the results.
- A user can distinguish hard constraints from preferences.
- A user can compare options using the same indicators and time basis.
- A user can return to a prior step without losing data.
- A user can explore a map entirely through a list or keyboard-accessible alternative.
- A user can see source, date, geography, and limitations for material claims.
- A user can identify what the AI inferred and correct it.
- A user can save, remove, undo, and resume a plan.
- A user can recover from no results, stale data, and network failure.
- A user can use the core flow on mobile with one hand.
- A user is never pushed to treat an uncertain recommendation as a final decision.

## Recommended MVP boundary

For the first usable version, implement:

```text
/start
/start/*
/discover
/discover/cities/[cityId]
/explore/[cityId]
/areas/[zoneId]
/compare
/saved
/help
/privacy
```

Keep advanced housing listings, multi-destination commute planning, detailed relocation checklists, and institutional dashboards outside the first flow. The MVP should prove that a user can move from a personal situation to a defensible city and local-area shortlist.
