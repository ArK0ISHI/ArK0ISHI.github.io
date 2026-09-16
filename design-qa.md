# Moon complete edition — release QA

## Approved scope

On 2026-09-16 the owner explicitly replaced the earlier local-import-only choice with permission to publish the original's complete details, including names, student identifiers and individual records, in the public site and repository. The 39-activation discovery remains a presentation feature, not access control. The current release supersedes the earlier privacy-preserving importer described in previous commits.

The source has since gained recommendation analysis. This release follows the latest supplied original: five full datasets, eleven views and seven executable scripts. The five dataset objects are copied without field removal, aggregation or anonymization. The iframe uses the trusted published template; the separate public dataset is loaded automatically. There is no file chooser. The main moon menu and welcome action now lead directly to /moon/workbench/; /moon/ remains an optional aggregate overview.

## Welcome dialog correction

Reproduced three real failures before changing code: desktop click 40 dismissed the backdrop; mobile click 40 landed directly on the newly appeared Enter button; keyboard Enter 40 activated the previously autofocused link. See ../round-ten/before/repro.json and paired screenshots.

The backdrop no longer dismisses the dialog. Focus initially lands on its heading. A continuation of the unlocking pointer burst near the same screen coordinates is consumed until a pause or deliberately different target; queued moon-trigger events are ignored while the dialog is open. Explicit close, Later, Enter and Escape remain available, and held-key repeats are suppressed. The first thirteen activations remain silent.

../round-ten/after/report.json verifies desktop, touch and keyboard: 39 real activations followed by eight extra clicks; four extra programmatic trigger events; twelve taps with the original touch point deliberately aligned to the new Enter button; rapid Enter and held Enter/Space; explicit close, Later, Enter, Escape and focus return. Zero browser errors. Final static/online evidence uses the same regression script with the new direct-entry target.

## Visual evidence

The original supplied dashboard was reviewed against the current complete-workbench desktop and mobile captures. Layout and calculations retain the original structure; the navy background, muted gold actions, serif headings, compact site frame and navigation follow the existing portfolio. The eleven original modules include the new recommendation view.

Evidence is kept outside the repository under ../round-ten/:

- complete-local/overview-desktop.png and overview-mobile.png: automatic complete data view, no import screen.
- after/mobile-after-burst.png and mobile-overlapping-enter-protected.png: welcome typography, buttons and touch protection.
- workbench-qa/functionality-report.json: all views and original interactive functions.
- complete-local/report.json: loading, exact data equality, state lifecycle and viewport containment.

Widths 320, 390 and 768 were checked across all eleven views (33 combinations). No outer or iframe document overflow and no clipped controls. The recommendation statistics and list tables have their own real horizontal scroll areas (1170 and 1420 px table widths). Additional host bounds checks cover 1440 px. The mobile navigation strip intentionally scrolls.

## Data and functionality

The public JSON is deeply equal to all five original data blocks. It contains 15,205 people, 73,559 semester records, 3,066 full-course records, 400 core-course scores and 879 recommendation entries. Both template and data generators pass --check. The aggregate-only generator also passes, confirming the optional overview stays consistent with the current original.

Functionality QA passed 27 checks with no browser errors: eleven views, original filters and sorting, student pagination and trajectories, paired semester changes, full-course and core-course comparisons, and the new recommendation analysis. The latter covers six populated chart instances, college/major/channel/minimum-group filters, grouping and sorting, list kind/status/search/pagination, 822 main-list and 57 alternate entries. Nine nonempty CSV Blobs and three PNG data URLs were checked; download anchors were intercepted so tests did not save personal exports. All five identity masks start off, with their original controls still available.

The automated host test compares every injected dataset object with the published JSON, verifies there is no file chooser, checks automatic load after in-site navigation and refresh, fullscreen reset, and relock removing the running iframe. The iframe retains an opaque origin and a no-network CSP. Trusted source links open separately with noopener/noreferrer. A failed dynamic-module fetch is retried through a fresh page load because browsers retain failed module loads in the current document; simulated network failure and recovery both passed.

## Delivery

Astro check: 104 files, zero errors/warnings/hints. The complete data and original plotting template are lazy-loaded after entering the unlocked workspace; their size warnings are expected for this intentionally complete edition. Hidden routes remain noindex and excluded from public indexes.

Current result: local and static-build checks passed. The production build contains 182 pages. Static gate evidence is in gate-static/report.json; complete-local/report.json records the production preview at port 4340. Live-release reports are saved separately alongside these artifacts.
