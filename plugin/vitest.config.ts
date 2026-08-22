/**
 * Standalone vitest config for the external dsh-slide-bar plugin. Node
 * environment (jsdom comes from each spec's first-line pragma). Aliases
 * mirror the dsh monorepo's tsconfig paths: dsh packages resolve to their
 * sources because the built lib/client.js artifacts are browser closure
 * bundles and built lib/ would also duplicate module singletons.
 */
import ts from 'typescript'
import { defineConfig } from 'vitest/config'

const DSH = '/Volumes/DataDrive/proj/public/deepseek-harness'
const r = (path: string): string => new URL(path, import.meta.url).pathname

const decoratorSyntax = /^\s*@[A-Za-z_$][\w$]*/m

/** Transform standard TypeScript decorators before Vite's default parser sees source files (copied from dsh vitest.shared.ts). */
function standardDecoratorPlugin() {
  return {
    name: 'dsh-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0]!
      if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return { code: result.outputText, map: result.sourceMapText }
    },
  }
}

export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: {
    alias: [
      // Self imports resolve to source (the package's own exports point at built lib/).
      { find: 'dsh-slide-bar/client', replacement: r('./src/client/index.ts') },
      { find: 'dsh-slide-bar/invariant', replacement: r('./src/invariant.ts') },
      { find: 'dsh-slide-bar', replacement: r('./src/index.ts') },
      // dsh packages: source, not built lib. The '/client' entries precede
      // their bare names because a bare find also matches its subpaths.
      { find: '@deepseek-ai/dsh-client-runtime/client', replacement: `${DSH}/packages/client/runtime/src/client/index.ts` },
      { find: '@deepseek-ai/dsh-client-locale/client', replacement: `${DSH}/packages/client/locale/src/client/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-sidebar/client', replacement: `${DSH}/packages/client/ui-sidebar/src/client/index.ts` },
      { find: '@deepseek-ai/dsh-client-runtime', replacement: `${DSH}/packages/client/runtime/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-locale', replacement: `${DSH}/packages/client/locale/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-slots', replacement: `${DSH}/packages/client/ui-slots/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-primitives', replacement: `${DSH}/packages/client/ui-primitives/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-sidebar', replacement: `${DSH}/packages/client/ui-sidebar/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-web-react', replacement: `${DSH}/packages/client/web-react/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-test-runtime', replacement: `${DSH}/packages/test-support/client-runtime/src/index.ts` },
      { find: '@deepseek-ai/dsh-invariants', replacement: `${DSH}/packages/runtime-diagnostics/invariants/src/index.ts` },
      { find: '@deepseek-ai/cordis', replacement: `${DSH}/vendor/cordis/src/index.ts` },
      // One React copy for the whole graph; the react devDependencies link to
      // the dsh repo's own copy, so every resolution path lands on one instance.
      { find: 'react', replacement: r('./node_modules/react') },
      { find: 'react-dom', replacement: r('./node_modules/react-dom') },
    ],
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    // Keep process-wide Web Storage from shadowing jsdom storage (dsh vitest.shared.ts).
    execArgv: process.allowedNodeEnvironmentFlags.has('--webstorage') ? ['--no-webstorage'] : [],
  },
})
