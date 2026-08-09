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
  src: url("https://use.typekit.net/af/2555e1/00000000000000007735e603/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n7&v=3") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova";
  src: url("https://use.typekit.net/af/efe4a5/00000000000000007735e609/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-condensed";
  src: url("https://use.typekit.net/af/15606c/00000000000000007735e60c/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n7&v=3") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-condensed";
  src: url("https://use.typekit.net/af/669f97/00000000000000007735e623/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-extra-condensed";
  src: url("https://use.typekit.net/af/de3701/00000000000000007735e618/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=i7&v=3") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-extra-condensed";
  src: url("https://use.typekit.net/af/6a4fa5/00000000000000007735e629/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=i4&v=3") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-wide";
  src: url("https://use.typekit.net/af/bfcb85/0000000000000000774e0796/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n7&v=3") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-wide";
  src: url("https://use.typekit.net/af/568007/0000000000000000774e079f/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "proxima-nova-extra-wide";
  src: url("https://use.typekit.net/af/d43f52/0000000000000000774e0792/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n7&v=3") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "proxima-nova-extra-wide";
  src: url("https://use.typekit.net/af/75e33b/0000000000000000774e07ad/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3") format("woff2");
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
