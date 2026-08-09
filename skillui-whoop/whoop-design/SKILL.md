---
name: whoop-design
description: Design system skill for whoop. Activate when building UI components, pages, or any visual elements. Provides exact color tokens, typography scale, spacing grid, component patterns, and craft rules. Read references/DESIGN.md before writing any CSS or JSX.
---

# whoop Design System

You are building UI for **whoop**. Light-themed, cool palette, monospace typography (ProximaNova-Regular), compact density on a 4px grid, expressive motion.

## Visual Reference

**IMPORTANT**: Study ALL screenshots below before writing any UI. Match colors, typography, spacing, layout, and motion exactly as shown.

### Homepage

![whoop Homepage](screenshots/homepage.png)

> Read `references/DESIGN.md` for full token details.

## Design Philosophy

- **Layered depth** — use shadow tokens to create a sense of physical layering. Each elevation level has a specific shadow.
- **Gradient accents** — gradients are used thoughtfully for emphasis, not decoration.
- **Single typeface** — ProximaNova-Regular carries all text. Hierarchy comes from size, weight, and color — never font mixing.
- **compact density** — 4px base grid. Every dimension is a multiple of 4.
- **cool palette** — the color temperature runs cool, matching the monospace typography.
- **Restrained accent** — `#00f19f` is the only pop of color. Used exclusively for CTAs, links, focus rings, and active states.
- **Expressive motion** — animations are an integral part of the experience. Use spring physics and layout animations.

## Color System

### Core Palette

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Background | `--background` | `#ffffff` | Page/app background |
| Text Primary | `--text-primary` | `#000000` | Headings, body text |
| Text Muted | `--text-muted` | `#999999` | Captions, placeholders |
| Accent | `--accent` | `#00f19f` | CTAs, links, focus rings |
| Border | `--border` | `#4c4c4c` | Dividers, card borders |

### Status Colors

| Status | Hex | Use |
|--------|-----|-----|
| Success | `#41ff31` | Confirmations, positive trends |
| Danger | `#ff0026` | Errors, destructive actions |

### Extended Palette

- **module-background:** `#eeeeee` — Light surface or highlight color
- `#dddddd`
- `#666666`
- `#333333`
- `#cccccc`
- **image-portrait-background:** `#191919` — Deep background layer or shadow color
- `#aaaaaa`
- `#bf773c`

### CSS Variable Tokens

```css
--color-accent: 74 83 255;
--color-accent-foreground: 255 255 255;
--module-background: #fff;
--module-background: #f3f5f9;
--module-background: #000;
--hero-slide-border-radius: 30px;
--image-portrait-background: #f3f5f9;
--image-portrait-background: #191919;
--color-accent: 74 83 255;
--color-accent-foreground: 255 255 255;
--module-background: #fff;
--module-background: #f3f5f9;
--module-background: #000;
--hero-slide-border-radius: 30px;
--image-portrait-background: #f3f5f9;
--image-portrait-background: #191919;
--color-accent: 74 83 255;
--color-accent-foreground: 255 255 255;
--module-background: #fff;
--module-background: #f3f5f9;
```

## Typography

### Font Stack

- **ProximaNova-Regular** — Heading 1, Heading 2, Heading 3
- **SFMono-Regular** — Body, Caption, Code

### Font Sources

```css
@font-face {
  font-family: "proxima-nova";
  src: url("fonts/proxima-nova-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova";
  src: url("fonts/proxima-nova-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-condensed";
  src: url("fonts/proxima-nova-condensed-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-condensed";
  src: url("fonts/proxima-nova-condensed-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-extra-condensed";
  src: url("fonts/proxima-nova-extra-condensed-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-extra-condensed";
  src: url("fonts/proxima-nova-extra-condensed-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-wide";
  src: url("fonts/proxima-nova-wide-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-wide";
  src: url("fonts/proxima-nova-wide-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-extra-wide";
  src: url("fonts/proxima-nova-extra-wide-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-extra-wide";
  src: url("fonts/proxima-nova-extra-wide-Regular.ttf") format("woff2");
  font-weight: 400;
}
```

### Type Scale

| Role | Family | Size | Weight |
|------|--------|------|--------|
| Heading 1 | ProximaNova-Regular | 7.5rem | 700 |
| Heading 2 | ProximaNova-Regular | 100px | 700 |
| Heading 3 | ProximaNova-Regular | 6rem | 700 |
| Body | SFMono-Regular | 1rem | 400 |
| Caption | SFMono-Regular | .875rem | 400 |
| Code | SFMono-Regular | 14px | 400 |

### Typography Rules

