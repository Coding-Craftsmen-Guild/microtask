# Foundation Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm + Turborepo workspace and build a fully tested domain core — roles, entities, repository ports, Zod contracts and the filesystem store — with no API and no UI.

**Architecture:** `packages/kernel` holds framework-free domain code and defines every port as an interface; `packages/store` implements those ports over the filesystem; `packages/contracts` holds Zod schemas that depend on `zod` and nothing else. Dependency inversion is the seam: kernel names what it needs, store provides it, and nothing in kernel imports Node's `fs`.

**Tech Stack:** pnpm 12.3.4 workspaces, Turborepo 2.10.12, TypeScript strict, Vitest, Zod 4.6.1, ESLint flat config.

**Spec:** [`../specs/2026-09-10-monorepo-restructure-design.md`](../specs/2026-09-10-monorepo-restructure-design.md)
**Decisions:** [`../../adr/README.md`](../../adr/README.md)

---

## File structure

```
pnpm-workspace.yaml                     workspaces, catalog (zod pinned once), overrides
package.json                            workspace root; no app code
turbo.json                              build · lint · test
apps/legacy/                             the current app, moved intact, still runnable
packages/typescript-config/base.json    one strict base (ADR 0023)
packages/eslint-config/
  index.js                              size caps, boundaries, hooks, jsdoc (ADR 0027)
  rules/tsdoc-comments-only.js          local rule: only TSDoc on exports
packages/kernel/src/
  product.ts                            'microtask' | 'macroplan' (ADR 0014)
  ids.ts                                ULIDs, share tokens
  errors.ts                             NotFound · Forbidden · Invalid · Conflict
  entities/{tab,task,folder,share-link,manifest,progress,document}.ts
  access/{role,action,scope,principal,target,policy}.ts
  ports/{clock,id-generator,lock,file-system,project-store}.ts
  testing/project-store-contract.ts     suite every adapter must pass (ADR 0027, LSP)
packages/contracts/src/
  {progress,document,tab,task,folder,share-link,project}.ts
packages/store/src/
  node-file-system.ts                   FileSystem over node:fs
  paths.ts                              the only two path builders (ADR 0005)
  queue-lock.ts                         single write queue
  fs-project-store.ts                   reads
  fs-project-store-writes.ts            writes, with ADR 0006 ordering
  share-index.ts                        token -> project, uniqueness enforced
```

Files are small because ADR 0027 caps `.ts` at 150 lines. That is the point, not an accident.

---

### Task 1: Bootstrap the workspace and move the legacy app

The current app is live. It is moved intact rather than deleted, so it stays runnable for
behaviour comparison during the port. Plan 5 removes it.

**Files:**
- Create: `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`
- Create: `apps/legacy/package.json`
- Modify: `package.json` (becomes the workspace root), `.gitignore`, `Dockerfile`
- Move: `server.js`, `lib/`, `public/`, `src/` → `apps/legacy/`

- [ ] **Step 1: Install pnpm**

```bash
npm install -g pnpm@12.3.4
pnpm --version
```

Expected: `12.3.4`

- [ ] **Step 2: Move the legacy app**

```bash
mkdir -p apps/legacy
git mv server.js lib public src apps/legacy/
git mv package.json apps/legacy/package.json
git rm -q package-lock.json
```

- [ ] **Step 3: Name the legacy package**

Edit `apps/legacy/package.json` — change only the `name` field, leave scripts and
devDependencies untouched:

```json
  "name": "legacy",
```

- [ ] **Step 4: Create the workspace root `package.json`**

```json
{
  "name": "ccg-workspace",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@12.3.4",
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "2.10.12"
  }
}
```

- [ ] **Step 5: Create `pnpm-workspace.yaml`**

One catalog entry per shared dependency, so a second copy of Zod cannot appear (ADR 0024).

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

catalog:
  zod: 4.6.1

overrides:
  zod: 'catalog:'
```

- [ ] **Step 6: Create `.npmrc`**

```ini
strict-peer-dependencies=true
auto-install-peers=true
```

- [ ] **Step 7: Create `turbo.json`**

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 8: Extend `.gitignore`**

Append:

```gitignore
dist/
.turbo/
*.tsbuildinfo
package-lock.json
yarn.lock
```

- [ ] **Step 9: Repoint the legacy Dockerfile**

In `Dockerfile`, replace the five source `COPY` lines so the legacy image still builds:

```dockerfile
COPY apps/legacy/package.json ./
COPY apps/legacy/server.js ./
COPY apps/legacy/lib ./lib
COPY apps/legacy/public ./public
COPY --from=build /app/public/vendor ./public/vendor
```

And in the build stage, replace `COPY src ./src` / `COPY public ./public` with:

```dockerfile
COPY apps/legacy/package.json apps/legacy/package-lock.json* ./
RUN npm install --omit=optional
COPY apps/legacy/src ./src
COPY apps/legacy/public ./public
```

- [ ] **Step 10: Install and verify the workspace resolves**

```bash
pnpm install
pnpm ls -r --depth -1
```

Expected: lists `ccg-workspace` and `legacy`. No error about a missing workspace package.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: bootstrap pnpm + turborepo workspace, move legacy app to apps/legacy"
```

---

### Task 2: Shared TypeScript config

**Files:**
- Create: `packages/typescript-config/package.json`, `packages/typescript-config/base.json`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@repo/typescript-config",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json"]
}
```

- [ ] **Step 2: Create `base.json`**

`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are required by ADR 0023.

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/typescript-config
git commit -m "feat: add shared strict TypeScript config"
```

---

### Task 3: Shared ESLint config with the TSDoc-only rule

ADR 0027 requires that only TSDoc comments on exported declarations survive. ESLint core cannot
express that, so the config ships a local rule — written test-first.

**Files:**
- Create: `packages/eslint-config/package.json`
- Create: `packages/eslint-config/rules/tsdoc-comments-only.js`
- Create: `packages/eslint-config/rules/tsdoc-comments-only.test.js`
- Create: `packages/eslint-config/index.js`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@repo/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "scripts": {
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "@eslint/js": "latest",
    "typescript-eslint": "latest",
    "eslint-plugin-import": "latest",
    "eslint-plugin-jsdoc": "latest",
    "eslint-plugin-react-hooks": "latest",
    "eslint-plugin-n": "latest"
  },
  "devDependencies": {
    "eslint": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/eslint-config/rules/tsdoc-comments-only.test.js`:

```js
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from './tsdoc-comments-only.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

describe('tsdoc-comments-only', () => {
  it('allows TSDoc on exports and rejects everything else', () => {
    tester.run('tsdoc-comments-only', rule, {
      valid: [
        '/** Counts things. */\nexport function count() {}',
        '/** A thing. */\nexport const a = 1',
        '/** Outer. */\nexport class A {\n  /** Inner. */\n  b() {}\n}',
      ],
      invalid: [
        { code: '// hello\nexport const a = 1', errors: [{ messageId: 'disallowed' }] },
        { code: '/** Not exported. */\nconst a = 1', errors: [{ messageId: 'disallowed' }] },
        { code: 'export const a = 1 // trailing', errors: [{ messageId: 'disallowed' }] },
        { code: '/* banner */\nexport const a = 1', errors: [{ messageId: 'disallowed' }] },
      ],
    })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @repo/eslint-config test
```

Expected: FAIL — cannot resolve `./tsdoc-comments-only.js`.

- [ ] **Step 4: Write the rule**

Create `packages/eslint-config/rules/tsdoc-comments-only.js`:

```js
function isDocForExport(source, comment) {
  if (comment.type !== 'Block' || !comment.value.startsWith('*')) return false
  const token = source.getTokenAfter(comment, { includeComments: false })
  if (!token) return false
  let node = source.getNodeByRangeIndex(token.range[0])
  while (node) {
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
      return true
    }
    node = node.parent
  }
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Allow only TSDoc comments attached to exported declarations' },
    messages: {
      disallowed:
        'Only TSDoc (/** ... */) on exported declarations is allowed. Put design rationale in docs/adr/ and behavioural rationale in a test name (ADR 0027).',
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode
    return {
      Program() {
        for (const comment of source.getAllComments()) {
          if (isDocForExport(source, comment)) continue
          context.report({ loc: comment.loc, messageId: 'disallowed' })
        }
      },
    }
  },
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @repo/eslint-config test
```

Expected: PASS — 1 test.

- [ ] **Step 6: Write the shared config**

Create `packages/eslint-config/index.js`:

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import jsdoc from 'eslint-plugin-jsdoc'
import n from 'eslint-plugin-n'
import tsdocCommentsOnly from './rules/tsdoc-comments-only.js'

export const local = { rules: { 'tsdoc-comments-only': tsdocCommentsOnly } }

const SIZE_RULES = {
  'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 4],
  'max-nested-callbacks': ['error', 3],
}

export const base = [
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: { import: importPlugin, jsdoc, n, local },
    rules: {
      ...SIZE_RULES,
      'max-lines': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'local/tsdoc-comments-only': 'error',
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: { FunctionDeclaration: true, ClassDeclaration: true, MethodDefinition: true },
        contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'VariableDeclaration'],
      }],
      'n/no-process-env': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: { 'max-lines': ['error', { max: 80, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/testing/**', '**/*.config.*'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'jsdoc/require-jsdoc': 'off',
      'local/tsdoc-comments-only': 'off',
      'n/no-process-env': 'off',
    },
  },
]

