import { addConnection } from './connectionStore';
import { verifyAccessToken } from '../lib/authTokens';

interface ApiGatewayWebsocketConnectEvent {
  requestContext: {
    connectionId: string;
  };
  queryStringParameters?: Record<string, string | undefined>;
}

interface LambdaResponse {
  statusCode: number;
  body?: string;
}

export const handler = async (event: ApiGatewayWebsocketConnectEvent): Promise<LambdaResponse> => {
  const { connectionId } = event.requestContext;
  const token = event.queryStringParameters?.token;

  console.log('[realtime] $connect invoked', {
    connectionId,
    hasToken: !!token,
  });

  if (!token) {
    return { statusCode: 401, body: 'Missing token' };
  }

  try {
    const auth = verifyAccessToken(token);

    await addConnection({
      connectionId,
      userId: auth.sub,
      createdAt: Date.now(),
    });

    return { statusCode: 200, body: 'Connected' };
  } catch (err) {
    const error = err as Error & { name?: string };

    console.error('[realtime] $connect failed', {
      connectionId,
      name: error.name,
      message: error.message,
    });

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    return { statusCode: 500, body: 'Internal error' };
  }
};
