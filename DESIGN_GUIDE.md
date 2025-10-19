# 2009 Design Guide

This document defines the visual language and design system for the 2009 create-your-own-adventure game.

**Last Updated:** 2025-10-19

---

## Color System

### Primary Colors

| Color | Value | Usage |
|-------|-------|-------|
| **Gold** | `#FFD700` | Accent color, highlights, important text |
| **Orange** | `#FFA500` | Gradient stops, warm accents |
| **Light Gold** | `#FFE44D` | Hover states, lighter gradients |
| **Light Orange** | `#FFB84D` | Hover states, lighter gradients |
| **Pure White** | `#FFFFFF` | Primary text, headings |
| **Pure Black** | `#000000` | CTA button text, high contrast |

### Opacity-Based Colors

#### Whites (for text and UI on dark backgrounds)
- `rgba(255, 255, 255, 1.0)` - Strong emphasis text
- `rgba(255, 255, 255, 0.9)` - Primary body text
- `rgba(255, 255, 255, 0.85)` - Secondary text, list items
- `rgba(255, 255, 255, 0.6)` - Muted text, links
- `rgba(255, 255, 255, 0.4)` - Borders (hover)
- `rgba(255, 255, 255, 0.3)` - Borders (default)
- `rgba(255, 255, 255, 0.2)` - Secondary borders
- `rgba(255, 255, 255, 0.1)` - Backgrounds (hover), glows
- `rgba(255, 255, 255, 0.05)` - Backgrounds (default), inset glows

#### Blacks (for backgrounds and overlays)
- `rgba(0, 0, 0, 0.85)` - Modal backgrounds
- `rgba(0, 0, 0, 0.8)` - Dark overlay (About modal)
- `rgba(0, 0, 0, 0.7)` - Standard overlay

#### Gold (for accents and glows)
- `rgba(255, 215, 0, 0.6)` - Strong glow (hover)
- `rgba(255, 215, 0, 0.4)` - Standard glow
- `rgba(255, 215, 0, 0.3)` - Subtle accents
- `rgba(255, 215, 0, 0.2)` - Very subtle accents

---

## Typography

### Font Family

**Primary:** Roboto Mono (monospace)
```css
font-family: var(--font-roboto-mono);
```

### Type Scale

| Element | Desktop Size | Tablet (≤768px) | Mobile (≤480px) |
|---------|--------------|-----------------|-----------------|
| **Modal Titles** | 2rem (32px) | 1.5rem (24px) | 1.25rem (20px) |
| **Section Titles** | 1.1rem (17.6px) | 1rem (16px) | 0.95rem (15.2px) |
| **CTA Buttons** | 1.1rem (17.6px) | 1rem (16px) | 0.95rem (15.2px) |
| **Body Text** | 1rem (16px) | 0.9rem (14.4px) | 0.85rem (13.6px) |
| **Secondary Text** | 0.9rem (14.4px) | 0.85rem (13.6px) | 0.8rem (12.8px) |
| **Cancel Buttons** | 0.9rem (14.4px) | 0.9rem (14.4px) | 0.85rem (13.6px) |
| **Small Text** | 0.85rem (13.6px) | 0.85rem (13.6px) | 0.8rem (12.8px) |

### Font Weights

- **Bold (700)**: Titles, headings, CTA buttons, emphasized text
- **Regular (400)**: Body text, descriptions

### Typography Styles

#### Titles
```css
font-family: var(--font-roboto-mono);
font-size: 2rem;
font-weight: 700;
color: #ffffff;
text-transform: uppercase;
letter-spacing: 0.1em;
text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
line-height: 1.2;
```

#### Section Headers
```css
font-family: var(--font-roboto-mono);
font-size: 1.1rem;
font-weight: 700;
color: #FFD700;
text-transform: uppercase;
letter-spacing: 0.05em;
```

#### Body Text
```css
font-family: var(--font-roboto-mono);
font-size: 1rem;
color: rgba(255, 255, 255, 0.9);
line-height: 1.5;
```

#### Emphasized Text (within body)
```css
color: #ffffff; /* or #FFD700 for high emphasis */
font-weight: 700;
```

---

## Spacing System

### Base Unit: `1rem` (16px)

| Token | Value | Usage |
|-------|-------|-------|
| `xxxs` | 0.25rem (4px) | Micro spacing |
| `xxs` | 0.5rem (8px) | Tight spacing |
| `xs` | 0.65rem (10.4px) | Small gaps |
| `sm` | 0.75rem (12px) | Compact spacing |
| `md` | 1rem (16px) | Standard spacing |
| `lg` | 1.25rem (20px) | Comfortable spacing |
| `xl` | 1.5rem (24px) | Section gaps |
| `2xl` | 2rem (32px) | Modal padding |