export default base
```

- [ ] **Step 7: Verify the config loads**

```bash
pnpm --filter @repo/eslint-config exec node -e "import('./index.js').then(m => console.log('configs:', m.default.length))"
```

Expected: `configs: 4`

- [ ] **Step 8: Commit**

```bash
git add packages/eslint-config
git commit -m "feat: add shared ESLint config with TSDoc-only comment rule"
```

---

### Task 4: Kernel scaffold, product namespace and ids

**Files:**
- Create: `packages/kernel/package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`
- Create: `packages/kernel/src/product.ts`, `src/ids.ts`, `src/ids.test.ts`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@repo/kernel",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./testing": { "types": "./dist/testing/index.d.ts", "default": "./dist/testing/index.js" }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@repo/eslint-config": "workspace:*",
    "typescript": "latest",
    "vitest": "latest",
    "eslint": "latest"
  }
}
```

- [ ] **Step 2: Create `packages/kernel/tsconfig.json`**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/kernel/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
```

- [ ] **Step 4: Create `packages/kernel/eslint.config.js`**

```js
import base from '@repo/eslint-config'

export default base
```

- [ ] **Step 5: Write the failing test for ids**

Create `packages/kernel/src/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isShareToken, isUlid, shareToken, ulid } from './ids.js'

describe('ulid', () => {
  it('produces a 26-character Crockford base32 id', () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('sorts lexicographically by the time it was given', () => {
    const earlier = ulid(1_000_000_000_000)
    const later = ulid(2_000_000_000_000)
    expect(earlier < later).toBe(true)
  })

  it('does not collide across many calls at the same instant', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => ulid(1_700_000_000_000)))
    expect(ids.size).toBe(1000)
  })
})

describe('isUlid', () => {
  it.each([
    ['a generated id', ulid(), true],
    ['lowercase', 'abcdefghjkmnpqrstvwxyz0123', false],
    ['too short', 'ABC', false],
    ['ambiguous letters I L O U', 'IIIIIIIIIIIIIIIIIIIIIIIIII', false],
    ['a traversal attempt', '../../etc/passwd', false],
    ['a number', 26, false],
    ['undefined', undefined, false],
  ])('rejects or accepts %s', (_label, value, expected) => {
    expect(isUlid(value)).toBe(expected)
  })
})

describe('shareToken', () => {
  it('produces a url-safe token this app recognises', () => {
    const token = shareToken()
    expect(isShareToken(token)).toBe(true)
    expect(token).not.toContain('/')
    expect(token).not.toContain('+')
    expect(token).not.toContain('=')
  })

  it('rejects a token carrying path separators', () => {
    expect(isShareToken('../../secret')).toBe(false)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
pnpm --filter @repo/kernel test
```

Expected: FAIL — cannot find module `./ids.js`.

- [ ] **Step 7: Create `packages/kernel/src/product.ts`**

```ts
/** The products sharing this API, each with its own entities and data root. */
export const PRODUCTS = ['microtask', 'macroplan'] as const

/** One of the products sharing this API. */
export type Product = (typeof PRODUCTS)[number]

/** Narrows a value to a known product name. */
export const isProduct = (value: unknown): value is Product =>
  typeof value === 'string' && (PRODUCTS as readonly string[]).includes(value)
```

- [ ] **Step 8: Create `packages/kernel/src/ids.ts`**

```ts
import { randomBytes } from 'node:crypto'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

function encodeTime(value: number, length: number): string {
  let remaining = value
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out = `${B32[remaining % 32] ?? '0'}${out}`
    remaining = Math.floor(remaining / 32)
  }
  return out
}

function encodeRandom(length: number): string {
  const bytes = randomBytes(length)
  let out = ''
  for (const byte of bytes) out += B32[byte % 32] ?? '0'
  return out
}

/** Creates a lexicographically sortable 26-character identifier. */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now, 10) + encodeRandom(16)
}

/** Narrows a value to a ULID-shaped identifier. */
export const isUlid = (value: unknown): value is string =>
  typeof value === 'string' && ULID.test(value)

/** Creates an opaque, unguessable share-link token. */
export const shareToken = (): string => randomBytes(24).toString('base64url')

/** Narrows a value to a share-link-token-shaped string. */
export const isShareToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN.test(value)
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
pnpm --filter @repo/kernel test
```

Expected: PASS — 12 tests.

- [ ] **Step 10: Commit**

```bash
git add packages/kernel
git commit -m "feat(kernel): add product namespace and id generation"
```

---

### Task 5: Kernel errors

**Files:**
- Create: `packages/kernel/src/errors.ts`, `src/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kernel/src/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AppError, Conflict, Forbidden, Invalid, NotFound } from './errors.js'

