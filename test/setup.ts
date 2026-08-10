// pnpm/action-setup exposes its own CLI path through this process-only value.
// Tests assert platform command construction, so that runner implementation
// detail must not change their expected commands.
delete process.env['npm_execpath']
