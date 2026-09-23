import base, { productImportPatterns } from '@repo/eslint-config'

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...base,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Two lists, on purpose. The allowlist is the rule ADR 0027 always stated: only the
      // packages named here may be imported, so admitting a new one is a deliberate edit to this
      // file rather than something a `pnpm add` does silently. The denylist below it is what keeps
      // the *reasons* attached — an allowlist refusal can only ever say "not on the list", where a
      // denylist entry names why that package in particular must never be reached. Both fire, so a
      // banned import is reported twice, once with the reason.
      'no-restricted-imports': ['error', {
        patterns: [
          ...productImportPatterns,
          {
            group: ['@repo/store', '@repo/store/*', '@repo/kernel', '@repo/kernel/*'],
            message: 'the app reads and writes only through @repo/api-client, so the API stays the single writer (ADR 0002, ADR 0027)',
          },
          {
            group: ['@repo/microtask-domain', '@repo/microtask-domain/*', '@repo/macroplan-domain', '@repo/macroplan-domain/*'],
            message: 'the domain barrel reaches node:path and node:crypto, and the app must not bypass the API (ADR 0014, ADR 0027)',
          },
          {
            // ESLint builds each group's matcher with the `ignore` package and asks
            // `matcher.ignores(specifier)`, so these are gitignore rules: the two wildcards ban
            // every @repo package and everything under it, and each `!` pair admits one package
            // back, subpaths included.
            group: [
              '@repo/*',
              '@repo/*/*',
              '!@repo/api-client',
              '!@repo/api-client/*',
              '!@repo/app-session',
              '!@repo/app-session/*',
              '!@repo/canvas',
              '!@repo/canvas/*',
              '!@repo/contracts',
              '!@repo/contracts/*',
              '!@repo/schedule',
              '!@repo/schedule/*',
              '!@repo/ui',
              '!@repo/ui/*',
            ],
            message: 'this app may import only @repo/api-client, @repo/app-session, @repo/canvas, @repo/contracts, @repo/schedule and @repo/ui; anything else is a decision to record before it is a dependency (ADR 0027)',
          },
        ],
      }],
    },
  },
]
