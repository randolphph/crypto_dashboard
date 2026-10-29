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
levels, parent account bands, direct area encoding, `squareRatio: 1.2`, SVG
rendering and a 900 ms quarticOut reveal. Zoom and drill-down are disabled.
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