describe('errors', () => {
  it.each([
    [new NotFound('gone'), 404, 'not_found'],
    [new Forbidden('nope'), 403, 'forbidden'],
    [new Invalid('bad'), 422, 'invalid'],
    [new Conflict('stale'), 409, 'conflict'],
  ])('maps %s to a status and a code', (error, status, code) => {
    expect(error.status).toBe(status)
    expect(error.code).toBe(code)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(Error)
  })

  it('keeps the message and a usable stack', () => {
    const error = new NotFound('Project not found')
    expect(error.message).toBe('Project not found')
    expect(error.stack).toContain('errors.test')
  })

  it('names itself after its class, so logs are readable', () => {
    expect(new Forbidden('x').name).toBe('Forbidden')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/kernel test errors
```

Expected: FAIL — cannot find module `./errors.js`.

- [ ] **Step 3: Create `packages/kernel/src/errors.ts`**

```ts
/** An error carrying the HTTP status and stable code the API should report. */
export abstract class AppError extends Error {
  /** The HTTP status this error maps to. */
  abstract readonly status: number

  /** A stable machine-readable code for this error kind. */
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** The requested thing does not exist, or the caller may not know that it does. */
export class NotFound extends AppError {
  readonly status = 404
  readonly code = 'not_found'
}

/** The caller is known but not permitted to perform this action. */
export class Forbidden extends AppError {
  readonly status = 403
  readonly code = 'forbidden'
}

/** The request was understood but its content is unacceptable. */
export class Invalid extends AppError {
  readonly status = 422
  readonly code = 'invalid'
}

/** The request conflicts with the current state, such as a stale write. */
export class Conflict extends AppError {
  readonly status = 409
  readonly code = 'conflict'
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @repo/kernel test errors
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/errors.ts packages/kernel/src/errors.test.ts
git commit -m "feat(kernel): add AppError hierarchy"
```

---

### Task 6: Kernel access types

These come before the entities because `ShareLink` carries a `Role` and a `Scope`.

**Files:**
- Create: `packages/kernel/src/access/role.ts`, `action.ts`, `scope.ts`, `principal.ts`, `target.ts`

- [ ] **Step 1: Create `packages/kernel/src/access/role.ts`**

```ts
/** The authority levels a share link can carry, weakest first. */
export const ROLES = ['view', 'write', 'manage'] as const

/** The authority a share link carries. */
export type Role = (typeof ROLES)[number]

/** Narrows a value to a known role. */
export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)
```

- [ ] **Step 2: Create `packages/kernel/src/access/action.ts`**

Create actions target their container; read and mutate actions target the thing itself.

```ts
/** Every action the policy can decide. Adding one requires a policy decision. */
export const ACTIONS = [
  'project:read',
  'project:rename',
  'project:delete',
  'folder:create',
  'folder:rename',
  'folder:delete',
  'folder:reorder',
  'task:create',
  'task:read',
  'task:rename',
  'task:delete',
  'task:move',
  'tab:create',
  'tab:rename',
  'tab:delete',
  'tab:reorder',
  'tab:write',
  'share:read',
  'share:create',
  'share:revoke',
  'export:run',
  'workspace:list-projects',
  'workspace:create-project',
  'workspace:import',
  'workspace:search',
] as const

/** Something a principal may attempt. */
export type Action = (typeof ACTIONS)[number]
```

- [ ] **Step 3: Create `packages/kernel/src/access/scope.ts`**

```ts
/** What a share link may reach. */
export type Scope =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
```

- [ ] **Step 4: Create `packages/kernel/src/access/principal.ts`**

```ts
import type { Role } from './role.js'
import type { Scope } from './scope.js'

/** Who is making a request. A service key alone is never a principal. */
export type Principal =
  | { readonly kind: 'admin' }
  | {
      readonly kind: 'link'
      readonly role: Role
      readonly scope: Scope
      readonly token: string
    }
```

- [ ] **Step 5: Create `packages/kernel/src/access/target.ts`**

```ts
/** What a request is acting on. `workspace` covers collections and top-level actions. */
export type Target =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'folder'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
  | { readonly kind: 'tab'; readonly projectId: string; readonly taskId: string }
```

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/access
git commit -m "feat(kernel): add access control types"
```

---

### Task 7: Kernel entities

Plain data shapes. The manifest holds task names, positions and the progress cache; the task
file holds only tabs (ADR 0005, ADR 0007).

**Files:**
- Create: `packages/kernel/src/entities/progress.ts`, `document.ts`, `tab.ts`, `task.ts`,
  `folder.ts`, `share-link.ts`, `manifest.ts`

- [ ] **Step 1: Create `packages/kernel/src/entities/progress.ts`**

```ts
/** Counted checklist state. Derived from a document, cached in the manifest. */
export interface Progress {
  readonly done: number
  readonly total: number
}

/** The progress of something with no checklist items. */
export const NO_PROGRESS: Progress = { done: 0, total: 0 }
```

- [ ] **Step 2: Create `packages/kernel/src/entities/document.ts`**

```ts
/** A Tiptap/ProseMirror document, stored as JSON and never as HTML. */
export interface DocumentJson {
  readonly type: 'doc'
  readonly content?: readonly unknown[]
}

/** Creates the document a new tab starts with. */
export const emptyDocument = (): DocumentJson => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})
```

- [ ] **Step 3: Create `packages/kernel/src/entities/tab.ts`**

```ts
import type { DocumentJson } from './document.js'

/** One tab inside a task, owning its own document. */
export interface Tab {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly document: DocumentJson
  readonly createdAt: string
  readonly updatedAt: string
}
```

- [ ] **Step 4: Create `packages/kernel/src/entities/task.ts`**

```ts
import type { Tab } from './tab.js'

/** The contents of one task file: its tabs and nothing else. */
export interface TaskDocument {
  readonly id: string
  readonly tabs: readonly Tab[]
  readonly createdAt: string
  readonly updatedAt: string
}
```

- [ ] **Step 5: Create `packages/kernel/src/entities/folder.ts`**

```ts
/** A one-level grouping of tasks inside a project. Folders never nest. */
export interface Folder {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly createdAt: string
  readonly updatedAt: string
}
```

- [ ] **Step 6: Create `packages/kernel/src/entities/share-link.ts`**

```ts
import type { Role } from '../access/role.js'
import type { Scope } from '../access/scope.js'

/** One person's access to a project or a single task. */
export interface ShareLink {
  readonly token: string
  readonly name: string
  readonly role: Role
  readonly scope: Scope
  readonly createdBy: string | null
  readonly createdAt: string
}
```

- [ ] **Step 7: Create `packages/kernel/src/entities/manifest.ts`**

```ts
import type { Folder } from './folder.js'
import type { Progress } from './progress.js'
import type { ShareLink } from './share-link.js'

/** A task as the manifest knows it. The only home for its name and placement. */
export interface TaskEntry {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly folderId: string | null
  readonly progress: Progress
}

/** Everything about a project except its tab documents. */
export interface ProjectManifest {
  readonly id: string
  readonly name: string
  readonly folders: readonly Folder[]
  readonly tasks: readonly TaskEntry[]
  readonly shareLinks: readonly ShareLink[]
  readonly createdAt: string
  readonly updatedAt: string
}
```

- [ ] **Step 8: Verify the entities compile against the access types**

```bash
pnpm --filter @repo/kernel typecheck
```

Expected: exit 0. `share-link.ts` imports `Role` and `Scope` from Task 6, so this fails if the
tasks were done out of order.

- [ ] **Step 9: Commit**

```bash
git add packages/kernel/src/entities
git commit -m "feat(kernel): add domain entities"
```

---

### Task 8: AccessPolicy with an exhaustive matrix

The crown jewel. `can()` is pure, has **no fallthrough allow branch**, and every action is
classified (ADR 0008, ADR 0009).

**Files:**
- Create: `packages/kernel/src/access/policy.ts`, `src/access/policy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kernel/src/access/policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ACTIONS, type Action } from './action.js'
import { ROLES, type Role } from './role.js'
import type { Principal } from './principal.js'
import type { Scope } from './scope.js'
import type { Target } from './target.js'
import { ADMIN_ONLY_ACTIONS, can } from './policy.js'

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const OTHER = '01M240FB4GD6PF6V0PKZVF6FDX'

const admin: Principal = { kind: 'admin' }

const link = (role: Role, scope: Scope): Principal => ({
  kind: 'link',
  role,
  scope,
  token: 'tok_abcdefghijklmnop',
})

const projectLink = (role: Role) => link(role, { kind: 'project', projectId: P })
const taskLink = (role: Role) => link(role, { kind: 'task', projectId: P, taskId: T })

const WORKSPACE: Target = { kind: 'workspace' }
const PROJECT: Target = { kind: 'project', projectId: P }
const FOLDER: Target = { kind: 'folder', projectId: P }
const TASK: Target = { kind: 'task', projectId: P, taskId: T }
const TAB: Target = { kind: 'tab', projectId: P, taskId: T }

const targetFor = (action: Action): Target => {
  if (action.startsWith('workspace:')) return WORKSPACE
  if (action === 'task:create' || action.startsWith('folder:')) return PROJECT
  if (action === 'tab:create') return TASK
  if (action.startsWith('tab:')) return TAB
  if (action.startsWith('task:')) return TASK
  return PROJECT
}

const VIEW: readonly Action[] = ['project:read', 'task:read']

const WRITE: readonly Action[] = [
  ...VIEW,
  'folder:create',
  'folder:rename',
  'task:create',
  'task:rename',
  'tab:create',
  'tab:rename',
  'tab:write',
]

const MANAGE: readonly Action[] = [
  ...WRITE,
  'project:rename',
  'project:delete',
  'folder:delete',
  'folder:reorder',
  'task:delete',
  'task:move',
  'tab:delete',
  'tab:reorder',
  'share:read',
  'share:create',
  'share:revoke',
  'export:run',
]

const ALLOWED: Record<Role, readonly Action[]> = { view: VIEW, write: WRITE, manage: MANAGE }

describe('can — admin', () => {
  it('permits every action', () => {
    for (const action of ACTIONS) {
      expect(can(admin, action, targetFor(action))).toBe(true)
    }
  })
})

describe('can — the full role x action matrix', () => {
  for (const role of ROLES) {
    it(`grants a project-scoped ${role} link exactly its listed actions`, () => {
      for (const action of ACTIONS) {
        expect({ action, allowed: can(projectLink(role), action, targetFor(action)) })
          .toEqual({ action, allowed: ALLOWED[role].includes(action) })
      }
    })
  }
})

describe('can — top level is admin only', () => {
  it('classifies every action as either admin-only or reachable by manage', () => {
    for (const action of ACTIONS) {
      const classified = ADMIN_ONLY_ACTIONS.includes(action) || MANAGE.includes(action)
      expect({ action, classified }).toEqual({ action, classified: true })
    }
  })

  it('refuses every workspace action to every link role', () => {
    for (const role of ROLES) {
      for (const action of ADMIN_ONLY_ACTIONS) {
        expect(can(projectLink(role), action, WORKSPACE)).toBe(false)
      }
    }
  })

  it('refuses a workspace target even for an otherwise-granted action', () => {
    expect(can(projectLink('manage'), 'project:read', WORKSPACE)).toBe(false)
  })
})

describe('can — scope containment', () => {
  it('refuses another project entirely', () => {
    const elsewhere: Target = { kind: 'project', projectId: OTHER }
    expect(can(projectLink('manage'), 'project:read', elsewhere)).toBe(false)
  })

  it('lets a task-scoped link read its own task and write its own tabs', () => {
    expect(can(taskLink('view'), 'task:read', TASK)).toBe(true)
    expect(can(taskLink('write'), 'tab:write', TAB)).toBe(true)
  })

  it('refuses a task-scoped link any sibling task', () => {
    const sibling: Target = { kind: 'task', projectId: P, taskId: OTHER }
    expect(can(taskLink('manage'), 'task:read', sibling)).toBe(false)
    const siblingTab: Target = { kind: 'tab', projectId: P, taskId: OTHER }
    expect(can(taskLink('manage'), 'tab:write', siblingTab)).toBe(false)
  })

  it('lets a task-scoped link read its project but change nothing about it', () => {
    expect(can(taskLink('view'), 'project:read', PROJECT)).toBe(true)
    expect(can(taskLink('manage'), 'project:rename', PROJECT)).toBe(false)
    expect(can(taskLink('manage'), 'project:delete', PROJECT)).toBe(false)
  })

  it('refuses a task-scoped link the folder tree', () => {
    expect(can(taskLink('manage'), 'folder:create', PROJECT)).toBe(false)
    expect(can(taskLink('manage'), 'folder:rename', FOLDER)).toBe(false)
  })

  it('refuses a task-scoped link the power to create sibling tasks', () => {
    expect(can(taskLink('write'), 'task:create', PROJECT)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/kernel test policy
```

Expected: FAIL — cannot find module `./policy.js`.

- [ ] **Step 3: Create `packages/kernel/src/access/policy.ts`**

```ts
import type { Action } from './action.js'
import type { Principal } from './principal.js'
import type { Role } from './role.js'
import type { Scope } from './scope.js'
import type { Target } from './target.js'

const VIEW = ['project:read', 'task:read'] as const

const WRITE = [
  ...VIEW,
  'folder:create',
  'folder:rename',
  'task:create',
  'task:rename',
  'tab:create',
  'tab:rename',
  'tab:write',
] as const

const MANAGE = [
  ...WRITE,
  'project:rename',
  'project:delete',
  'folder:delete',
  'folder:reorder',
  'task:delete',
  'task:move',
  'tab:delete',
  'tab:reorder',
  'share:read',
  'share:create',
  'share:revoke',
  'export:run',
] as const

const GRANTS: Readonly<Record<Role, readonly Action[]>> = {
  view: VIEW,
  write: WRITE,
  manage: MANAGE,
}

/** Actions with no per-resource target, reserved to the admin (ADR 0009). */
export const ADMIN_ONLY_ACTIONS: readonly Action[] = [
  'workspace:list-projects',
  'workspace:create-project',
  'workspace:import',
  'workspace:search',
]

const TASK_SCOPE_PROJECT_ACTIONS: readonly Action[] = ['project:read']

function withinProjectScope(scope: Scope, target: Target): boolean {
  return target.kind !== 'workspace' && target.projectId === scope.projectId
}

function withinTaskScope(scope: Scope, action: Action, target: Target): boolean {
  if (scope.kind !== 'task') return false
  if (target.kind === 'project') return TASK_SCOPE_PROJECT_ACTIONS.includes(action)
  if (target.kind === 'task' || target.kind === 'tab') return target.taskId === scope.taskId
  return false
}

function inScope(scope: Scope, action: Action, target: Target): boolean {
  if (!withinProjectScope(scope, target)) return false
  return scope.kind === 'project' ? true : withinTaskScope(scope, action, target)
}

/** Decides whether a principal may perform an action on a target. Pure. */
export function can(principal: Principal, action: Action, target: Target): boolean {
  if (principal.kind === 'admin') return true
  if (ADMIN_ONLY_ACTIONS.includes(action)) return false
  if (!inScope(principal.scope, action, target)) return false
  return GRANTS[principal.role].includes(action)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @repo/kernel test policy
```

Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/access/policy.ts packages/kernel/src/access/policy.test.ts
git commit -m "feat(kernel): add AccessPolicy with exhaustive role x action tests"
```

---

### Task 9: Kernel ports

Interfaces only. Nothing here imports `node:fs` — that is the inversion (ADR 0003).

**Files:**
- Create: `packages/kernel/src/ports/clock.ts`, `id-generator.ts`, `lock.ts`, `file-system.ts`,
  `project-store.ts`

- [ ] **Step 1: Create `packages/kernel/src/ports/clock.ts`**

```ts
/** Supplies the current time, so services never read it themselves. */
export interface Clock {
  /** Returns the current time as an ISO 8601 string. */
  now(): string
}
```

- [ ] **Step 2: Create `packages/kernel/src/ports/id-generator.ts`**

```ts
/** Supplies new identifiers, so services never generate them themselves. */
export interface IdGenerator {
  /** Returns a new entity identifier. */
  entityId(): string

  /** Returns a new share-link token. */
  token(): string
}
```

- [ ] **Step 3: Create `packages/kernel/src/ports/lock.ts`**

```ts
/** Serialises read-modify-write cycles against the same data. */
export interface Lock {
  /** Runs `work` once no earlier work is outstanding. */
  run<T>(work: () => Promise<T>): Promise<T>
}
```

- [ ] **Step 4: Create `packages/kernel/src/ports/file-system.ts`**

```ts
/** The whole filesystem surface the store is allowed to use. */
export interface FileSystem {
  /** Reads a UTF-8 file, or returns null when it does not exist. */
  readText(file: string): Promise<string | null>

  /** Writes a UTF-8 file atomically, creating parent directories. */
  writeTextAtomic(file: string, text: string): Promise<void>

  /** Deletes a file, reporting whether it existed. */
  remove(file: string): Promise<boolean>

  /** Deletes a directory and everything under it, reporting whether it existed. */
  removeDir(dir: string): Promise<boolean>

  /** Lists immediate subdirectory names, or an empty array when absent. */
  listDirs(dir: string): Promise<readonly string[]>

  /** Lists immediate file names, or an empty array when absent. */
  listFiles(dir: string): Promise<readonly string[]>
}
```

- [ ] **Step 5: Create `packages/kernel/src/ports/project-store.ts`**

The two-file write ordering of ADR 0006 belongs to this port, which is why `saveTask` and
`deleteTask` take the manifest rather than callers writing it separately.

```ts
import type { ProjectManifest } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import type { Product } from '../product.js'

/** Persistence for projects, with the write ordering that keeps a crash recoverable. */
export interface ProjectStore {
  /** Reads every project manifest, newest update first. */
  listManifests(product: Product): Promise<readonly ProjectManifest[]>

  /** Reads one project manifest, or null when the project does not exist. */
  readManifest(product: Product, projectId: string): Promise<ProjectManifest | null>

  /** Reads one task's tabs, or null when the task file is missing or unreadable. */
  readTask(product: Product, projectId: string, taskId: string): Promise<TaskDocument | null>

  /** Writes the manifest alone, for changes that touch no task file. */
  saveManifest(product: Product, manifest: ProjectManifest): Promise<void>

  /** Writes the task file, then the manifest, so a crash can only orphan a file. */
  saveTask(product: Product, manifest: ProjectManifest, task: TaskDocument): Promise<void>

  /** Writes the manifest, then unlinks the task file, in that order. */
  deleteTask(product: Product, manifest: ProjectManifest, taskId: string): Promise<void>

  /** Removes a project and everything under it, reporting whether it existed. */
  deleteProject(product: Product, projectId: string): Promise<boolean>
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/ports
git commit -m "feat(kernel): add repository and infrastructure ports"
```

---

### Task 10: The ProjectStore contract suite

ADR 0027 requires every adapter to pass one shared suite, so swapping the store later is a
package rather than a rewrite. This suite is the definition of correct storage behaviour.

**Files:**
- Create: `packages/kernel/src/testing/project-store-contract.ts`
- Create: `packages/kernel/src/testing/index.ts`
- Create: `packages/kernel/src/testing/fixtures.ts`

- [ ] **Step 1: Create `packages/kernel/src/testing/fixtures.ts`**

```ts
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import { emptyDocument } from '../entities/document.js'
import { NO_PROGRESS } from '../entities/progress.js'

export const STAMP = '2026-09-10T00:00:00.000Z'

export function taskEntry(id: string, name: string, overrides: Partial<TaskEntry> = {}): TaskEntry {
  return { id, name, position: 0, folderId: null, progress: NO_PROGRESS, ...overrides }
}

export function taskDocument(id: string, tabId: string): TaskDocument {
  return {
    id,
    createdAt: STAMP,
    updatedAt: STAMP,
    tabs: [
      { id: tabId, name: 'General', position: 0, document: emptyDocument(), createdAt: STAMP, updatedAt: STAMP },
    ],
  }
}

export function manifest(id: string, overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    id,
    name: 'Launch',
    folders: [],
    tasks: [],
    shareLinks: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  }
}
```

- [ ] **Step 2: Create `packages/kernel/src/testing/project-store-contract.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { ProjectStore } from '../ports/project-store.js'
import { manifest, taskDocument, taskEntry } from './fixtures.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAB'
const T1 = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB1 = '01M240FB4GD6PF6V0PKZVF6FDA'

export interface StoreHarness {
  store: ProjectStore
  reset(): Promise<void>
}

/** Runs the behaviour every ProjectStore adapter must exhibit. */
export function describeProjectStore(name: string, makeHarness: () => StoreHarness): void {
  describe(`${name} — ProjectStore contract`, () => {
    const harness = makeHarness()
    const { store } = harness

    const fresh = async () => {
      await harness.reset()
    }

    it('returns null for a project that was never written', async () => {
      await fresh()
      expect(await store.readManifest('microtask', P1)).toBeNull()
    })

    it('round-trips a manifest', async () => {
      await fresh()
      const m = manifest(P1, { name: 'Discovery' })
      await store.saveManifest('microtask', m)
      expect(await store.readManifest('microtask', P1)).toEqual(m)
    })

    it('round-trips a task and its manifest entry together', async () => {
      await fresh()
      const task = taskDocument(T1, TAB1)
      const m = manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] })
      await store.saveTask('microtask', m, task)
      expect(await store.readTask('microtask', P1, T1)).toEqual(task)
      expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Go-live')
    })

    it('keeps products in separate data roots', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { name: 'Mine' }))
      expect(await store.readManifest('macroplan', P1)).toBeNull()
    })

    it('lists manifests newest update first', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { updatedAt: '2026-01-01T00:00:00.000Z' }))
      await store.saveManifest('microtask', manifest(P2, { updatedAt: '2026-06-01T00:00:00.000Z' }))
      expect((await store.listManifests('microtask')).map((m) => m.id)).toEqual([P2, P1])
    })

    it('deletes a task file and its manifest entry', async () => {
      await fresh()
      await store.saveTask('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] }), taskDocument(T1, TAB1))
      await store.deleteTask('microtask', manifest(P1, { tasks: [] }), T1)
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
      expect((await store.readManifest('microtask', P1))?.tasks).toEqual([])
    })

    it('treats a manifest entry with no task file as one unreadable task, not a broken project', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Ghost')] }))
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
      expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Ghost')
    })

    it('removes a project and everything under it', async () => {
      await fresh()
      await store.saveTask('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] }), taskDocument(T1, TAB1))
      expect(await store.deleteProject('microtask', P1)).toBe(true)
      expect(await store.readManifest('microtask', P1)).toBeNull()
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
    })

    it('reports a project that was never there as not deleted', async () => {
      await fresh()
      expect(await store.deleteProject('microtask', P2)).toBe(false)
    })

    it('rejects an identifier that is not a ULID', async () => {
      await fresh()
      await expect(store.readManifest('microtask', '../../etc/passwd')).rejects.toThrow()
    })
  })
}
```

- [ ] **Step 3: Create `packages/kernel/src/testing/index.ts`**

```ts
export { describeProjectStore, type StoreHarness } from './project-store-contract.js'
export { manifest, taskDocument, taskEntry, STAMP } from './fixtures.js'
```

- [ ] **Step 4: Verify it compiles**

```bash
pnpm --filter @repo/kernel typecheck
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/testing
git commit -m "feat(kernel): add ProjectStore contract test suite"
```

---

### Task 11: Kernel barrel and build

**Files:**
- Create: `packages/kernel/src/index.ts`

- [ ] **Step 1: Create `packages/kernel/src/index.ts`**

```ts
export { isProduct, PRODUCTS, type Product } from './product.js'
export { isShareToken, isUlid, shareToken, ulid } from './ids.js'
export { AppError, Conflict, Forbidden, Invalid, NotFound } from './errors.js'

