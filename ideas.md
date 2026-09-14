# PhotoMedia ERP — Design Direction

## Three possible approaches

### 1. Editorial Atelier
**Very Brief Intro:** A calm, gallery-like command center inspired by premium photo books and production call sheets. It feels crafted, deliberate, and quietly expensive rather than like generic business software.

**Probability:** 0.07

### 2. Field Console
**Very Brief Intro:** A high-contrast operational cockpit modeled after live production equipment and broadcast control rooms. It is dense, urgent, and optimized for at-a-glance execution.

**Probability:** 0.03

### 3. Luminous Ledger
**Very Brief Intro:** A warm, tactile finance-forward workspace that mixes dark ink surfaces, parchment panels, and restrained metallic accents. It makes a broad ERP feel like an executive studio ledger.

**Probability:** 0.09

## Chosen approach: Editorial Atelier

### Design Movement

**Contemporary editorial design** translated into a productivity workspace. The experience takes cues from art-direction boards, premium print layouts, and the disciplined geometry of a professional studio contact sheet.

### Core Principles

1. **Operational clarity with editorial hierarchy.** Large, confident typography and disciplined small metadata make the most important decision visually unavoidable.
2. **Material contrast, not decorative excess.** Ink, ivory, archival green, and copper create depth through paper-like panels, fine rules, and quiet shadows instead of gradients or glow.
3. **Asymmetric rhythm.** The main workspace is a flexible canvas with a compact rail, a strong page header, and varied editorial panels rather than a flat grid of interchangeable cards.
4. **Action in context.** Each view shows the primary work, its next decision, and its related records together so clicks have a visible purpose.

### Color Philosophy

The signature **Archive Green** (#0B4D3E) conveys confidence, discretion, and the tradition of studio archives. Warm **Paper** (#F5F0E7) keeps dense work human and reduces visual fatigue. **Ink** (#17211F) holds key typography, while **Copper** (#B36A36) marks exceptions, deadlines, and financial action without pretending everything is urgent.

### Layout Paradigm

The application behaves like a **production desk**: a thin vertical tool rail establishes orientation, an editorial masthead gives the page a visible point of view, and the body is built from unequal “sheets” that merge reporting, task context, and action. Screens should breathe on large displays but collapse into a compact drawer-and-stack experience on small screens.

### Signature Elements

1. A small **contact-sheet motif**: paired squares, crop marks, and index numbers used in avatars, section labels, and media states.
2. **Archive rules**: hairline dividers and small uppercase-style labels to create the feeling of a considered production dossier.
3. **Copper edge states**: focused, overdue, or financially significant states gain a thin copper edge or dot, not a loud warning block.

### Interaction Philosophy

Navigation must always change the actual workspace, never merely recolor a selected item. Buttons open usable drawers, modals, or filtered views; quick-add interactions create visible records; boards and trackers allow state changes. Every interaction receives an immediate local confirmation and supports keyboard focus.

### Animation

Use restrained 140–240ms transitions with a crisp ease-out. Sheets enter with 6–10px vertical movement and opacity, lists stagger by 40ms, and drawers slide from their contextual edge. Hover states slightly lift paper panels, while active controls scale to 0.98. Respect reduced-motion settings.

### Typography System

Use **IBM Plex Sans Arabic** for all Arabic interface text because of its clarity at both display and metadata sizes, paired with **DM Mono** for dates, file dimensions, financial figures, and system labels. Page titles use 700 weight with tight tracking; body copy stays at 400–500; labels use mono at 10–11px with letter spacing.

### Brand Essence

**PhotoMedia ERP is the production command desk for studios that need their craft, logistics, and client delivery to move as one.**

Personality: **considered, capable, composed**.

### Brand Voice

Headlines are direct and calm, CTAs identify their resulting action, and microcopy explains operational context without filler.

Example lines: “The day’s production, in one clear frame.” and “Create a secure client upload room.”

### Wordmark & Logo

The mark is an abstract **aperture-and-ledger glyph**: four offset archival-green frames around a small copper registration point. It has no text inside the mark, remains legible at favicon scale, and suggests both lens framing and production order.

### Signature Brand Color

**Archive Green — #0B4D3E**.

## Style Decisions

- Every workspace route now uses one dominant editorial sheet for the key decision, supported by ledger and contextual sheets rather than a generic centered search-and-table composition.
- The aperture-and-ledger mark is treated as the primary brand anchor; the contact-sheet motif is repeated in labels, record indices, file states, and page markers.
- Primary surfaces use archival-sheet detailing, fine rules, mono metadata, crop marks, and restrained copper edges. Generic rounded-card treatment remains secondary.