- All text uses **ProximaNova-Regular** — never add another font family
- Max 3-4 font sizes per screen
- Headings: weight 600-700, body: weight 400
- Use color and opacity for text hierarchy, not additional font sizes
- Line height: 1.5 for body, 1.2 for headings

## Spacing & Layout

### Base Grid: 4px

Every dimension (margin, padding, gap, width, height) must be a multiple of **4px**.

### Spacing Scale

`2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24` px

### Spacing as Meaning

| Spacing | Use |
|---------|-----|
| 4-8px | Tight: related items (icon + label, avatar + name) |
| 12-16px | Medium: between groups within a section |
| 24-32px | Wide: between distinct sections |
| 48px+ | Vast: major page section breaks |

### Border Radius

Scale: `.125rem, .25rem, .3125rem, .375rem, .5rem, .625rem, .75rem, .875rem, .9375rem, 1rem, 1.25rem, 1.5rem, 1.875rem, 2rem, 2px, 2.2rem, 3.75rem, 6px, 8px, 9.35px, 16px, 17px, 18.75rem, 24px, 30px, 50px, 100px, inherit, 10px`
Default: `2px`

### Container

Max-width: `80rem`, centered with auto margins.

### Breakpoints

| Name | Value |
|------|-------|
| md | 40.0625rem |
| md | 40.1255rem |
| lg | 63rem |
| xl | 80rem |
| 2xl | 85.375rem |
| 2xl | 90rem |
| 2xl | 120rem |

Mobile-first: design for small screens, layer on responsive overrides.

## Component Patterns

### Card

```css
.card {
  background: #ffffff;
  border: 1px solid #4c4c4c;
  border-radius: 2px;
  padding: 16px;
  box-shadow: 0 .25rem 1.25rem 0 rgba(0,0,0,.2);
}
```

```html
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>
```

### Button

```css
/* Primary */
.btn-primary {
  background: #00f19f;
  color: #000000;
  border-radius: 2px;
  padding: 8px 16px;
  font-weight: 500;
  transition: opacity 150ms ease;
}
.btn-primary:hover { opacity: 0.9; }

/* Ghost */
.btn-ghost {
  background: transparent;
  border: 1px solid #4c4c4c;
  color: #000000;
  border-radius: 2px;
  padding: 8px 16px;
}
```

```html
<button class="btn-primary">Get Started</button>
<button class="btn-ghost">Learn More</button>
```

### Input

```css
.input {
  background: #ffffff;
  border: 1px solid #4c4c4c;
  border-radius: 2px;
  padding: 8px 12px;
  color: #000000;
  font-size: 14px;
}
.input:focus { border-color: #00f19f; outline: none; }
```

```html
<input class="input" type="text" placeholder="Search..." />
```

### Badge / Chip

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #ffffff;
  color: #999999;
}
```

```html
<span class="badge">New</span>
<span class="badge">Beta</span>
```

### Modal / Dialog

```css
.modal-backdrop { background: rgba(0, 0, 0, 0.6); }
.modal {
  background: #ffffff;
  border: 1px solid #4c4c4c;
  border-radius: 10px;
  padding: 24px;
  max-width: 480px;
  width: 90vw;
  box-shadow: 0 4px 20px 0 hsla(0,0%,87%,.2);
}
```

```html
<div class="modal-backdrop">
  <div class="modal">
    <h2>Dialog Title</h2>
    <p>Dialog content.</p>
    <button class="btn-primary">Confirm</button>
    <button class="btn-ghost">Cancel</button>
  </div>
</div>
```

### Table

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 500;
  font-size: 12px;
  color: #999999;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #4c4c4c;
}
.table td {
  padding: 12px;
  border-bottom: 1px solid #4c4c4c;
}
```

```html
<table class="table">
  <thead><tr><th>Name</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>
    <tr><td>Item One</td><td>Active</td><td>Jan 1</td></tr>
    <tr><td>Item Two</td><td>Pending</td><td>Jan 2</td></tr>
  </tbody>
</table>
```

### Navigation

```css
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #4c4c4c;
}
.nav-link {
  color: #999999;
  padding: 8px 12px;
  border-radius: 2px;
  transition: color 150ms;
}
.nav-link:hover { color: #000000; }
.nav-link.active { color: #00f19f; }
```

```html
<nav class="nav">
  <a href="/" class="nav-link active">Home</a>
  <a href="/about" class="nav-link">About</a>
  <a href="/pricing" class="nav-link">Pricing</a>
  <button class="btn-primary" style="margin-left: auto">Get Started</button>
</nav>
```

### Extracted Components

