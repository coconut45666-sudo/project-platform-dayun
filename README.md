# 大运工程协同管理平台

同一项目、两个账户角色。展示账户查看航拍历史、设备、监测数据、数值模拟、项目资料和报告文件；管理账户还可以修改项目与设备信息、维护监测数据、上传断面与报告、修改文件信息及删除恢复。权限由服务端检查。

## 功能与存储

- 首页项目概况、可扩展参建单位、设备统计、视频入口、每日航拍历史及三个模块入口。
- SW / NSW 平面图、时间序列、断面图、CSV 下载；管理员表格维护、Excel 导入、断面替换和并发版本检查。
- 数值模拟、项目资料与报告分类库，支持搜索、分类筛选、上传、下载、图片/PDF 预览、修改和回收站。DOC/DWG 等保留原文件下载，未提供浏览器 CAD/Word 渲染器。
- 报告中心统一为一张报告列表，上方按全部报告、日报、周报、月报及专项类型筛选，支持名称、日期范围和分页。
- 点击“上传报告”直接选择电脑中的文件，再确认类型、日期及备注。保留删除、回收站恢复、文件信息修改与历史撤回。原Windows日报工具包可下载。
- 网站内的模板填报、在线编辑及云端AI已移除，对应新建/编辑/AI接口返回410。旧在线日报与图片保留：已发布内容仍可查阅，未发布存档仅管理员可见，可下载Word或打印PDF后在电脑上处理。
- 项目、设备、视频配置、分类、监测值、导入结果、断面和文件元数据有持久修改记录，可恢复旧内容。未留存的旧版本不能凭空恢复。
- Cloudflare D1 保存元数据、监测和日报，R2 保存文件；不把文件存进浏览器。单文件上限 90 MB，列表接口上限 2000 条。

## 本地运行

需要 Node.js 22.13+。先进入仓库中的 `网站源码` 文件夹，再依次执行：

```text
npm ci
node scripts/create-accounts.mjs
npm run build
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_harsh_guardian.sql
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_thankful_shotgun.sql
npm run dev
```

打开 http://127.0.0.1:5173 。初始账号在 private-assets/accounts.json。平台没有内置通用密码。此目录、.env 和 .dev.vars 均忽略提交。

源码包不包含 node_modules、会话数据库或线上密钥。将交付包“配套素材”中的文件复制到 private-assets，保留自己的 accounts.json，然后执行：

```text
node scripts/import-assets.mjs http://127.0.0.1:5173 private-assets
```

航拍通过管理页面上传并填写实际拍摄日期。现有参考底图的真实拍摄日期未确认，未伪造为每日新图。数值模拟与项目资料等待上传真实文件。

## 发布与迁移

本项目部署到自有 Cloudflare Workers，D1 保存业务数据，R2 保存上传文件。GitHub 仓库负责版本管理，实际访问网站应使用 Cloudflare 控制台提供的站点地址。

在 Cloudflare 为自己的项目创建 D1 数据库和 R2 存储桶，并在 Workers Builds 中配置：

| 项目 | 值 |
| --- | --- |
| Root directory | `网站源码` |
| Build command | `node scripts/build-cloudflare.mjs` |
| Deploy command | `npx wrangler deploy --config dist/server/wrangler.json` |
| Version command | `npx wrangler versions upload --config dist/server/wrangler.json` |
| Production branch | `main` |

在 **Builds → Variables and secrets** 填写四个构建变量的实际值：`CF_WORKER_NAME`、`CF_D1_DATABASE_NAME`、`CF_D1_DATABASE_ID`、`CF_R2_BUCKET_NAME`。构建脚本会把这些值写入本次生成的配置，不要把示例文字作为变量值。

账户配置 `PLATFORM_USERS` 应放在 **Settings → Runtime variables and secrets**，类型为 Secret；不要提交到 GitHub。首次生成配置见 `网站源码/scripts/create-accounts.mjs`。

本地发布时，在 `网站源码` 目录设置同样四个环境变量，执行 `npm ci` 和 `node scripts/build-cloudflare.mjs`，然后 `npx wrangler login`。仅当准备了新的空数据库时，执行 `npx wrangler d1 migrations apply DB --remote --config dist/server/wrangler.json`。发布命令为 `npx wrangler deploy --config dist/server/wrangler.json`。已有正式数据库必须核对迁移记录，仅应用尚未执行的迁移；常规网页更新不需要重新初始化数据库或账户。

构建失败和线上运行是两个独立状态。若日志在 Initializing 阶段就显示内部错误，代码尚未开始编译，应先检查 Cloudflare 构建服务；不要因此删除已有 Worker、D1 或 R2。排查参考 [Cloudflare 构建文档](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/)。

PLATFORM_USERS仅用于首次创建账户，已存在的账户不会被环境变量覆盖。上线后在“平台设置”新增账户、修改密码与权限、停用或恢复；修改后旧会话会撤销。数据库、R2和密钥保管配置均需备份，正常源码发布不重置数据。只对新数据库运行全部迁移，已有数据库仅应用新迁移。

## 统一登录

平台设置保留项目账户和统一登录。签名票据接口及边界详见 [统一登录接入说明](网站源码/docs/统一登录接入.md)；大平台尚未上线，目前是接入准备。网站不再提供云端AI配置或调用。

## 操作

管理员：项目概况编辑参建单位；首页上传航拍，通过“管理航拍/回收站”维护；数据监测切换至“修改后台数据”；数值模拟、项目资料建立分类并上传；报告中心点击“上传报告”，选择电脑中已完成的文件，确认分类与日期后上传。

展示账户：查看与下载已发布内容。两个账户同时使用时，请分别在不同浏览器、浏览器独立用户配置或无痕窗口登录。

视频监控等待管理员配置MP4地址或供应商允许嵌入的HTTPS播放页；尚未接入原平台视频，也未内置RTSP/HLS转码。PDF使用浏览器打印。列表最多2000条，通用修改记录显示最近100条，日报修订显示最近50条。

新增代码采用 MIT 许可。业务素材与原工具的权利说明见 [THIRD_PARTY_NOTICES.md](网站源码/THIRD_PARTY_NOTICES.md)。
