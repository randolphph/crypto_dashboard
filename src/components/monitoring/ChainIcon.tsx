import { Network } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChainIcon({ chainId, className }: { chainId: number; className?: string }) {
  if (chainId === 1) {
    return (
      <span className={cn('inline-flex size-8 shrink-0 items-center justify-center', className)} aria-hidden="true">
        <svg data-chain-logo="1" viewBox="0 0 256 421" className="h-[82%] w-auto">
          <path fill="#8A92B2" d="M128 0 0 206.2 128 281.9V0Z" />
          <path fill="#62688F" d="m128 0 128 206.2-128 75.7V0Z" />
          <path fill="#454A75" d="m128 154.1 128 52.1-128 75.7V154.1Z" />
          <path fill="#62688F" d="M128 154.1 0 206.2l128 75.7V154.1Z" />
          <path fill="#8A92B2" d="M128 306.1V421L0 230.4l128 75.7Z" />
          <path fill="#62688F" d="M128 421V306.1l128-75.7L128 421Z" />
        </svg>
      </span>
    );
  }

  if (chainId === 56) {
    return (
      <span className={cn('inline-flex size-8 shrink-0 items-center justify-center', className)} aria-hidden="true">
        <svg data-chain-logo="56" viewBox="0 0 24 24" className="size-[78%] fill-[#F0B90B]">
          <path d="m16.624 13.92 2.718 2.716-7.354 7.353-7.353-7.352 2.718-2.717 4.635 4.66 4.636-4.66Zm4.637-4.636L24 12l-2.715 2.716L18.568 12l2.693-2.716Zm-9.273 0 2.717 2.692-2.717 2.717L9.272 12l2.716-2.716Zm-9.272 0L5.409 12l-2.692 2.692L0 12l2.716-2.716ZM11.988.012l7.354 7.328-2.718 2.716-4.636-4.636-4.635 4.66-2.717-2.716L11.988.012Z" />
        </svg>
      </span>
    );
  }

  if (chainId === 4663) {
    return (
      <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#CCFF00]', className)} aria-hidden="true">
        <svg data-chain-logo="4663" viewBox="-22 -14 204 235" className="h-[74%] w-auto fill-black">
          <path d="M102.68 48.63C79.28 74.66 41.98 118.13 7.71 205.9c-.41.69-1.1 1.11-1.93 1.11H1.24c-.96 0-1.51-.55-1.1-1.66 4.54-16.89 10.74-35.58 20.51-63.13v-38.21c0-7.34 1.1-12.46 5.51-18l30-37.38c.96-1.38 2.34-1.94 3.85-1.94h41.84c1.38 0 1.79.83.83 1.94Z" />
          <path d="M152.23 5.58c7.3 7.75 8.26 26.44 6.61 38.62-1.24 8.31-2.61 10.11-7.16 16.06l-27.94 36.69c-.83 1.25-1.93.83-1.93-.55V43.79c0-4.29-2.48-6.78-6.74-6.78H68.69c-1.38 0-1.79-.97-.83-1.94 7.85-8.31 16.1-16.75 28.49-27.41 2.75-2.49 4.13-2.77 6.74-4.01 13.49-5.26 42.67-4.98 49.14 1.94Z" />
          <path d="M112.04 58.04v52.88c0 .69-.14 1.66-.55 2.49l-19.13 31.7c-2.34 3.88-5.09 6.09-9.91 7.34l-42.94 13.29c-1.24.41-1.93-.42-1.38-1.52 20.78-40.84 43.22-74.76 71.98-107.01.96-1.11 1.93-.55 1.93.83Z" />
        </svg>
      </span>
    );
  }

  if (chainId === 9745) {
    return (
      <span
        className={cn('inline-flex size-8 shrink-0 bg-contain bg-center bg-no-repeat', className)}
        style={{ backgroundImage: "url('/brands/plasma-xpl-mark.svg')" }}
        aria-hidden="true"
        data-chain-logo="9745"
      />
    );
  }

  return <Network aria-hidden="true" className={cn('size-8 shrink-0 text-muted-foreground', className)} />;
}