export { emptyDocument, type DocumentJson } from './entities/document.js'
export { NO_PROGRESS, type Progress } from './entities/progress.js'
export type { Tab } from './entities/tab.js'
export type { TaskDocument } from './entities/task.js'
export type { Folder } from './entities/folder.js'
export type { ShareLink } from './entities/share-link.js'
export type { ProjectManifest, TaskEntry } from './entities/manifest.js'

export { ACTIONS, type Action } from './access/action.js'
export { isRole, ROLES, type Role } from './access/role.js'
export type { Scope } from './access/scope.js'
export type { Principal } from './access/principal.js'
export type { Target } from './access/target.js'
export { ADMIN_ONLY_ACTIONS, can } from './access/policy.js'

export type { Clock } from './ports/clock.js'
export type { IdGenerator } from './ports/id-generator.js'
export type { Lock } from './ports/lock.js'
export type { FileSystem } from './ports/file-system.js'
export type { ProjectStore } from './ports/project-store.js'
```

- [ ] **Step 2: Build and verify the declaration output exists**

```bash
pnpm --filter @repo/kernel build
ls packages/kernel/dist/index.d.ts packages/kernel/dist/testing/index.d.ts
```

Expected: both paths listed.

- [ ] **Step 3: Run lint to confirm the size caps and comment rule pass on real code**

```bash
pnpm --filter @repo/kernel lint
```

Expected: no output, exit 0. If `max-lines` fires, split the offending file — do not raise the cap.

- [ ] **Step 4: Commit**

```bash
git add packages/kernel
git commit -m "feat(kernel): add public barrel and build output"
```

---

### Task 12: Contracts package

Plain Zod only, `.meta({ id })` and never `.openapi()`, with the unique-id test that ADR 0024's
spike proved is the only defence against silently collapsed schemas.

**Files:**
- Create: `packages/contracts/package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`
- Create: `packages/contracts/src/{progress,document,tab,folder,task,share-link,project}.ts`
- Create: `packages/contracts/src/index.ts`, `src/index.test.ts`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@repo/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "dependencies": { "zod": "catalog:" },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@repo/eslint-config": "workspace:*",
    "typescript": "latest",
    "vitest": "latest",
    "eslint": "latest"
  }
}
```

