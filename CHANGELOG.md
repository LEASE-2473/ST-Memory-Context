# 更改日志

## 2026-07-26 GitHub 公开发布准备

- **用户目标**：将魔改版本发布到用户自己的 GitHub 账户，同时正确注明原作者和开源许可。
- **主要修改**：在 README 顶部增加原项目链接、MIT 授权来源及非官方衍生声明，并加入当前 GitHub 安装地址；增加完整 MIT `LICENSE`；增加 `ATTRIBUTION.md` 记录原项目、维护者与主要功能差异；在 manifest 中同时标明当前维护者、原作者来源和项目主页；已在 `LEASE-2473` 账户下创建原仓库 Fork。
- **修改的文件**：`README.md`、`manifest.json`、`PROJECT_CONTEXT.md`、`CHANGELOG.md`、`LICENSE`、`ATTRIBUTION.md`。
- **验证**：全部 7 个 JavaScript 文件通过 `node --check`；`manifest.json` 解析通过；`git diff --check` 通过；未发现写死的非空密钥、Token、私人路径或聊天数据；与上游差异确认 `backfill_manager.js` 未被修改，完整手动追溯实现原样保留。
- **未完成事项**：尚未在实际 SillyTavern 环境中完成 UI、总结 API、Embedding API 与检索注入回归。
- **风险与建议**：原仓库没有独立 `LICENSE` 文件，但其 README 明确声明 MIT License；本版本据此补齐标准 MIT 文本并显著保留原作者归属。

## 2026-07-26 LEASE 轻量化记忆总结与向量化重构

- **用户目标**：将弃用的开源版本魔改为个人插件；保留记忆表格、完整手动追溯、表格总结、默认总结兜底与向量检索；移除日常实时填表、后台自动填表、聊天与大总结、总结优化和世界书总结同步。
- **主要修改**：
  - 插件显示名改为 `LEASE Memory Context`，版本升至 `3.0.0`，关闭上游自动更新。
  - 将总结模块重写为仅总结所选记忆表格，并支持保留、隐藏或删除源行。
  - 总结保存后可直接同步向量模块；正文按 `===` 等配置分隔符切片，每片独立向量化。
  - 向量仅使用总结正文，不附加“剧情总结 N”标题或备注。
  - 统一总结同步、TXT 导入和源文本编辑的切片实现。
  - 切断 AI 回复中的实时填表解析入口，增加仅表格来源的自动总结触发器。
  - 保留并重新接入原版完整手动追溯模块，包括区间/单表/全部表、分批、重构、表格优化、进度修正与结果确认；恢复追溯提示词管理和每聊天追溯进度。
  - 总结确认页保留“重新生成”，可在写入总结表前重做本次结果。
  - 删除世界书总结、手机填表适配、内置实时填表预设包及三个备份预设文件。
  - 配置界面删除实时/批量填表、大总结、表格注入和世界书区块；保留默认总结与向量化区块。
  - 提示词界面只暴露表格总结、手动追溯与可选系统提示词，旧配置中的实时填表、聊天总结和优化提示词字段会被清理。
  - 根据用户纠正，从本机未改动的 2.3.5 安装副本完整恢复 `backfill_manager.js`，避免自行重写造成追溯行为缺失。
- **修改的文件**：`index.js`、`backfill_manager.js`、`summary_manager.js`、`vector_manager.js`、`prompt_manager.js`、`manifest.json`、`README.md`、`PROJECT_CONTEXT.md`、`CHANGELOG.md`。
- **删除的文件**：`world_info.js`、`phone-adapter.js`、`builtin_preset_bundle.js`、三个 `yuzuki-*_及全部预设备份_*.json`。
- **验证**：全部 7 个现存 JavaScript 文件通过 `node --check`；`manifest.json` 解析通过；追溯模块与本机原版副本 SHA-256 一致；行为测试确认两行总结中的 `chunk-A === chunk-B` 与 `chunk-C` 会在同步阶段直接形成 3 个独立片段，且标题和备注不会进入向量，并会继续调用该书籍的向量化入口；已移除模块和旧活动入口检查通过。
- **未完成事项**：尚未在实际 SillyTavern 环境中执行 UI、总结 API、Embedding API 与检索注入回归。
- **风险与建议**：尚未在 SillyTavern 中实际点击追溯、调用总结/Embedding API；向量数据库继续使用隐藏存储书以避免浏览器容量限制。
