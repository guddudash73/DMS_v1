import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';

const REALTIME_WS_ENDPOINT = process.env.REALTIME_WS_ENDPOINT;

let client: ApiGatewayManagementApiClient | null = null;

export function getWsClient(): ApiGatewayManagementApiClient | null {
  if (!REALTIME_WS_ENDPOINT) return null;

  if (!client) {
    client = new ApiGatewayManagementApiClient({
      endpoint: REALTIME_WS_ENDPOINT,
    });
  }
  return client;
}
