import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: [
      'src/components/accumulation/**/*.{ts,tsx}',
      'src/components/common/**/*.{ts,tsx}',
      'src/components/dashboard/**/*.{ts,tsx}',
      'src/components/ledger/**/*.{ts,tsx}',
      'src/components/settings/**/*.{ts,tsx}',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
    },
  },
  {
    files: ['src/stores/ledgerStore.ts'],
    rules: { 'prefer-const': 'warn' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
