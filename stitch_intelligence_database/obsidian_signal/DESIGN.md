# Design System Document: The Sentinel Protocol

## 1. Overview & Creative North Star
**Creative North Star: The Sovereign Eye**
This design system is not a dashboard; it is a surveillance apparatus. It rejects the friendly, rounded "SaaS" aesthetic in favor of a high-fidelity, OSINT (Open Source Intelligence) environment. By merging the brutalist efficiency of a Bloomberg Terminal with the ominous transparency of a hacker’s workstation, we create a "Sovereign Eye"—a platform that feels authoritative, unyielding, and surgically precise.

To break the "template" look, we utilize **intentional asymmetry**. Data modules should not always align to a perfect center; they should feel like windows snapped into a multi-monitor array. We use high-contrast monospace typography against a void-like background to emphasize that information is the only light in the darkness.

---

## 2. Colors & Surface Architecture
The palette is rooted in deep obsidian tones, punctuated by high-frequency phosphors. 

### The Palette
- **Primary (`#00FF88`):** The "Live" frequency. Used exclusively for active data streams, interactive hits, and successful connections.
- **Error/Alert (`#FF3B5C`):** High-risk corruption indicators. Use sparingly to maintain psychological impact.
- **Warning (`#FFD166`):** Specific to political influence tags and medium-risk volatility.
- **Info (`#4DA6FF`):** Hard data links and external OSINT references.

### The "No-Line" Rule
Standard 1px borders are prohibited for sectioning. They create visual "noise" that clutters data-heavy interfaces. Instead, define boundaries through:
1.  **Background Shifts:** Distinguish a sidebar from a main feed by moving from `surface` (`#111317`) to `surface-container-low` (`#1A1C1F`).
2.  **Tonal Transitions:** Use the `surface-container` tiers to create logical groupings.

### Surface Hierarchy & Nesting
Treat the UI as a physical terminal stack.
- **Level 0 (Base):** `background` (`#080A0D`) - The "Void."
- **Level 1 (Sections):** `surface-container-low` (`#1A1C1F`) - Regional data blocks.
- **Level 2 (Active Cards):** `surface-container-high` (`#282A2D`) - Highlighted investigative leads.
- **Level 3 (Modals/Popouts):** `surface-bright` (`#37393D`) - Temporary tactical overlays.

### The "Glass & Scanline" Rule
To add "soul" to the darkness, use `2px` horizontal scanline overlays at 3% opacity globally. For floating tactical panels, apply **Glassmorphism**: use a semi-transparent `surface-variant` with a `20px` backdrop-blur. This suggests a HUD (Heads-Up Display) layered over a deep database.

---

## 3. Typography
The typography system is a binary between human-readable headlines and machine-readable data.

- **Display & Headlines (Space Grotesk):** Low-contrast, wide-aperture sans-serif. Used for headers to provide an authoritative, modern editorial feel. It should feel like a redacted document's title page.
- **Data, Labels, & Mono (IBM Plex Mono):** The workhorse. Every piece of raw data, timestamp, and financial figure must be set in Mono. This conveys "unfiltered truth."

**Hierarchy Strategy:**
- **Display-LG (3.5rem):** Reserved for site-wide "Total Corruption" counters.
- **Headline-SM (1.5rem):** For investigative titles.
- **Label-SM (0.6875rem):** For metadata (e.g., `LAST_SEEN_IN_TALLAHASSEE`). Always uppercase with 0.05em tracking.

---

## 4. Elevation & Depth
In this design system, shadows do not represent light—they represent distance from the data core.

- **The Layering Principle:** Depth is achieved by stacking darker elements on lighter surfaces, or vice versa. A `surface-container-lowest` card sitting on a `surface-container` section creates a "recessed" look, like a module slotted into a rack.
- **Ambient Glow:** Instead of traditional shadows, use "Emission Glows." A primary-colored element (like a live indicator) should have a soft, `12px` blur glow of the same color at 10% opacity to mimic a CRT monitor phosphor bloom.
- **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline-variant` (`#3B4B3D`) at **15% opacity**. It must feel like a faint grid line on a blueprint, not a box.

---

## 5. Components

### Buttons
- **Primary:** `0px` radius. Background: `primary`. Text: `on-primary` (All caps, Bold Mono). 
- **Secondary:** `0px` radius. Border: `1px solid primary` (at 40% opacity). No background.
- **States:** Hover must trigger a "glitch" or immediate color inversion (Background: `primary` -> `primary-fixed-dim`). No transitions; the terminal responds instantly.

### Input Fields
- **Styling:** Transparent background with a `bottom-only` border using `outline-variant`. 
- **Focus:** The bottom border turns `primary` (`#00FF88`) with a faint glow. Helper text must appear in `Label-SM` Mono.

### Cards & Lists
- **The No-Divider Rule:** Explicitly forbid horizontal line dividers. Separate list items using `8px` of vertical whitespace or by alternating `surface-container-low` and `surface-container-lowest` backgrounds.
- **Data Cells:** In lists, align all numerical data to the right to maintain the "Intelligence Terminal" readability.

### Tactical Modules (Custom)
- **The "Pulse" Indicator:** A small `8px` square of `primary` that breathes (opacity 40% to 100%) to indicate a live data connection.
- **The Scanline Overlay:** A global `div` with a repeating linear gradient to simulate cathode-ray tube textures.

---

## 6. Do’s and Don’ts

### Do
- **Do** use `0px` border radius on everything. Sharpness is a brand pillar.
- **Do** use `faint grid backgrounds` (12px grid cells) in the hero section at 5% opacity.
- **Do** lean into monospace for anything that looks like "output."
- **Do** use intentional asymmetry (e.g., a left-aligned header with a right-aligned data-feed).

### Don’t
- **Don't** use soft gradients or round corners. It undermines the "Ominous/Functional" tone.
- **Don't** use 100% white. Use `text-primary` (`#C8D8E8`) to reduce eye strain and maintain the low-light aesthetic.
- **Don't** use "standard" icons. Use simplified, geometric, or ASCII-inspired iconography.
- **Don't** use smooth easing functions. Use `steps()` or `linear` for animations to mimic terminal rendering.