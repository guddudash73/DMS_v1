import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { listConnections, removeConnection } from './connectionStore';
import { logError, logInfo } from '../lib/logger';
import { getWsClient } from './wsClient';

export type ClinicQueueUpdatedEvent = {
  visitDate: string;
};

export type RealtimeEvent = {
  type: 'ClinicQueueUpdated';
  payload: ClinicQueueUpdatedEvent;
};

export async function publishClinicQueueUpdated(event: ClinicQueueUpdatedEvent): Promise<void> {
  const wsClient = getWsClient();
  if (!wsClient) {
    console.warn('[realtime] REALTIME_WS_ENDPOINT not set; skipping ClinicQueueUpdated event');
    return;
  }

  const connections = await listConnections();
  if (connections.length === 0) return;

  const payload: RealtimeEvent = { type: 'ClinicQueueUpdated', payload: event };
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
          logInfo('realtime_connection_gone', { connectionId: conn.connectionId });
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
