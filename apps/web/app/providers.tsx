'use client';

import type React from 'react';
import { Provider } from 'react-redux';
import { store } from '../src/store';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
