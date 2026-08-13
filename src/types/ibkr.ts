export interface IbkrExecution {
  /** Local date/time as configured in the Flex Query, without a timezone. */
  occurredAt: string;
  instrumentType: 'stock' | 'option' | 'future';
  market: string;
  symbol: string;
  name?: string;
  underlying?: string;
  expiry?: string;
  strike?: number;
  optionType?: 'call' | 'put';
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  currency: string;
  multiplier: number;
  commission: number;
  cashFlow?: number;
  externalId: string;
  note?: string;
}
