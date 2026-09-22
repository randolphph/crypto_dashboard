# LP row reference QA

- Source visual truth: `/var/folders/_q/ck1hs0d512bgfltklz2w3l2r0000gn/T/TemporaryItems/NSIRD_screencaptureui_djIkzL/截屏2026-09-17 10.50.15.png`
- Implementation capture: `/tmp/lp-reference-row.png`
- Combined comparison: `/tmp/lp-reference-comparison.png`
- Desktop browser viewport: `1600 × 900` CSS px, `deviceScaleFactor: 1`.
- Source dimensions: `1576 × 218` px. Focused implementation dimensions: `1037 × 112` px. The source was normalized to `1037 × 143` px before comparison; the implementation is intentionally shorter because the application shows the metadata and range state in a denser monitor-workspace row.
- Mobile capture: `/tmp/lp-reference-mobile.png`, `390 × 844` CSS px viewport.
- State: Robinhood Uniswap V3 wallet monitor. It contains one active NVDA/USDG position and five closed positions. The comparison is the active row; closed rows are only shown after the explicit toggle.

## Comparison history

### Iteration 1

- Finding [P2]: the raw chain order showed `USDG / NVDA`; a pin-shaped marker and generic dashed line created visual noise; null valuation appeared as bare dashes; mobile placed each data point in a long, one-column list.
- Fix: display the non-stable asset against the stable quote, use one triangular current-price marker with a segmented range bar, create a purposeful `待估值` state, and use a two-column mobile detail grid.

### Iteration 2

- Finding [P2]: the header and summary used raw English API field names, while the desktop row did not read as one coherent LP section.
- Fix: translate the Uniswap summary metrics, place the active/closed count and toggle into one quiet LP section header, align numeric columns to the right, and reduce icon, metadata, and border weight.

### Iteration 3

- Finding [P2]: the current-price marker was an upward-pointing triangle positioned above the distribution bar, unlike the source's subtle downward notch.
- Fix: rotate the marker downward and lower it by one pixel so its tip gently overlaps the segmented distribution bar. Updated focused evidence: `/tmp/lp-reference-row.png`.

### Iteration 4

- Finding [P2]: the user found even the reduced triangle visually distracting.
- Fix: remove the marker entirely. The row now presents an explicit `价格区间位置` percentage above a green-to-neutral segmented progress bar. Updated focused evidence: `/tmp/lp-reference-row.png`.

### Final comparison

- Full-view evidence: `/tmp/lp-reference-desktop.png`.
- Focused evidence: `/tmp/lp-reference-comparison.png`.
- Interaction evidence: `/tmp/verify-lp-reference-layout.cjs` loaded `/monitoring`, selected `rh-lp`, then opened the five closed positions. It reported HTTP 200, the expected five columns and range status, no console errors, and no page errors.
- Desktop result: passed. The implementation preserves the reference hierarchy of pair, fee tier, price range, range distribution, value, and fees without inventing unavailable values.
- Mobile result: passed. Identity, price range and distribution span the card; value and fee data share a compact lower grid with no clipping.

## Required fidelity surfaces

- Fonts and typography: the existing Geist sans hierarchy uses a compact 17 px pair/range emphasis, tabular numeric text, and restrained 12 px metadata. It avoids raw engineering labels in the customer-facing Uniswap summary.
- Spacing and layout rhythm: the row uses five aligned desktop columns and 20 px padding. On mobile, the key full-width fields and the two compact monetary fields remove the prior repeated vertical rhythm.
- Colors and visual tokens: neutral surfaces and low-elevation borders keep the monitor workspace quiet; only range state uses semantic green/amber. The distribution uses olive segments before the current-price marker and neutral segments after it, as in the reference.
- Image and asset fidelity: the reference has product-specific token artwork. The backend snapshot currently has no verified token-image URL, so the implementation deliberately uses the product's existing neutral `Coins` fallback rather than mislabelling an invented token logo.
- Copy and data: `positionValueUsd` and `feesValueUsd` are wired as the value sources. This live snapshot returns both as `null` with `valuationStatus: unavailable`; the UI therefore says `待估值` and explains the limitation instead of fabricating dollar amounts.

## Follow-up polish

- [P3] Use trusted token image URLs when the API exposes them.
- [P3] Render `US$` value and fee totals automatically as soon as the backend returns non-null `positionValueUsd` and `feesValueUsd`.

final result: passed