These components were found in the codebase:

**Button** (`html`)

**Card** (`html`)
- Variants: `features___S1OU`, `features__image`, `item__contents`, `component__z3CD1`, `logo__NR9kI`

**Navigation** (`html`)

**Badge** (`html`)

## Page Structure

The following page sections were detected:

- **Navigation** — Top navigation bar (22 items)
- **Hero** — Hero/banner section with headline and CTAs
- **Features** — Feature/benefit cards grid (92 items)
- **Faq** — FAQ/accordion section
- **Footer** — Page footer with links and info (35 items)
- **Cta** — Call-to-action section

When building pages, follow this section order and structure.

## Animation & Motion

This project uses **expressive motion**. Animations are part of the design language.

### CSS Animations

- `pulse`
- `slide-down-fade-out`
- `slide-up-fade-in`
- `enter`
- `exit`

### Motion Tokens

- **Duration scale:** `0ms`, `.15s`, `.2s`, `.25s`, `.3s`, `.5s`, `.6s`, `.7s`, `1s`, `50ms`, `150ms`, `200ms`, `250ms`, `300ms`, `400ms`, `500ms`, `600ms`, `800ms`
- **Easing functions:** `cubic-bezier(.4,0,.2,1)`, `linear`, `cubic-bezier(0,0,.2,1)`, `ease`, `cubic-bezier(.16,1,.3,1)`, `ease-in-out`, `cubic-bezier(.5,0,0,1)`, `ease-in`
- **Animated properties:** `top`

### Motion Guidelines

- **Duration:** Use values from the duration scale above. Short (0ms) for micro-interactions, long (800ms) for page transitions
- **Easing:** Use `cubic-bezier(.4,0,.2,1)` as the default easing curve
- **Direction:** Elements enter from bottom/right, exit to top/left
- **Reduced motion:** Always respect `prefers-reduced-motion` — disable animations when set

## Depth & Elevation

### Shadow Tokens

- Raised (cards, buttons): `0 .25rem 1.25rem 0 rgba(0,0,0,.2)`
- Floating (dropdowns, popovers): `0 4px 20px 0 hsla(0,0%,87%,.2)`
- Floating (dropdowns, popovers): `0 0 20px 0 hsla(0,0%,78%,.25)`
- Overlay (modals, dialogs): `0 4.75px 23.75px 0 hsla(0,0%,85%,.1)`

### Z-Index Scale

`0, 1, 2, 3, 5, 10, 20, 50, 100, 101, 200, 300, 700, 800, 1000, 9999, 2147483010`

Use these exact values — never invent z-index values.

## Anti-Patterns (Never Do)

- **No blur effects** — no backdrop-blur, no filter: blur()
- **No zebra striping** — tables and lists use borders for separation
- **No invented colors** — every hex value must come from the palette above
- **No arbitrary spacing** — every dimension is a multiple of 4px
- **No extra fonts** — only ProximaNova-Regular and SFMono-Regular are allowed
- **No arbitrary border-radius** — use the scale: .125rem, .25rem, .3125rem, .375rem, .5rem, .625rem, .75rem, .875rem, .9375rem, 1rem
- **No opacity for disabled states** — use muted colors instead

## Workflow

1. **Read** `references/DESIGN.md` before writing any UI code
2. **Pick colors** from the Color System section — never invent new ones
3. **Set typography** — ProximaNova-Regular, SFMono-Regular only, using the type scale
4. **Build layout** on the 4px grid — check every margin, padding, gap
5. **Match components** to patterns above before creating new ones
6. **Apply elevation** — use shadow tokens
7. **Validate** — every value traces back to a design token. No magic numbers.

## Brand Spec

- **Favicon:** `/favicon.ico`
- **Site URL:** `https://www.whoop.com`
- **Brand color:** `#00f19f`
- **Brand typeface:** ProximaNova-Regular

## Quick Reference

```
Background:     #ffffff
Surface:        (not extracted)
Text:           #000000 / #999999
Accent:         #00f19f
Border:         #4c4c4c
Font:           ProximaNova-Regular
Spacing:        4px grid
Radius:         2px
Components:     10 detected
```

## When to Trigger

Activate this skill when:
- Creating new components, pages, or visual elements for whoop
- Writing CSS, Tailwind classes, styled-components, or inline styles
- Building page layouts, templates, or responsive designs
- Reviewing UI code for design consistency
- The user mentions "whoop" design, style, UI, or theme
- Generating mockups, wireframes, or visual prototypes

---

# Full Reference Files

> Every output file is embedded below. Claude has full design system context from /skills alone.

