// apps/api/src/realtime/wsClient.ts
import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';

let client: ApiGatewayManagementApiClient | null = null;
let cachedEndpoint: string | null = null;

export function getWsClient(): ApiGatewayManagementApiClient | null {
  const endpoint = process.env.REALTIME_WS_ENDPOINT;
  const region = process.env.APP_REGION ?? process.env.AWS_REGION;

  if (!endpoint) {
    console.warn('[realtime] REALTIME_WS_ENDPOINT not set; cannot publish');
    return null;
  }
  if (!region) {
    console.warn('[realtime] APP_REGION/AWS_REGION not set; cannot publish');
    return null;
  }

  if (!client || cachedEndpoint !== endpoint) {
    cachedEndpoint = endpoint;
    client = new ApiGatewayManagementApiClient({
      endpoint,
      region,
    });
    console.log('[realtime] ws client initialized', { endpoint, region });
  }

  return client;
}