- [ ] **Step 2: Create `packages/contracts/tsconfig.json`**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/contracts/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
```

- [ ] **Step 4: Create `packages/contracts/eslint.config.js`**

The import ban is the enforcement ADR 0024 depends on.

```js
import base from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@hono/zod-openapi', message: 'contracts must stay framework-free; use z.meta({ id }) from zod (ADR 0024)' },
          { name: 'hono', message: 'contracts must stay framework-free (ADR 0024)' },
          { name: '@asteasolutions/zod-to-openapi', message: 'contracts must stay framework-free (ADR 0024)' },
        ],
      }],
    },
  },
]
```

- [ ] **Step 5: Write the failing test**

Create `packages/contracts/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as contracts from './index.js'

const schemas = Object.entries(contracts).filter(
  (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
)

describe('contracts', () => {
  it('exports at least one schema', () => {
    expect(schemas.length).toBeGreaterThan(0)
  })

  it('gives every exported schema a component id', () => {
    const missing = schemas.filter(([, schema]) => !schema.meta()?.id).map(([name]) => name)
    expect(missing).toEqual([])
  })

  it('never reuses a component id', () => {
    const ids = schemas.map(([, schema]) => schema.meta()?.id).filter(Boolean)
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(duplicates).toEqual([])
  })

  it('accepts a valid project manifest', () => {
    const parsed = contracts.ProjectManifest.safeParse({
      id: '01M240ERCRWWCN16Q5AHP1FZAQ',
      name: 'Launch',
      folders: [],
      tasks: [],
      shareLinks: [],
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a name longer than 80 characters', () => {
    expect(contracts.EntityName.safeParse('x'.repeat(81)).success).toBe(false)
    expect(contracts.EntityName.safeParse('x'.repeat(80)).success).toBe(true)
  })

  it('rejects a document that is not a doc node', () => {
    expect(contracts.DocumentJson.safeParse({ type: 'paragraph' }).success).toBe(false)
    expect(contracts.DocumentJson.safeParse({ type: 'doc', content: [] }).success).toBe(true)
  })

  it('rejects an id that is not a ULID', () => {
    expect(contracts.EntityId.safeParse('../../etc/passwd').success).toBe(false)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
pnpm --filter @repo/contracts test
```

Expected: FAIL — cannot find module `./index.js`.

- [ ] **Step 7: Create `packages/contracts/src/progress.ts`**

```ts
import { z } from 'zod'

/** Counted checklist state. */
export const Progress = z
  .object({ done: z.number().int().min(0), total: z.number().int().min(0) })
  .meta({ id: 'Progress', description: 'Counted checklist state, derived from a document' })
```

- [ ] **Step 8: Create `packages/contracts/src/document.ts`**

```ts
import { z } from 'zod'

/** A ULID-shaped identifier. */
export const EntityId = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be a ULID')
  .meta({ id: 'EntityId', description: 'A ULID-shaped identifier' })

/** A share-link token. */
export const ShareToken = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, 'must be a share token')
  .meta({ id: 'ShareToken', description: 'An opaque share-link token' })

/** A user-supplied name for a project, folder, task or tab. */
export const EntityName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .meta({ id: 'EntityName', description: 'A display name, at most 80 characters' })

/** A Tiptap/ProseMirror document. */
export const DocumentJson = z
  .object({ type: z.literal('doc'), content: z.array(z.unknown()).optional() })
  .meta({ id: 'DocumentJson', description: 'A Tiptap document, stored as JSON and never as HTML' })
```

- [ ] **Step 9: Create `packages/contracts/src/tab.ts`**

```ts
import { z } from 'zod'
import { DocumentJson, EntityId, EntityName } from './document.js'

/** One tab inside a task. */
export const Tab = z
  .object({
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    document: DocumentJson,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Tab', description: 'One tab inside a task, owning its own document' })
```

- [ ] **Step 10: Create `packages/contracts/src/folder.ts`**

```ts
import { z } from 'zod'
import { EntityId, EntityName } from './document.js'

/** A one-level grouping of tasks inside a project. */
export const Folder = z
  .object({
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Folder', description: 'A one-level grouping of tasks; folders never nest' })
```

- [ ] **Step 11: Create `packages/contracts/src/task.ts`**

```ts
import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { Progress } from './progress.js'
import { Tab } from './tab.js'

/** A task as the manifest knows it. */
export const TaskEntry = z
  .object({
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    folderId: EntityId.nullable(),
    progress: Progress,
  })
  .meta({ id: 'TaskEntry', description: 'A task as its project manifest records it' })

/** The contents of one task file. */
export const TaskDocument = z
  .object({
    id: EntityId,
    tabs: z.array(Tab).max(40),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'TaskDocument', description: 'One task file: its tabs and nothing else' })
```

- [ ] **Step 12: Create `packages/contracts/src/share-link.ts`**

```ts
import { z } from 'zod'
import { EntityId, EntityName, ShareToken } from './document.js'

/** The authority a share link carries. */
export const Role = z
  .enum(['view', 'write', 'manage'])
  .meta({ id: 'Role', description: 'The authority a share link carries' })

/** What a share link may reach. */
export const Scope = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('project'), projectId: EntityId }),
    z.object({ kind: z.literal('task'), projectId: EntityId, taskId: EntityId }),
  ])
  .meta({ id: 'Scope', description: 'What a share link may reach' })

/** One person's access to a project or a single task. */
export const ShareLink = z
  .object({
    token: ShareToken,
    name: EntityName.or(z.literal('')),
    role: Role,
    scope: Scope,
    createdBy: ShareToken.nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'ShareLink', description: 'One person’s access, and who granted it' })
```

- [ ] **Step 13: Create `packages/contracts/src/project.ts`**

```ts
import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { Folder } from './folder.js'
import { ShareLink } from './share-link.js'
import { TaskEntry } from './task.js'

/** Everything about a project except its tab documents. */
export const ProjectManifest = z
  .object({
    id: EntityId,
    name: EntityName,
    folders: z.array(Folder).max(100),
    tasks: z.array(TaskEntry).max(500),
    shareLinks: z.array(ShareLink).max(50),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'ProjectManifest', description: 'A project manifest: folders, tasks and share links' })
```

- [ ] **Step 14: Create `packages/contracts/src/index.ts`**

```ts
export { EntityId, EntityName, DocumentJson, ShareToken } from './document.js'
export { Progress } from './progress.js'
export { Tab } from './tab.js'
export { Folder } from './folder.js'
export { TaskEntry, TaskDocument } from './task.js'
export { Role, Scope, ShareLink } from './share-link.js'
export { ProjectManifest } from './project.js'
```

- [ ] **Step 15: Run the test to verify it passes**

```bash
pnpm --filter @repo/contracts test
```

Expected: PASS — 7 tests.

- [ ] **Step 16: Prove the framework-free rule is enforced, not just intended**

```bash
cd packages/contracts
printf "import { z } from '@hono/zod-openapi'\nexport const Bad = z.object({})\n" > src/scratch.ts
pnpm exec eslint src/scratch.ts; echo "exit=$?"
rm src/scratch.ts
cd ../..
```

Expected: an error mentioning "contracts must stay framework-free", and `exit=1`.

- [ ] **Step 17: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add framework-free Zod schemas with unique-id guard"
```

---

### Task 13: Node FileSystem adapter and the path chokepoint

Every disk path in the system is built by the two functions here, each asserting a ULID and a
resolved-prefix containment check (ADR 0005). Nothing else may call `path.join`.

**Files:**
- Create: `packages/store/package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`
- Create: `packages/store/src/paths.ts`, `src/paths.test.ts`, `src/node-file-system.ts`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@repo/store",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "dependencies": { "@repo/kernel": "workspace:*" },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@repo/eslint-config": "workspace:*",
    "@types/node": "latest",
    "typescript": "latest",
    "vitest": "latest",
    "eslint": "latest"
  }
}
```

- [ ] **Step 2: Create `packages/store/tsconfig.json`**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/store/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
```

- [ ] **Step 4: Create `packages/store/eslint.config.js`**

```js
import base from '@repo/eslint-config'

export default base
```

- [ ] **Step 5: Write the failing test**

Create `packages/store/src/paths.test.ts`:

```ts
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { manifestFile, projectDir, projectsDir, taskFile } from './paths.js'

const ROOT = path.resolve('/data')
const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'

describe('projectDir', () => {
  it('places a project under its product root', () => {
    expect(projectDir(ROOT, 'microtask', P)).toBe(
      path.join(ROOT, 'microtask', 'projects', P),
    )
  })

  it.each(['../../etc', '..', 'a/b', 'not-a-ulid', '', 'IIIIIIIIIIIIIIIIIIIIIIIIII'])(
    'refuses %s as a project id',
    (bad) => {
      expect(() => projectDir(ROOT, 'microtask', bad)).toThrow(Invalid)
    },
  )

  it('refuses an unknown product', () => {
    expect(() => projectDir(ROOT, 'other' as 'microtask', P)).toThrow(Invalid)
  })
})

describe('projectsDir', () => {
  it('places every product in its own root', () => {
    expect(projectsDir(ROOT, 'microtask')).toBe(path.join(ROOT, 'microtask', 'projects'))
    expect(projectsDir(ROOT, 'macroplan')).toBe(path.join(ROOT, 'macroplan', 'projects'))
  })

  it('refuses an unknown product', () => {
    expect(() => projectsDir(ROOT, 'other' as 'microtask')).toThrow(Invalid)
  })
})

describe('manifestFile', () => {
  it('names the manifest inside the project directory', () => {
    expect(manifestFile(ROOT, 'microtask', P)).toBe(
      path.join(ROOT, 'microtask', 'projects', P, 'project.json'),
    )
  })
})

describe('taskFile', () => {
  it('names a task file inside the project tasks directory', () => {
    expect(taskFile(ROOT, 'microtask', P, T)).toBe(
      path.join(ROOT, 'microtask', 'projects', P, 'tasks', `${T}.json`),
    )
  })

  it.each(['../../../secret', '..', 'not-a-ulid'])('refuses %s as a task id', (bad) => {
    expect(() => taskFile(ROOT, 'microtask', P, bad)).toThrow(Invalid)
  })

  it('never escapes the data root', () => {
    const built = taskFile(ROOT, 'microtask', P, T)
    expect(built.startsWith(ROOT + path.sep)).toBe(true)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
pnpm --filter @repo/store test paths
```

Expected: FAIL — cannot find module `./paths.js`.

- [ ] **Step 7: Create `packages/store/src/paths.ts`**

```ts
import path from 'node:path'
import { Invalid, isProduct, isUlid, type Product } from '@repo/kernel'

const MANIFEST = 'project.json'
const TASKS = 'tasks'

function contained(root: string, target: string): string {
  const base = path.resolve(root)
  const resolved = path.resolve(target)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Invalid('Path escapes the data root')
  }
  return resolved
}

/** Resolves the directory holding every project for one product. */
export function projectsDir(root: string, product: Product): string {
  if (!isProduct(product)) throw new Invalid('Unknown product')
  return contained(root, path.join(root, product, 'projects'))
}

/** Resolves the directory holding one project's files. */
export function projectDir(root: string, product: Product, projectId: string): string {
  if (!isUlid(projectId)) throw new Invalid('Project id must be a ULID')
  return contained(root, path.join(projectsDir(root, product), projectId))
}

/** Resolves the file holding one project's manifest. */
export function manifestFile(root: string, product: Product, projectId: string): string {
  return contained(root, path.join(projectDir(root, product, projectId), MANIFEST))
}

/** Resolves the file holding one task's tabs. */
export function taskFile(
  root: string,
  product: Product,
  projectId: string,
  taskId: string,
): string {
  if (!isUlid(taskId)) throw new Invalid('Task id must be a ULID')
  const dir = path.join(projectDir(root, product, projectId), TASKS)
  return contained(root, path.join(dir, `${taskId}.json`))
}

/** Resolves the directory holding one project's task files. */
export function tasksDir(root: string, product: Product, projectId: string): string {
  return contained(root, path.join(projectDir(root, product, projectId), TASKS))
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
pnpm --filter @repo/store test paths
```

Expected: PASS — 13 tests.

- [ ] **Step 9: Create `packages/store/src/node-file-system.ts`**

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FileSystem } from '@repo/kernel'

const missing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

/** The only implementation of FileSystem that touches a real disk. */
export class NodeFileSystem implements FileSystem {
  /** Reads a UTF-8 file, or returns null when it does not exist. */
  async readText(file: string): Promise<string | null> {
    try {
      return await fs.readFile(file, 'utf8')
    } catch (error) {
      if (missing(error)) return null
      throw error
    }
  }

  /** Writes a UTF-8 file atomically, creating parent directories. */
  async writeTextAtomic(file: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await fs.writeFile(temp, text)
    await fs.rename(temp, file)
  }

  /** Deletes a file, reporting whether it existed. */
  async remove(file: string): Promise<boolean> {
    try {
      await fs.unlink(file)
      return true
    } catch (error) {
      if (missing(error)) return false
      throw error
    }
  }

  /** Deletes a directory and everything under it, reporting whether it existed. */
  async removeDir(dir: string): Promise<boolean> {
    const existed = await fs.stat(dir).then(() => true, () => false)
    await fs.rm(dir, { recursive: true, force: true })
    return existed
  }

  /** Lists immediate subdirectory names, or an empty array when absent. */
  async listDirs(dir: string): Promise<readonly string[]> {
    return this.#entries(dir, (entry) => entry.isDirectory())
  }

  /** Lists immediate file names, or an empty array when absent. */
  async listFiles(dir: string): Promise<readonly string[]> {
    return this.#entries(dir, (entry) => entry.isFile())
  }

  async #entries(dir: string, keep: (e: { isFile(): boolean; isDirectory(): boolean }) => boolean) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return entries.filter(keep).map((entry) => entry.name)
    } catch (error) {
      if (missing(error)) return []
      throw error
    }
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add packages/store
git commit -m "feat(store): add path chokepoint and Node filesystem adapter"
```

---

### Task 14: The write queue

**Files:**
- Create: `packages/store/src/queue-lock.ts`, `src/queue-lock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/store/src/queue-lock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { QueueLock } from './queue-lock.js'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('QueueLock', () => {
  it('runs work in the order it was submitted', async () => {
    const lock = new QueueLock()
    const order: string[] = []
    await Promise.all([
      lock.run(async () => {
        await wait(20)
        order.push('first')
      }),
      lock.run(async () => {
        order.push('second')
      }),
    ])
    expect(order).toEqual(['first', 'second'])
  })

  it('never overlaps two pieces of work', async () => {
    const lock = new QueueLock()
    let inside = 0
    let maxInside = 0
    await Promise.all(
      Array.from({ length: 10 }, () =>
        lock.run(async () => {
          inside += 1
          maxInside = Math.max(maxInside, inside)
          await wait(1)
          inside -= 1
        }),
      ),
    )
    expect(maxInside).toBe(1)
  })

  it('keeps running later work after earlier work rejects', async () => {
    const lock = new QueueLock()
    const failed = lock.run(async () => {
      throw new Error('boom')
    })
    await expect(failed).rejects.toThrow('boom')
    await expect(lock.run(async () => 'fine')).resolves.toBe('fine')
  })

  it('returns the value the work produced', async () => {
    const lock = new QueueLock()
    await expect(lock.run(async () => 42)).resolves.toBe(42)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/store test queue-lock
```

Expected: FAIL — cannot find module `./queue-lock.js`.

- [ ] **Step 3: Create `packages/store/src/queue-lock.ts`**

```ts
import type { Lock } from '@repo/kernel'

/** Serialises work through a single promise chain, in submission order. */
export class QueueLock implements Lock {
  #chain: Promise<unknown> = Promise.resolve()

  /** Runs `work` once no earlier work is outstanding. */
  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#chain.then(work, work)
    this.#chain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @repo/store test queue-lock
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/store/src/queue-lock.ts packages/store/src/queue-lock.test.ts
git commit -m "feat(store): add serialising write queue"
```

---

### Task 15: FsProjectStore

Implements the port, including the ADR 0006 ordering. `FileSystem` is injected, which is what
makes the crash test in Task 16 possible.

**Files:**
- Create: `packages/store/src/fs-project-store.ts`
- Create: `packages/store/src/index.ts`
- Create: `packages/store/src/fs-project-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/store/src/fs-project-store.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describeProjectStore } from '@repo/kernel/testing'
import { FsProjectStore } from './fs-project-store.js'
import { NodeFileSystem } from './node-file-system.js'

describeProjectStore('FsProjectStore', () => {
  let root = ''
  const store = new FsProjectStore({
    files: new NodeFileSystem(),
    root: () => root,
  })
  return {
    store,
    async reset() {
      if (root) await rm(root, { recursive: true, force: true })
      root = await mkdtemp(path.join(tmpdir(), 'ccg-store-'))
    },
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/store test fs-project-store
```

Expected: FAIL — cannot find module `./fs-project-store.js`.

- [ ] **Step 3: Create `packages/store/src/fs-project-store.ts`**

```ts
import {
  isUlid,
  type FileSystem,
  type Product,
  type ProjectManifest,
  type ProjectStore,
  type TaskDocument,
} from '@repo/kernel'
import { manifestFile, projectDir, projectsDir, taskFile, tasksDir } from './paths.js'

export interface FsProjectStoreOptions {
  files: FileSystem
  root: () => string
}

/** A ProjectStore over plain JSON files, one directory per project. */
export class FsProjectStore implements ProjectStore {
  readonly #files: FileSystem
  readonly #root: () => string

  constructor(options: FsProjectStoreOptions) {
    this.#files = options.files
    this.#root = options.root
  }

  /** Reads every project manifest, newest update first. */
  async listManifests(product: Product): Promise<readonly ProjectManifest[]> {
    const ids = await this.#files.listDirs(projectsDir(this.#root(), product))
    const found: ProjectManifest[] = []
    for (const id of ids) {
      if (!isUlid(id)) continue
      const manifest = await this.readManifest(product, id)
      if (manifest) found.push(manifest)
    }
    return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** Reads one project manifest, or null when the project does not exist. */
  async readManifest(product: Product, projectId: string): Promise<ProjectManifest | null> {
    return this.#readJson<ProjectManifest>(manifestFile(this.#root(), product, projectId))
  }

  /** Reads one task's tabs, or null when the task file is missing or unreadable. */
  async readTask(
    product: Product,
    projectId: string,
    taskId: string,
  ): Promise<TaskDocument | null> {
    return this.#readJson<TaskDocument>(taskFile(this.#root(), product, projectId, taskId))
  }

  /** Writes the manifest alone, for changes that touch no task file. */
  async saveManifest(product: Product, manifest: ProjectManifest): Promise<void> {
    await this.#writeJson(manifestFile(this.#root(), product, manifest.id), manifest)
  }

  /** Writes the task file, then the manifest, so a crash can only orphan a file. */
  async saveTask(
    product: Product,
    manifest: ProjectManifest,
    task: TaskDocument,
  ): Promise<void> {
    await this.#writeJson(taskFile(this.#root(), product, manifest.id, task.id), task)
    await this.saveManifest(product, manifest)
  }

  /** Writes the manifest, then unlinks the task file, in that order. */
  async deleteTask(
    product: Product,
    manifest: ProjectManifest,
    taskId: string,
  ): Promise<void> {
    await this.saveManifest(product, manifest)
    await this.#files.remove(taskFile(this.#root(), product, manifest.id, taskId))
  }

  /** Removes a project and everything under it, reporting whether it existed. */
  async deleteProject(product: Product, projectId: string): Promise<boolean> {
    return this.#files.removeDir(projectDir(this.#root(), product, projectId))
  }

  /** Lists the task ids that have a file on disk, whatever the manifest says. */
  async listTaskFiles(product: Product, projectId: string): Promise<readonly string[]> {
    const names = await this.#files.listFiles(tasksDir(this.#root(), product, projectId))
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -5))
      .filter(isUlid)
  }

  async #readJson<T>(file: string): Promise<T | null> {
    const raw = await this.#files.readText(file)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async #writeJson(file: string, value: unknown): Promise<void> {
    await this.#files.writeTextAtomic(file, JSON.stringify(value, null, 2))
  }
}
```

- [ ] **Step 4: Create `packages/store/src/index.ts`**

```ts
export { FsProjectStore, type FsProjectStoreOptions } from './fs-project-store.js'
export { NodeFileSystem } from './node-file-system.js'
export { QueueLock } from './queue-lock.js'
export { manifestFile, projectDir, projectsDir, taskFile, tasksDir } from './paths.js'
```

- [ ] **Step 5: Build kernel so the `/testing` subpath resolves, then run the contract suite**

```bash
pnpm --filter @repo/kernel build
pnpm --filter @repo/store test fs-project-store
```

Expected: PASS — 10 tests, all from the kernel contract suite.

- [ ] **Step 6: Run the whole store suite**

```bash
pnpm --filter @repo/store test
```

Expected: PASS across `paths`, `queue-lock` and the contract suite. The contract suite's
"rejects an identifier that is not a ULID" case proves `Invalid` propagates through the store
surface and not just the path builder.

- [ ] **Step 7: Commit**

```bash
git add packages/store
git commit -m "feat(store): add FsProjectStore passing the kernel contract suite"
```

---

### Task 16: Crash-ordering tests

ADR 0006's guarantee is a claim about what a kill leaves behind. This proves it.

**Files:**
- Create: `packages/store/src/fs-project-store.ordering.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/store/src/fs-project-store.ordering.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FileSystem } from '@repo/kernel'
import { manifest, taskDocument, taskEntry } from '@repo/kernel/testing'
import { FsProjectStore } from './fs-project-store.js'

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB = '01M240FB4GD6PF6V0PKZVF6FDA'

class MemoryFileSystem implements FileSystem {
  readonly writes: string[] = []
  readonly removals: string[] = []
  failOn: (file: string) => boolean = () => false

  readonly #store = new Map<string, string>()

  async readText(file: string) {
    return this.#store.get(file) ?? null
  }

  async writeTextAtomic(file: string, text: string) {
    if (this.failOn(file)) throw new Error('killed mid-write')
    this.writes.push(file)
    this.#store.set(file, text)
  }

  async remove(file: string) {
    this.removals.push(file)
    return this.#store.delete(file)
  }

  async removeDir() {
    return true
  }

  async listDirs() {
    return []
  }

  async listFiles() {
    return []
  }
}

const isManifest = (file: string) => file.includes('project.json')

function setup() {
  const files = new MemoryFileSystem()
  const store = new FsProjectStore({ files, root: () => '/data' })
  const entry = manifest(P, { tasks: [taskEntry(T, 'Go-live')] })
  const emptied = manifest(P, { tasks: [] })
  return { files, store, entry, emptied }
}

describe('write ordering (ADR 0006)', () => {
  it('writes the task file before the manifest, so a crash orphans a file at worst', async () => {
    const { files, store, entry } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    expect(files.writes.map((file) => (isManifest(file) ? 'manifest' : 'task'))).toEqual([
      'task',
      'manifest',
    ])
  })

  it('leaves no manifest entry pointing at a missing task file when the manifest write dies', async () => {
    const { files, store, entry } = setup()
    files.failOn = isManifest
    await expect(store.saveTask('microtask', entry, taskDocument(T, TAB))).rejects.toThrow(
      'killed mid-write',
    )
    expect(await store.readTask('microtask', P, T)).not.toBeNull()
    expect(await store.readManifest('microtask', P)).toBeNull()
  })

  it('writes the manifest before unlinking, so a crash never strands a referenced file', async () => {
    const { files, store, entry, emptied } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    files.writes.length = 0
    await store.deleteTask('microtask', emptied, T)
    expect(files.writes.some(isManifest)).toBe(true)
    expect(files.removals.some((file) => file.includes(T))).toBe(true)
  })

  it('keeps the task file when the manifest write dies during a delete', async () => {
    const { files, store, entry, emptied } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    files.failOn = isManifest
    await expect(store.deleteTask('microtask', emptied, T)).rejects.toThrow('killed mid-write')
    expect(files.removals).toEqual([])
    expect(await store.readTask('microtask', P, T)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails or passes for the right reason**

```bash
pnpm --filter @repo/store test ordering
```

Expected: PASS — 4 tests. If the second test fails with a manifest that is not null, the write
order in `saveTask` is wrong; fix the implementation, not the test.

- [ ] **Step 3: Commit**

```bash
git add packages/store/src/fs-project-store.ordering.test.ts
git commit -m "test(store): prove the ADR 0006 write ordering survives a mid-write crash"
```

---

### Task 17: Share-token index with the uniqueness invariant

ADR 0019 makes "one token belongs to exactly one project" an enforced store invariant. This is
the component that enforces it.

**Files:**
- Create: `packages/store/src/share-index.ts`, `src/share-index.test.ts`
- Modify: `packages/store/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/store/src/share-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Conflict } from '@repo/kernel'
import { manifest } from '@repo/kernel/testing'
import type { ShareLink } from '@repo/kernel'
import { ShareIndex } from './share-index.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAB'
const TOKEN = 'tok_abcdefghijklmnop'

const link = (token: string, projectId: string): ShareLink => ({
  token,
  name: 'Jane at ACME',
  role: 'view',
  scope: { kind: 'project', projectId },
  createdBy: null,
  createdAt: '2026-09-10T00:00:00.000Z',
})

describe('ShareIndex', () => {
  it('resolves a token to its project', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(index.find(TOKEN)).toEqual({ product: 'microtask', projectId: P1 })
  })

  it('returns null for a token it has never seen', () => {
    expect(new ShareIndex().find('tok_zzzzzzzzzzzzzzzz')).toBeNull()
  })

  it('refuses a token already owned by another project', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(() => index.add('microtask', manifest(P2, { shareLinks: [link(TOKEN, P2)] }))).toThrow(Conflict)
  })

  it('refuses a token owned by another product', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(() => index.add('macroplan', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))).toThrow(Conflict)
  })

  it('re-adding the same project replaces only its own tokens', () => {
    const index = new ShareIndex()
    const other = 'tok_bbbbbbbbbbbbbbbb'
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    index.add('microtask', manifest(P2, { shareLinks: [link(other, P2)] }))
    index.add('microtask', manifest(P1, { shareLinks: [] }))
    expect(index.find(TOKEN)).toBeNull()
    expect(index.find(other)).toEqual({ product: 'microtask', projectId: P2 })
  })

  it('removing a project drops only its own tokens', () => {
    const index = new ShareIndex()
    const other = 'tok_bbbbbbbbbbbbbbbb'
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    index.add('microtask', manifest(P2, { shareLinks: [link(other, P2)] }))
    index.removeProject('microtask', P1)
    expect(index.find(TOKEN)).toBeNull()
    expect(index.find(other)).not.toBeNull()
  })

  it('reports the tokens that would collide, before anything is written', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(index.collisions('microtask', P2, [TOKEN, 'tok_freshfreshfresh1'])).toEqual([TOKEN])
    expect(index.collisions('microtask', P1, [TOKEN])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/store test share-index
```

Expected: FAIL — cannot find module `./share-index.js`.

- [ ] **Step 3: Create `packages/store/src/share-index.ts`**

```ts
import { Conflict, type Product, type ProjectManifest } from '@repo/kernel'

/** Where a share token lives. */
export interface TokenOwner {
  readonly product: Product
  readonly projectId: string
}

const key = (owner: TokenOwner): string => `${owner.product}/${owner.projectId}`

/** Maps a share token to the one project that owns it. */
export class ShareIndex {
  readonly #owners = new Map<string, TokenOwner>()

  /** Resolves a token to its owning project, or null when unknown. */
  find(token: string): TokenOwner | null {
    return this.#owners.get(token) ?? null
  }

  /** Reports which of `tokens` are already owned by a different project. */
  collisions(product: Product, projectId: string, tokens: readonly string[]): readonly string[] {
    const mine = key({ product, projectId })
    return tokens.filter((token) => {
      const owner = this.#owners.get(token)
      return owner !== undefined && key(owner) !== mine
    })
  }

  /** Replaces the tokens recorded for one project, refusing any collision. */
  add(product: Product, manifest: ProjectManifest): void {
    const tokens = manifest.shareLinks.map((link) => link.token)
    const clashing = this.collisions(product, manifest.id, tokens)
    if (clashing.length > 0) {
      throw new Conflict(`Share token already belongs to another project: ${clashing.join(', ')}`)
    }
    this.removeProject(product, manifest.id)
    for (const token of tokens) this.#owners.set(token, { product, projectId: manifest.id })
  }

  /** Drops every token belonging to one project. */
  removeProject(product: Product, projectId: string): void {
    const mine = key({ product, projectId })
    for (const [token, owner] of this.#owners) {
      if (key(owner) === mine) this.#owners.delete(token)
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @repo/store test share-index
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Export it**

Add to `packages/store/src/index.ts`:

```ts
export { ShareIndex, type TokenOwner } from './share-index.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/store
git commit -m "feat(store): add share-token index enforcing one-token-one-project"
```

---

### Task 18: Green across the workspace

**Files:**
- Modify: `docs/superpowers/plans/2026-09-10-foundation.md` (tick the boxes)

- [ ] **Step 1: Build everything**

```bash
pnpm build
```

Expected: `@repo/kernel`, `@repo/contracts` and `@repo/store` all build. No TypeScript errors.

- [ ] **Step 2: Typecheck everything**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 3: Lint everything**

```bash
pnpm lint
```

Expected: exit 0. Any `max-lines` failure is fixed by splitting the file, and any
`tsdoc-comments-only` failure by deleting the comment and recording the rationale in an ADR or a
test name — never by disabling the rule.

- [ ] **Step 4: Test everything**

```bash
pnpm test
```

Expected: PASS, with no suite skipped. Four packages report: `@repo/eslint-config` (the local
comment rule), `@repo/kernel` (ids, errors, policy), `@repo/contracts` (schema guards) and
`@repo/store` (paths, queue lock, the contract suite, write ordering, share index).

Sanity-check the count rather than trusting it: `pnpm test 2>&1 | grep -E "Tests +[0-9]+"`. If the
kernel policy suite reports fewer cases than `ACTIONS.length × ROLES.length`, the matrix loop is
not running and the most important test in this plan is silently vacuous.

- [ ] **Step 5: Confirm the legacy app still runs**

```bash
cd apps/legacy && npm install --silent && ADMIN_PASSWORD=localdevpassword node server.js
```

Expected: `CC GUILD Microtask  ->  http://localhost:4321`. Stop it with Ctrl-C. This is the
reference implementation for the parity inventory in later plans, which is why it is kept.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: foundation green across build, typecheck, lint and test"
```

---

## Known issues carried forward

Found during execution, deliberately not fixed here. Recorded so they are not rediscovered the
hard way.

- **`.dockerignore` patterns are root-anchored and now stale.** `node_modules` and
  `public/vendor` no longer match `apps/legacy/…`. The legacy image still builds correctly
  because the Dockerfile copies specific paths, so the only cost is build-context size — which
  grows as pnpm's symlink farm accumulates across packages. Fixed in **Plan 5**, where the three
  per-image Dockerfiles are written.
- **The legacy Docker build is no longer lockfile-pinned.** Task 1 deletes and gitignores
  `package-lock.json`, because ADR 0026 requires no non-pnpm lockfile in the repo — a stray one
  silently moves Next's inferred tracing root. So the legacy build stage resolves its `^` ranges
  fresh, and a Tiptap patch release could change the bundled editor. Accepted because this
  branch is never deployed before cutover (ADR 0022) and the rollback path is redeploying the
  image built from `main`, which still has its lockfile. Legacy is removed in Plan 5.
- **pnpm 12 gates dependency build scripts.** `pnpm install` exits 1 with
  `ERR_PNPM_IGNORED_BUILDS` unless the decision is recorded, and `pnpm approve-builds` is
  interactive. Resolved in Task 1 with an explicit `allowBuilds: { esbuild: false }` in
  `pnpm-workspace.yaml` — verified sufficient, since esbuild's native binary arrives through its
  optional platform dependency rather than the postinstall. Written explicitly rather than left
  as pnpm's injected placeholder string, which otherwise dirties the tree on every install. The
  entry can go when legacy does.
- **`turbo run build` warns "no output files found" for `legacy`.** `turbo.json` declares
  `outputs: ["dist/**"]`, the convention for the new packages, while legacy writes to
  `public/vendor/`. Harmless; disappears with legacy.

## Definition of done

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass from the repository root.
- `packages/kernel` has no import of `node:fs` outside `ports/` type declarations.
- `packages/contracts` has no import of `hono`, `@hono/zod-openapi` or
  `@asteasolutions/zod-to-openapi`, proven by the ESLint check in Task 12 Step 16.
- `FsProjectStore` passes the kernel contract suite unmodified.
- The ADR 0006 ordering is proven by a test that fails the manifest write and asserts the task
  file survives with no manifest referencing it.
- `apps/legacy` still starts and serves the current app.

## What this plan deliberately does not build

Services (`TaskService`, `ShareLinkService`), the HTTP API, import/export, and any UI. Those are
Plans 2 to 5. Nothing here imports Hono, React or Next.

Two enforcement rules from the ADRs also land later, because there is nothing yet to enforce them
against:

- **`import/no-restricted-paths` stopping a Next app importing `packages/store`** (spec §14). It
  arrives in Plan 4 with the first Next app. Until then the only thing that could violate it is
  `apps/legacy`, which imports nothing from `packages/`.
- **The progress cache being written on every document save** (ADR 0007). Plan 1 defines the
  `progress` field on `TaskEntry` and the `Progress` type; the service that keeps it current is
  Plan 2. A manifest written by this plan carries `NO_PROGRESS`, which the "computed on read, never
  treated as zero" rule already covers.

Likewise `createdBy` exists on `ShareLink` here, but the revocation cascade that uses it (ADR 0010)
is a service concern in Plan 2.
