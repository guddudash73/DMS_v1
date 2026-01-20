// apps/api/src/realtime/wsClient.ts
import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';

let client: ApiGatewayManagementApiClient | null = null;
let cachedEndpoint: string | null = null;

export function getWsClient(): ApiGatewayManagementApiClient | null {
  const endpoint = process.env.REALTIME_WS_ENDPOINT;

  if (!endpoint) {
    // CloudWatch will show this clearly
    console.warn('[realtime] REALTIME_WS_ENDPOINT missing in this Lambda; cannot publish');
    return null;
  }

  if (!client || cachedEndpoint !== endpoint) {
    cachedEndpoint = endpoint;
    client = new ApiGatewayManagementApiClient({ endpoint });
  }

  return client;
}
