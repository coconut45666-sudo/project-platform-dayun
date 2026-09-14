import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deploymentSettings, prepareDeployment } from './prepare-cloudflare-deploy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  deploymentSettings();
  const build = spawnSync(process.execPath, [fileURLToPath(new URL('./run-framework.mjs', import.meta.url)), 'build'], {
    cwd: root, stdio: 'inherit', env: process.env,
  });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status || 1);
  const config = prepareDeployment(root);
  console.log('已生成可供自有 Cloudflare Worker 使用的构建产物：' + config.name);
} catch (error) {
  console.error('[Cloudflare 构建准备] ' + error.message);
  process.exitCode = 1;
}
