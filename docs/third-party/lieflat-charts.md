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
