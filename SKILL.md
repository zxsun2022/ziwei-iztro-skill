---
name: ziwei-iztro-reader
description: 使用 iztro 生成紫微斗数排盘并输出分层解读。适用于用户要求基于出生日期、出生时辰、出生地与性别进行本命盘分析，或要求流年/流月/流日/未来时间段推演时。支持先确认出生日期是公历或农历，再生成对应盘面并按“本命→流年→流月→流日”层级解读。
---

# Ziwei Iztro Reader

按以下顺序执行，保证日期与解读层级一致。

## 1. 收集并标准化输入

先收集这些字段：
- 出生信息确认：`birth.confirmed = true`
- 出生日期类型：`solar`（公历）或 `lunar`（农历）
- 出生日期：`YYYY-M-D`
- 出生时辰索引：`0..12`（见 `references/time-index.md`）
- 性别：`male` 或 `female`
- 出生地（非空文本）
- 当前所在地时区（IANA，如 `Asia/Shanghai`）

执行规则：
- 先明确用户说的出生日期是公历还是农历，未确认时不得排盘。
- 未满足“出生信息已确认”时，停止输出并只返回缺失项。
- 本命盘直接使用“出生地当地民用出生时间”语义，不额外做真太阳时修正。
- 当用户问“今天/本月/未来某天”时，先按“当前所在地时区”确定公历日期，再计算流运。
- 回答里同时写出公历日期和对应农历日期，避免相对时间歧义。

## 2. 生成盘面数据

1. 进入 `scripts/` 并安装依赖：`npm install`
2. 构造输入 JSON（见 `references/input-schema.md`，可复制 `scripts/example.input.json`）
3. 运行：
   - `node iztro_runner.mjs input.json`
4. 读取输出 JSON：
   - `natal`：本命盘（完整 astrolabe）
   - `current`：当前参考日期的流运（含流年/流月/流日）
   - `future[]`：未来日期快照（辅助判断趋势）
   - `currentDetailed`：逐宫合并后的详细快照（推荐用于“像样例那样”的完整输出）
   - `futureDetailed[]`：未来日期的逐宫详细快照

## 3. 按层级解读

解读必须遵循层级依赖：
- 解读流年：基于 `natal + current.yearly`
- 解读流月：基于 `natal + current.yearly + current.monthly`
- 解读流日：基于 `natal + current.yearly + current.monthly + current.daily`

对未来时间段：
- 用 `future[]` 做对比，强调趋势与时间窗口，不替代本命结构。

## 4. 输出格式

固定输出档位：`full`（不提供简版）。

按以下结构输出（固定模板）：
1. 输入确认：公历/农历、出生信息、时区、参考日期（公历+农历）
2. 口径声明：默认使用 `byRole`（宫位角色映射）
3. 本命盘：12宫完整明细（主星/辅星/杂曜/12神）
4. 流年：12宫完整明细 + 四化 + 流星
5. 流月：12宫完整明细 + 四化 + 流星
6. 流日：12宫完整明细 + 四化 + 流星
7. 未来辅助信息：未来日期对比与建议
8. 固定免责声明：文化研究与娱乐参考，默认未做真太阳时修正

详细输出规则：
- 当用户要求“详细/全面/完整”时，默认遍历 `currentDetailed.palaces[]` 输出 12 宫完整明细。
- 明细里优先包含：主星、辅星、杂曜、长生十二神、博士十二神、岁前十二神、将前十二神、各层流星（大限/小限/流年/流月/流日/流时）与四化标签。
- 不可省略 `tags`（如 `本命禄`、`大限权`、`流年科`、`流月忌`），除非该星没有标签。
- 默认只使用 `flowStarsByRole` 进行解读。
- 仅在开发调试时，才开启索引口径并读取 `flowStarsByIndex`。

## 5. 失败处理

- 缺少关键字段时，明确列出缺失项并停止解读。
- 日期解析失败时，要求用户提供明确格式（`YYYY-M-D`）。
- `iztro` 未安装时，提示先在 `scripts/` 目录运行 `npm install`。

参考：
- `references/time-index.md`
- `references/input-schema.md`
- `references/interpretation-template.md`
