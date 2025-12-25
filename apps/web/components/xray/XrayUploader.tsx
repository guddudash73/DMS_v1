// apps/web/components/xray/XrayUploader.tsx
'use client';

import { useMemo, useRef, useState } from 'react';
import type { XrayContentType } from '@dms/types';
import { Button } from '@/components/ui/button';
import { toast } from 'react-toastify';
import { usePresignXrayUploadMutation, useRegisterXrayMetadataMutation } from '@/src/store/api';
import { useSelector } from 'react-redux';
import type { RootState } from '@/src/store';
import { cn } from '@/lib/utils';

type Props = {
  visitId: string;
  onUploaded?: () => void;
  variant?: 'outline' | 'default';
  className?: string;
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_SIZE_BYTES = 1024;

const toContentType = (file: File): XrayContentType | null => {
  if (file.type === 'image/jpeg') return 'image/jpeg';
  if (file.type === 'image/png') return 'image/png';
  return null;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (pct: number) => void,
  signalRef: React.MutableRefObject<XMLHttpRequest | null>,
) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signalRef.current = xhr;

    xhr.open('PUT', url, true);

    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress(pct);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new Error(`Upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));

    xhr.send(file);
  });
}

export function XrayUploader({ visitId, onUploaded, variant = 'default', className }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [progress, setProgress] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const [presign] = usePresignXrayUploadMutation();
  const [registerMeta] = useRegisterXrayMetadataMutation();

  const userId = useSelector((s: RootState) => s.auth.userId);

  const buttonLabel = useMemo(() => {
    if (!busy) return 'Upload X-Ray';
    if (progress > 0 && progress < 100) return `Uploading… ${progress}%`;
    return 'Uploading…';
  }, [busy, progress]);

  const pickFile = () => fileInputRef.current?.click();

  const cancel = () => {
    if (xhrRef.current) xhrRef.current.abort();
  };

  const handleFile = async (file: File) => {
    const contentType = toContentType(file);
    if (!contentType) {
      toast.error('Only JPG/PNG images are supported.');
      return;
    }
    if (file.size < MIN_SIZE_BYTES) {
      toast.error('File too small.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('File too large (max 10MB).');
      return;
    }

    if (!userId) {
      toast.error('Missing user session. Please re-login.');
      return;
    }

    setBusy(true);
    setProgress(0);

    try {
      const presignRes = await presign({
        visitId,
        contentType,
        size: file.size,
      }).unwrap();

      const maxAttempts = 3;
      let lastErr: unknown = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await putWithProgress(
            presignRes.uploadUrl,
            file,
            presignRes.headers ?? { 'Content-Type': contentType },
            (pct) => setProgress(pct),
            xhrRef,
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt === maxAttempts) break;
          await sleep(200 * attempt);
        }
      }

      if (lastErr) throw lastErr;

      await registerMeta({
        visitId,
        xrayId: presignRes.xrayId,
        contentType,
        size: file.size,
        takenAt: Date.now(),
        contentKey: presignRes.key,
        takenByUserId: userId,
      } as any).unwrap();

      toast.success('X-ray uploaded.');
      onUploaded?.();
    } catch (err: any) {
      toast.error(err?.message ?? 'Upload failed.');
    } finally {
      setBusy(false);
      setProgress(0);
      xhrRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      <Button
        type="button"
        variant={variant}
        onClick={pickFile}
        disabled={busy}
        className={cn(
          'rounded-xl',
          variant === 'default' ? 'bg-black text-white hover:bg-black/90' : '',
          className,
        )}
      >
        {buttonLabel}
      </Button>

      {busy && (
        <Button type="button" variant="ghost" onClick={cancel} className="rounded-xl">
          Cancel
        </Button>
      )}
    </div>
  );
}