### Common Patterns

**Modal Padding:**
- Desktop: `2rem`
- Mobile: `1.5rem`

**Content Gaps:**
- Between sections: `1.5rem`
- Between list items: `1rem` (desktop), `0.75rem` (mobile)

**Button Padding:**
- CTA: `1.25rem 2rem` (desktop), `1rem` (mobile)
- Cancel: `0.75rem 1.5rem` (desktop), `0.65rem 1rem` (mobile)

---

## Components

### Buttons

#### Primary CTA Button
```css
font-family: var(--font-roboto-mono);
font-size: 1.1rem;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.05em;
color: #000000;
background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
border: none;
border-radius: 8px;
padding: 1.25rem 2rem;
box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
transition: all 0.2s ease;
```

**Hover:**
```css
transform: translateY(-2px);
box-shadow: 0 0 30px rgba(255, 215, 0, 0.6);
background: linear-gradient(135deg, #FFE44D 0%, #FFB84D 100%);
```

**Active:**
```css
transform: translateY(0);
```

#### Secondary/Cancel Button
```css
font-family: var(--font-roboto-mono);
font-size: 0.9rem;
color: rgba(255, 255, 255, 0.6);
background: transparent;
border: 2px solid rgba(255, 255, 255, 0.2);
border-radius: 8px;
padding: 0.75rem 1.5rem;
transition: all 0.2s ease;
```

**Hover:**
```css
color: rgba(255, 255, 255, 0.9);
border-color: rgba(255, 255, 255, 0.4);
background: rgba(255, 255, 255, 0.05);
```

---

### Modals

#### Overlay
```css
position: fixed;
top: 0;
left: 0;
width: 100vw;
height: 100vh;
background: rgba(0, 0, 0, 0.7);
backdrop-filter: blur(5px);
z-index: 100; /* 200 for stacked modals */
animation: fadeIn 0.3s ease-out;
```

#### Modal Container
```css
width: 90%;
max-width: 500px;
background: rgba(0, 0, 0, 0.85);
border: 3px solid rgba(255, 255, 255, 0.3);
border-radius: 12px;
padding: 2rem;
backdrop-filter: blur(10px);
box-shadow:
  0 0 40px rgba(255, 255, 255, 0.1),
  inset 0 0 40px rgba(255, 255, 255, 0.05);
animation: flyIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

### Glassmorphism Effect

The signature visual style of the game.

```css
background: rgba(0, 0, 0, 0.85);
backdrop-filter: blur(10px);
border: 3px solid rgba(255, 255, 255, 0.3);
box-shadow:
  0 0 40px rgba(255, 255, 255, 0.1),
  inset 0 0 40px rgba(255, 255, 255, 0.05);
```

**Key Properties:**
- Semi-transparent dark background (85% black)
- 10px backdrop blur
- White border with 30% opacity
- Dual shadows: outer glow + inner highlight

---

## Animations

### Standard Animations

#### Fade In (Overlays)
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
animation: fadeIn 0.3s ease-out;
```

#### Fly In (Modals)
```css
@keyframes flyIn {
  from {
    transform: translateY(100px) scale(0.8);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
animation: flyIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
```

#### Slide Up (Bottom Sheets)
```css
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
```

### Timing Functions

| Name | Value | Usage |
|------|-------|-------|
| **Bounce** | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Modal entrance |
| **Smooth** | `cubic-bezier(0.16, 1, 0.3, 1)` | Slide animations |
| **Ease Out** | `ease-out` | Simple fades |
| **Standard** | `ease` | Micro-interactions |

### Transition Durations

- **Instant**: `0.1s` - Micro-feedback
- **Quick**: `0.2s` - Button hovers, color changes
- **Standard**: `0.3s` - Fade ins, overlays
- **Moderate**: `0.4s` - Slide animations
- **Slow**: `0.5s` - Modal entrances

---

## Borders & Radii

### Border Widths
- **Modal borders**: `3px`
- **Button borders**: `2px`
- **Dividers**: `1px`

### Border Radius
| Element | Radius |
|---------|--------|
| **Modals** | `12px` |
| **Bottom Sheets (top only)** | `20px 20px 0 0` |
| **Buttons** | `8px` |
| **Slots/Cards** | `8px` |
| **Small elements** | `6px` |

---

## Shadows & Glows

### Text Shadows
```css
/* Titles */
text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
```

### Box Shadows

#### Modal Default
```css
box-shadow:
  0 0 40px rgba(255, 255, 255, 0.1),
  inset 0 0 40px rgba(255, 255, 255, 0.05);
```

