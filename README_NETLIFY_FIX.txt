# Fix for Netlify build: Supabase dep + CJS warning

Steps:
1) Replace/merge `package.json` to include "@supabase/supabase-js" in dependencies.
2) Commit the provided `netlify.toml` so functions mark supabase as external.
3) Add recursive sanitizer prebuild: `node scripts/sanitize-all.js`.
4) **Rename** `netlify/functions/fd-proxy.js` to `fd-proxy.cjs` (CommonJS), or convert to ESM:
   - CommonJS: keep `exports.handler = async (...) => {}` but file must be `.cjs`
   - ESM: change to `export const handler = async (event) => { ... }` and keep `.js`

If you keep the file as `.js` with `exports.handler`, Node will warn in a `"type": "module"` package.
