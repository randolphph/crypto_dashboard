'use client';

import { assetCategoryColor } from '@/lib/theme/colors';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CategoryOption { id: string; name: string; color?: string }

export function CategoryDropdown({ label, value, categories, onValueChange, compact = false }: {
  label: string;
  value: string;
  categories: CategoryOption[];
  onValueChange: (value: string) => void;
  compact?: boolean;
}) {
  const selected = categories.find((category) => category.id === value);
  return <Select value={value} onValueChange={(next) => { if (next) onValueChange(next); }}>
    <SelectTrigger size="sm" aria-label={label} title={selected?.name} className={`gap-1.5 border-transparent bg-muted/50 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-[size=sm]:rounded-md dark:bg-muted/40 dark:hover:bg-muted [&_svg]:size-3 ${compact ? 'max-w-28 px-1.5 py-0 text-[10px] data-[size=sm]:h-5' : 'max-w-40 px-2'}`}>
      <SelectValue className="min-w-0 gap-1.5">
        {selected?.color && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: assetCategoryColor(selected) }} />}
        <span className="truncate">{selected?.name}</span>
      </SelectValue>
    </SelectTrigger>
    <SelectContent align="start" alignItemWithTrigger={false} sideOffset={5} className="w-max max-w-[min(18rem,calc(100vw-2rem))] min-w-40">
      <SelectGroup>
        {categories.map((category) => <SelectItem key={category.id} value={category.id} label={category.name} className="cursor-pointer py-2 pl-2 text-xs data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_[data-slot=select-item-indicator]_svg]:size-3">
          {category.color && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: assetCategoryColor(category) }} />}
          <span className="max-w-56 truncate">{category.name}</span>
        </SelectItem>)}
      </SelectGroup>
    </SelectContent>
  </Select>;
}
