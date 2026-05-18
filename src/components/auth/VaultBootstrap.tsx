'use client';

import { useEffect } from 'react';
import { bootstrapVault } from '@/lib/auth/vault';

export function VaultBootstrap() {
  useEffect(() => {
    void bootstrapVault();
  }, []);
  return null;
}
