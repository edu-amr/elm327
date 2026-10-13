import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      // Vendored third-party components (shadcn, uiarc, cult-ui, affectui, EvilCharts, react-bits).
      'web/src/components/ui/**',
      'web/src/components/arc/**',
      'web/src/components/evilcharts/**',
      'web/src/components/ElectricBorder.tsx',
      'web/src/components/GlareHover.tsx',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['src/cli/**/*.ts', '**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },
);
