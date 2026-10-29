# Bundled token icons

57 high-resolution token logos are served from `public/token-icons` so displaying known assets does not require CoinGecko API or RPC calls at runtime. These brand marks identify the corresponding assets; ownership remains with each project.

`next.config.ts` sets `Cache-Control: public, max-age=31536000, immutable` for `/token-icons/*`. Browsers can reuse downloaded images for one year without revalidation on ordinary visits. Files use content hashes, so an updated image receives a new URL. Clearing browser caches, forced reloads or cache eviction can cause another download from this website.

The files were downloaded on 2026-10-29 from CoinGecko image URLs returned for exact coin IDs by the [coins/markets endpoint](https://docs.coingecko.com/reference/coins-markets). File names include a SHA-256 prefix so refreshing an image changes its browser cache key. Images are fetched only when their assets are displayed; the full set is not loaded upfront.

To refresh, query the existing exact IDs in one batch, verify the returned identities and image content, replace the affected asset file and update `src/lib/portfolio/tokenIcons.ts`. Do not resolve ambiguous ticker searches automatically.

| Symbol | Coin ID | Original image |
| --- | --- | --- |
| BTC | bitcoin | [Source](https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400) |
| ETH | ethereum | [Source](https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628) |
| SOL | solana | [Source](https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756) |
| USDT | tether | [Source](https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661) |
| USDC | usd-coin | [Source](https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602) |
| WBTC | wrapped-bitcoin | [Source](https://coin-images.coingecko.com/coins/images/7598/large/WBTCLOGO.png?1764496367) |
| WETH | weth | [Source](https://coin-images.coingecko.com/coins/images/2518/large/weth.png?1696503332) |
| BNB | binancecoin | [Source](https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970) |
| DOGE | dogecoin | [Source](https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409) |
| XRP | ripple | [Source](https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442) |
| ADA | cardano | [Source](https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090) |
| AVAX | avalanche-2 | [Source](https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369) |
| DOT | polkadot | [Source](https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg?1766533446) |
| MATIC | matic-network | [Source](https://coin-images.coingecko.com/coins/images/4713/large/polygon.png?1698233745) |
| LINK | chainlink | [Source](https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405) |
| UNI | uniswap | [Source](https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669) |
| AAVE | aave | [Source](https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354) |
| ARB | arbitrum | [Source](https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242) |
| OP | optimism | [Source](https://coin-images.coingecko.com/coins/images/25244/large/Token.png?1774456081) |
| DAI | dai | [Source](https://coin-images.coingecko.com/coins/images/9956/large/Badge_Dai.png?1696509996) |
| FDUSD | first-digital-usd | [Source](https://coin-images.coingecko.com/coins/images/31079/large/FDUSD_icon_black.png?1731097953) |
| TUSD | true-usd | [Source](https://coin-images.coingecko.com/coins/images/3449/large/tusd.png?1696504140) |
| PYUSD | paypal-usd | [Source](https://coin-images.coingecko.com/coins/images/31212/large/PYUSD_Token_Logo_2x.png?1765987788) |
| USDP | paxos-standard | [Source](https://coin-images.coingecko.com/coins/images/6013/large/Pax_Dollar.png?1696506427) |
| POL | polygon-ecosystem-token | [Source](https://coin-images.coingecko.com/coins/images/32440/large/pol.png?1759114181) |
| ENA | ethena | [Source](https://coin-images.coingecko.com/coins/images/36530/large/ethena.png?1711701436) |
| SUI | sui | [Source](https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png?1727791290) |
| TRX | tron | [Source](https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png?1776048311) |
| LTC | litecoin | [Source](https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400) |
| BCH | bitcoin-cash | [Source](https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932) |
| ETC | ethereum-classic | [Source](https://coin-images.coingecko.com/coins/images/453/large/ethereum-classic-logo.png?1696501717) |
| NEAR | near | [Source](https://coin-images.coingecko.com/coins/images/10365/large/near.jpg?1696510367) |
| SHIB | shiba-inu | [Source](https://coin-images.coingecko.com/coins/images/11939/large/shiba.png?1696511800) |
| PEPE | pepe | [Source](https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776) |
| HYPE | hyperliquid | [Source](https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg?1729431300) |
| USDE | ethena-usde | [Source](https://coin-images.coingecko.com/coins/images/33613/large/usde.png?1733810059) |
| STETH | staked-ether | [Source](https://coin-images.coingecko.com/coins/images/13442/large/steth_logo.png?1696513206) |
| WSTETH | wrapped-steth | [Source](https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png?1696518295) |
| EIGEN | eigenlayer | [Source](https://coin-images.coingecko.com/coins/images/37441/large/eigencloud.jpg?1751003565) |
| PENDLE | pendle | [Source](https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728) |
| TIA | celestia | [Source](https://coin-images.coingecko.com/coins/images/31967/large/tia.jpg?1696530772) |
| ONDO | ondo-finance | [Source](https://coin-images.coingecko.com/coins/images/26580/large/ONDO.png?1696525656) |
| WLD | worldcoin-wld | [Source](https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903) |
| APT | aptos | [Source](https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Profile-Picture_%281%29.png?1788259511) |
| SEI | sei-network | [Source](https://coin-images.coingecko.com/coins/images/28205/large/Sei_Logo_-_Transparent.png?1696527207) |
| RENDER | render-token | [Source](https://coin-images.coingecko.com/coins/images/11636/large/rndr.png?1696511529) |
| INJ | injective-protocol | [Source](https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212) |
| FET | fetch-ai | [Source](https://coin-images.coingecko.com/coins/images/5681/large/ASI.png?1719827289) |
| TAO | bittensor | [Source](https://coin-images.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg?1696527447) |
| FIL | filecoin | [Source](https://coin-images.coingecko.com/coins/images/12817/large/filecoin.png?1696512609) |
| ICP | internet-computer | [Source](https://coin-images.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png?1696514180) |
| JUP | jupiter-exchange-solana | [Source](https://coin-images.coingecko.com/coins/images/34188/large/jup.png?1704266489) |
| JTO | jito-governance-token | [Source](https://coin-images.coingecko.com/coins/images/33228/large/jto.png?1701137022) |
| CAKE | pancakeswap-token | [Source](https://coin-images.coingecko.com/coins/images/12632/large/pancakeswap-cake-logo_%281%29.png?1696512440) |
| BUSD | binance-usd | [Source](https://coin-images.coingecko.com/coins/images/9576/large/busd.png?1785507511) |
| USD1 | usd1-wlfi | [Source](https://coin-images.coingecko.com/coins/images/54977/large/USD1_1000x1000_transparent.png?1749297002) |
| USD0 | usual-usd | [Source](https://coin-images.coingecko.com/coins/images/38272/large/USD0LOGO.png?1716962811) |