#### CTA Button
```css
/* Default */
box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);

/* Hover */
box-shadow: 0 0 30px rgba(255, 215, 0, 0.6);
```

#### Slot/Card Hover
```css
box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
```

---

## Icons & Emojis

### Icon Sizing
```css
.icon {
  font-size: 1.25rem; /* Desktop */
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Mobile */
@media (max-width: 480px) {
  .icon {
    font-size: 1rem;
    width: 24px;
    height: 24px;
  }
}
```

### Common Icons
- 🎬 - Video/scenes
- 🔀 - Branching/choices
- 💎 - Purchase/premium
- 🤖 - AI generation
- 🌳 - Story tree
- ♾️ - Infinite/permanent
- 🌍 - Global/discovery
- ⏱️ - Time/duration
- 💰 - Money/refunds
- 🔒 - Locked/restricted

---

## Z-Index Scale

| Layer | Value | Usage |
|-------|-------|-------|
| **Base** | `0` | Main game container |
| **SlotChoiceModal** | `10` | Bottom sheet slot selection |
| **ExtendStoryModal** | `100` | Payment confirmation overlay |
| **AboutModal** | `200` | Information overlay (topmost) |

**Rule:** Increment by 10 for standard layers, 100 for major modals.

---

## Responsive Breakpoints

```css
/* Tablet and below */
@media (max-width: 768px) {
  /* Reduce font sizes by ~10-20% */
}

/* Mobile */
@media (max-width: 480px) {
  /* Reduce padding, tighter spacing */
  /* Smaller fonts, larger tap targets */
}
```

### Mobile Considerations

1. **Tap Targets**: Minimum 44px (iOS), 48px (Android)
   - Our slot buttons: `min-height: 60px` (desktop), `70px` (mobile)

2. **Safe Areas**: Use `env(safe-area-inset-*)` for notches
   ```css
   padding-bottom: max(2rem, env(safe-area-inset-bottom));
   ```

3. **Full Width on Small Screens**:
   ```css
   @media (max-width: 480px) {
     width: 100%;
     max-width: 100%;
   }
   ```

4. **Overflow Handling**:
   ```css
   overflow: hidden; /* Prevent scroll during animations */
   ```

---

## Accessibility

### Color Contrast
- White text on dark backgrounds: **Pass WCAG AA**
- Gold accents: For emphasis only, not critical info
- Black text on gold buttons: **Pass WCAG AAA**

### Focus States
```css
button:focus-visible {
  outline: 2px solid rgba(255, 215, 0, 0.8);
  outline-offset: 2px;
}
```

### Touch Feedback
```css
-webkit-tap-highlight-color: rgba(255, 255, 255, 0.1);
```

---

## Usage Examples

### Creating a New Modal

1. Copy structure from `ExtendStoryModal.tsx` / `AboutModal.tsx`
2. Use standard overlay with `z-index: 100` (or `200` if stacking)
3. Apply glassmorphism to modal container
4. Use Roboto Mono for all text
5. Follow spacing system (`1.5rem` gaps, `2rem` padding)
6. Add fly-in animation
7. Ensure responsive breakpoints

### Creating a New Button

**Primary Action:**
```css
background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
color: #000000;
border-radius: 8px;
padding: 1.25rem 2rem;
```

**Secondary Action:**
```css
background: transparent;
color: rgba(255, 255, 255, 0.6);
border: 2px solid rgba(255, 255, 255, 0.2);
```

### Adding a Glow Effect

**Gold glow (emphasis):**
```css
box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
```

**White glow (subtle):**
```css
box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
```

---

## Design Principles

1. **Glassmorphism First** - All overlays use semi-transparent dark glass with blur
2. **Gold for Emphasis** - Use sparingly for important actions and highlights
3. **Monospace Typography** - Roboto Mono everywhere for retro-tech feel
4. **Smooth Animations** - Everything transitions, nothing pops
5. **Mobile-First Interactions** - Large tap targets, bottom sheets, safe areas
6. **Dark Theme Only** - Pure black backgrounds, white text, no light mode
7. **Minimal Color Palette** - Black, white, gold, orange. That's it.
8. **Uppercase Titles** - All headings and CTAs in caps for impact

---

## Quick Reference

### CSS Variable Template
```css
:root {
  --color-gold: #FFD700;
  --color-orange: #FFA500;
  --color-white: #FFFFFF;
  --color-black: #000000;

  --font-primary: var(--font-roboto-mono);

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;

  --spacing-xs: 0.5rem;
  --spacing-sm: 0.75rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;

  --z-base: 0;
  --z-modal: 10;
  --z-overlay: 100;
  --z-topmost: 200;
}
```

---

**For questions or additions, update this document and commit to the repo.**
