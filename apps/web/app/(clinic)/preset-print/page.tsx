'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import type { RxLineType } from '@dcm/types';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RxPresetImportDialog } from '@/components/prescription/RxPresetImportDialog';
import { MedicinesEditor } from '@/components/prescription/MedicinesEditor';

const A4_W = 794;
const A4_H = 1123;

const timingLabel = (t?: RxLineType['timing']) => {
  if (!t) return undefined;
  if (t === 'BEFORE_MEAL') return 'Before meal';
  if (t === 'AFTER_MEAL') return 'After meal';
  return 'Any time';
};

function PresetBlock({ lines }: { lines: RxLineType[] }) {
  return (
    <div className="h-full w-full p-2">
      <div className="text-[12px] font-semibold text-gray-900">Prescription</div>

      <div className="mt-2 space-y-2 text-[12px] leading-snug text-gray-900">
        {lines.length === 0 ? (
          <div className="text-gray-500">No medicines</div>
        ) : (
          lines.map((l, idx) => {
            const metaParts = [
              l.dose,
              l.amountPerDose,
              l.frequency,
              l.quantity,
              timingLabel(l.timing),
            ].filter(Boolean);

            return (
              <div key={idx} className="flex gap-2">
                <div className="w-5 shrink-0 text-gray-500">{idx + 1}.</div>

                <div className="min-w-0">
                  <div className="font-semibold">{l.medicine}</div>

                  {metaParts.length > 0 ? (
                    <div className="text-gray-700">{metaParts.join(' • ')}</div>
                  ) : null}

                  {l.notes?.trim() ? <div className="mt-0.5 text-gray-700">{l.notes}</div> : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function PresetPrintPage() {
  const [importOpen, setImportOpen] = useState(false);
  const [lines, setLines] = useState<RxLineType[]>([]);
  const [box, setBox] = useState({ x: 60, y: 80, w: 280, h: 180 });

  const hasLines = lines.length > 0;

  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setWrapW(w);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const previewScale = useMemo(() => {
    if (!wrapW) return 1;
    return Math.min(wrapW / A4_W, 0.85);
  }, [wrapW]);

  const previewOuterStyle = useMemo(
    () => ({
      height: Math.round(A4_H * previewScale),
    }),
    [previewScale],
  );

  const previewInnerStyle = useMemo(
    () => ({
      width: A4_W,
      height: A4_H,
      transform: `scale(${previewScale})`,
      transformOrigin: 'top left',
    }),
    [previewScale],
  );

  const print = () => window.print();

  return (
    <div className="w-full p-4">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #preset-print-root, #preset-print-root * { visibility: visible !important; }
          #preset-print-root {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: ${A4_W}px !important;
            height: ${A4_H}px !important;
            background: white !important;
            overflow: hidden !important;
          }
          .preset-grid { display: none !important; }
          .preset-rnd-outline { outline: none !important; }
        }
      `}</style>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* LEFT */}
        <div className="xl:col-span-7 h-full">
          <Card className="rounded-2xl border bg-white p-4 h-full">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Preset Editor</div>
                <div className="text-sm text-gray-500">
                  Import preset, then edit medicines before printing.
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setImportOpen(true)}
                >
                  Import
                </Button>

                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setLines([]);
                    setBox({ x: 60, y: 80, w: 280, h: 180 });
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <MedicinesEditor lines={lines} onChange={setLines} />
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="xl:col-span-5">
          <Card className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Preset Print</div>
                <div className="text-sm text-gray-500">
                  Drag + resize the preset block on the blank A4 sheet, then print.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button className="rounded-xl" disabled={!hasLines} onClick={print}>
                  Print
                </Button>

                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={!hasLines}
                  onClick={() => setBox({ x: 60, y: 80, w: 280, h: 180 })}
                >
                  Reset Position
                </Button>
              </div>
            </div>

            <div className="mt-0">
              <div
                ref={previewWrapRef}
                className="w-full overflow-hidden rounded-xl border bg-white"
                style={previewOuterStyle}
              >
                <div className="relative" style={previewInnerStyle}>
                  <div className="preset-grid pointer-events-none absolute inset-0 opacity-[0.06]">
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundImage:
                          'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                      }}
                    />
                  </div>

                  {hasLines ? (
                    <Rnd
                      bounds="parent"
                      scale={previewScale}
                      size={{ width: box.w, height: box.h }}
                      position={{ x: box.x, y: box.y }}
                      onDragStop={(_e, d) => setBox((b) => ({ ...b, x: d.x, y: d.y }))}
                      onResizeStop={(_e, _dir, ref, _delta, pos) => {
                        setBox({
                          x: pos.x,
                          y: pos.y,
                          w: ref.offsetWidth,
                          h: ref.offsetHeight,
                        });
                      }}
                      minWidth={80}
                      minHeight={60}
                      className="preset-rnd-outline rounded-md outline outline-dashed outline-gray-300"
                    >
                      <PresetBlock lines={lines} />
                    </Rnd>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                      Import a preset to place it on the A4 sheet.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Preview is scaled smaller. Printing is always true A4 size.
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* PRINT ROOT */}
      <div
        id="preset-print-root"
        className="pointer-events-none fixed -left-[25000px] top-0 bg-white"
        style={{ width: A4_W, height: A4_H }}
      >
        {hasLines ? (
          <div className="relative h-full w-full">
            <div
              style={{
                position: 'absolute',
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
              }}
            >
              <PresetBlock lines={lines} />
            </div>
          </div>
        ) : null}
      </div>

      <RxPresetImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        disabled={false}
        append={false}
        existingCount={lines.length}
        onImport={(importedLines) => {
          setLines(importedLines);
          setBox({ x: 60, y: 80, w: 280, h: 180 });
        }}
      />
    </div>
  );
}
