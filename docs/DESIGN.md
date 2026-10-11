---
version: "alpha"
name: "JEJAK Map-First Relocation Interface"
description: "A structured, asymmetric, map-first interface for comparing cities and exploring the local zones that fit a user's study, career, housing, and commute needs."
colors:
  primary: "#006AD8"
  secondary: "#5F84B1"
  accent: "#9ED9EB"
  base-100: "#FFF9F9"
  base-content: "#21297C"
  neutral: "#21297C"
  ink: "#21297C"
  ink-muted: "rgba(33, 41, 124, 0.72)"
  rule: "rgba(33, 41, 124, 0.14)"
  surface: "rgba(255, 249, 249, 0.96)"
typography:
  h1:
    fontFamily: "Urbanist"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 700
  body-md:
    fontFamily: "Source Sans 3"
    fontSize: "1rem"
    fontWeight: 400
  label-caps:
    fontFamily: "Source Sans 3"
    fontSize: "0.75rem"
    fontWeight: 600
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.base-100}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

## Overview

JEJAK, formerly Opportunity Atlas, helps people decide where to move for study, work, or both. It begins with the user's background, goals, budget, housing needs, transport preferences, and commute tolerance. It then recommends cities and lets the user inspect the specific zones, neighborhoods, corridors, and clusters within each city that best match those needs.

The interface is a relocation guide built around an interactive map, not a conventional analytics dashboard. The map is the main workspace. Panels explain what is visible, help the user compare options, and expose the evidence behind estimates. A city summary provides context, while local-area data supports the actual relocation decision.

The product should feel personal without becoming playful, data-rich without crowding the map, and credible without resembling a government portal. The public landing uses a photographic hero and warm surfaces; the signed-in map stays compact and map-first. AI operates in the background to gather and structure current evidence. The interface should foreground useful findings, their source coverage, freshness, and uncertainty instead of promoting AI as a visual feature.

JEJAK applies Swiss-style grid discipline to a contemporary geospatial product. Shared alignment, controlled asymmetry, strong type hierarchy, and deliberate negative space organize the interface. The map stays fluid and exploratory, while controls, panels, labels, and evidence follow a strict spacing system.

The current interface consists of the public landing and account pages, onboarding over the map, the map workspace, and profile editing. Standalone city shortlists, comparison, saved plans, and other journeys below are product direction, not a reason to add routes or controls before they exist.

- Density: Focused; detail is progressively disclosed

- Variance: Controlled asymmetry, with the map remaining the largest surface

- Motion: Subtle, functional transitions only

- **Style:** Map-first, structured, asymmetric, typographic, personalized, evidence-backed

- **Keywords:** Spatial, grid-based, typographic, accessible, progressive disclosure, local detail, trustworthy, decision-focused

- **Era:** Contemporary geospatial product

- **Light/Dark:** Light theme for the current MVP; no dark-theme toggle is shipped

## Colors

- **Base / Snow** (`#FFF9F9`) - Page background, panels, sheets, cards, and neutral map surroundings. Keep this color dominant.
- **Primary / Sapphire Sky** (`#006AD8`) - Main actions, selected zones, active layers, links, focus indicators, current state, and the top of sequential map scales. Sapphire on Snow is about 5:1, so it also works as link or inline-emphasis text.
- **Secondary / Glaucous** (`#5F84B1`) - Non-text structure only: quiet zone outlines, decorative marks, and secondary map features. At about 3.7:1 on Snow it is too weak for body-size text, text buttons, or muted copy.
- **Accent / Frosted Blue** (`#9ED9EB`) - Highlighted values on ink surfaces, the low end of sequential map scales, and light zone fills. Never use it for text on Snow (about 1.5:1).
- **Ink / True Cobalt** (`#21297C`) - Headings, body text, navigation, icons, strong borders, and labels (about 12:1 on Snow). Ink also carries structure and inverse emphasis:
  - **Section rules:** a `2px` ink top rule starts each section in a detail panel; `rule` dividers separate rows within it, except metric rows, which use metric cards (see Components).
  - **Secondary / ghost buttons:** `1px` ink border on the base or panel surface (Legenda, Reset, Retry). Hover inverts to an ink fill with On Ink text. Do not hover to a translucent tint (over the map it replaces the opaque surface and the map shows through) or to a primary fill (it clashes with the ink border and reads as an active state).
  - **Qualifier badges:** `Sample data` uses an ink fill; evidence states use ink fill or outline (see Evidence States).
  - **Inverse surfaces:** short-lived overlays that must stand out from the light map (map hover tooltips, toasts, AI activity status) use an ink background with On Ink text.
  - **Map casing:** the selected zone gets an ink casing beneath its primary outline.
  - Ink never marks selected or active state; that remains primary blue.
