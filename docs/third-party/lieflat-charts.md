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

Allocation hover details combine the same instrument across exchanges, wallets
and brokers within its assigned category, before sorting by absolute value and
selecting the largest eight. Tokenized US stocks use the existing explicit
ticker association; options retain contract identity. Known crypto symbols
combine across chains/venues while wrapped/staked tokens remain distinct and
unknown onchain namesakes retain chain/contract identity. Category totals and
per-account holdings stay unchanged; source amounts remain in the aggregated
detail model. Merged rows show a muted second line of deduplicated venue labels
(for example Binance · OKX · 链上 · IBKR); wallet names and exchange subaccounts
do not repeat the same venue in this compact line.

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

`src/components/dashboard/AllocationTopHoldings.tsx` adapts **L2 · Dot Cascade**,
"What breaks, stacked and ranked", from `templates/lupi-gallery.html`. Six
ranked columns spread across the available width, mirrored so the largest is
first. The dotted diagonal baseline, stacks of unit dots, distinct top markers
and 50 ms-per-column / 30 ms-per-dot pop stagger follow the template. Horizontal
HTML captions retain shared asset icons, whole-dollar values, shares and venues;
long names remain available through hover/focus. Classic/Palm and light/dark use
the selected site tokens rather than forcing the reference's dark background.

Candidate audit: L4 Arc Matrix would add a second categorical dimension to a
single ranking. F1 Rung Bars retains a bar-like silhouette; F5 Tick Rows already
serves A-shares and uses the tall row layout the user wants to avoid. L2 provides
an unused shape and arranges all six holdings horizontally. The chart and its
loading placeholder stay 140 px high; narrow screens scroll the columns
sideways instead of stacking rows. On desktop, the summary has three adjacent
columns: net assets, the category pie, and a permanently visible data view.
The data view defaults to the six largest non-cash holdings and can switch to
the allocation stream without hiding the pie. There are no expand/collapse
buttons. Tablet uses a two-column summary with the data view beneath; phones
stack the three sections. Pie legend amounts respond to the column's actual
width, rather than the viewport, so labels remain readable in the compact
desktop column. Pie and data-view replay state are independent.

Dots share a real monetary unit with at most ten units in the largest column.
A partial final dot uses sqrt(fraction) for its radius, so its area preserves the
fraction; the outer top ring is an identity marker, not an extra money unit.
Amounts and unit arithmetic are never rounded for geometry. Ranking consolidates
instrument IDs across eligible categories and sorts absolute net market values.
The cash category (stable ID `cash`, including renamed categories) is excluded
from ranked candidates before consolidation. Individual shares and the top-six
combined share use the dashboard's full asset valuation, including cash and
account-level residuals, before liabilities. Filtering the ranking never reduces
this denominator. Options
remain separate contracts; account-level residuals and undetailed equity remain
in pie totals without masquerading as individual holdings. Privacy masks money
and shares, reduced motion disables reveals, and clicking any chart area
replays with no additional finance/RPC requests.

`src/components/dashboard/AllocationStreamgraph.tsx` adapts **F16 · Stream
Ribbon (STREAMGRAPH)**, "Three products trade the same river", from the upstream
`templates/basics-gallery.html` inspected on 2026-10-30. The permanent data-view
selector offers this stream alongside the default top-six Dot Cascade; the
compact pie stays visible in either view. The chart keeps silhouette stacking, quadratic ribbon boundaries,
paper seams, labels in wide interiors, an observation barcode floor and 900 ms
fades staggered by 160 ms. Shared boundaries use reversible midpoint smoothing
so adjacent ribbons meet exactly. The SVG and controls stay within the existing
140 px chart height and use the selected Classic/Palm and light/dark tokens.

F16 was explicitly selected by the user for composition over time. F13 Treemap
and L2 Dot Cascade represent a single current distribution or ranking, so they
cannot express this history. X encodes actual observation timestamps, color
identifies asset categories and vertical ribbon thickness encodes positive USD
category value, or share of the positive category total in percentage mode.
More than five categories fold into the four largest plus Other without losing
value; negative categories remain signed in stored observations and appear
separately in the time-point tooltip. Hover/keyboard inspection snaps to real
observations. Paused records split ribbons, and fewer than two continuous
observations show an honest empty state. Range/metric controls do not replay;
clicking the chart replays without fetching financial data. Reduced motion
disables fades and privacy masks tooltip values.

`useAllocationHistory` observes existing dashboard valuations, including
composition changes with unchanged totals. It stores wallet-scoped records in
the browser's IndexedDB `crypto-dashboard-allocation-history` / `observations`,
with one atomic read/compact/write transaction to preserve concurrent writes.
Existing detailed snapshots backfill only their actual `assetAllocation` data;
total-only history never generates invented category history. Estimated
valuations retain provenance, unavailable valuations record pause boundaries,
and unchanged valuations can record hourly while the dashboard runs. Recent
30-day retention keeps first/last valid observations and pause boundaries per
hour; older data retains one observation nearest local noon plus pause markers
per day, up to three years. Recording makes no new market-data or RPC requests.
It runs only while this dashboard is open in this browser: there is no server
background scheduler or cross-device synchronization. Clearing site storage
removes these local records. Existing net-worth history and its CSV format
remain separate.
