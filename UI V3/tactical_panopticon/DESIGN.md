# Design System Specification: Terminal Sovereignty

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Panopticon."** This is an aesthetic of absolute surveillance, high-density intelligence, and brutalist efficiency. We are moving away from the "friendly" consumer web and toward a high-stakes, mission-critical interface that feels like a redacted government terminal.

The system breaks traditional templates through **Hyper-Density Architecture.** Every pixel must serve a functional purpose. We utilize intentional asymmetry—heavy, left-aligned data clusters contrasted with wide, scanning-line voids—to create a sense of vast, searchable depth. This is not just a dashboard; it is a lens into a global hierarchy.

## 2. Colors & Atmospheric Depth
Our palette is rooted in the "Deep Obsidian" spectrum, punctuated by high-frequency luminescence.

*   **The Foundation:** `surface` (#111417) and `surface_container_lowest` (#0c0e12) form the void.
*   **The Pulse:** `primary_container` (#00ff88) is our "High-Bloom Neon." It is used sparingly for active states and critical data paths.
*   **The Warning:** `on_tertiary_container` (#c50039) serves as our "Alert Red," reserved for data anomalies and structural breaches.

### The "No-Line" Rule (Internal Content)
While the outer architecture uses structural 1px borders, internal content sections must never be separated by standard borders. Instead, use **Surface Nesting**. A data list (`surface_container_low`) should sit inside a panel (`surface_container`), defined only by the shift in background value. 

### Signature Textures & CRT Bloom
To achieve a "High-End Editorial" feel, apply a global **Scanline Overlay** (a 2px repeating linear gradient at 3% opacity). Active elements must utilize a `primary_container` outer glow (8px blur, 0.4 opacity) to simulate the phosphor bleed of high-intensity CRT monitors.

## 3. Typography: The Intelligence Lexicon
Typography is the core of this system. We use two high-contrast faces to separate "The System" from "The Data."

*   **Display & Headlines (Space Grotesk):** This is our "High-Impact" face. It represents the voice of the authority. It should be tracked tightly (-0.02em) and set in all-caps for `headline-lg`.
*   **Data & Labels (IBM Plex Mono):** This is the "Working" face. Every piece of raw data, timestamp, and terminal command uses this mono-spaced font. It ensures mathematical alignment across dense tables.

**Hierarchy Strategy:**
*   **Display-LG:** Space Grotesk / 3.5rem / Leading 1.1 — Reserved for top-level entity names.
*   **Label-SM:** IBM Plex Mono / 0.6875rem — Used for metadata headers (e.g., "LAT_COORD", "UPTIME").

## 4. Elevation & Depth
In this system, "Elevation" is a misnomer. We do not use "Lift"; we use **Systemic Layering.**

*   **The Layering Principle:** Treat the UI as a stack of transparent terminal sheets. Depth is achieved by placing a `surface_container_highest` (#323539) element atop a `surface_dim` (#111417) background. 
*   **Corner Brackets:** Instead of shadows, use "Ghost Brackets." Use `outline_variant` (#3b4b3d) at 40% opacity to draw 4px L-shaped brackets at the corners of high-priority containers.
*   **Zero-Rounding Policy:** All `border-radius` tokens are strictly **0px**. Any curvature is a violation of the system's brutalist integrity.

## 5. Components & High-Density UI

### Top Bar Structure (The Command Hub)
A dual-layer header that dictates the user's focus:
1.  **Layer 1 (Utility):** Left-aligned functional dropdown; Center-aligned real-time clock (`YYYY-MM-DD HH:MM:SS`) in IBM Plex Mono; Right-aligned command-line search bar (no icon, just a `>_` prompt).
2.  **Layer 2 (Navigation):** Heavy, terminal-style tabs using `surface_container_high`. Active tabs are inverted: `on_primary_container` text on `primary_container` background with a high-intensity bloom.

### Primitive Components
*   **Buttons:** Rectangular blocks. Primary variant uses `primary_container` with `on_primary_fixed` text. No hover transitions; they must "snap" instantly between states.
*   **Terminal Tabs:** `DASHBOARD`, `CANDIDATES`, etc. All caps, IBM Plex Mono, 1px `outline` border. Active state removes the border and adds the CRT Glow effect.
*   **Input Fields:** Ghost-style inputs. Only a bottom border of 1px using `outline`. The cursor is a solid block (`primary_fixed_dim`) that blinks at 1Hz.
*   **Data Grids:** Forbid the use of horizontal divider lines. Use `spacing.2` (0.4rem) of vertical white space to separate entries. Highlight the entire row on hover using `surface_bright` (#37393d) at 10% opacity.

### Custom Component: The "Juice Box"
A specific telemetry container using a `primary_fixed` border. It features a micro-sparkline graph at the bottom, updating in real-time, rendered in `primary_container` green.

## 6. Do's and Don'ts

### Do:
*   **Snap-to-Grid:** Ensure every container edge aligns with a strict 4px grid.
*   **Monochromatic Data:** Keep 90% of the UI in Obsidian/Grey. Reserve Neon Green specifically for "Active" or "Actionable" items.
*   **Visual Noise:** Use the `spacing.px` (1px) borders to define the primary layout skeleton only.

### Don't:
*   **Never use Rounded Corners:** Even a 1px radius breaks the brutalist aesthetic.
*   **No Soft Transitions:** Avoid 300ms eases. Use 0ms or 50ms "cut" transitions to mimic hardware speed.
*   **No Drop Shadows:** Use background color shifts and CRT glows to denote focus; traditional "material" shadows are prohibited.