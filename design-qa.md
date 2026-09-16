# Moon observatory — design and release QA

The approved change adds a footer moon, exact 39-activation discovery, a welcome dialog, conditional navigation and a public aggregate-data observatory. This is an intentional redesign of the supplied offline dashboard using the existing portfolio style.

## Visual evidence

Evidence is outside the public repository under ../round-nine/:

- site-reference.png: production homepage, dark theme, 1440 × 1000 CSS/physical pixels, DPR 1.
- dashboard-reference.png: supplied local dashboard overview, dark theme, same viewport. Original HTML and personal records are not copied to the repository.
- observatory-release.png: static production build at port 4340, unlocked overview, same viewport.
- design-comparison.png: source site and implementation reduced uniformly to 720 × 500 each, side by side in a 1440 × 500 canvas. Different content and composition are intentional; comparison checks typography, palette and header continuity.
- local/overview-desktop.png and local/overview-390.png: full-page overview captures.
- local/groups-mobile.png, local/courses-mobile.png, local/overview-mobile.png, local/semesters-desktop.png: focused charts, controls and table states.
- local/welcome-desktop.png: moon image, dialog typography, focus and primary action.
- local/chart-export.png: image export with embedded title and scope.
- ../moon-gate-evidence/: footer, mobile/desktop menus, dialog, storage and navigation checks.

## Iterations and findings

1. Removed duplicated visible chart headings while preserving semantic HTML headings. Increased table text and provided 420 px for ten-category plots. Revised mobile groups/courses captures show readable labels and values.
2. Corrected course counts to enrolled people, with the release threshold separately based on at least ten graded people.
3. Corrected fixed four-cohort scope in PNG and CSV exports. Added a course-semester table and rectangular CSV metadata columns.
4. Restored focus after select replacement; added dialog Tab wrapping; kept focus on a visible element after relocking.

No actionable P0/P1/P2 findings remain. The moon intentionally overlaps the hero background at narrow widths while text remains readable. Long chart labels shorten inside plots; their full text is retained in tables and accessible descriptions.

## Fidelity surfaces

- Fonts: existing Noto Serif SC headings and DM Mono numbers, system sans for controls/charts/tables; mobile and desktop hierarchy inspected.
- Spacing: site page width and header retained; metrics become two columns, charts stack, filters wrap, wide tables scroll locally.
- Colors: page-local navy, warm white and muted gold, blue, violet and green; global saved theme is unchanged. Series text and line patterns supplement color.
- Images: real NASA LRO far-side imagery, 768 px hero and 160 px trigger/dialog, with credit and source link in notes.
- Content: GPA and percentage scores, administrative cohorts and changing sample populations, incomplete periods and top-20 course-sample selection bias are distinguished.

## Verification

../round-nine/local/report.json records the static build browser run at http://127.0.0.1:4340. Passed: locked direct route; exact 39th unlock; welcome CTA; lazy aggregate loading; four views; cohort/metric filters; sorting/search/empty state/pagination; course and term tables; PNG/CSV exports; keyboard navigation; persisted views; relock and reload. No horizontal document overflow at 320, 390, 768, 1024 or 1440 px; zero browser exceptions.

Gate checks additionally cover phases 13/26, refresh/navigation count, held-key suppression, Space, persistent and cross-tab unlock/reset, storage failures, reduced motion, and real Astro transitions.

Build: 99 checked files, zero errors/warnings/hints, 181 static pages. Hidden route has noindex/nofollow/noarchive and is absent from sitemap, search data and RSS. These controls are not authentication.

Data verification: deterministic generator check, population/bin conservation, independent cohort statistics, minimum group sizes. Final new build files were scanned against all 15,205 source identifiers: no identity fields, names, personal arrays or private paths. Compiled aggregate equals source aggregate exactly. Original source remains outside the website.

final result: passed

## Full workbench update — 2026-09-16

Approved scope: keep the first thirteen moon activations silent; retain the original dashboard's complete functionality through local import while only aggregates remain public.

The footer now has no hint, hover glow, pulse or live announcement for activations 1–13. Response begins at 14, the second phase at 26, and the welcome dialog at 39. Keyboard focus remains visible. Desktop and touch-browser screenshots are pixel-identical to the initial state after every one of the first thirteen activations. Refresh at 13, relock and the exact final activation were checked.

The new /moon/workbench/ route preserves all ten original analysis modules and calculation scripts inside an opaque-origin sandbox. Only the four validated JSON blocks are read from the selected HTML. Its scripts and images are never executed or loaded. Records live in memory, survive in-site navigation, and are cleared on reload, clearing or relocking. All four identity masks start enabled. The published template contains no personal datasets.

### Visual comparison and corrections

Compared the original dashboard-reference.png with workbench-local/overview-desktop.png and overview-mobile.png. The original navigation, controls and chart structure remain; the palette, serif headings, restrained gold accents, square panels and enclosing site navigation now follow the portfolio. The full workbench can expand to the viewport. Import-desktop.png shows the empty state, local-data explanation and complete module list.

Corrected a narrow-screen container margin that made the iframe wider than the visible page and reduced year-button padding to remove a two-pixel overflow at 320 px. Final static checks verify both iframe bounds and its internal document at 320, 390, 768 and 1440 px. Wide tables and the mobile module strip scroll within their own containers. Fixed clearing while fullscreen so the browser exits fullscreen before hiding the workspace. Fixed the boot insertion boundary to use the document's final body closure rather than an earlier string inside the embedded plotting library.

### Release verification

- workbench-local/report.json: static-build import, malformed replacement, sandbox isolation, zero child network requests, default masks, in-site navigation, fullscreen clear, refresh and relock; zero browser errors.
- workbench-qa/functionality-report.json: 21 successful checks across all ten modules, cohort and course filters, semester pairing, trajectories, student pagination, seven nonempty CSV Blobs and two PNG data URLs. Export anchors were intercepted; no personal export files were saved as evidence.
- ../moon-gate-evidence/silence-report.json: desktop and mobile first-thirteen pixel/style comparisons, 14/26/39 transitions and keyboard focus; passed.
- local/report.json: public aggregate views, filters, table states, exports, keyboard controls, responsive bounds and reset; passed again on the static build.
- Source/template privacy audit: 411 repository files and 453 built files scanned. Zero matches for 15,205 unique source identifiers, 3,066 course-record signatures, 11,003 multi-term trajectory signatures, structured names or private source filenames. No original HTML copy or private table exports in the repository. Four template data blocks are placeholders, and generator --check passed.
- Astro check: 103 files, zero errors, warnings or hints. Build: 182 static pages. Vite reports the expected large lazy-loaded template chunk, which includes the original embedded ECharts library; it is requested only when importing records. The workbench is noindex and excluded from the public sitemap, RSS and search index.

Current result: passed. No actionable release-blocking findings remain in the checked desktop and mobile flows.
