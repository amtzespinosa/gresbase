import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Visible copy goes through i18n (AGENTS.md): no letters in JSX text or in user-facing
    // string attributes inside screens and features.
    files: ['src/features/**/*.tsx', 'src/routes/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\p{L}/u]',
          message: 'Visible text must use t() from react-i18next.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt|label|content)$/] > Literal[value=/\\p{L}/u]',
          message: 'User-facing attributes must use t() from react-i18next.',
        },
      ],
    },
  },
)
