import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { getWsClient } from './wsClient';
import { touchConnectionTtl } from './connectionStore';

interface LambdaResponse {
  statusCode: number;
  body?: string;
}

type WsEvent = {
  requestContext?: {
    routeKey?: string;
    connectionId?: string;
  };
  body?: string | null;
};

export const handler = async (event: WsEvent): Promise<LambdaResponse> => {
  const routeKey = event.requestContext?.routeKey;
  const connectionId = event.requestContext?.connectionId;

  if (routeKey === '$default' && connectionId && event.body) {
    try {
      const msg = JSON.parse(event.body) as { type?: string };

      if (msg.type === 'ping') {
        // keep the connection record fresh (even if disconnect never fires)
        await touchConnectionTtl(connectionId);

        // send pong back over websocket
        const wsClient = getWsClient();
        if (wsClient) {
          await wsClient.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: Buffer.from(JSON.stringify({ type: 'pong' })),
            }),
          );
        }

        return { statusCode: 200, body: 'OK' };
      }
    } catch {
      // ignore bad payloads
    }
  }

  return { statusCode: 200, body: 'OK' };
};
