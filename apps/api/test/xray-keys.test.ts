import { describe, it, expect } from 'vitest';
import type { XrayContentType } from '@dcm/types';
import { buildXrayObjectKey } from '../src/routes/xray';

describe('X-ray key layout', () => {
  it('build deterministic keys for original and thumb variants', () => {
    const visitId = 'visit-123';
    const xrayId = 'xray-abc';

    const jpeg: XrayContentType = 'image/jpeg';

    const jpegKeyoriginal = buildXrayObjectKey(visitId, xrayId, 'original', jpeg);
    const jpegKeyThumb = buildXrayObjectKey(visitId, xrayId, 'thumb', jpeg);

    expect(jpegKeyoriginal).toBe('xray/visit-123/xray-abc/original.jpg');
    expect(jpegKeyThumb).toBe('xray/visit-123/xray-abc/thumb.jpg');
  });
});
