# Design QA

## Scope

- Build under review: the selected Home A dusk-observatory homepage plus the rebuilt `/blog/invisible-distance/` work archive.
- Source visual truth for the work archive: `public/images/works/invisible-distance/article-opening.jpg` (1800 × 1240), derived from the supplied `Backlog Vol.2` pp.62–63 spread; `public/images/works/invisible-distance/backlog-cover-photo.jpg` (1800 × 1197), derived from the supplied physical-book photo.
- Primary implementation capture: `design-audit/invisible-distance/06-after-desktop-top-v2.png` (1425 × 1013 pixels) at a 1440 × 1024 CSS viewport, device scale 1.
- Mobile implementation capture: `design-audit/invisible-distance/08-after-mobile-top-v1.png` (375 × 812 pixels) at a 390 × 844 CSS viewport, device scale 1.
- Normalized side-by-side evidence: `design-audit/invisible-distance/07-source-vs-desktop-v2.jpg` (2400 × 900), with both source and implementation fitted into equal 1200-pixel columns without cropping.
- State: dark editorial archive, player collapsed, no navigation menu open.

## Full-view comparison evidence

- The source spread and implementation use the same near-black blue field, warm paper-white type, restrained amber rules, large serif title, and image-led editorial hierarchy.
- The webpage intentionally translates the spread rather than reproducing it: the title and project metadata occupy the left half, while the physical `Backlog Vol.2` object establishes material context on the right.
- Desktop composition remains balanced at 1440 × 1024; the header, title, cover photograph, calls to action, and four-column publication metadata are all visible without overlap.
- Mobile composition at 390 × 844 preserves the title, subtitle, project explanation, both actions, and the beginning of the physical cover. No horizontal overflow is visible.

## Focused region evidence

- `design-audit/invisible-distance/11-desktop-pages.png`: printed-pages section at 1440 × 1024. The supplied spread is sharp, uncropped, and visually subordinate to the section heading until the reader reaches it.
- `design-audit/invisible-distance/13-desktop-publication-stable.png`: publication-memory and credit section at 1440 × 1024. Names, roles, historical-preorder status, and team attribution remain readable.
- `design-audit/invisible-distance/09-mobile-lightbox.png`: native dialog at 390 × 844. Close, previous, and next controls remain reachable; the spread fits without horizontal clipping.
- Focused comparisons were necessary because the full page is much taller than a viewport and would make type, image crop, and credit text too small to judge reliably.

## Required fidelity surfaces

- Fonts and typography: the existing site serif and mono families are retained. The title uses a larger optical scale and tighter tracking than ordinary article pages, while metadata stays small and spaced like the printed source. Chinese line wrapping is stable on desktop and mobile.
- Spacing and layout rhythm: the page uses a 12-column gallery, wide editorial intervals, one-pixel rules, and consistent section widths. Responsive breakpoints collapse the hero, metadata, gallery, object grid, and credits without hidden controls.
- Colors and tokens: near-black navy, paper white, desaturated blue, and amber are sampled from the supplied spreads and expressed as page-scoped tokens. Contrast is sufficient in the reviewed states.
- Image quality and asset fidelity: every visible publication image comes from the user-supplied files. Web copies were converted to sRGB JPEG and reduced to 1000–1800 pixels; no placeholder, generated illustration, CSS drawing, or fake book asset is used.
- Copy and content: the previous generic meta-game essay was replaced by the real title, subtitle, thesis, pp.62–70 range, publication context, and verified credits. Page 71 belongs to the next contributor and was removed from the final gallery.

## Comparison history

1. P1 content/rights issue: the initial gallery treated pp.70–71 as a single ending spread even though p.71 begins another contributor's article. Fix: generated a left-page-only p.70 asset, changed the final index to `P.70`, and updated all page-range copy to pp.62–70. Post-fix evidence: gallery DOM and final asset `article-page-70.jpg`.
2. P1 attribution issue: the first pass described production only as a generic team effort. Fix: added verified roles—article by 亚略 Ar, overall design and layout by RLt, cover illustration by 虾滑馆破奇, and editorial proofreading by 坂上白菜. Post-fix evidence: `13-desktop-publication-stable.png`.
3. P2 title wrap: desktop v1 (`05-after-desktop-top-v1.png`) wrapped the final character of “看不见的远方” onto a second line. Fix: reduced the optical size, tightened tracking, and kept the main title on one line at reviewed breakpoints. Post-fix evidence: `06-after-desktop-top-v2.png` and the side-by-side comparison.

## Interaction and runtime checks

- “进入作品档案” anchor and “打开书页浏览” action work.
- Native lightbox opens, traps focus through the browser dialog behavior, closes from the visible button, and advances in both directions; the count and accessible image text update.
- Desktop and mobile gallery anchors load the expected section and lazy images resolve.
- Current browser logs contain no error or warning entries; the only connection message was the expected development-server restart during route registration.
- Astro content routing keeps the existing public slug while excluding it from the generic dynamic route, preventing duplicate output.

## Homepage and global feature regression

- Home A remains the selected direction and retains the visitor-weather permission flow, 44-track mixed playlist, responsive room threshold, search, theme control, and ClientRouter persistence.
- The work archive reuses the global header, footer, search, theme, and music player rather than creating parallel controls.

## Findings

- No actionable P0, P1, or P2 visual findings remain.
- P3: the collapsed music dock occupies the lower-right edge of small viewports. This is an intentional persistent global control; page content remains scrollable and no primary action is hidden.

## Build verification

- `pnpm check`: 33 files, 0 errors, 0 warnings, 0 hints.
- `pnpm build`: exit 0; 37 static pages built, including the dedicated `/blog/invisible-distance/` route.
- Music sync during the production build: 44 tracks, 1 local track, 43 LRC records, 0 degraded items.
- Deployed-page smoke test remains required after the GitHub Pages workflow completes.

final result: passed
