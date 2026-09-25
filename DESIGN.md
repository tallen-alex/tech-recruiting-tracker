---
name: Tech Recruiting Tracker
description: A personal ops console for a tech job search — dense, monospace-accented, light and fresh.
colors:
  surface: "#ffffff"
  panel: "#f3f6f4"
  panel-raised: "#eaf0ec"
  border: "#dde5e0"
  border-strong: "#c7d3cc"
  text: "#16231c"
  text-secondary: "#4a5a51"
  text-faint: "#5f6f65"
  accent: "#0c7a61"
  accent-strong: "#0a6a54"
  accent-muted: "#e3f3ee"
  success: "#127035"
  success-muted: "#e6f6ea"
  warning: "#93540a"
  warning-muted: "#fdf1de"
  danger: "#c13434"
  danger-muted: "#fbe9e7"
  info: "#2761a3"
  info-muted: "#e8f1fb"
typography:
  ui:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  sm: "0.1875rem"
  md: "0.25rem"
  lg: "0.375rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-ghost:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
---

# Design System: Tech Recruiting Tracker

## Overview

**Creative North Star: "The Personal ATS"**

Every applicant tracking system Tallen has ever used belonged to someone else — a recruiter, a company, a hiring pipeline he could only see from the outside. This system flips that: it's his own ops console, built in the visual grammar of the internal tools engineers already run daily (`k9s`, `lazygit`, Grafana-style dashboards) fused with the pipeline/status vocabulary of the ATS software he's used to being tracked *by*. It shipped dark first, but that read as a grind — a night-shift terminal, not a search that's actually going somewhere. It was rebuilt light and fresh on direct correction: white ground, a single growth-green accent, dense information without the weight of a dark ops room. The instrument-panel structure (tables, monospace data, tone-dot status controls) stayed; only the mood changed, from "night shift" to "moving forward."

Nothing here is decorative. The system still answers the same original brief — functional over decorative, scan speed over visual flourish, no "vibe-coded" showpiece — now paired with an explicit ask for a light, positive feel. Every color, weight, and spacing choice earns its place by making triage faster or status clearer; the green accent additionally earns its place by making progress feel like progress.

**Key Characteristics:**
- White ground with soft green-tinted neutrals and a single teal-green accent — never a palette of competing colors.
- Monospace reserved strictly for data — numbers, dates, the wordmark — never for prose or headings.
- Flat by construction: hairline borders do the separating job shadows would do elsewhere.
- Dense tabular rows are the primary content pattern, not cards.

## Colors

A near-white neutral ground carries almost the entire surface; one teal-green accent and four semantic hues do all remaining color work. Every saturated color was re-tuned for light backgrounds (not just lightened from the prior dark palette) — light grounds need darker, more saturated values than dark grounds to hit the same 4.5:1 text-contrast floor.

### Primary
- **Signal Teal** (`#0c7a61`): the single accent. Active tab underline, primary buttons, focus rings, current-selection state. Never used decoratively — if it isn't marking an action, a selection, or a focus target, it shouldn't be teal.
- **Signal Teal, Strong** (`#0a6a54`): hover state for accent-colored controls only.

### Neutral
- **Paper White** (`#ffffff`): the base surface every view sits on.
- **Panel** (`#f3f6f4`): the header bar, table header rows, empty-state chrome, table row hover — the "second neutral layer" that separates structural chrome from content. A whisper of green keeps it from reading as generic gray.
- **Panel Raised** (`#eaf0ec`): reserved for anything that sits a level above panel (currently unused in shipped views; held for future overlays/popovers).
- **Border** (`#dde5e0`): default hairline dividers — table rows, header underline.
- **Border Strong** (`#c7d3cc`): control outlines (selects, inputs, buttons) and empty-state dashed borders — anything that needs to read as an interactive edge.
- **Text** (`#16231c`): primary reading text.
- **Text Secondary** (`#4a5a51`): supporting text — descriptions, secondary table columns.
- **Text Faint** (`#5f6f65`): table header labels, placeholder text. Tuned to clear 4.5:1 contrast on both Paper White and Panel — never drop below this value for text-bearing uses.

### Semantic (state only — never decorative)
- **Success** (`#127035` / muted `#e6f6ea`): positive pipeline states (Offer, Meeting Scheduled). Deliberately a different hue-family register than the primary accent (leaf green vs. teal) so "this is a positive status" never gets confused with "this is the brand color."
- **Warning** (`#93540a` / muted `#fdf1de`): in-progress states (Interviewing, Reviewing, Messaged).
- **Danger** (`#c13434` / muted `#fbe9e7`): negative states (Rejected, No Response) and inline error messaging.
- **Info** (`#2761a3` / muted `#e8f1fb`): neutral-active states (New, Applied, Messaged).

### Named Rules
**The One Accent Rule.** Teal appears only on the active tab underline, primary buttons, focus rings, and text links on hover. It never appears twice in the same control for two different reasons, and it is never used just to add color to a screen that has none.

**The Muted-Background Rule.** Every semantic color gets a corresponding `-muted` background token for badges/dots' containing chrome. Never place a full-saturation semantic color as a fill behind body text — only as text, dot, or border-accent color.

**The Retune, Not Relighten Rule.** When adapting this palette to a different ground (light↔dark), never just invert lightness on the existing hues — re-derive each saturated color against the new background until it clears 4.5:1 again. A color that read fine on near-black can fail badly on white at the same hue/saturation.

## Typography

