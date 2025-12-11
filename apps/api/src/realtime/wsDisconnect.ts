import { removeConnection } from './connectionStore';

interface ApiGatewayWebsocketDisconnectEvent {
  requestContext: {
    connectionId: string;
  };
}

interface LambdaResponse {
  statusCode: number;
  body?: string;
}

export const handler = async (
  event: ApiGatewayWebsocketDisconnectEvent,
): Promise<LambdaResponse> => {
  const { connectionId } = event.requestContext;
  await removeConnection(connectionId);

  return { statusCode: 200, body: 'Disconnected' };
};
