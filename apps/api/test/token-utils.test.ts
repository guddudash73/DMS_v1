import { describe, it, expect } from 'vitest';
import { buildTokenPair, verifyAccessToken, verifyRefreshToken } from '../src/lib/authTokens';

describe('authTokens', () => {
  it('buildTokenPair issues valid access and refresh tokens', () => {
    const userId = 'user-123';
    const role = 'DOCTOR';

    const pair = buildTokenPair(userId, role);

    const accessClaims = verifyAccessToken(pair.access.token);
    expect(accessClaims.sub).toBe(userId);
    expect(accessClaims.role).toBe(role);

    const refreshClaims = verifyRefreshToken(pair.refresh.token);
    expect(refreshClaims.sub).toBe(userId);
    expect(refreshClaims.role).toBe(role);
    expect(refreshClaims.jti).toBeTruthy();
    expect(refreshClaims.type).toBe('refresh');
  });
});