## Design System Tokens (DESIGN.md)

# whoop DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 2 · Components: 10
> Icon library: not detected · State: not detected
> Primary theme: light · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![whoop Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **light-themed** interface with a cool, approachable feel. The light background emphasizes content clarity. Typography uses **ProximaNova-Regular** throughout — a technical, developer-focused choice that maintains consistency. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 14, 16px. The accent color **#00f19f** anchors interactive elements (buttons, links, focus rings). Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| tw-ring-offset-color | `#ffffff` | background | Page background, darkest surface |
| tw-ring-color | `#000000` | text-primary | Headings and body text |
| text-muted | `#999999` | text-muted | Captions, placeholders, secondary info |
| border | `#4c4c4c` | border | Dividers, card borders, outlines |
| accent | `#00f19f` | accent | CTAs, links, focus rings, active states |
| danger | `#ff0026` | danger | Error states, destructive actions |
| success | `#41ff31` | success | Success states, positive indicators |
| tw-ring-color | `#3b82f6` | info | Informational highlights |
| module-background | `#eeeeee` | unknown | Palette color |
| unknown | `#dddddd` | unknown | Palette color |
| unknown | `#666666` | unknown | Palette color |
| unknown | `#333333` | unknown | Palette color |
| unknown | `#cccccc` | unknown | Palette color |
| image-portrait-background | `#191919` | unknown | Palette color |
| unknown | `#aaaaaa` | unknown | Palette color |
| unknown | `#bf773c` | unknown | Palette color |
| unknown | `#9ca3af` | unknown | Palette color |
| unknown | `#a8652a` | unknown | Palette color |
| unknown | `#adc2cd` | unknown | Palette color |
| unknown | `#bbbbbb` | unknown | Palette color |

### CSS Variable Tokens

```css
--tw-border-spacing-x: 0;
--tw-border-spacing-y: 0;
--tw-border-spacing-x: 0;
--tw-border-spacing-y: 0;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 0.1;
--color-accent: 74 83 255;
--color-accent-foreground: 255 255 255;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
```


---

## 3. Typography Rules

**Font Stack:**
- **ProximaNova-Regular** — Heading 1, Heading 2, Heading 3
- **SFMono-Regular** — Body, Caption, Code

**Font Sources:**

```css
@font-face {
  font-family: "proxima-nova";
  src: url("fonts/proxima-nova-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova";
  src: url("fonts/proxima-nova-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-condensed";
  src: url("fonts/proxima-nova-condensed-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-condensed";
  src: url("fonts/proxima-nova-condensed-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-extra-condensed";
  src: url("fonts/proxima-nova-extra-condensed-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-extra-condensed";
  src: url("fonts/proxima-nova-extra-condensed-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-wide";
  src: url("fonts/proxima-nova-wide-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-wide";
  src: url("fonts/proxima-nova-wide-Regular.ttf") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-extra-wide";
  src: url("fonts/proxima-nova-extra-wide-700.ttf") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-extra-wide";
  src: url("fonts/proxima-nova-extra-wide-Regular.ttf") format("woff2");
  font-weight: 400;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | ProximaNova-Regular | 7.5rem | 700 |
| Heading 2 | ProximaNova-Regular | 100px | 700 |
| Heading 3 | ProximaNova-Regular | 6rem | 700 |
| Body | SFMono-Regular | 1rem | 400 |
| Caption | SFMono-Regular | .875rem | 400 |
| Code | SFMono-Regular | 14px | 400 |

**Typographic Rules:**
- Use **ProximaNova-Regular** for all text — do not mix font families
- Maintain consistent hierarchy: no more than 3-4 font sizes per screen
- Headings use bold (600-700), body uses regular (400)
- Line height: 1.5 for body text, 1.2 for headings
- Use color and opacity for secondary hierarchy, not additional font sizes


---

## 4. Component Stylings

### Layout (1)

**Footer** — `html`

### Navigation (1)

**Navigation** — `html`

### Data Display (3)

**Card** — `html`
- Variants: `features___S1OU`, `features__image`, `item__contents`, `component__z3CD1`, `logo__NR9kI`

**Badge** — `html`

**List** — `html`

### Data Input (2)

**Button** — `html`
- Animation: 

**Input** — `html`
- State: :focus, :placeholder

### Media (3)

**Image** — `html`

**Icon** — `html`

**Map/Canvas** — `html`



---

## 5. Layout Principles

- **Base spacing unit:** 4px
- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24
- **Border radius:** .125rem, .25rem, .3125rem, .375rem, .5rem, .625rem, .75rem, .875rem, .9375rem, 1rem, 1.25rem, 1.5rem, 1.875rem, 2rem, 2px, 2.2rem, 3.75rem, 6px, 8px, 9.35px, 16px, 17px, 18.75rem, 24px, 30px, 50px, 100px, inherit, 10px
- **Max content width:** 80rem

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 4-8px | Tight: related items within a group |
| 12-16px | Medium: between groups |
| 24-32px | Wide: between sections |
| 48px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Raised — cards, buttons, interactive elements

- `0 .25rem 1.25rem 0 rgba(0,0,0,.2)`

### Floating — dropdowns, popovers, modals

- `0 4px 20px 0 hsla(0,0%,87%,.2)`
- `0 0 20px 0 hsla(0,0%,78%,.25)`

### Overlay — full-screen overlays, top-level dialogs

- `0 4.75px 23.75px 0 hsla(0,0%,85%,.1)`

### Z-Index Scale

`0, 1, 2, 3, 5, 10, 20, 50, 100, 101, 200, 300, 700, 800, 1000, 9999, 2147483010`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes pulse`
- `@keyframes slide-down-fade-out`
- `@keyframes slide-up-fade-in`
- `@keyframes enter`
- `@keyframes exit`
- `@keyframes accordion-up`
- `@keyframes accordion-down`
- `@keyframes fade-in`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#00f19f` for interactive elements (buttons, links, focus rings)
- Use `#ffffff` as the primary page background
- Use **ProximaNova-Regular** for all UI text
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: .125rem, .25rem, .3125rem, .375rem, .5rem
- Reuse existing components from Section 4 before creating new ones

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't mix font families — use ProximaNova-Regular consistently
- Don't use arbitrary spacing values — stick to multiples of 4px
- Don't create custom box-shadow values outside the system tokens
- Don't use arbitrary border-radius values — pick from the defined scale
- Don't duplicate component patterns — check Section 4 first
- Don't use backdrop-blur or blur effects

### Anti-Patterns (detected from codebase)

- No blur or backdrop-blur effects
- No zebra striping on tables/lists


---

## 9. Responsive Behavior

| Name | Value | Source |
|---|---|---|
| md | 40.0625rem | css |
| md | 40.1255rem | css |
| lg | 63rem | css |
| xl | 80rem | css |
| 2xl | 85.375rem | css |
| 2xl | 90rem | css |
| 2xl | 120rem | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #ffffff
Border: 1px solid #4c4c4c
Radius: 2px
Padding: 16px
Font: ProximaNova-Regular
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #00f19f, text white
Ghost: bg transparent, border #4c4c4c
Padding: 8px 16px
Radius: 2px
Hover: opacity 0.9 or lighter shade
Focus: ring with #00f19f
```

### Build a Page Layout

```
Background: #ffffff
Max-width: 80rem, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #ffffff
Label: #999999 (muted, 12px, uppercase)
Value: #000000 (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #ffffff
Input border: 1px solid #4c4c4c
Focus: border-color #00f19f
Label: #999999 12px
Spacing: 16px between fields
Radius: 2px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: ProximaNova-Regular, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```

## Bundled Fonts (fonts/)

The following font files are bundled in the `fonts/` directory:

- `fonts/proxima-nova-500.ttf`
- `fonts/proxima-nova-600.ttf`
- `fonts/proxima-nova-700.ttf`
- `fonts/proxima-nova-Regular.ttf`
- `fonts/proxima-nova-condensed-500.ttf`
- `fonts/proxima-nova-condensed-600.ttf`
- `fonts/proxima-nova-condensed-700.ttf`
- `fonts/proxima-nova-condensed-Regular.ttf`
- `fonts/proxima-nova-extra-condensed-500.ttf`
- `fonts/proxima-nova-extra-condensed-600.ttf`
- `fonts/proxima-nova-extra-condensed-700.ttf`
- `fonts/proxima-nova-extra-condensed-Regular.ttf`
- `fonts/proxima-nova-extra-wide-500.ttf`
- `fonts/proxima-nova-extra-wide-600.ttf`
- `fonts/proxima-nova-extra-wide-700.ttf`
- `fonts/proxima-nova-extra-wide-Regular.ttf`
- `fonts/proxima-nova-wide-500.ttf`
- `fonts/proxima-nova-wide-600.ttf`
- `fonts/proxima-nova-wide-700.ttf`
- `fonts/proxima-nova-wide-Regular.ttf`

Use these local font files in `@font-face` declarations instead of fetching from Google Fonts.

## Homepage Screenshots (screenshots/)

![homepage.png](screenshots/homepage.png)

