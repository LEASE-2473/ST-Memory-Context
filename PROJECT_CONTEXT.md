# 项目上下文

## 项目目标

`LEASE Memory Context` 是 SillyTavern 轻量记忆插件，负责维护记忆表格、手动追溯旧聊天、将选定表格总结到“记忆总结”表，并通过独立 Embedding API 完成分片向量检索。

## 技术栈与运行环境

- SillyTavern 第三方前端扩展
- 原生 JavaScript、jQuery、HTML、CSS
- OpenAI 兼容 Embedding API，可选 Rerank API
- 无本地构建流程或 npm 依赖

## 核心文件

- `index.js`：表格数据、主界面、配置、默认总结注入和向量检索注入。
- `backfill_manager.js`：完整的手动剧情追溯、分批追溯、单表重构、表格优化和追溯进度管理。
- `summary_manager.js`：仅处理记忆表格总结、源行后处理和向量同步。
- `vector_manager.js`：向量书籍、统一文本切片、Embedding、检索和隐藏数据库持久化。
- `prompt_manager.js`：表格结构管理、表格总结提示词和手动追溯提示词；已停用实时填表、聊天总结和总结优化提示词。
- `io_manager.js`：表格和配置导入导出。
- `debug_manager.js`：诊断与日志工具。
- `style.css`：现有界面样式。

## 关键设计决策

- 总结来源固定为记忆表格，不读取聊天历史。
- 日常聊天不解析或执行 `<Memory>` 填表指令；旧聊天只能由用户主动点击“追溯”处理。
- 手动追溯保留原版的区间、单表/全部表、分批、重构、表格优化、进度修正和确认流程；后台自动追溯不启用。
- 总结正文按 `vectorSeparator` 切片，默认 `===`；总结行标题和备注不进入向量。
- 总结后的源行可配置为 `keep`、`hide` 或 `delete`。
- 开启 `autoVectorizeSummary` 后，总结保存会同步并向量化；默认总结注入被抑制，由语义检索注入相关片段。
- 未开启自动向量化时，继续使用“记忆总结（默认发送）”兜底。
- 用户可见的世界书总结同步已移除；`Memory_Vector_Database` 仅作为隐藏向量持久化存储。
- 保留原扩展 ID `st_memory_table` 与存储键，兼容已有记忆表格数据；显示名称和维护者已改为 LEASE。
- 公开版本保留原项目 gaigai315 / Gaigai Team 的署名，并通过 `LICENSE`、`ATTRIBUTION.md` 和 README 标明 MIT 授权来源与非官方衍生关系。

## 验证方法

- 静态语法：`node --check index.js` 及逐个检查所有 `.js`。
- JSON：解析 `manifest.json`。
- 残留检查：搜索已移除模块的活动加载入口和用户可见 UI。
- 实机验证需要在 SillyTavern 中完成总结、源行处理、向量化和检索注入。

## 当前状态与已知风险

- 轻量化代码已完成第一轮重构；手动追溯已从本机未修改的原版副本恢复并重新接入，尚需 SillyTavern 实机回归。
- 已物理删除旧实时消息解析器和旧依赖加载链；当前加载链只加载表格所需模块、手动追溯、总结和向量模块。
- 旧配置会在加载时清除已移除功能的键，并强制总结来源为 `table`。
- 发布目标为 GitHub 账户 `LEASE-2473` 下的上游 Fork；修改通过独立分支和 Pull Request 合入。
