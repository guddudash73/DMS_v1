/// <reference path="../.sst/platform/config.d.ts" />

/**
 * Define Secrets ONCE and reuse across stacks.
 * Avoid duplicate Secret resources (same logical name) in multiple modules.
 */
export const jwtAccessSecret = new sst.Secret('JWT_ACCESS_SECRET');
export const jwtRefreshSecret = new sst.Secret('JWT_REFRESH_SECRET');
