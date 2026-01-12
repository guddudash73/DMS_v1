import { LoginRequest, RefreshRequest, LoginResponse, RefreshResponse } from '@dcm/types';

export { LoginRequest, RefreshRequest, LoginResponse, RefreshResponse };

export const parseLoginRequest = (body: unknown) => LoginRequest.parse(body);
export const parseRefreshRequest = (body: unknown) => RefreshRequest.parse(body);
