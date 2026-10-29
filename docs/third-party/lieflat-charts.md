# Lieflat Charts visual reference

`src/components/dashboard/CustomAllocationPie.tsx` adapts **G13 · Big Slice
(Custom Pie)** from Lieflat Charts' Glance gallery. It preserves the ECharts
custom-series sector/group structure, inner radius, dashed guide rings,
900 ms cubicOut entrance, 130 ms stagger and radius expansion from the inner ring.

The asset chart uses exact portfolio share for angle and square-root-scaled
category value for radius. Category colors and exact legend values come from crypto-dashboard. Hover,
keyboard, touch and pinned details stay connected to the existing category data.
The chart is loaded lazily with the ECharts custom-chart module and SVG renderer;
reduced-motion users get the final frame without animation.

- Repository: https://github.com/larashero3-dotcom/lieflat-charts
- Reference: https://github.com/larashero3-dotcom/lieflat-charts/blob/main/templates/glance-gallery.html
- Template license: **PolyForm Noncommercial License 1.0.0**
- License terms: https://polyformproject.org/licenses/noncommercial/1.0.0/
- Repository license: https://github.com/larashero3-dotcom/lieflat-charts/blob/main/LICENSE

The reference supplies presentation only. Portfolio values, category assignments,
valuation rules and data sources remain supplied by crypto-dashboard.

Apache ECharts and ZRender are distributed under their own Apache-2.0 / BSD-3-Clause licenses in the installed npm packages.

`src/components/dashboard/ExchangeTreemap.tsx` adapts **F13 · Nested Treemap**,
"Where the work went", from `templates/basics-gallery.html`. It retains two
levels, parent account bands, direct area encoding, `squareRatio: 1.2` and SVG
layout. Colored HTML tiles assemble with a 520 ms eased translation/scale reveal,
staggered by 35 ms. Clicking anywhere in the chart, including account bands, gaps, tiles and icons,
replays the reveal without recreating the chart or refetching balances. Keyboard
activation also replays it. The separate replay button is removed; hover and
keyboard focus retain details. Reduced
motion disables the reveal. Zoom and drill-down are disabled.
The selected site palette colors accounts: light mode uses deeper fills with
white text; dark mode uses lighter fills with black text.
Amounts and quantities respect privacy mode, including tooltips and ARIA text.
Long tails fold into per-account Other tiles without changing their values.
Only positive balance equity enters the chart; futures notional positions are
shown separately. The original table remains available for details and tagging.
Asset icons use the same source-first lookup in centered HTML overlays, hover
details and the original table. Each overlay follows the native SVG tile layout;
icon slot diameter is 32% of the tile's shorter side. Known token logos are
[bundled static assets](token-icons.md), avoiding metadata API rate limits;
the tree upgrades undersized source images where a lookup exists.
Raster images are capped at their native resolution for the device pixel ratio;
unavailable images become letter avatars without changing tile area or values.

- Reference: https://github.com/larashero3-dotcom/lieflat-charts/blob/main/templates/basics-gallery.html

`src/components/dashboard/IbkrScatter.tsx` adapts **F8 · Plumb Scatter**,
"Price against satisfaction, twelve products", from the C4 card and matching
render block in `templates/basics-gallery.html`. The SVG retains hairline
vertical plumbs, a barcode floor, best/worst labels and
staggered circle reveals. It uses the selected site's theme tokens, reveals on
entering the viewport, supports replay and respects reduced motion.

Candidate audit: F8 directly encodes each holding's two numeric metrics. L4 Arc
Matrix expects two categorical dimensions, while L9 Bubble Almanac expects a
category/time matrix; neither matches a current portfolio's weight/return pairs.
F8 therefore supplies the structure without falling back to Glance.

X is absolute USD market value divided by the absolute market value of all
valued IBKR holdings, excluding cash. Y is the existing holding return on cost;
options retain their premium market value, not underlying notional. Valued rows
missing a return remain in the denominator and detail table. Short legs remain
separate, and no jitter changes their actual coordinates. Nearby/overlapping
points share an inspectable tooltip. Filled dots denote stocks, outlined dots
options. Privacy masks axes and tooltip values; keyboard focus and touch expose
the same details as hover. Other broker tables remain unchanged.

All valid holdings remain plotted in both axis modes. At the user's explicit
request, both default axes are nonlinear: each blends interpolated empirical
mid-ranks (80%) with a linear component (20%), expanding dense intervals while
keeping sparse intervals strictly increasing. Duplicate weights retain exactly
the same x coordinate. Both axes include zero and their full bounds; losses
remain below the real zero line and gains above it. A labelled toggle restores
uniform spacing on both axes. Numeric tick marks use their transformed positions, skip labels
that would overlap and retain sub-percent precision. The nonlinear axis is
explicitly labelled on each visible axis and in its accessible description. The
SVG uses an ARIA label without a native title popup, keeping hover details clear. Values
and tooltip percentages are never renormalized or jittered.

Each dot has a small underlying stock logo above it, using the existing cached
stock-logo endpoint. Options reuse their underlying stock's identity. A
deterministic label layout avoids dots and other logos, adding a hairline leader
when a logo is offset; the data coordinates remain unchanged. Optional text
captions yield to logos when crowded. Missing images use the shared letter
fallback. The same logo works as a hover/focus target without adding market-data
or RPC requests.

`src/components/dashboard/AShareRanking.tsx` adapts **F5 · Tick Rows**, C1
"Six teams, shipped and counted", from `templates/basics-gallery.html`.
It retains horizontal tick queues, a common monetary unit, hairline row guides,
every-fifth markers, deterministic tick height/opacity variation and staggered
0.08s-per-row / 0.012s-per-tick reveals. The final fractional tick scales its
height to the remaining fraction of a unit instead of rounding the holding up.
Values stay linear and appear at the row end. All A-share rows share a scale;
long lists scroll rather than silently dropping lower-ranked holdings. The
ranking is capped at 900 px, with compact row spacing and 24 px tick strips;
mobile screens retain the stacked name/value and tick layout.

Candidate audit: F5 directly supports the requested horizontal ranking and
Chinese stock names. L2 Dot Cascade's vertical names make those labels harder
to read; F1 Rung Bars has the same label constraint on a vertical layout.
F5 therefore supplies the structure without using a Glance fallback.

Rows rank nonnegative, valued CNY A-share stock positions by market value, with
names, codes, cached stock logos and shares of the ranked total. Cash and debt
remain in their existing account summaries, outside the tick queues. Missing
costs do not exclude an otherwise valued holding. Unsupported or unavailable
rows remain in the original detail table. Hover and keyboard focus expose
costs, current price, quantity and PnL; privacy masks monetary values, shares
and the unit label. Theme tokens, replay and reduced-motion support match the
other portfolio charts. Broker view preferences remain independent.

All four portfolio charts (allocation pie, exchange treemap, A-share ranking and
IBKR scatter) replay when any part of their chart area is clicked or tapped,
including empty space. Chart clicks no longer pin instrument details. Separate
replay buttons are removed. Hover/focus still exposes details, and existing
category management, view tabs and IBKR axis-mode controls keep their own actions.
Replays use existing in-memory data and do not refetch financial APIs.
