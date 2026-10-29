# Palm site theme

The optional **Palm / 椰林绿** theme uses the Lieflat Charts palette from
[`color-presets.js`](https://github.com/larashero3-dotcom/lieflat-charts/blob/main/color-presets.js).
The shared light theme is paper `#F0EFEB`, brown text `#58402E`, forest
`#43593B`, olive `#77835A` / `#ACAD79`, wheat `#F2D17E` and amber `#D4A017`.
Dark surfaces and chart colors extend the preset's dark forest palette.

`src/app/globals.css` owns the light and dark values. Components use semantic
roles (`primary`, `positive`, `negative`, `warning`, `critical`, `muted`) rather
than individual Tailwind hue/shade classes. Buttons, navigation, cards, forms,
tables, dialogs, login and chart furniture share these roles. Positive amounts
use forest/olive; losses and destructive actions use a muted terracotta state
color so they remain distinct from normal data and warnings.

Chart fills use `--chart-1` through `--chart-8`, selected from Palm's category
and green ramp colors. Labels use foreground text where pale fills would not
give sufficient contrast. `src/lib/theme/colors.ts` assigns stable presentation
roles to asset category IDs. It resolves older stored category colors at render
time without rewriting names, asset assignments, stock mappings or values.
The category chart, legend, dropdown and category manager use the same roles.
ECharts resolves those CSS variables when painting and repaints on a theme switch.

Intrinsic third-party logo artwork retains its identity; surrounding UI uses
Palm. The site's own icon supports light and dark Palm colors.

The chart template attribution and license are in
[`third-party/lieflat-charts.md`](third-party/lieflat-charts.md).


The default color scheme is **Classic / 经典**, using the original neutral
surfaces and colorful chart series. The header's appearance menu selects
Classic or Palm independently from light, dark and system mode. The palette is
stored under `crypto-dashboard-color-scheme`; next-themes keeps the existing
`theme` preference. An inline head script restores the selected palette before
paint, invalid/missing values use Classic, and storage events synchronize tabs.
Charts observe palette and mode changes; no financial data or classifications
are changed when switching themes.

The dashboard retains the original Classic text and icon colors with the
`classic:` variant. Palm keeps the semantic palette. Portfolio history lines
and event markers use dedicated palette tokens so Classic retains its original
emerald/red series independently from green/red text.
