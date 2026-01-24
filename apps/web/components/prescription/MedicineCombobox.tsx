'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import type { MedicineTypeaheadItem, QuickAddMedicineInput } from '@dcm/types';
import { useLazySearchMedicinesQuery, useQuickAddMedicineMutation } from '@/src/store/api';

type Props = {
  value: string;
  onPick: (item: MedicineTypeaheadItem) => void;
  placeholder?: string;

  inputRef?: React.RefObject<HTMLInputElement | null>;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onEnterPicked?: () => void;
};

function LoadingRow({ label = 'Searching…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 text-sm text-gray-500">
      <span className="inline-flex h-4 w-4 items-center justify-center">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function MedicineCombobox({
  value,
  onPick,
  placeholder,
  inputRef,
  triggerRef,
  onEnterPicked,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value);

  const [triggerSearch, search] = useLazySearchMedicinesQuery();
  const [quickAdd, quickAddState] = useQuickAddMedicineMutation();

  React.useEffect(() => {
    setQuery(value);
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) return;
    triggerSearch({ query: q, limit: 10 });
  }, [open, query, triggerSearch]);

  const items = search.data?.items ?? [];

  const isSearching = Boolean(open && (search.isFetching || search.isLoading));

  const canQuickAdd =
    query.trim().length >= 2 && !items.some((i) => i.displayName === query.trim());

  const totalOptions = items.length + (canQuickAdd ? 1 : 0);

  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;

    if (items.length > 0) {
      setActiveIndex(0);
      return;
    }
    if (canQuickAdd) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(0);
  }, [open, items.length, canQuickAdd, query]);

  const doQuickAdd = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const payload: QuickAddMedicineInput = { displayName: trimmed };
    const created = await quickAdd(payload).unwrap();
    onPick(created);
    setOpen(false);
    onEnterPicked?.();
  };

  const pickItem = (item: MedicineTypeaheadItem) => {
    onPick(item);
    setOpen(false);
    onEnterPicked?.();
  };

  const selectActive = () => {
    if (isSearching) return;
    if (totalOptions <= 0) return;

    if (activeIndex < items.length) {
      const item = items[activeIndex];
      if (item) pickItem(item);
      return;
    }

    if (canQuickAdd) {
      void doQuickAdd();
    }
  };

  const moveActive = (delta: number) => {
    if (isSearching) return;
    if (totalOptions <= 0) return;
    setActiveIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return 0;
      if (next > totalOptions - 1) return totalOptions - 1;
      return next;
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          className="w-full justify-between rounded-xl cursor-pointer"
        >
          <span className="truncate text-left">{value || placeholder || 'Select medicine'}</span>

          <span className="ml-2 inline-flex items-center gap-2">
            {open && isSearching ? (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600"
                aria-label="Loading"
              />
            ) : null}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          onKeyDown={(e) => {
            if (!open) return;

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveActive(1);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveActive(-1);
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              selectActive();
              return;
            }
          }}
        >
          <CommandInput
            ref={inputRef as React.Ref<HTMLInputElement>}
            placeholder="Search medicine..."
            value={query}
            onValueChange={setQuery}
          />

          <CommandList>
            {isSearching ? (
              <CommandGroup heading="Searching">
                {/* Using a plain div keeps it simple and reliable inside shadcn CommandList */}
                <LoadingRow label="Fetching medicines…" />
              </CommandGroup>
            ) : null}

            {!isSearching ? <CommandEmpty>No medicines found.</CommandEmpty> : null}

            <CommandGroup heading="Results">
              {items.map((item, idx) => {
                const isActive = activeIndex === idx;

                return (
                  <CommandItem
                    key={item.id}
                    value={item.displayName}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onSelect={() => pickItem(item)}
                    aria-selected={isActive}
                    data-selected={isActive ? 'true' : 'false'}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === item.displayName ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{item.displayName}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {canQuickAdd ? (
              <CommandGroup heading="Create">
                {(() => {
                  const addIndex = items.length;
                  const isActive = activeIndex === addIndex;

                  return (
                    <CommandItem
                      value={`add:${query}`}
                      onMouseEnter={() => setActiveIndex(addIndex)}
                      onSelect={() => void doQuickAdd()}
                      disabled={quickAddState.isLoading || isSearching}
                      aria-selected={isActive}
                      data-selected={isActive ? 'true' : 'false'}
                    >
                      {quickAddState.isLoading ? (
                        <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
                        </span>
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Add “{query.trim()}”
                    </CommandItem>
                  );
                })()}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
