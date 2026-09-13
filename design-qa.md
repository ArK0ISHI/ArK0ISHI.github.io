# Homepage refinement — Design QA

Date: 2026-09-13 (Asia/Shanghai)

final result: passed

## Findings and scope

No actionable P0/P1/P2 findings remain in the reviewed homepage states. The research, publication and photography displays are intentional editorial additions to the original dusk/paper identity, rather than a pixel-for-pixel clone. Existing content routes and original artwork/novel attribution remain intact. The previous work-archive QA is preserved in Git at the recovered baseline.

## Source and implementation

- Source visual truth: https://ark0ishi.github.io/, recovered baseline `54e921b81b450272b9e5927f26757d795848089e`; captures `before-desktop.png`, `before-hero.png`, `before-mobile.png`.
- Implementation: http://127.0.0.1:4322/; captures `after-desktop.png`, `after-hero.png`, `after-mobile.png`, `after-mobile-hero.png`, `after-dark.png`, `after-mobile-320.png`.
- Evidence location: `../design/` in the recovered working project; `../visual-check/` relative to the ZIP's `project/` directory.
- Capture tool: local headless Edge through Playwright, explicitly authorized by the user after connected-browser failures.
- Desktop CSS viewport 1440 × 1000; both hero captures 1440 × 1000 pixels. Mobile CSS viewport 390 × 844; both hero crops 390 × 844 pixels. Density 1, no device frames/browser chrome.
- Full desktop source 1440 × 7210, implementation 1440 × 7522 pixels. Full-page comparison pads the shorter image and scales both equally by 0.5. Other responsive checks cover 320 and 768 CSS pixels.
- State: light theme unless labeled dark, reduced motion, default research tab, all-article filter with four visible items, menu/player closed. Dynamic weather and music metadata differ across captures and are excluded from exact matching.

## Combined visual evidence

- `compare-full-page.jpg`: original/refined composition, section hierarchy, gutters and rhythm together in one input.
- `compare-desktop-hero.jpg`: same-viewport original/refined typography, actions, illustration and attribution.
- `compare-mobile-hero.jpg`: original, initial refinement and final contrast repair together at equal density.
- `mobile-content-details.jpg`: readable research, publication and photo crops from the final mobile page.
- `after-desktop-prologue-clean.png`: document-width opening crop with correct margins.
- `compare-works-themes.jpg`: equally scaled light/dark publication sections, complete covers, captions and credits.

Focused crops use document coordinates from full-page screenshots. Earlier element screenshots scrolled beneath the fixed header; those capture artifacts were excluded from final evidence. Focused checks were required because text is too small to assess in the full-page overview alone.

## Required fidelity surfaces

- **Typography:** retained Noto Serif SC / DM Mono and the Latin serif accent; larger name display, readable paragraph leading, stable mobile heading wraps and complete credit lines.
- **Spacing/layout:** consistent desktop gutters and rules; research/books collapse into one column; mobile photos retain full-width frames and captions. No horizontal overflow at 320, 390, 768 or 1440 pixels.
- **Color/tokens:** warm paper, navy and muted red retained through theme variables. Mobile hero overlay now supports light text; paper navigation has red focus indicators; dark works surfaces preserve original cover colors.
- **Images:** actual repository illustration, research charts, physical publication photo, novel cover/chapter and travel photos. No generated substitutes. Charts/covers remain uncropped; photos use responsive sources. Visible images load correctly.
- **Copy/content:** dynamic counts match 8 published posts, 7 projects and 43 photos. All projects remain linked. Illustrator attribution and coolcate's novel authorship remain explicit. Ar's editing/typesetting role, original dates and publication page range remain accurate. Search summary now describes the new homepage sections.

## Repair and comparison history

1. **P2 — cream navigation focus:** inherited gold lacked contrast. Changed threshold focus to the existing red accent and retained gold on the dark hero; final source and theme captures rechecked.
2. **P2 — populated search Escape:** native search behavior could clear text while leaving the dialog open. Added a composing-aware key handler with preventDefault and closeSearch. Final browser test verifies dismissal after entering a known query.
3. **P2 — mobile text over bright clouds:** initial evidence `mobile-hero-before-contrast-fix.png`. Increased middle overlay opacity .26 → .5, paragraph type 12px → 13px and mobile actions 41px → 44px. Rebuilt and recaptured; `compare-mobile-hero.jpg` shows the final clearer text while retaining the original scene. 320px overflow and button-height checks pass.
4. **P3 — stale homepage search copy:** replaced the obsolete three-path description with the new research, works, photos and articles summary; present in the final build.

## Runtime and interaction evidence

Final `interaction-report.json`: passed, no page errors, console errors or failed local requests.

- Research tabs: click, ArrowRight, Home, selected state and visible panel.
- Article filters/counts, show-more and collapse.
- Search returns the known query and closes with Escape.
- Music drawer opens/closes without autoplay.
- All 47 distinct internal homepage links return HTTP 200.
- Client navigation away/back reinitializes controls.
- Mobile menu/Escape and research tabs work.
- All visible homepage images load.
- Reduced-motion preference disables scenic animation; primary mobile action is at least 44px.
- Width equals scrollWidth at 1440 light/dark, 768, 390 and 320 pixels.

`pnpm check`: 63 files, 0 errors, 0 warnings, 0 hints. Final Astro production build: 143 pages, successful. `git diff --check`: passed.

## Remaining scope and checklist

- [x] Compare source and implementation in combined inputs.
- [x] Review typography, spacing, colors, assets and content at readable scale.
- [x] Repair focus, search Escape and mobile readability; rebuild and repeat checks.
- [x] Preserve real materials and credits.
- [ ] External music playback, geolocation and third-party weather reliability were not comprehensively tested.
- [ ] Publishing has not been requested or performed; this is a local preview.
