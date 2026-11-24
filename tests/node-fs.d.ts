// The root tsconfig loads only vite/client's types, so app code can't reach for
// Node APIs by accident. sharePreview.test.ts reads site files from disk (Vitest
// blanks CSS imports, even with ?raw), so declare just the one function it uses
// rather than pulling all of Node's globals into the app's type check.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
