'use client';

import type { Visit } from '@dms/types';

export type DoctorQueueEvent =
  | { type: 'visitAdded'; visit: Visit }
  | { type: 'visitStatusChanged'; visitId: string; status: Visit['status'] };

type MessageHandler = (event: DoctorQueueEvent) => void;

const WS_URL = process.env.NEXT_PUBLIC_WS_BASE_URL;

const subscribers = new Map<string, Set<MessageHandler>>();

let socket: WebSocket | null = null;
let isConnecting = false;

function getDoctorQueueKey(doctorId: string, date: string): string {
  return `${doctorId}|${date}`;
}

function safeParse<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type IncomingMessage =
  | {
      channel: 'doctorQueue';
      doctorId: string;
      date: string;
      event: DoctorQueueEvent;
    }
  | Record<string, never>;

function ensureSocket() {
  if (typeof window === 'undefined') return;
  if (!WS_URL) return;

  if (socket || isConnecting) return;

  isConnecting = true;

  try {
    const ws = new WebSocket(WS_URL);
    socket = ws;

    ws.onopen = () => {
      isConnecting = false;
    };

    ws.onclose = () => {
      socket = null;
      isConnecting = false;
    };

    ws.onerror = () => {
      socket = null;
      isConnecting = false;
    };

    ws.onmessage = (evt) => {
      const msg = safeParse<IncomingMessage>(evt.data);
      if (!msg || msg.channel !== 'doctorQueue') return;

      const key = getDoctorQueueKey(msg.doctorId, msg.date);
      const set = subscribers.get(key);
      if (!set || set.size === 0) return;

      for (const handler of set) {
        handler(msg.event);
      }
    };
  } catch {
    socket = null;
    isConnecting = false;
  }
}

export function subscribeToDoctorQueue(
  args: { doctorId: string; date: string },
  onEvent: (event: DoctorQueueEvent) => void,
): { unsubscribe: () => void } {
  if (typeof window === 'undefined' || !WS_URL) {
    return {
      unsubscribe() {},
    };
  }

  ensureSocket();

  const key = getDoctorQueueKey(args.doctorId, args.date);
  let set = subscribers.get(key);
  if (!set) {
    set = new Set<MessageHandler>();
    subscribers.set(key, set);
  }

  set.add(onEvent);

  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(
        JSON.stringify({
          channel: 'doctorQueue',
          type: 'subscribe',
          doctorId: args.doctorId,
          date: args.date,
        }),
      );
    } catch {
      // ignore
    }
  }

  return {
    unsubscribe() {
      const current = subscribers.get(key);
      if (!current) return;
      current.delete(onEvent);
      if (current.size === 0) {
        subscribers.delete(key);
        if (socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(
              JSON.stringify({
                channel: 'doctorQueue',
                type: 'unsubscribe',
                doctorId: args.doctorId,
                date: args.date,
              }),
            );
          } catch {
            // ignore
          }
        }
      }
    },
  };
}
