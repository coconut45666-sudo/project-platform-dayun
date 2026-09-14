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

需要 Node.js 22.13+。在此目录依次执行：

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

当前工程使用 Sites。保留 .openai/hosting.json 的 project_id，构建并推送同一源版本后通过 Sites 发布。Sites 为逻辑绑定 DB、BUCKET 分配持久化资源并运行 drizzle 下迁移。PLATFORM_USERS 设为私密环境变量，其值由 create-accounts 脚本生成于 private-assets/PLATFORM_USERS.json。

托管入口受众与平台账号是两层设置：私有站点先验证托管身份；开放站点直接显示平台登录页。项目 API 和文件始终需要平台登录。

迁移至自有 Cloudflare 账户时，建立 D1 和 R2，使用 dist/server/wrangler.json 的构建产物作为 Worker 配置，设置实际 name、d1_databases[].database_id 和 r2_buckets[].bucket_name，再设置 PLATFORM_USERS secret、执行 drizzle/*.sql 迁移并部署。生成配置会随 build 重建，需要在每次发布时应用自有绑定。不能使用示例占位数据库 ID。

PLATFORM_USERS仅用于首次创建账户，已存在的账户不会被环境变量覆盖。上线后在“平台设置”新增账户、修改密码与权限、停用或恢复；修改后旧会话会撤销。数据库、R2和密钥保管配置均需备份，正常源码发布不重置数据。只对新数据库运行全部迁移，已有数据库仅应用新迁移。

## 统一登录

平台设置保留项目账户和统一登录。签名票据接口及边界详见 `docs/统一登录接入.md`；大平台尚未上线，目前是接入准备。网站不再提供云端AI配置或调用。

## 操作

管理员：项目概况编辑参建单位；首页上传航拍，通过“管理航拍/回收站”维护；数据监测切换至“修改后台数据”；数值模拟、项目资料建立分类并上传；报告中心点击“上传报告”，选择电脑中已完成的文件，确认分类与日期后上传。

展示账户：查看与下载已发布内容。两个账户同时使用时，请分别在不同浏览器、浏览器独立用户配置或无痕窗口登录。

视频监控等待管理员配置MP4地址或供应商允许嵌入的HTTPS播放页；尚未接入原平台视频，也未内置RTSP/HLS转码。PDF使用浏览器打印。列表最多2000条，通用修改记录显示最近100条，日报修订显示最近50条。

新增代码采用 MIT 许可。业务素材与原工具的权利说明见 THIRD_PARTY_NOTICES.md。
