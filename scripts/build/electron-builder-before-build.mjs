/**
 * This app ships from bundled `out/` artifacts, so electron-builder does not
 * need to walk pnpm-managed node_modules during packaging.
 */
export default async function beforeBuild() {
  return false
}
