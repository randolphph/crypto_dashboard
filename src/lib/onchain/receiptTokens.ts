// Default DeFi receipt-token symbols for the symbol-based double-count filter.
// User can override this list via the settings UI; the active list is sent
// from the client on each /api/onchain request.
//
// Extend when you discover a protocol whose receipt token slips through both
// OKX's lpTokenAddressList and the address+amount match.
export const DEFAULT_RECEIPT_TOKEN_SYMBOLS: string[] = [
  // ETH liquid staking / restaking
  'stETH', 'wstETH', 'rETH', 'cbETH', 'wbETH', 'mETH', 'swETH', 'osETH', 'oETH',
  'frxETH', 'sfrxETH', 'ETHx', 'weETH', 'ezETH', 'rsETH', 'pufETH',
  // SOL liquid staking
  'mSOL', 'jitoSOL', 'JitoSOL', 'bSOL', 'bnSOL', 'INF', 'jupSOL', 'JupSOL',
  // Compound v2 / v3
  'cETH', 'cUSDC', 'cDAI', 'cWBTC', 'cUSDT', 'cBAT', 'cZRX',
  'cUSDCv3', 'cUSDTv3', 'cWETHv3',
  // GMX
  'GLP', 'fsGLP', 'sGLP', 'GLV',
  // Sky / MakerDAO / Frax
  'sDAI', 'sUSDe', 'sUSDS', 'sFRAX',
];
