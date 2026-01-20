// apps/api/src/realtime/publisher.ts
import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { listConnections, removeConnection } from './connectionStore';
import { logError, logInfo } from '../lib/logger';
import { getWsClient } from './wsClient';

export type ClinicQueueUpdatedEvent = { visitDate: string };

export type RealtimeEvent =
  | { type: 'ClinicQueueUpdated'; payload: ClinicQueueUpdatedEvent }
  | { type: 'ping' }
  | { type: 'pong' };

export async function publishClinicQueueUpdated(event: ClinicQueueUpdatedEvent): Promise<void> {
  const wsClient = getWsClient();
  if (!wsClient) {
    logInfo('realtime_publish_skipped', { reason: 'ws_client_null' });
    return;
  }

  const connections = await listConnections();
  if (connections.length === 0) {
    logInfo('realtime_publish_skipped', { reason: 'no_connections' });
    return;
  }

  const payload: RealtimeEvent = { type: 'ClinicQueueUpdated', payload: event };
  const data = Buffer.from(JSON.stringify(payload));

  logInfo('realtime_publish_start', { count: connections.length, visitDate: event.visitDate });

  await Promise.all(
    connections.map(async (conn) => {
      try {
        await wsClient.send(
          new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: data,
          }),
        );
      } catch (err: any) {
        const code = err?.$metadata?.httpStatusCode;

        if (code === 410) {
          await removeConnection(conn.connectionId);
          logInfo('realtime_connection_gone', { connectionId: conn.connectionId });
          return;
        }

        logError('realtime_post_failed', {
          connectionId: conn.connectionId,
          httpStatusCode: code,
          name: err?.name,
          message: err?.message ?? String(err),
        });
      }
    }),
  );

  logInfo('realtime_publish_done', { visitDate: event.visitDate });
}
