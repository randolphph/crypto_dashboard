import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

if (!process.allowedNodeEnvironmentFlags.has('--use-env-proxy')) {
  throw new Error('当前 Node 不支持环境代理，请使用支持 --use-env-proxy 的版本（已验证 v25.9.0）。');
}

// Load proxy configuration before starting Node's fetch implementation.
// Passing --env-file to Next directly makes it copy that unsupported option
// into its child server's NODE_OPTIONS. Keep startup flags out of execArgv.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}
if (!process.env.HTTPS_PROXY && !process.env.https_proxy && !process.env.HTTP_PROXY && !process.env.http_proxy) {
  throw new Error('请先在 .env.local 设置 HTTPS_PROXY 为已有 HTTP 代理的地址。');
}
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 0; });
