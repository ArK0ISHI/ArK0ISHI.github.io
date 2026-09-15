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
