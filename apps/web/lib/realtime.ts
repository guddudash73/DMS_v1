export type RealtimeMessage =
  | {
      type: 'DoctorQueueUpdated';
      payload: { doctorId: string; visitDate: string };
    }
  | { type: 'pong' }
  | { type: 'ping' };

export function createDoctorQueueWebSocket(params: {
  token: string;
  onMessage?: (msg: RealtimeMessage) => void;
  onOpen?: (ev: Event) => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (ev: Event) => void;
}): WebSocket | null {
  if (typeof window === 'undefined') return null;

  const base = process.env.NEXT_PUBLIC_WS_BASE_URL;
  if (!base) {
    console.warn('[realtime] NEXT_PUBLIC_WS_BASE_URL not set; skipping WebSocket');
    return null;
  }

  const trimmed = base.replace(/\/+$/, '');
  const withStage = trimmed.endsWith('/$default') ? trimmed : `${trimmed}/$default`;

  const url = new URL(withStage);
  url.searchParams.set('token', params.token);

  console.log('[realtime] opening WebSocket to', url.toString());

  const socket = new WebSocket(url.toString());

  socket.onopen = (ev) => {
    console.log('[realtime] WebSocket open');
    params.onOpen?.(ev);
  };

  socket.onerror = (ev) => {
    console.error('[realtime] WebSocket error', ev);
    params.onError?.(ev);
  };

  socket.onclose = (ev) => {
    console.warn('[realtime] WebSocket closed', {
      code: ev.code,
      reason: ev.reason,
      wasClean: ev.wasClean,
    });
    params.onClose?.(ev);
  };

  socket.onmessage = (event) => {
    if (!params.onMessage) return;
    try {
      const data: RealtimeMessage = JSON.parse(event.data);
      params.onMessage(data);
    } catch (err) {
      console.error('[realtime] failed to parse message', err, event.data);
    }
  };

  return socket;
}
