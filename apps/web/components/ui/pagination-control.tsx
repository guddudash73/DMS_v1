'use client';

import * as React from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

type Props = {
  page: number; // 1-based
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  siblingCount?: number;
  className?: string;
  disabled?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function range(start: number, end: number) {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function getTokens(params: {
  page: number;
  totalPages: number;
  siblingCount: number;
}): Array<number | '...'> {
  const { page, totalPages, siblingCount } = params;

  const totalNumbersToShow = siblingCount * 2 + 5;
  if (totalPages <= totalNumbersToShow) return range(1, totalPages);

  const left = Math.max(page - siblingCount, 1);
  const right = Math.min(page + siblingCount, totalPages);

  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftCount = 1 + (siblingCount * 2 + 2);
    return [...range(1, leftCount), '...', totalPages];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightCount = 1 + (siblingCount * 2 + 2);
    const start = totalPages - rightCount + 1;
    return [1, '...', ...range(start, totalPages)];
  }

  return [1, '...', ...range(left, right), '...', totalPages];
}

export function PaginationControl({
  page,
  totalItems,
  pageSize,
  onPageChange,
  siblingCount = 1,
  className,
  disabled = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = clamp(page, 1, totalPages);

  if (totalPages <= 1) return null;

  const tokens = React.useMemo(
    () => getTokens({ page: current, totalPages, siblingCount }),
    [current, totalPages, siblingCount],
  );

  const canPrev = current > 1 && !disabled;
  const canNext = current < totalPages && !disabled;

  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={!canPrev}
            tabIndex={!canPrev ? -1 : 0}
            className={!canPrev ? 'pointer-events-none opacity-50' : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (!canPrev) return;
              onPageChange(current - 1);
            }}
          />
        </PaginationItem>

        {tokens.map((t, idx) =>
          t === '...' ? (
            <PaginationItem key={`e-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={t}>
              <PaginationLink
                isActive={t === current}
                onClick={(e) => {
                  e.preventDefault();
                  if (disabled) return;
                  onPageChange(t);
                }}
              >
                {t}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            aria-disabled={!canNext}
            tabIndex={!canNext ? -1 : 0}
            className={!canNext ? 'pointer-events-none opacity-50' : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (!canNext) return;
              onPageChange(current + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