**UI Font:** system sans stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`)
**Data Font:** system monospace stack (`ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace`)

**Character:** One workhorse sans carries every heading, label, button, and body of prose — this is a task tool, not a brand surface, and a second display face would just be noise. Monospace is a functional register switch, not a typeface choice: it marks "this is data, measure it accordingly," reserved for numeric/date columns and the `tracker_` wordmark.

### Hierarchy
- **Page title** (semibold, 1.125rem `text-xl`): one per view, e.g. "Jobs feed".
- **Body / labels** (regular, 0.875rem `text-base`): default UI text, table cell content.
- **Small / secondary** (regular, 0.8125rem `text-sm`): supporting copy under a page title.
- **Micro / header labels** (medium, 0.75rem `text-xs`, uppercase, tracked): table column headers only.
- **Data (mono)** (regular, 0.875rem, same size as body): dates, currency, percentages, counts — right-aligned where the column is a magnitude (match score).

### Named Rules
**The Data-Only Mono Rule.** Monospace never appears in a heading, a button label, or a paragraph of prose. If it isn't a number, a date, or the wordmark, it's set in the sans.

## Layout

Single-column page body, `max-w-6xl` centered container, `px-4`/`sm:px-6` horizontal padding. A sticky top bar (`h-12`) holds the wordmark and tab navigation — no sidebar, because three destinations don't earn persistent side chrome. Content views stack a page-title block (`mb-4`) above their primary table or empty state.

Tables are the dominant content pattern: header row in Panel background with micro-label columns, body rows at `px-3 py-2.5` cell padding, hairline `border-b` between rows (no border on the last row), full-row hover highlight to Panel. Status controls pair a 6px tone dot with a native `<select>` at `gap-1.5`. On narrow viewports the table scrolls horizontally rather than reflowing columns — the product is desktop-primary by confirmed brief, so horizontal scroll is the honest fallback, not a compromise to fix later.

## Elevation & Depth

Flat by construction. No `box-shadow` is used anywhere in the shipped system — depth and separation come entirely from the Panel/Paper-White two-layer neutral system and 1px hairline borders. The only "lifted" affordance is the 2px teal focus ring (`outline`), which signals interaction state, not elevation.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. If two regions need visual separation, reach for a border or a background-layer step before reaching for a shadow — shadows are not part of this system's vocabulary at all right now.

## Shapes

Small, consistent radii throughout: `0.1875rem` (3px) on controls (selects, badges, dots' container), `0.25rem` (4px) on inputs and buttons, `0.375rem` (6px) on containers (tables, empty-state boxes, the add-row form panel). Nothing rounds past 6px — this is precision-instrument geometry, not the soft bubble-rounded-2xl language of generic SaaS cards. The status dot is the one fully circular element in the system, by design: it's the one place roundness reads as "indicator," not "container."

## Components

Every component reads as an instrument, not a decoration — quiet by default, precise on interaction.

### Buttons
- **Shape:** `rounded-sm` (3px).
- **Primary** (Save actions): `bg-accent` / `text-surface`, hover `bg-accent-strong`, disabled at 50% opacity with `cursor-not-allowed`.
- **Ghost** (Log application / Add contact, Cancel): `bg-panel` with `border-border-strong`, text goes `text-accent` on hover along with the border.
- **Focus:** 2px teal outline, 1-2px offset depending on button type.

### Inputs / Fields
- **Style:** `bg-surface`, `border-border-strong`, `rounded-sm`, `px-2 py-1.5`, placeholder text in `text-faint`.
- **Focus:** 2px teal outline (no border-color change — the outline alone carries focus state).

### Status Select + Dot
The system's signature control. A 6px semantic-tone dot (`StatusDot`) sits to the left of a plain native `<select>` styled to match other inputs. The dot gives at-a-glance color scanning across a dense table; the select remains a fully native, keyboard-operable control rather than a custom dropdown — deliberately refusing to reinvent a standard affordance for flavor.

### Tables
- **Header:** `bg-panel`, `text-xs uppercase tracking-wide text-faint`, bottom border.
- **Rows:** `px-3 py-2.5`, hairline bottom border (omitted on the last row), full-row hover to `bg-panel`.
- **Numeric/date columns:** monospace, right-aligned when the value is a magnitude (match score), left-aligned when it's a date.
- **Container:** `rounded-md border border-border`, horizontal scroll on overflow.

### Empty States
Dashed `border-border-strong` box, centered content, a bold one-line title plus a description that explains what will eventually populate the view and why it's empty right now — never a bare "nothing here."

### Navigation
Top bar tabs, not a sidebar. Active tab: `text-text` plus a 2px teal underline (`absolute inset-x-0 bottom-0`). Inactive: `text-secondary`, hovers to `text-text`. No icons on tab labels — three short text labels don't need them.

## Do's and Don'ts

### Do:
- **Do** keep monospace scoped to data and the wordmark (`ui-monospace` stack) — never prose, headings, or button labels.
- **Do** pair every status-changing control with a semantic-tone dot so tables stay scannable without reading every cell.
- **Do** use the accent color only for the active tab, primary buttons, focus rings, and current-selection state — nothing else.
- **Do** keep tables flat with hairline borders; reach for a border before a shadow.
- **Do** write empty-state copy that explains what will populate the view, not just that it's empty.
- **Do** re-derive contrast whenever a token changes ground (light↔dark) — see the Retune, Not Relighten Rule.

### Don't:
- **Don't** introduce a second accent color or a display/brand typeface — this is an Operate surface, not a marketing one.
- **Don't** add drop shadows, glassmorphism, or gradient fills anywhere in this system; it has committed to flat.
- **Don't** round any element past 6px (`rounded-lg`) — the sharp-cornered, precision-instrument language is load-bearing for the "ops console" identity.
- **Don't** replace the native `<select>` status controls with a custom dropdown component; the plain-native-control choice is deliberate (see craft-floor's standard-affordance rule).
- **Don't** seed fake/demo data into a real table to make a view look populated — every empty state ships true-empty by design until the corresponding data source (Apify scraping, hiring-manager search) actually exists.
