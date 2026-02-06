# ziwei-iztro-reader

一个基于 `iztro` 的 Skill，用于生成紫微斗数本命盘与流运快照，并输出可用于分层解读的结构化 JSON。

## 项目定位

- 目标：把排盘与数据整理自动化，供上层 AI 解读链路使用
- 场景：本命分析、流年/流月/流日分析、未来日期趋势辅助
- 输出：机器可读 JSON（包含基础快照与逐宫详细快照）

## 目录结构

- `SKILL.md`：Skill 使用说明
- `scripts/iztro_runner.mjs`：核心运行脚本
- `references/input-schema.md`：输入与输出字段说明
- `references/time-index.md`：时辰索引定义
- `references/interpretation-template.md`：解读模板参考
- `已知问题.md`：当前已确认问题与影响评估

## 快速使用（Skill 模式）

适用于支持 Skill 自动安装/运行的 AI 客户端（如 Claude、Cursor、Codex 等）：

1. 下载或克隆本仓库
2. 将整个 `ziwei-iztro-reader` 文件夹放到客户端约定的 skills 目录（或通过客户端导入本地 skill）
3. 在客户端刷新/重启后启用该 skill
4. 按 `references/input-schema.md` 提供输入参数即可使用

## 本地调试（可选）

如果你要在命令行直接验证脚本：

```bash
cd scripts
npm install
node iztro_runner.mjs example.input.json
```

输出核心字段：

- `natal`：本命盘完整结构
- `current`：基准日期流运快照
- `future[]`：未来日期流运快照
- `currentDetailed`：逐宫详细快照（推荐用于完整解读）
- `futureDetailed[]`：未来日期逐宫详细快照

## 输入要点

- 必填：`birth.confirmed`、`birth.calendar`、`birth.date`、`birth.timeIndex`、`birth.gender`、`birth.birthplace`
- `birth.calendar` 支持：
  - `solar`（公历）
  - `lunar`（农历）
- `query.timezone` 用于解析 `today`
- `query.futureDates` 支持批量未来日期

详细格式请看：`references/input-schema.md`

## 当前行为说明

- 默认输出档位固定为 `full`
- 默认解读口径为按宫位角色映射（`flowStarsByRole`）
- 仅在调试模式下开启索引映射（`query.debug.includeIndexMapping = true`）
- 默认不做真太阳时修正（用于文化研究与娱乐参考）

## 已知限制

请查看：[`已知问题.md`](./已知问题.md)

## 免责声明

本项目输出仅用于文化研究与娱乐参考，不构成医疗、法律、投资等专业建议。
