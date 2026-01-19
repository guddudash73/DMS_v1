'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useGetXrayUrlQuery } from '@/src/store/api';

function XrayOriginal({ xrayId }: { xrayId: string }) {
  const { data } = useGetXrayUrlQuery({ xrayId, size: 'original' });

  return (
    <div className="h-full w-full">
      {data?.url ? (
        <Image src={data.url} alt="X-ray" fill className="object-contain" unoptimized priority />
      ) : (
        <div className="h-full w-full bg-gray-100" />
      )}
    </div>
  );
}

export function XrayPrintSheet(props: {
  open: boolean;
  xrayIds: string[];
  onAfterPrint?: () => void;
}) {
  const { open, xrayIds, onAfterPrint } = props;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;

    const onAfter = () => {
      document.body.classList.remove('print-xray');
      window.removeEventListener('afterprint', onAfter);
      onAfterPrint?.();
    };

    window.addEventListener('afterprint', onAfter);
    document.body.classList.add('print-xray');

    const t = setTimeout(() => {
      window.print();
    }, 250);

    return () => {
      clearTimeout(t);
      document.body.classList.remove('print-xray');
      window.removeEventListener('afterprint', onAfter);
    };
  }, [open, onAfterPrint]);

  const count = xrayIds.length;

  const layoutClass = useMemo(() => {
    if (count <= 1) return 'grid grid-cols-1 grid-rows-1';
    if (count === 2) return 'grid grid-cols-1 grid-rows-2';
    if (count === 3) return 'grid grid-cols-2 grid-rows-2';
    if (count === 4) return 'grid grid-cols-2 grid-rows-2';
    return 'grid grid-cols-3 grid-rows-3';
  }, [count]);

  const items = useMemo(() => {
    if (count <= 4) return xrayIds;
    return xrayIds.slice(0, 9);
  }, [xrayIds, count]);

  if (!mounted) return null;

  return createPortal(
    <div className={`xray-print-root ${open ? '' : 'hidden'} print:block`}>
      <style>{`
        .xray-print-root { display: none; }

        @media print {
          body.print-xray > *:not(.xray-print-root) { display: none !important; }
          body.print-xray .xray-print-root { display: block !important; }

          @page { size: A4; margin: 0; }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .xray-a4 {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            background: white;
            overflow: hidden;
          }
        }
      `}</style>

      <div className="xray-a4">
        <div className={`${layoutClass} h-full w-full gap-0`}>
          {items.map((id) => (
            <div key={id} className="relative h-full w-full border border-black/5">
              <XrayOriginal xrayId={id} />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
