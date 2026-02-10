# Axiometry Branding Guide

## 1. Brand Identity
- Brand name: **Axiometry**
- Tagline option: **Measure what matters in learning.**
- Positioning: AI-assisted education platform focused on measurable, trustworthy progress.

## 2. Name Meaning and Messaging
Use these approved framing options depending on audience.

### 2.1 Etymological Meaning
- **Axiom**: fundamental truth.
- **-metry**: measurement.
- Core message: "Axiometry is the science of measuring fundamental knowledge."

### 2.2 A-to-Z Workflow Meaning
- Message: the platform covers the full cycle from lessons and curriculum to student tries/attempts and grading.

### 2.3 AI + Precision Meaning
- Message: grading and learning analytics should be precise, data-driven, and transparent.

### 2.4 Institutional Meaning
- Message: one standard system where curriculum and analytics meet in a single operational dashboard.

## 3. Official Color Palette (Deep Data Scheme)
These are the canonical brand colors.

- **Oxford Blue (Primary):** `#003366`
  - Use for primary identity surfaces (top nav, major headers, high-authority elements).
- **Cyan/Bright Blue (Accent):** `#00A8E8`
  - Use for CTAs, selected states, active highlights.
- **Off-White / Light Gray (Background):** `#F4F7F9`
  - Use for page background and soft neutral sections.
- **Slate Gray (Secondary Text):** `#7F8C8D`
  - Use for muted text, helper copy, and low-emphasis labels.

## 4. Product Token Mapping
Current implementation maps brand colors as CSS tokens in `/Users/george/Documents/Projects/educ/apps/web/src/styles.css`.

```css
--ax-primary: #003366;
--ax-accent: #00A8E8;
--ax-bg: #F4F7F9;
--ax-slate: #7F8C8D;
```

Secondary internal tokens may be derived from these (hover, borders, contrast states).

## 5. Logo Assets
- Primary logo file: `/Users/george/Documents/Projects/educ/branding/Axiometry_logo.png`
- Web app bundled logo: `/Users/george/Documents/Projects/educ/apps/web/src/assets/axiometry-logo.png`

### 5.1 Logo Usage Rules
- Keep logo aspect ratio unchanged.
- Do not stretch, skew, recolor, or apply heavy effects.
- Maintain clear space around logo equal to at least half the logo height.
- Prefer placing logo on clean backgrounds with sufficient contrast.

## 6. UI Application Rules
- Keep top-level branded navigation dark using primary blue.
- Use accent blue only for actions and active states.
- Avoid introducing unrelated dominant colors for primary UI actions.
- Keep muted instructional and metadata text in slate gray.
- Preserve visual hierarchy: brand/nav -> content controls -> data cards/tables.

## 7. Voice and Copy Guidelines
Tone:
- Precise
- Calm
- Professional
- Data-informed

Writing rules:
- Prefer clear instructional copy over marketing-heavy language in workflows.
- Use "Axiometry" in first mention on each key page.
- Keep action labels direct: "Create User", "Refresh Audit", "Start Attempt".

## 8. Accessibility Baseline
- Maintain strong contrast for text on primary backgrounds.
- Ensure selected/active states are both color and state-text indicated.
- Keep controls keyboard reachable and focus-visible.

## 9. AI Agent Implementation Checklist
When adding new features, agents should:
1. Reuse color tokens from `/Users/george/Documents/Projects/educ/apps/web/src/styles.css`.
2. Use the logo from `/Users/george/Documents/Projects/educ/apps/web/src/assets/axiometry-logo.png`.
3. Keep naming and page headings aligned with "Axiometry".
4. Avoid adding new hardcoded brand colors unless approved and documented here.
5. Update this file when branding rules change.

## 10. Change Log
- 2026-02-10: Initial Markdown branding spec created from `Branding_Guide.rtf` and applied to web UI.
