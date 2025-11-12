import { LoginRequest, RefreshRequest, LoginResponse, RefreshResponse } from '@dms/types';

export { LoginRequest, RefreshRequest, LoginResponse, RefreshResponse };

export const parseLoginRequest = (body: unknown) => LoginRequest.parse(body);
export const parseRefreshRequest = (body: unknown) => RefreshRequest.parse(body);
