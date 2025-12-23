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

import type { MedicineTypeaheadItem, QuickAddMedicineInput } from '@dms/types';
import { useLazySearchMedicinesQuery, useQuickAddMedicineMutation } from '@/src/store/api';

type Props = {
  value: string;
  onPick: (item: MedicineTypeaheadItem) => void;
  placeholder?: string;

  // optional (for keyboard flow in MedicinesEditor)
  inputRef?: React.RefObject<HTMLInputElement | null>;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onEnterPicked?: () => void;
};

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
          className="w-full justify-between rounded-xl"
        >
          <span className="truncate text-left">{value || placeholder || 'Select medicine'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
            ref={inputRef as any}
            placeholder="Search medicine..."
            value={query}
            onValueChange={setQuery}
          />

          <CommandList>
            <CommandEmpty>No medicines found.</CommandEmpty>

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
                      disabled={quickAddState.isLoading}
                      aria-selected={isActive}
                      data-selected={isActive ? 'true' : 'false'}
                    >
                      <Plus className="mr-2 h-4 w-4" />
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
