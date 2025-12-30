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

  if (routeKey === '$default' && event.body) {
    try {
      const msg = JSON.parse(event.body) as { type?: string };

      if (msg.type === 'ping') {
        return { statusCode: 200, body: 'OK' };
      }
    } catch {
      // ignore
    }
  }

  return { statusCode: 200, body: 'OK' };
};
