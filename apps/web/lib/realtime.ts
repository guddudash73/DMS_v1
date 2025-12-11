// apps/web/src/lib/realtime.ts
export type RealtimeMessage = {
  type: 'DoctorQueueUpdated';
  payload: {
    doctorId: string;
    visitDate: string; // YYYY-MM-DD
  };
};

export function createDoctorQueueWebSocket(params: {
  token: string;
  onMessage?: (msg: RealtimeMessage) => void;
}): WebSocket | null {
  if (typeof window === 'undefined') return null;

  const base = process.env.NEXT_PUBLIC_WS_BASE_URL;
  if (!base) {
    // eslint-disable-next-line no-console
    console.warn('[realtime] NEXT_PUBLIC_WS_BASE_URL not set; skipping WebSocket');
    return null;
  }

  // Normalize the base so it ALWAYS ends with "/$default"
  const trimmed = base.replace(/\/+$/, '');
  const withStage = trimmed.endsWith('/$default') ? trimmed : `${trimmed}/$default`;

  const url = new URL(withStage);
  url.searchParams.set('token', params.token);

  console.log('[realtime] opening WebSocket to', url.toString());

  const socket = new WebSocket(url.toString());

  socket.onopen = () => {
    console.log('[realtime] WebSocket open');
  };

  socket.onerror = (event) => {
    console.error('[realtime] WebSocket error', event);
  };

  socket.onclose = (event) => {
    console.warn('[realtime] WebSocket closed', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
  };

  if (params.onMessage) {
    socket.onmessage = (event) => {
      try {
        const data: RealtimeMessage = JSON.parse(event.data);
        params.onMessage?.(data);
      } catch (err) {
        console.error('[realtime] failed to parse message', err, event.data);
      }
    };
  }

  return socket;
}
