'use client';

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import StoreProvider from '@/components/providers/StoreProvider';

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      {children}

      {/* Toastify container */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        theme="light"
        newestOnTop
        closeOnClick
        pauseOnHover
      />
    </StoreProvider>
  );
}
