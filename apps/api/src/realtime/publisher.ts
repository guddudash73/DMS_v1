// apps/api/src/realtime/publisher.ts
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { listConnections, removeConnection } from './connectionStore';
import { logError, logInfo } from '../lib/logger';

const REALTIME_WS_ENDPOINT = process.env.REALTIME_WS_ENDPOINT;

const realtimeEnabled = Boolean(REALTIME_WS_ENDPOINT);

let client: ApiGatewayManagementApiClient | null = null;

function getClient(): ApiGatewayManagementApiClient | null {
  if (!realtimeEnabled || !REALTIME_WS_ENDPOINT) {
    return null;
  }

  if (!client) {
    client = new ApiGatewayManagementApiClient({
      endpoint: REALTIME_WS_ENDPOINT,
    });
  }
  return client;
}

/**
 * ✅ Clinic-wide queue updated event (no doctorId)
 */
export type ClinicQueueUpdatedEvent = {
  visitDate: string;
};

export type RealtimeEvent = {
  type: 'ClinicQueueUpdated';
  payload: ClinicQueueUpdatedEvent;
};

/**
 * ✅ Publish clinic-wide queue update to all connected clients
 */
export async function publishClinicQueueUpdated(event: ClinicQueueUpdatedEvent): Promise<void> {
  const wsClient = getClient();
  if (!wsClient) {
    console.warn('[realtime] REALTIME_WS_ENDPOINT not set; skipping ClinicQueueUpdated event');
    return;
  }

  const connections = await listConnections();
  if (connections.length === 0) {
    return;
  }

  const payload: RealtimeEvent = {
    type: 'ClinicQueueUpdated',
    payload: event,
  };

  const data = Buffer.from(JSON.stringify(payload));

  await Promise.all(
    connections.map(async (conn) => {
      try {
        await wsClient.send(
          new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: data,
          }),
        );
      } catch (err: unknown) {
        const e = err as { $metadata?: { httpStatusCode?: number } };

        if (e?.$metadata?.httpStatusCode === 410) {
          await removeConnection(conn.connectionId);
          logInfo('realtime_connection_gone', {
            connectionId: conn.connectionId,
          });
          return;
        }

        logError('realtime_post_failed', {
          connectionId: conn.connectionId,
          error:
            err instanceof Error
              ? { name: err.name, message: err.message }
              : { message: String(err) },
        });
      }
    }),
  );
}
