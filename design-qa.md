# Moon workbench — full-window layout QA

## Scope and result

Result: passed

2026-09-17. The user requested a larger, more suitable workspace rather than a page nested inside a page. This release changes the shell, responsive layout and navigation affordances only. The original template, all five datasets, calculations, eleven modules and exports are unchanged. Existing publication authorization remains in effect.

## Evidence and comparison

Evidence directory: `../round-eleven/` (outside the repository). Baseline is the deployed `abdc2da` layout; implementation is the production build served on port 4340. Captures use Edge/Chromium at DPR 1, 100% zoom, reduced motion, fonts ready, unlocked default overview, loader hidden, no selected filters, no menu open, scroll at top.

| Viewport | Source | Implementation |
| --- | --- | --- |
| 1920 × 1080 | before/top-1920.png | after/top-1920.png |
| 1440 × 1000 | before/top-1440.png | after/top-1440.png |
| 390 × 844 | before/top-390.png | after/top-390.png |

`comparison-1920.png` (1920 × 540, each source scaled equally to half size) and `comparison-390.png` (780 × 844, original size) were inspected as combined visual inputs: baseline left, implementation right. `before/audit.json` and `after/audit.json` record exact bounds. Initial baseline capture caught a remount/loading flash; it was rejected and replaced after waiting for the ready marker and loader disappearance. The new setup is idempotent for an unchanged route root.

At 1920 px width, the original iframe was x=371, y=488, width=1178, height=970, while the outer document scrolled to 2130 px. The new frame is x=0, y=52, width=1920, height=1028, with the outer document exactly one viewport tall. Mobile frame moves from y=544 and width=356 to y=52 and width=390. Its five primary metrics are now visible in the first viewport.

## Intentional visual changes

The ordinary site header, hero, second title bar, footer, music float and framed card are replaced on this route by a dedicated full-window application shell. A 52 px bar contains the real existing avatar, a restrained serif title, home, fullscreen and More. The existing navy and muted gold palette connects it to the site. No new illustrations or external assets were introduced.

Desktop has a 224 px analysis directory, five metrics across above 1280 px and comfortable chart gutters. Tablet uses three metrics. Mobile has a sticky current-view selector opening all eleven original destinations in two columns; filters collapse to a live scope summary. Two metric columns plus a full-width fifth metric provide a clear hierarchy. The original graphs and tables retain their functions; wide tables keep local horizontal scrolling.

Typography uses system UI fonts for compact controls, the site's serif fallbacks for headings, and tabular numerals for metrics. No remote font dependency is introduced by the shell. The original labels and data descriptions are retained; duplicate inner branding becomes “分析目录”, and the inherited offline badge becomes “完整数据”. Contrast, wrapping, avatar crop, labels and chart spacing were checked in the paired captures. No unresolved visual mismatch within this layout brief.

## Interaction and lifecycle verification

`check-layout.cjs` passed against the final production build (`layout-local/report.json`):

- Widths 320, 390, 768, 1280, 1440, 1920: full-width frame, 52 px bar, no outer horizontal or vertical overflow; one main vertical scrolling surface.
- Mobile selection reaches all eleven original modules. Directory closes on selection, Escape and keyboard focus leaving it; the selected view remains apparent. Filters retain original behavior and no empty filter panel remains on independently filtered modules.
- More closes on Escape, focus leaving, outside click and iframe interaction. Fullscreen includes the host toolbar and visible exit control. Reset exits fullscreen and reconstructs the dashboard.
- Normal-site round trip restores the full site layout and returns to the standalone workbench; refresh initializes the frame successfully. Relock clears the frame and restores the gate, also checked at 667 × 375 landscape.
- First thirteen taps remain silent. Thirty-nine taps unlock; an uninterrupted burst through forty-five leaves the welcome dialog open; explicit Escape closes it.
- Zero browser errors in the end-to-end run.

`check-focus-summary.cjs` additionally verifies keyboard focus across desktop/mobile breakpoints and original chart drilldown/reset updating the collapsed scope summary. The review found and fixed expanded mobile menus covering later focused controls, focus disappearing when a breakpoint hides a control, and summaries becoming stale after non-form filter changes. The scope text observer covers those original render paths without changing calculations.

The existing retry regression (`../round-ten/check-workbench-retry.cjs`) passed: an aborted initial module request exposes the retry state, and retry performs a fresh load successfully. The original frame isolation/CSP remains unchanged.

`pnpm build` passed: 106 files checked, zero errors/warnings/hints in Astro diagnostics, 182 pages generated. The existing large static data/library chunk notice remains. `git diff --check` passed; neither the template nor data file has a diff. No unrelated data refresh was included.


## 2026-09-18: private data migration

The 39-step discovery now exchanges signed progress receipts with a private Worker. The welcome and shared unlocked state appear only after the final server proof. Existing boolean-only unlocks cannot fetch data. First thirteen taps stay silent, the continuing-click dialog guard remains, and requests are cancelled on relock or route cleanup. A navigation race found in review was fixed: shared state completes after a valid proof even if the initiating view was replaced; only its old dialog stays suppressed.

Both the complete dataset and overview aggregates are removed from tracked sources and frontend imports. Structural TypeScript types contain no statistic values. Private copies and a full pre-migration Git bundle are kept outside the website repository. Generators reject output paths inside the repository. The build guard was tested against the previous complete-data build and rejected it; the clean build passes.

The Worker has 14 synthetic tests for signed progress, final-step access, forged/expired/wrong-purpose/origin proofs, retries, renewal, cache headers, body limits, private streams and both data routes. The client passed strict type checking and synthetic tests for queue coalescing, transient errors, storage denial, renewal, retry, reload, abort and late responses. Browser end-to-end tests verified legacy flag rejection, no data request before39, silent13, extra-click protection, exact complete-data equality without printing records, all11modules, remembered refresh, overview round trip and relock. No browser errors.

The interface remains the reviewed full-window layout. This protocol prevents downloading raw JSON from the public repository/static files, but it is not identity authentication and can be automated. History rewrite and removal of old Pages artifacts accompany publishing. GitHub unreachable caches and third-party copies cannot be declared erased solely by rewriting main.
