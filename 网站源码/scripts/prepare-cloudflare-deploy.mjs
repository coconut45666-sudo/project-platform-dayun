import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const placeholder = '00000000-0000-4000-8000-000000000000';

export function deploymentSettings(env = process.env) {
  const value = name => String(env[name] || '').trim();
  const configuredName = value('CF_WORKER_NAME');
  const buildName = value('WRANGLER_CI_OVERRIDE_NAME');
  if (configuredName && buildName && configuredName !== buildName) {
    throw new Error('CF_WORKER_NAME 与 Cloudflare 当前 Worker 名称不一致，请在构建变量中修改。');
  }
  const worker = buildName || configuredName;
  const databaseId = value('CF_D1_DATABASE_ID');
  const databaseName = value('CF_D1_DATABASE_NAME');
  const bucketName = value('CF_R2_BUCKET_NAME');
  const missing = [!worker && 'CF_WORKER_NAME', !databaseId && 'CF_D1_DATABASE_ID',
    !databaseName && 'CF_D1_DATABASE_NAME', !bucketName && 'CF_R2_BUCKET_NAME'].filter(Boolean);
  if (missing.length) throw new Error('请先创建 D1 数据库和 R2 存储桶，再在 Cloudflare 构建变量中填写：' + missing.join(', '));
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(worker)) {
    throw new Error('Worker 名称须为 1–63 位小写字母、数字或中划线，首尾不能为中划线。');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId) || databaseId === placeholder) {
    throw new Error('CF_D1_DATABASE_ID 必须填写你创建的真实数据库 UUID，不能使用全零占位值。');
  }
  if (databaseName.length > 128 || /[\r\n\0]/.test(databaseName) || databaseName === 'site-creator-d1') {
    throw new Error('CF_D1_DATABASE_NAME 必须填写你自己的数据库名称。');
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName) || bucketName === 'site-creator-r2') {
    throw new Error('CF_R2_BUCKET_NAME 必须填写你自己的 R2 存储桶名称。');
  }
  return { worker, databaseId, databaseName, bucketName };
}

export function prepareDeployment(root = projectRoot, env = process.env) {
  const settings = deploymentSettings(env);
  const configPath = path.join(root, 'dist', 'server', 'wrangler.json');
  if (!fs.existsSync(configPath)) throw new Error('未找到构建产物。根目录应设为“网站源码”，并先运行 npm run build。');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.main !== 'index.js' || !fs.existsSync(path.join(root, 'dist', 'server', 'index.js')) ||
      config.assets?.directory !== '../client' || !fs.existsSync(path.join(root, 'dist', 'client'))) {
    throw new Error('构建产物不完整，请重新运行 npm run build。');
  }
  if (config.vars?.PLATFORM_USERS) throw new Error('PLATFORM_USERS 应设为 Worker 运行时 Secret，不应写入构建配置。');
  config.name = settings.worker;
  config.topLevelName = settings.worker;
  config.keep_vars = true;
  config.d1_databases = [{binding: 'DB', database_name: settings.databaseName,
    database_id: settings.databaseId, migrations_dir: '../../drizzle'}];
  config.r2_buckets = [{binding: 'BUCKET', bucket_name: settings.bucketName}];
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = prepareDeployment();
    console.log('Cloudflare 发布配置已生成：' + config.name + '；数据库 DB 和文件存储 BUCKET 已配置。');
    console.log('部署命令：npx wrangler deploy --config dist/server/wrangler.json');
  } catch (error) {
    console.error('[部署配置错误] ' + error.message);
    process.exitCode = 1;
  }
}
