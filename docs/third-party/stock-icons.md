# Bundled stock icon corrections

China Merchants Bank (A-share 600036 / H-share 03968) uses the bank's official
[mobile-site touch icon](https://s3gw.cmbimg.cn/srd-a2549394cd7491f-1255000101/touch-icon-iphone4.png),
linked by its [official mobile website](https://m.cmbchina.com/).
Downloaded unchanged on 2026-10-29; PNG, 114 × 114 pixels. The previous market
image provider returned a building photograph for 600036.SS.

The local asset filename contains a content hash and is cached for one year.
`src/lib/portfolio/stockIcons.ts` applies exact market/ticker overrides so the
new URL bypasses previously cached incorrect images. Other stock logos retain
their existing provider and caching. Brand marks remain owned by their issuer.
