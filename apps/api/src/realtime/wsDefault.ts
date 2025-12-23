// apps/api/src/realtime/wsDefault.ts
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
  // $default route receives client messages (including our heartbeat ping)
  const routeKey = event.requestContext?.routeKey;

  if (routeKey === '$default' && event.body) {
    try {
      const msg = JSON.parse(event.body) as { type?: string };

      // Cheap no-op for heartbeat
      if (msg.type === 'ping') {
        return { statusCode: 200, body: 'OK' };
      }
    } catch {
      // ignore parse errors; still 200
    }
  }

  return { statusCode: 200, body: 'OK' };
};
