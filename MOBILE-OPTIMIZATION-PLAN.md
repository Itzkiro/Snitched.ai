# Snitched.ai Mobile Optimization Plan

## Current Issues

### 1. **Header Navigation** (Critical)
- Navigation links don't collapse on mobile
- Search bar takes too much horizontal space
- Logo text (2rem) too large for small screens
- Fixed padding (2rem) wastes space on mobile
- **Fix**: Hamburger menu for nav, collapsible search, responsive padding

### 2. **Juice Box Leaderboard Table** (Critical)
- 6-column table (#, Photo, Name, Office, Israel Lobby $, %) overflows on mobile
- Fixed column widths don't adapt
- **Fix**: Horizontal scroll with sticky rank column OR card-based mobile layout

### 3. **Politician Cards** (High Priority)
- Photos + text layout may be cramped
- Font sizes need scaling
- Spacing too generous for mobile
- **Fix**: Stack layout on mobile, reduce padding, scale fonts

### 4. **Terminal Headers** (Medium Priority)
- Large ASCII-style headers may overflow
- Fixed font sizes don't adapt
- **Fix**: Smaller font on mobile, truncate or hide decorative elements

### 5. **Typography** (Medium Priority)
- No responsive font scaling in globals.css
- Bebas Neue headers too large on mobile
- Body text (IBM Plex Mono) may be too small
- **Fix**: Add responsive typography with media queries

### 6. **Spacing & Padding** (Medium Priority)
- Fixed padding (1.5rem, 2rem) too large on mobile
- Card margins waste space
- **Fix**: Reduce padding/margins on mobile (0.75rem, 1rem)

### 7. **Tables & Data Displays** (High Priority)
- All data tables need mobile strategy
- Politicians list, funding breakdowns, vote records
- **Fix**: Horizontal scroll OR responsive card conversion

### 8. **Search Results Dropdown** (Low Priority)
- May extend beyond viewport on mobile
- Results too tall (400px max-height)
- **Fix**: Adjust max-height, ensure within viewport

---

## Implementation Strategy

### Phase 1: Critical Fixes (30 min)
1. Add responsive breakpoints to globals.css
2. Create mobile Header with hamburger menu
3. Make Juice Box table horizontally scrollable
4. Reduce padding across all pages

### Phase 2: Layout Optimization (30 min)
1. Convert politician cards to mobile-friendly stack layout
2. Optimize terminal headers for small screens
3. Add responsive typography scaling
4. Test all pages on phone viewport

### Phase 3: Polish (20 min)
1. Fine-tune spacing/padding
2. Test search functionality on mobile
3. Ensure all buttons are thumb-friendly (min 44px tap target)
4. Add touch-friendly hover states

---

## Responsive Breakpoints

```css
/* Mobile First */
@media (max-width: 640px) {
  /* sm breakpoint - phones */
}

@media (min-width: 641px) and (max-width: 768px) {
  /* md breakpoint - tablets */
}

@media (min-width: 769px) {
  /* lg breakpoint - desktop */
}
```

---

## Key Changes Needed

### globals.css
```css
/* Add responsive typography */
@media (max-width: 640px) {
  html { font-size: 14px; }
  h1 { font-size: 1.75rem; }
  h2 { font-size: 1.5rem; }
  h3 { font-size: 1.25rem; }
  
  .card { padding: 1rem; }
  .btn { padding: 0.75rem 1.5rem; }
  .tag { padding: 0.25rem 0.5rem; font-size: 0.625rem; }
}
```

### Header.tsx
```jsx
// Add hamburger menu state
const [menuOpen, setMenuOpen] = useState(false);

// Responsive container
<div className="md:flex hidden">
  {/* Desktop nav */}
</div>
<button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
  {/* Hamburger icon */}
</button>
```

### Juice Box Table
```jsx
<div className="overflow-x-auto">
  <table className="min-w-[800px]">
    {/* Table content - scrolls horizontally on mobile */}
  </table>
</div>
```

---

## Testing Checklist

- [ ] iPhone SE (375px) - smallest modern phone
- [ ] iPhone 12 Pro (390px) - common size
- [ ] iPhone 14 Pro Max (430px) - large phone
- [ ] iPad Mini (768px) - small tablet
- [ ] Test all pages: Home, Hierarchy, Juicebox, Candidates, Officials, Browse, Tasks, Politician Detail
- [ ] Test search functionality
- [ ] Test navigation menu
- [ ] Test table scrolling
- [ ] Verify tap targets are 44px minimum
- [ ] Check font readability
- [ ] Verify no horizontal overflow

---

## Execution Plan

**Option A: Jarvis handles it** (Codex CLI, ~1 hour)
- Use `codex exec` for targeted fixes
- Update globals.css, Header, pages with mobile breakpoints
- Test on multiple viewports
- Deploy to Vercel

**Option B: Spawn Adrian** (Web Architect, ~40 min)
- Specialized in responsive design + Tailwind
- Can handle all mobile optimization in parallel
- Delivers production-ready responsive code

**Recommendation**: **Option B - Spawn Adrian** for faster, more polished execution.

---

## Priority Order

1. **Header mobile menu** (blocks navigation)
2. **Juice Box table scroll** (worst mobile UX)
3. **Responsive typography** (readability)
4. **Card padding reduction** (space efficiency)
5. **Politician card mobile layout** (core content)
6. **Terminal header scaling** (polish)
7. **Search dropdown** (minor)
8. **Touch targets** (accessibility)