- **On Ink** (`#FFF9F9`) and **On Ink Muted** (`rgba(255, 249, 249, 0.72)`) - Text on ink surfaces. Use Frosted Blue for a highlighted value on ink (about 8:1); Sapphire on Cobalt is only about 2.4:1.
- **Muted Ink** (`rgba(33, 41, 124, 0.72)`) - Supporting copy, metadata, and secondary labels (about 5.3:1 on Snow; lower opacities fall below 4.5:1).
- **Rule** (`rgba(33, 41, 124, 0.14)`) - Dividers, quiet borders, and inactive controls.
- **Panel Surface** (`rgba(255, 249, 249, 0.96)`) - Map overlays that need slight separation without glassmorphism. Do not apply `backdrop-filter: blur()` to any surface that overlays the map — it forces GPU compositing of all content behind the element, which causes frame-rate degradation while MapLibre is actively rendering vector tiles.
- **Primary Tint** (`rgba(0, 106, 216, 0.10)`) - Selected rows, light active states, and low-intensity map areas.
- **Primary Tint Strong** (`rgba(0, 106, 216, 0.20)`) - Hovered zones and stronger selected-state backgrounds.

Use Snow (`#FFF9F9`) text on Sapphire (`#006AD8`) buttons, which gives about 5:1. Cobalt text on Sapphire is only about 2.4:1. Do not use opacity alone to communicate disabled, estimated, or unavailable states.

The brand palette and data-visualization palette have different roles. For quantitative map layers, use a sequential scale from Frosted Blue (`#9ED9EB`) to Sapphire (`#006AD8`), with clear lightness steps and a visible legend. If several categories must appear together, define a separate accessible data palette rather than inventing colors inside components.

Priority charts reuse the five existing Jejak palette colors: career uses Sapphire (`primary`), housing Glaucous (`secondary`), commute Cobalt (`neutral`), education Frosted Blue (`accent`), and living costs Snow (`base-100`). Runtime aliases (`--color-priority-*`) keep each category's color fixed regardless of weight. Outline Snow segments and legend swatches so light fills remain visible. Each category retains a labeled legend swatch, including at 0%; bar widths represent the actual weights without minimum widths.

The map's district choropleths use the Frosted Blue-to-Sapphire sequential scale. Additive H3 density layers use the existing warm yellow-to-red ramp to distinguish density from per-area values; pair it with a labeled legend and the selected district's summary. Treat this as a data-encoding palette, not an extension of the brand palette.

## Typography

