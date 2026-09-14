# 附件与第三方说明

- 监测模块基于用户提供的 dayun-monitor-app-v7.zip 内源码移植，保留原 SW / NSW 点位、平面图、断面交互、数据规则与 XLSX 导入逻辑。原 MIT 许可见 licenses/monitor-MIT.txt。
- 报告中心使用文件上传与分类管理。DailyReport-Windows-x64.zip 原 Windows 包完整保留在受保护的对象存储中，仅管理账户可下载；网站内模板填报及AI已移除。
- 为保留旧版在线日报，网站保留只读预览与Word导出，使用原模板、富文本绑定及照片布局。PDF使用浏览器打印，分页可能随浏览器、字体或Word版本变化。该存档出口不再提供在线编辑和生成新日报。
- 用户提供的照片、工程数据、公司信息、图纸、模板及两个原 ZIP 不属于新增平台代码的 MIT 授权范围。发布通用开源仓库前，应移除或替换这些业务资料。
- React、Vinext、Cloudflare、shadcn/Radix、fflate 等依赖遵循各自包内许可，具体版本以 package-lock.json 为准。