- **Display / Brand:** [Urbanist](https://fonts.google.com/specimen/Urbanist) - Weights 600 and 700. Used for the wordmark, page titles, city and zone names, section headings, and large metrics.
- **Body / Interface:** [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) - Weights 400, 500, and 600. Used for body copy, forms, buttons, filters, map labels, tooltips, tables, and evidence text.
- **UI Labels / Captions:** Source Sans 3 - Weight 600 for controls and short labels; weight 400 or 500 for supporting metadata.
- **Numeric Data:** Source Sans 3 or Urbanist with tabular numerals. Used for wages, rent, commute time, distance, counts, and comparisons.

Urbanist carries the brand; Source Sans 3 carries the interface. Do not add a third font. Geist, Geist Mono, and Instrument Serif from early prototypes are deprecated.

Load both fonts via `next/font/google` — not a bare `<link>` to the Google Fonts CDN. `next/font` self-hosts the font files, sets `font-display: swap` automatically, and eliminates layout shift caused by web font loading. Enable `variable` mode and map the CSS variable to the Tailwind `fontFamily` config so all weights are available from a single font request.

Scale:

- Landing hero: `clamp(2.25rem, 5vw, 3.5rem)`
- Application / panel title: `1.5rem` to `1.75rem`
- City or zone title: `1.625rem` to `2.125rem`
- Section heading: `1.25rem` to `1.5rem`
- Large metric: `1.75rem` to `2.5rem`
- Body: `1rem / 1.55`
- Button and input label: `0.875rem` to `1rem`
- Map label and tooltip: `0.75rem` to `0.875rem`
- Supporting metadata: `0.75rem` to `0.8125rem`

Use sentence case for headings, buttons, and labels. Reserve uppercase for short data labels or compact eyebrows. Keep long explanations in Source Sans 3 and limit wide-panel copy to roughly 55 to 75 characters per line.

Typography establishes hierarchy before containers or decoration. Use size, weight, alignment, spacing, and contrast before adding backgrounds or borders. Keep interface copy flush left with a ragged right edge. Do not center headings, metrics, or explanatory text inside information panels.

## Layout

- **Primary canvas:** A full-screen MapLibre map beneath compact navigation and controls. The map remains visible and understandable during exploration.
- **Spatial grid:** Use an 8px base unit and a 12-column desktop grid. Search, map tools, legends, panel edges, attribution, and map controls align to shared grid lines.
- **Asymmetric composition:** Keep the full-screen map as the canvas. The selected-zone desktop panel overlays the right edge at a fixed `400px` width; it does not resize. The screen can feel visually uneven, but controls and panels align to the spacing system.
- **Information hierarchy:** User profile and goals lead to a city shortlist, then a city summary, then detailed local zones, companies, housing, transport, and evidence.
- **Progressive disclosure:** Show a short summary first, relevant metrics second, map evidence third, and source or methodology details on demand.
- **Surface limit:** Show no more than two substantial information surfaces at once, excluding navigation and compact map controls.
- **Desktop:** Group the brand, region picker, and district search in a compact upper-left header; stack the horizontally scrollable category lenses below it. Keep map utilities at the lower right and offset them around the fixed-width detail panel. The discovery sheet remains anchored along the bottom edge.
- **Tablet:** Preserve the full map canvas and compact overlay controls. Let the category row scroll when it does not fit.
- **Mobile:** Keep search and account controls in the top row and category lenses in a horizontally scrollable second row. The discovery sheet is a non-modal map companion, not a dialog: it has collapsed, center, and expanded states, uses up to `60dvh`, and remains available while a zone is selected. Center state presents a horizontal card row; expanded state uses a responsive grid. The separate zone-detail sheet is a native modal `<dialog>` at up to `60dvh`, with Escape and backdrop dismissal. Keep these distinct roles separate. The discovery list also exposes the selected district metric and its missing-data state.
- **Map detail:** City-level recommendations open to local zone polygons, heatmaps, company and campus bubbles, housing clusters, transport access, and commute bands. Do not present a whole city as the final answer.
- **Responsive breakpoint:** Multi-column content collapses below `768px`. Avoid horizontal overflow and preserve a minimum 44 by 44 pixel touch target.
- **z-index contract:** map (0) / map data (10) / controls (100) / panels (200) / modal (300) / toast (500).
- **Viewport height:** Use dynamic viewport units for full-height and height-constrained surfaces. The discovery sheet uses up to `60dvh` on mobile and `72dvh` on desktop; the mobile detail sheet uses up to `60dvh`.
- **Responsive components:** Use container queries for layouts that respond to a panel or sheet's available width, as the discovery cards do. Use viewport breakpoints for page-level changes such as desktop panels versus mobile sheets.

Implementation defaults:

- Navigation height: `56px` to `64px`
- Compact control width: `280px` to `340px`
- Desktop detail panel width: `400px` fixed
- Panel padding: `20px` to `24px`
- Card gap: `12px` to `16px`
- Control height: `40px` to `44px`
- Max reading width: `72ch`

Use CSS Grid for page-level composition and Flexbox for compact controls. The implementation stack is Next.js, Tailwind CSS, daisyUI, and MapLibre GL JS. Use deck.gl only after MapLibre cannot satisfy a demonstrated rendering or data-volume requirement.

## Elevation & Depth

Depth should separate map controls and information panels without making every element float. Prefer subtle borders and surface contrast before shadows.

- **Panels:** `1px solid rgba(33, 41, 124, 0.14)` with a short, soft shadow when map contrast requires it.
- **Cards:** Mostly flat within panels. Metric cards may carry one light shadow within the shadow limit; elsewhere use spacing, dividers, or tint before adding another shadow layer.
- **Shadow limit:** Do not exceed `0 2px 8px rgba(33, 41, 124, 0.08)` on standard interface surfaces.
- **Selected state:** Primary-blue border, tint, or indicator. Never rely on shadow alone.
- **Motion:** Ease-out curves with `150ms` to `250ms` duration. Keep movement calm and predictable.
- **Entry animations:** Fade plus a small translate of `8px` to `12px`. Avoid large slides over the map.
- **Hover states:** Subtle border, tint, or elevation change over `150ms` to `200ms`.
- **Panel transitions:** Fade and short translate only. Preserve the user's map position.
- **Functional motion:** Animate geographic transitions, selection, layer changes, or panel relationships. Do not animate static content for decoration.
- **Performance:** Animate transform and opacity. Avoid layout-triggering animation on map-heavy screens.
- **Accessibility:** Respect `prefers-reduced-motion`. Disable non-essential CSS animation and transitions under the reduced-motion preference, and gate JavaScript-driven motion such as MapLibre `flyTo` and `easeTo` so it runs immediately instead.

## Shapes

Base corner radius: `10px`. Use the rounded tokens from front matter for the full scale.

- `8px`: Search, inputs, compact controls, chips, and small buttons.
- `10px` to `12px`: Standard buttons, floating toolbars, cards, menus, and tooltips.
- `12px` to `16px`: Main panels, sheets, and larger information surfaces.
- Full pills: Status badges, filter chips, and commute-distance labels only.

Avoid excessive pill-shaped controls and avoid fully rounded content cards. Shapes should help users distinguish controls, status, and containers rather than act as decoration.

## Components

- **Primary Button:** Sapphire fill, Snow text, `12px` radius, and weight 600. Hover uses a modest darkening or border change. Active state uses a subtle `translateY(1px)`. No glow.
- **Secondary / Ghost Button:** Base surface with a navy or muted border. Hover with a navy border inverts to an ink fill with On Ink text. Maintain a visible keyboard focus ring.
- **Cards and Panels:** Base or panel surface, clear heading hierarchy, `1px` rule, and restrained shadow. Group information through alignment, whitespace, and dividers before introducing another card. A panel explains the map; it should not become a second dashboard.
- **Metric Cards:** The summary panel may use a compact three-column fact row. Thematic detail views use one flat card per metric, with its label, value, sample status, period, and concise source link. Keep cards in one column with a `1px` rule border, `16px` padding, and a `12px` gap. A native disclosure within the card may reveal evidence type, geographic scope, retrieval freshness, source confidence, and limitations when those values exist; do not invent unavailable qualifiers or style disclosures as nested cards. Confidence is Jejak's evidence-quality score, not a statistical probability. Headings, campus lists, and explanatory copy stay outside cards.
- **Inputs:** Label above the field, visible border, primary-blue focus ring, and error text below. Do not use floating labels. Onboarding questions should explain how each answer changes recommendations.
- **Navigation:** Compact and visually quiet. Active destinations use a primary indicator and weight 600. Keep the header free of the destination search field so the map command area remains spatially connected to the map.
- **Search and Category Controls:** Keep region selection and district search in the compact map header. Place Ringkasan, Pekerjaan, Pendidikan, Hunian, and Mobilitas in a horizontally scrollable category row beneath it. On small screens, the row stays horizontally scrollable rather than wrapping into another toolbar.
- **Map Controls:** Group related controls, give icon-only controls accessible names, and keep zoom, legend, 3D, search, region selection, and reset actions consistent. Keep the legend collapsed behind the Legenda control while its metric, unit, period, range, and coverage remain available on demand. Use native disclosure or Popover API behavior where it fits the interaction; do not require one implementation mechanism for every overlay.
- **Fixed Detail Panel:** The desktop panel attaches to the right edge at a fixed `400px` width, with a restrained border and overlay shadow. Do not add a resize grip or CSS `resize`; the current layout intentionally keeps map controls and panel offset predictable. On mobile, show zone detail in a native modal dialog, separate from the persistent discovery sheet underneath.
- **Zone Polygons:** Use primary-blue outlines and translucent fills. Hover strengthens the border. Selection persists with a stronger border or tint, and the selected zone gets an ink casing beneath the primary outline so it stays legible over the basemap. Saved zones also need an icon or pattern so color is not the only cue.
- **Heatmaps:** Every heatmap must show the measure, unit, period, source coverage, and legend. Never label a layer simply as “opportunity.”
- **Bubbles / Points:** Bubble size represents one declared measure only. A company count, employee estimate, vacancy count, rent cluster, campus, or transit point must be visually distinguishable. Imprecise locations must not appear as exact building coordinates.
- **Commute Bands:** Distance and travel time are separate concepts. Label bands such as `<5 km` and `<10 km` clearly, and do not imply they equal a specific journey duration without routing evidence.
- **City Summary:** Provides orientation, top matching reasons, trade-offs, broad cost range, and data freshness. It must lead users toward local exploration rather than act as the final recommendation.
- **Zone Detail:** Shows career or study relevance, observed openings, employer clusters, wage evidence, housing cost, access, commute fit, and confidence. This is the main actionable surface.
- **Evidence States:** Mark values as observed, estimated, derived, or unavailable in Indonesian. Keep sample status, period, and source link visible with the value; place evidence type, geographic scope, retrieval freshness, confidence score, and limitations in a keyboard-accessible disclosure. Display only fields supplied by the data. Do not present confidence as a calibrated probability. Distinguish states with label text and ink treatments, not with color alone.
- **AI Activity:** Use task language such as “Checking current hiring evidence” or “Updated from four sources.” Do not use a robot mascot or a permanent chatbot panel.
- **Loading:** Prefer skeletons shaped like the destination component using the daisyUI `skeleton` component as the base primitive. Set `aria-busy="true"` on the loading region and `aria-label="Loading…"` so screen readers announce the state. Use CSS `@keyframes` shimmer on `background-position` rather than JS animation for performance. Layer loading should not block map navigation.
- **Empty States:** Explain what is missing, why it matters, and the next available action. Do not invent a number to fill a gap.
- **daisyUI Usage:** Treat daisyUI as a primitive layer. Bind components to project tokens and avoid the appearance of an untouched default theme or a page made entirely from generic cards.

## Do's and Don'ts

- Do keep the map as the primary workspace.
- Do align floating controls, panel edges, legends, and attribution to the 8px spatial grid.
- Do use controlled asymmetry so the map carries more visual weight than supporting panels.
- Do use typography, whitespace, and dividers before adding containers.
- Do lead from city context to zone-level detail.
- Do personalize the hierarchy around the user's study field, career goal, budget, housing needs, transport mode, and commute tolerance.
- Do expose available sources, coverage, freshness, uncertainty, and limitations near generated findings; do not invent source counts or confidence where none is provided.
- Do keep observed facts distinct from estimates and model-derived conclusions.
- Do use direct, evidence-grounded language such as “12 active IT openings observed across 4 monitored sources” only when the count and source total are computed from the evidence.
- Do provide keyboard focus, screen-reader labels, strong contrast, and the selected district metric with its availability status in the discovery list as a non-map alternative.
- Do provide legends and units for every quantitative layer.
- Do preserve at least a 44 by 44 pixel target for touch controls.
- Do use one consistent icon family, preferably Lucide.
- Don't display city-level data as if it were evidence for a specific zone.
- Don't imply precise company or housing coordinates when the source only supports a neighborhood or district.
- Don't rank every area with one unexplained universal score.
- Don't equate distance with travel time without route or traffic evidence.
- Don't show more than two substantial overlays at once.
- Don't add a permanent chat window, robot mascot, AI glow, or generic “AI-powered insight” label.
- Don't use glassmorphism, decorative gradients, excessive shadows, or too many floating cards.
- Don't center explanatory text or metric groups inside information panels.
- Don't place cards inside cards. In detail panels, only a metric and its evidence qualifiers get a card; don't give sources, limitations, or other evidence lines their own rounded container.
- Don't use color as the only signal for selection, status, or confidence.
- Don't add a third font or restore deprecated prototype fonts.
- Don't use generic AI copy such as “revolutionize,” “unlock,” “seamless,” or “perfect place.”
- Don't hide unavailable data or fabricate precision to make the interface appear complete.

## Use Case

JEJAK supports people who are considering relocation for education, employment, or both. A user might say they want to study IT and build an IT career, then provide their budget, housing preference, transport options, preferred city, and acceptable commute. The product recommends cities such as Bandung or Jakarta, summarizes each option, and lets the user inspect the specific zones that contain relevant employers, campuses, job openings, housing, wage evidence, and travel patterns.

Within a selected city, users should be able to press zones, heatmap areas, sector polygons, and bubbles. The interface may show employer clusters, estimated employment ranges, currently observed openings, average wages, housing costs, and commute bands. These findings can come from first-party datasets, public structured data, and AI-assisted collection of reliable unstructured sources, but every value must communicate its evidence quality.

Primary product surfaces include onboarding, personalized city shortlist, map exploration, city summary, zone detail, comparison, saved places, and evidence or methodology views. The design is suitable for a public-facing relocation decision tool, a career and education discovery platform, and a location intelligence interface for users who need practical local detail rather than a generic city quality-of-life ranking.
