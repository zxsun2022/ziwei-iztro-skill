# 代码审查报告

**项目名称**: ziwei-iztro-reader
**审查日期**: 2026-02-05
**审查范围**: 全部代码文件和文档

---

## 项目概述

这是一个Claude Code skill，用于生成紫微斗数排盘并进行分层解读。主要依赖iztro库，通过Node.js脚本生成本命盘、流年、流月、流日等数据，供AI进行占星分析。

**核心组件**:
- `SKILL.md`: Skill说明文档
- `scripts/iztro_runner.mjs`: 核心运行脚本（469行）
- `references/`: 参考文档（输入schema、时辰索引、解读模板）
- `agents/openai.yaml`: Agent配置

---

## 发现的问题

### 1. 时区处理潜在问题 ⚠️ 高优先级

**位置**: `scripts/iztro_runner.mjs:376`

```javascript
process.env.TZ = timezone;
```

**问题描述**:
- 修改全局环境变量`process.env.TZ`会影响整个Node.js进程
- 如果脚本被并发调用或在服务器环境运行，可能导致竞态条件
- 不同请求的时区设置可能互相干扰

**影响**: 可能导致日期计算错误，影响排盘准确性

**建议**:
- 使用`Intl.DateTimeFormat`的timeZone参数，避免修改全局变量
- 或者在每次调用时创建独立的子进程

---

### 2. 日期验证逻辑不完善

**位置**: `scripts/iztro_runner.mjs:46-53`

```javascript
const utc = new Date(Date.UTC(year, month - 1, day));
if (
  utc.getUTCFullYear() !== year ||
  utc.getUTCMonth() + 1 !== month ||
  utc.getUTCDate() !== day
) {
  fail(`${fieldName} is not a valid calendar date.`);
}
```

**问题描述**:
- 使用UTC时间验证日期有效性
- 对于农历日期，这个验证逻辑可能不够准确（农历有闰月、大小月变化）
- 农历的2月30日可能在某些年份存在，但公历验证会拒绝

**影响**: 可能拒绝合法的农历日期

**建议**:
- 对农历日期使用iztro库本身的验证能力
- 或者添加专门的农历日期验证逻辑

---

### 3. 代码结构问题 - 函数过长

**位置**: `scripts/iztro_runner.mjs:251-328`

```javascript
function buildDetailedPalaceReport(astrolabe, snapshot, options = {}) {
  // ... 78行代码 ...
}
```

**问题描述**:
- `buildDetailedPalaceReport`函数长达78行
- 包含多个职责：构建标签映射、星曜映射、宫位数据组装
- 违反单一职责原则，难以测试和维护

**影响**: 代码可读性差，维护困难

**建议**: 拆分为多个小函数（详见优化建议章节）

---

### 4. 硬编码配置

**位置**:
- `scripts/iztro_runner.mjs:246-249` (宫位别名)
- `scripts/iztro_runner.mjs:117` (四化标签顺序)

```javascript
const palaceNameAlias = {
  官禄: '事业',
  仆役: '交友',
};

const labelOrder = ['禄', '权', '科', '忌'];
```

**问题描述**:
- 配置数据硬编码在业务逻辑中
- 如果需要修改或扩展配置，需要修改核心代码
- 不利于国际化或多语言支持

**影响**: 可维护性差，扩展性差

**建议**: 提取为独立的配置文件或常量模块

---

### 5. 性能问题 - 低效的JSON序列化

**位置**: `scripts/iztro_runner.mjs:104-106`

```javascript
function sanitizeForJson(data) {
  return JSON.parse(JSON.stringify(data, buildSafeReplacer()));
}
```

**问题描述**:
- 对整个对象树进行完整的序列化和反序列化
- 对于大型的astrolabe对象（包含12宫、多层星曜），这个操作开销较大
- 每次调用都会遍历整个对象树两次

**影响**: 性能损耗，特别是处理多个future dates时

**建议**: 使用更高效的深拷贝方法，或只在必要时序列化

---

### 6. 缺少类型安全

**位置**: 整个项目

**问题描述**:
- 使用JavaScript而非TypeScript
- 没有编译时类型检查
- 大量的可选链操作符（?.）和默认值处理，说明数据结构不稳定
- 运行时才能发现类型错误

**影响**: 容易出现运行时类型错误，开发效率低

**建议**: 迁移到TypeScript，添加完整的类型定义

---

### 7. 错误处理不够细致

**位置**: `scripts/iztro_runner.mjs:387-391`

```javascript
try {
  ({ astro } = await import('iztro'));
} catch (error) {
  fail(`iztro is not installed. Run npm install in scripts/. Original error: ${error.message}`);
}
```

**问题描述**:
- 没有区分不同类型的错误（模块未安装 vs 导入失败 vs 版本不兼容）
- 错误信息可能误导用户
- 没有提供详细的调试信息

**影响**: 问题排查困难

**建议**:
- 区分不同错误场景，提供针对性的错误信息
- 添加详细的错误上下文

---

### 8. 文档与代码不一致

**问题1**: 真太阳时修正说明不明确

- **位置**: `SKILL.md:23`, `input-schema.md:459`
- **描述**: 文档提到"不额外做真太阳时修正"，但代码中没有相关注释说明
- **影响**: 用户可能不清楚排盘的时间基准

**问题2**: birthplace验证不足

- **位置**: `input-schema.md:35`, `scripts/iztro_runner.mjs:370-373`
- **描述**: 文档说birthplace是"必填，非空字符串"，但没有格式验证
- **影响**: 可能接受无效的地名格式

---

### 9. 缺少测试

**问题描述**:
- 没有任何单元测试文件
- 只有一些手动测试用的JSON输入输出文件
- 无法自动验证代码正确性
- 重构风险高

**影响**: 代码质量无法保证，重构困难

**建议**: 添加完整的单元测试和集成测试

---

### 10. 代码重复

**位置**: `scripts/iztro_runner.mjs:194-210`

```javascript
function cloneStarEntry(entry) {
  return {
    ...entry,
    tags: Array.isArray(entry?.tags) ? [...entry.tags] : [],
  };
}

function cloneFlowStars(flowStars) {
  return {
    decadal: (flowStars?.decadal || []).map(cloneStarEntry),
    age: (flowStars?.age || []).map(cloneStarEntry),
    yearly: (flowStars?.yearly || []).map(cloneStarEntry),
    monthly: (flowStars?.monthly || []).map(cloneStarEntry),
    daily: (flowStars?.daily || []).map(cloneStarEntry),
    hourly: (flowStars?.hourly || []).map(cloneStarEntry),
  };
}
```

**问题描述**:
- `cloneFlowStars`和`flowStars`的构建逻辑重复
- 在第319行，`flowStarsByRole: cloneFlowStars(flows)`实际上是对刚构建的`flows`做了一次深拷贝，但看起来是不必要的

**影响**: 代码冗余，性能浪费

**建议**: 明确是否需要深拷贝，如不需要则删除冗余代码

---

### 11. 循环引用处理不完整

**位置**: `scripts/iztro_runner.mjs:85-102`

```javascript
function buildSafeReplacer() {
  const seen = new WeakSet();

  return (_, value) => {
    if (typeof value === 'function') {
      return undefined;
    }

    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    return value;
  };
}
```

**问题描述**:
- 虽然处理了循环引用，但返回`'[Circular]'`字符串可能导致JSON结构异常
- 没有记录循环引用的位置，调试困难

**影响**: 可能产生难以理解的JSON输出

**建议**: 考虑记录循环引用路径，或在发现循环引用时抛出警告

---

## 优化建议

### 建议1: 改进时区处理 ⭐ 高优先级

**当前代码**:
```javascript
const timezone = query.timezone || 'Asia/Shanghai';
process.env.TZ = timezone;
```

**优化方案**:
```javascript
// 方案A: 使用Intl API，不修改全局变量
function dateInTimeZone(timeZone, instant = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(instant);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  return `${Number(year)}-${Number(month)}-${Number(day)}`;
}

// 方案B: 使用date-fns-tz等第三方库
import { utcToZonedTime, format } from 'date-fns-tz';

function dateInTimeZone(timeZone, instant = new Date()) {
  const zonedDate = utcToZonedTime(instant, timeZone);
  return format(zonedDate, 'yyyy-M-d');
}
```

**优点**:
- 避免全局状态污染
- 线程安全，支持并发
- 更符合函数式编程原则

---

### 建议2: 重构大函数

**拆分方案**:

```javascript
// 1. 提取标签映射构建
function buildAllMutagenMaps(astrolabe, snapshot) {
  return {
    natal: collectNatalMutagenTags(astrolabe.palaces || []),
    decadal: buildMutagenMap(snapshot?.decadal?.mutagen, '大限'),
    yearly: buildMutagenMap(snapshot?.yearly?.mutagen, '流年'),
    monthly: buildMutagenMap(snapshot?.monthly?.mutagen, '流月'),
    daily: buildMutagenMap(snapshot?.daily?.mutagen, '流日'),
    hourly: buildMutagenMap(snapshot?.hourly?.mutagen, '流时'),
  };
}

// 2. 提取星曜映射构建
function buildAllScopeStarMaps(snapshot) {
  return {
    yearly: buildScopePalaceMap(snapshot?.yearly),
    monthly: buildScopePalaceMap(snapshot?.monthly),
    daily: buildScopePalaceMap(snapshot?.daily),
    hourly: buildScopePalaceMap(snapshot?.hourly),
    decadal: buildScopePalaceMap(snapshot?.decadal),
    age: buildScopePalaceMap(snapshot?.age),
  };
}

// 3. 提取流年星曜数据
function buildYearlyDecStarContext(snapshot) {
  const suiqian = snapshot?.yearly?.yearlyDecStar?.suiqian12 || [];
  const jiangqian = snapshot?.yearly?.yearlyDecStar?.jiangqian12 || [];
  const palaceNames = snapshot?.yearly?.palaceNames || [];

  const indexByPalace = new Map();
  palaceNames.forEach((name, index) => {
    indexByPalace.set(name, index);
  });

  return { suiqian, jiangqian, palaceNames, indexByPalace };
}

// 4. 提取单个宫位构建逻辑
function buildPalaceEntry(palace, context) {
  const { tagMaps, scopeStarMaps, yearlyDecStar, includeIndexMapping, snapshot } = context;

  const yearlyIndex = yearlyDecStar.indexByPalace.get(palace.name);

  // 本命星曜
  const natal = {
    majorStars: (palace.majorStars || []).map(star => starEntryWithTags(star, tagMaps)),
    minorStars: (palace.minorStars || []).map(star => starEntryWithTags(star, tagMaps)),
    adjectiveStars: (palace.adjectiveStars || []).map(star => starEntryWithTags(star, tagMaps)),
  };

  // 流星（按角色）
  const flowStars = {
    decadal: (scopeStarMaps.decadal.get(palace.name) || []).map(star => starEntryWithTags(star, tagMaps)),
    age: (scopeStarMaps.age.get(palace.name) || []).map(star => starEntryWithTags(star, tagMaps)),
    yearly: (scopeStarMaps.yearly.get(palace.name) || []).map(star => starEntryWithTags(star, tagMaps)),
    monthly: (scopeStarMaps.monthly.get(palace.name) || []).map(star => starEntryWithTags(star, tagMaps)),
    daily: (scopeStarMaps.daily.get(palace.name) || []).map(star => starEntryWithTags(star, tagMaps)),
    hourly: (scopeStarMaps.hourly.get(palace.name) || []).map(star => starEntryWithTags(star, tagMaps)),
  };

  // 构建完整条目
  return {
    palaceIndex: palace.index,
    palaceName: palace.name,
    palaceAlias: PALACE_ALIASES[palace.name] || null,
    palaceDisplayName: `${PALACE_ALIASES[palace.name] || palace.name}宫${palace.isBodyPalace ? '-身宫' : ''}`,
    heavenlyStem: palace.heavenlyStem,
    earthlyBranch: palace.earthlyBranch,
    isBodyPalace: Boolean(palace.isBodyPalace),
    isOriginalPalace: Boolean(palace.isOriginalPalace),
    changsheng12: palace.changsheng12 || null,
    boshi12: palace.boshi12 || null,
    jiangqian12: palace.jiangqian12 || null,
    suiqian12: palace.suiqian12 || null,
    yearlyDecStar: buildYearlyDecStarForPalace(yearlyIndex, yearlyDecStar),
    natal,
    flowStars,
    flowStarsByRole: flowStars, // 注意：如果不需要深拷贝，直接引用
    // ... 其他字段
  };
}

// 5. 主函数变得简洁
function buildDetailedPalaceReport(astrolabe, snapshot, options = {}) {
  const includeIndexMapping = options.includeIndexMapping === true;

  const mutagenMaps = buildAllMutagenMaps(astrolabe, snapshot);
  const tagMaps = Object.values(mutagenMaps);
  const scopeStarMaps = buildAllScopeStarMaps(snapshot);
  const yearlyDecStar = buildYearlyDecStarContext(snapshot);

  const context = {
    tagMaps,
    scopeStarMaps,
    yearlyDecStar,
    includeIndexMapping,
    snapshot,
  };

  return (astrolabe.palaces || []).map(palace => buildPalaceEntry(palace, context));
}
```

**优点**:
- 每个函数职责单一，易于理解
- 易于测试和维护
- 可以独立复用各个子函数

---

### 建议3: 提取配置常量

**创建配置文件**: `scripts/config.mjs`

```javascript
/**
 * 紫微斗数排盘配置
 */

// 宫位别名映射
export const PALACE_ALIASES = {
  '命宫': null,
  '兄弟': null,
  '夫妻': null,
  '子女': null,
  '财帛': null,
  '疾厄': null,
  '迁移': null,
  '奴仆': '交友',
  '官禄': '事业',
  '田宅': null,
  '福德': null,
  '父母': null,
};

// 四化标签顺序
export const MUTAGEN_LABELS = ['禄', '权', '科', '忌'];

// 流运层级标签
export const SCOPE_LABELS = {
  natal: '本命',
  decadal: '大限',
  age: '小限',
  yearly: '流年',
  monthly: '流月',
  daily: '流日',
  hourly: '流时',
};

// 时辰索引配置
export const TIME_INDEX_CONFIG = [
  { index: 0, name: '早子时', range: '00:00-00:59' },
  { index: 1, name: '丑时', range: '01:00-02:59' },
  { index: 2, name: '寅时', range: '03:00-04:59' },
  { index: 3, name: '卯时', range: '05:00-06:59' },
  { index: 4, name: '辰时', range: '07:00-08:59' },
  { index: 5, name: '巳时', range: '09:00-10:59' },
  { index: 6, name: '午时', range: '11:00-12:59' },
  { index: 7, name: '未时', range: '13:00-14:59' },
  { index: 8, name: '申时', range: '15:00-16:59' },
  { index: 9, name: '酉时', range: '17:00-18:59' },
  { index: 10, name: '戌时', range: '19:00-20:59' },
  { index: 11, name: '亥时', range: '21:00-22:59' },
  { index: 12, name: '晚子时', range: '23:00-23:59' },
];

// 默认配置
export const DEFAULT_CONFIG = {
  timezone: 'Asia/Shanghai',
  language: 'zh-CN',
  fixLeap: true,
  detailLevel: 'full',
};

// 错误消息
export const ERROR_MESSAGES = {
  MISSING_INPUT: 'Missing input JSON path. Usage: node iztro_runner.mjs <input.json>',
  INVALID_CALENDAR: 'birth.calendar must be either solar or lunar.',
  NOT_CONFIRMED: 'birth.confirmed must be true before generating chart output.',
  INVALID_TIME_INDEX: 'birth.timeIndex must be an integer from 0 to 12.',
  INVALID_GENDER: 'birth.gender must be male or female.',
  EMPTY_BIRTHPLACE: 'birth.birthplace must be a non-empty string.',
  IZTRO_NOT_INSTALLED: 'iztro is not installed. Run npm install in scripts/.',
  INVALID_DATE_FORMAT: 'Date must match YYYY-M-D or YYYY-MM-DD format.',
};
```

**在主文件中使用**:
```javascript
import { PALACE_ALIASES, MUTAGEN_LABELS, ERROR_MESSAGES } from './config.mjs';

// 使用配置
const palaceAlias = PALACE_ALIASES[palace.name] || null;
const labelOrder = MUTAGEN_LABELS;
fail(ERROR_MESSAGES.INVALID_CALENDAR);
```

---

### 建议4: 添加输入验证工具

**创建验证模块**: `scripts/validation.mjs`

```javascript
import { ERROR_MESSAGES } from './config.mjs';

/**
 * 验证出生信息
 */
export function validateBirthInput(birth) {
  const errors = [];

  // 必填字段检查
  if (!birth) {
    errors.push('birth object is required');
    return errors;
  }

  // confirmed检查
  if (birth.confirmed !== true) {
    errors.push(ERROR_MESSAGES.NOT_CONFIRMED);
  }

  // calendar检查
  if (!['solar', 'lunar'].includes(birth.calendar)) {
    errors.push(ERROR_MESSAGES.INVALID_CALENDAR);
  }

  // date格式检查
  if (!birth.date || typeof birth.date !== 'string') {
    errors.push('birth.date is required and must be a string');
  } else if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(birth.date)) {
    errors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT);
  }

  // timeIndex检查
  const timeIndex = Number(birth.timeIndex);
  if (!Number.isInteger(timeIndex) || timeIndex < 0 || timeIndex > 12) {
    errors.push(ERROR_MESSAGES.INVALID_TIME_INDEX);
  }

  // gender检查
  const gender = typeof birth.gender === 'string' ? birth.gender.toLowerCase() : '';
  if (!['male', 'female'].includes(gender)) {
    errors.push(ERROR_MESSAGES.INVALID_GENDER);
  }

  // birthplace检查
  const birthplace = typeof birth.birthplace === 'string' ? birth.birthplace.trim() : '';
  if (!birthplace) {
    errors.push(ERROR_MESSAGES.EMPTY_BIRTHPLACE);
  }

  // 农历特定检查
  if (birth.calendar === 'lunar') {
    if (typeof birth.isLeapMonth !== 'boolean') {
      errors.push('birth.isLeapMonth must be a boolean for lunar calendar');
    }
  }

  return errors;
}

/**
 * 验证查询参数
 */
export function validateQueryInput(query) {
  const errors = [];

  if (!query) {
    return errors; // query是可选的
  }

  // timezone检查
  if (query.timezone && typeof query.timezone !== 'string') {
    errors.push('query.timezone must be a string');
  }

  // baseDate检查
  if (query.baseDate && query.baseDate !== 'today') {
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(query.baseDate)) {
      errors.push('query.baseDate must be "today" or YYYY-M-D format');
    }
  }

  // futureDates检查
  if (query.futureDates) {
    if (!Array.isArray(query.futureDates)) {
      errors.push('query.futureDates must be an array');
    } else {
      query.futureDates.forEach((date, index) => {
        if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) {
          errors.push(`query.futureDates[${index}] must be in YYYY-M-D format`);
        }
      });
    }
  }

  return errors;
}

/**
 * 验证完整输入
 */
export function validateInput(input) {
  const errors = [];

  errors.push(...validateBirthInput(input.birth));
  errors.push(...validateQueryInput(input.query));

  return errors;
}
```

**在主文件中使用**:
```javascript
import { validateInput } from './validation.mjs';

const input = parseInputFile(process.argv[2]);

// 验证输入
const validationErrors = validateInput(input);
if (validationErrors.length > 0) {
  console.error('Input validation failed:');
  validationErrors.forEach(err => console.error(`  - ${err}`));
  process.exit(1);
}
```

---

### 建议5: 迁移到TypeScript

**创建类型定义**: `scripts/types.ts`

```typescript
/**
 * 日历类型
 */
export type CalendarType = 'solar' | 'lunar';

/**
 * 性别类型
 */
export type Gender = 'male' | 'female';

/**
 * 出生信息
 */
export interface BirthInput {
  confirmed: boolean;
  calendar: CalendarType;
  date: string; // YYYY-M-D格式
  timeIndex: number; // 0-12
  gender: Gender;
  birthplace: string;
  isLeapMonth?: boolean;
  fixLeap?: boolean;
  language?: string;
}

/**
 * 查询参数
 */
export interface QueryInput {
  timezone?: string;
  baseDate?: string; // "today" 或 YYYY-M-D
  futureDates?: string[];
  debug?: {
    includeIndexMapping?: boolean;
  };
}

/**
 * 完整输入
 */
export interface RunnerInput {
  birth: BirthInput;
  query?: QueryInput;
}

/**
 * 星曜条目
 */
export interface StarEntry {
  name: string;
  type: string | null;
  scope: string | null;
  brightness: string | null;
  mutagen: string | null;
  tags: string[];
}

/**
 * 流星分层
 */
export interface FlowStars {
  decadal: StarEntry[];
  age: StarEntry[];
  yearly: StarEntry[];
  monthly: StarEntry[];
  daily: StarEntry[];
  hourly: StarEntry[];
}

/**
 * 宫位条目
 */
export interface PalaceEntry {
  palaceIndex: number;
  palaceName: string;
  palaceAlias: string | null;
  palaceDisplayName: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  changsheng12: string | null;
  boshi12: string | null;
  jiangqian12: string | null;
  suiqian12: string | null;
  yearlyDecStar: {
    suiqian12: string | null;
    jiangqian12: string | null;
  };
  natal: {
    majorStars: StarEntry[];
    minorStars: StarEntry[];
    adjectiveStars: StarEntry[];
  };
  flowStars: FlowStars;
  flowStarsByRole: FlowStars;
  flowStarsByIndex: FlowStars | null;
  flowRoleAtIndex: any | null;
  decadalRange: number[] | null;
  decadalGanZhi: string | null;
  ages: number[];
}

/**
 * 详细快照
 */
export interface DetailedSnapshot {
  targetSolarDate: string;
  targetLunarDate: string | null;
  age: any | null;
  decadal: any | null;
  yearly: any | null;
  monthly: any | null;
  daily: any | null;
  hourly: any | null;
  palaces: PalaceEntry[];
}

/**
 * 输出结果
 */
export interface RunnerOutput {
  generatedAt: string;
  normalizedInput: {
    calendar: CalendarType;
    birthDate: string;
    timeIndex: number;
    gender: Gender;
    birthplace: string;
    birthConfirmed: boolean;
    timezone: string;
    baseDateSolar: string;
    baseDateLunar: string | null;
  };
  outputPolicy: {
    detailLevel: string;
    mappingModes: string[];
    includeIndexMapping: boolean;
    requiredConfirmation: boolean;
    disclaimer: string;
  };
  natal: any; // iztro的Astrolabe类型
  current: any;
  future: Array<{
    targetSolarDate: string;
    snapshot: any;
  }>;
  currentDetailed: DetailedSnapshot;
  futureDetailed: DetailedSnapshot[];
}
```

**迁移主文件**: `scripts/iztro_runner.ts`

```typescript
#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RunnerInput, RunnerOutput } from './types';

function fail(message: string): never {
  console.error(`[ziwei-iztro-runner] ${message}`);
  process.exit(1);
}

function parseInputFile(filePath: string): RunnerInput {
  if (!filePath) {
    fail('Missing input JSON path. Usage: node iztro_runner.mjs <input.json>');
  }

  try {
    const content = readFileSync(resolve(process.cwd(), filePath), 'utf-8');
    return JSON.parse(content) as RunnerInput;
  } catch (error) {
    fail(`Cannot read input file: ${(error as Error).message}`);
  }
}

// ... 其他函数使用TypeScript类型
```

**配置TypeScript**: `scripts/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["*.ts", "*.mts"],
  "exclude": ["node_modules", "dist"]
}
```

**修改package.json**:
```json
{
  "scripts": {
    "build": "tsc",
    "run": "node dist/iztro_runner.mjs",
    "dev": "tsc && node dist/iztro_runner.mjs"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

---

### 建议6: 添加单元测试

**安装测试框架**:
```bash
npm install --save-dev vitest @vitest/ui
```

**创建测试配置**: `scripts/vitest.config.js`

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['*.mjs', '*.ts'],
      exclude: ['node_modules', 'dist', '*.test.{js,ts}'],
    },
  },
});
```

**创建测试文件**: `scripts/iztro_runner.test.mjs`

```javascript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

describe('normalizeYmd', () => {
  // 注意：需要将normalizeYmd等函数导出才能测试
  test('should normalize valid dates', () => {
    // 需要重构代码以支持模块导出
  });

  test('should reject invalid dates', () => {
    // 测试2月30日等无效日期
  });

  test('should handle single-digit months and days', () => {
    // 测试 2024-1-5 格式
  });
});

describe('iztro_runner integration', () => {
  test('should process example.input.json successfully', () => {
    const result = execSync(
      'node iztro_runner.mjs example.input.json',
      { encoding: 'utf-8', cwd: __dirname }
    );

    const output = JSON.parse(result);

    expect(output).toHaveProperty('natal');
    expect(output).toHaveProperty('current');
    expect(output).toHaveProperty('currentDetailed');
    expect(output.normalizedInput.calendar).toBe('solar');
    expect(output.outputPolicy.detailLevel).toBe('full');
  });

  test('should fail when birth.confirmed is false', () => {
    const invalidInput = {
      birth: {
        confirmed: false,
        calendar: 'solar',
        date: '1994-8-15',
        timeIndex: 7,
        gender: 'female',
        birthplace: 'Shanghai',
      }
    };

    writeFileSync('test-invalid.json', JSON.stringify(invalidInput));

    expect(() => {
      execSync('node iztro_runner.mjs test-invalid.json', { encoding: 'utf-8' });
    }).toThrow();
  });

  test('should handle future dates correctly', () => {
    // 测试未来日期处理
  });

  test('should handle timezone properly', () => {
    // 测试时区处理
  });
});

describe('buildMutagenMap', () => {
  test('should build mutagen tags correctly', () => {
    // 测试四化标签构建
  });
});

describe('sanitizeForJson', () => {
  test('should remove circular references', () => {
    // 测试循环引用处理
  });

  test('should remove function properties', () => {
    // 测试函数属性移除
  });
});
```

**在package.json中添加测试脚本**:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

### 建议7: 改进错误处理

**创建错误处理模块**: `scripts/errors.mjs`

```javascript
/**
 * 自定义错误类
 */
export class RunnerError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * 错误代码常量
 */
export const ErrorCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TIME_INDEX: 'INVALID_TIME_INDEX',
  INVALID_GENDER: 'INVALID_GENDER',
  MISSING_CONFIRMATION: 'MISSING_CONFIRMATION',
  IZTRO_NOT_INSTALLED: 'IZTRO_NOT_INSTALLED',
  IZTRO_IMPORT_FAILED: 'IZTRO_IMPORT_FAILED',
  IZTRO_VERSION_MISMATCH: 'IZTRO_VERSION_MISMATCH',
  DATE_PARSE_FAILED: 'DATE_PARSE_FAILED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  JSON_PARSE_FAILED: 'JSON_PARSE_FAILED',
};

/**
 * 失败处理函数
 */
export function fail(message, code = ErrorCodes.INVALID_INPUT, details = {}) {
  const error = new RunnerError(message, code, details);
  console.error(JSON.stringify(error.toJSON(), null, 2));
  process.exit(1);
}

/**
 * 增强的iztro导入
 */
export async function importIztro() {
  try {
    const { astro } = await import('iztro');

    // 检查API可用性
    if (!astro?.bySolar || !astro?.byLunar) {
      throw new RunnerError(
        'iztro API is incomplete',
        ErrorCodes.IZTRO_VERSION_MISMATCH,
        { available: Object.keys(astro || {}) }
      );
    }

    return astro;
  } catch (error) {
    if (error instanceof RunnerError) {
      throw error;
    }

    // 区分不同类型的导入错误
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new RunnerError(
        'iztro is not installed. Run: cd scripts && npm install',
        ErrorCodes.IZTRO_NOT_INSTALLED,
        { originalError: error.message }
      );
    }

    throw new RunnerError(
      'Failed to import iztro',
      ErrorCodes.IZTRO_IMPORT_FAILED,
      { originalError: error.message, stack: error.stack }
    );
  }
}
```

**在主文件中使用**:
```javascript
import { fail, importIztro, ErrorCodes } from './errors.mjs';

// 文件解析
function parseInputFile(filePath) {
  if (!filePath) {
    fail(
      'Missing input JSON path',
      ErrorCodes.INVALID_INPUT,
      { usage: 'node iztro_runner.mjs <input.json>' }
    );
  }

  try {
    const content = readFileSync(resolve(process.cwd(), filePath), 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail(
        `Input file not found: ${filePath}`,
        ErrorCodes.FILE_NOT_FOUND,
        { filePath, cwd: process.cwd() }
      );
    }

    fail(
      `Cannot parse input JSON: ${error.message}`,
      ErrorCodes.JSON_PARSE_FAILED,
      { filePath, error: error.message }
    );
  }
}

// 日期验证
function normalizeYmd(dateText, fieldName) {
  // ... validation logic ...

  if (!match) {
    fail(
      `Invalid date format for ${fieldName}`,
      ErrorCodes.INVALID_DATE,
      {
        field: fieldName,
        value: dateText,
        expected: 'YYYY-M-D or YYYY-MM-DD'
      }
    );
  }

  // ...
}

// iztro导入
const astro = await importIztro();
```

---

### 建议8: 优化JSON序列化性能

**改进方案**:

```javascript
/**
 * 高效的对象深拷贝（避免完整序列化）
 */
function deepClone(obj, seen = new WeakMap()) {
  // 基本类型直接返回
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 处理循环引用
  if (seen.has(obj)) {
    return '[Circular]';
  }

  // 处理Date
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  // 处理Array
  if (Array.isArray(obj)) {
    seen.set(obj, true);
    const arrCopy = obj.map(item => deepClone(item, seen));
    seen.delete(obj);
    return arrCopy;
  }

  // 处理普通对象
  seen.set(obj, true);
  const objCopy = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      // 跳过函数
      if (typeof value === 'function') {
        continue;
      }

      objCopy[key] = deepClone(value, seen);
    }
  }

  seen.delete(obj);
  return objCopy;
}

/**
 * 改进的sanitizeForJson
 */
function sanitizeForJson(data) {
  // 如果数据已经是纯JSON兼容的，直接返回
  if (isPlainObject(data)) {
    return deepClone(data);
  }

  // 否则使用原有方法
  return JSON.parse(JSON.stringify(data, buildSafeReplacer()));
}

/**
 * 检查是否为纯对象（无循环引用、无函数）
 */
function isPlainObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return true;
  }

  // 简单检查（可以更严格）
  try {
    JSON.stringify(obj);
    return true;
  } catch {
    return false;
  }
}

/**
 * 针对snapshot的优化：只移除astrolabe引用，不深拷贝
 */
function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot;
  }

  // 浅拷贝，只移除astrolabe
  const { astrolabe, ...rest } = snapshot;
  return rest;
}
```

---

### 建议9: 添加日志系统

**创建日志模块**: `scripts/logger.mjs`

```javascript
/**
 * 日志级别
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * 当前日志级别（从环境变量读取）
 */
const currentLevel = LogLevel[process.env.LOG_LEVEL] ?? LogLevel.INFO;

/**
 * 日志函数
 */
function log(level, message, data = {}) {
  if (LogLevel[level] < currentLevel) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };

  const output = level === 'ERROR' ? console.error : console.log;
  output(JSON.stringify(logEntry, null, 2));
}

export const logger = {
  debug: (message, data) => log('DEBUG', message, data),
  info: (message, data) => log('INFO', message, data),
  warn: (message, data) => log('WARN', message, data),
  error: (message, data) => log('ERROR', message, data),
};
```

**在主文件中使用**:
```javascript
import { logger } from './logger.mjs';

// 启动日志
logger.info('Starting iztro runner', {
  version: '0.1.0',
  inputFile: process.argv[2],
});

// 解析输入
logger.debug('Parsing input file', { filePath });
const input = parseInputFile(filePath);
logger.debug('Input parsed successfully', {
  calendar: input.birth.calendar,
  timeIndex: input.birth.timeIndex,
});

// 生成盘面
logger.info('Generating natal chart', {
  calendar,
  birthDate,
  gender,
});

const astrolabe = calendar === 'solar'
  ? astro.bySolar(birthDate, timeIndex, gender, fixLeap, language)
  : astro.byLunar(birthDate, timeIndex, gender, isLeapMonth, fixLeap, language);

logger.debug('Natal chart generated', {
  palaceCount: astrolabe.palaces?.length,
});

// 计算流运
logger.info('Computing horoscope snapshots', {
  baseDate: baseDateText,
  futureDatesCount: futureDates.length,
});

// 完成
logger.info('Runner completed successfully', {
  outputSize: JSON.stringify(output).length,
});
```

**使用方式**:
```bash
# 普通运行（只显示INFO及以上）
node iztro_runner.mjs input.json

# 调试模式（显示DEBUG及以上）
LOG_LEVEL=DEBUG node iztro_runner.mjs input.json

# 静默模式（只显示ERROR）
LOG_LEVEL=ERROR node iztro_runner.mjs input.json
```

---

### 建议10: 改进文档

**更新SKILL.md**:

```markdown
## 5. 失败处理

- 缺少关键字段时，明确列出缺失项并停止解读。
- 日期解析失败时，要求用户提供明确格式（`YYYY-M-D`）。
- `iztro` 未安装时，提示先在 `scripts/` 目录运行 `npm install`。

## 6. 常见问题 FAQ

### Q: 为什么我的排盘结果和其他软件不同？

A: 本工具默认使用民用时间（用户输入的当地时间），不进行真太阳时修正。真太阳时修正会根据出生地经度调整时辰，可能导致时辰发生变化（如未时变为午时）。如需真太阳时结果，请使用其他工具。

### Q: 农历日期如何输入？

A: 设置`birth.calendar: "lunar"`，并确保：
- `birth.date`格式为农历年月日（如"1994-7-15"表示农历七月十五）
- 如遇闰月，设置`birth.isLeapMonth: true`
- 使用`birth.fixLeap: true`（推荐）来自动处理闰月边界情况

### Q: 时区如何影响排盘？

A: 时区只影响"今天"的解析和流运计算，不影响本命盘。本命盘使用出生地的当地时间。

### Q: 未来日期怎么用？

A: `query.futureDates`数组用于批量计算未来多个日期的流运，适合查看趋势变化。建议不超过10个日期以避免输出过大。

## 7. 已知限制

- **不支持真太阳时修正**：本命盘使用民用时间，未根据出生地经度调整时辰
- **农历日期验证有限**：无法检测所有非法农历日期（如某年没有闰七月却输入闰七月）
- **时区依赖全局变量**：当前版本修改`process.env.TZ`，不支持并发运行
- **输出文件可能很大**：完整输出（特别是带多个future dates）可能超过1MB

## 8. 性能建议

- 单次查询的future dates建议不超过10个
- 如需批量查询，考虑分批运行
- 使用`query.debug.includeIndexMapping: false`（默认）以减少输出大小

## 9. 开发与调试

### 开启调试输出

设置环境变量：
```bash
LOG_LEVEL=DEBUG node iztro_runner.mjs input.json
```

### 开启索引映射（仅调试）

```json
{
  "query": {
    "debug": {
      "includeIndexMapping": true
    }
  }
}
```

这会在输出中添加`flowStarsByIndex`和`flowRoleAtIndex`字段，用于对比宫位角色映射和固定索引映射的差异。
```

**创建CHANGELOG.md**:

```markdown
# 更新日志

## [Unreleased]

### 计划改进
- [ ] 修复时区处理的全局变量问题
- [ ] 添加TypeScript类型定义
- [ ] 添加单元测试
- [ ] 重构大函数
- [ ] 提取配置常量

## [0.1.0] - 2026-02-05

### 初始版本
- 支持公历/农历排盘
- 支持本命盘 + 流年/流月/流日/流时
- 支持未来日期批量查询
- 输出详细的12宫星曜信息
- 支持四化标签（本命/大限/流年/流月/流日/流时）
```

---

## 优先级建议

根据影响程度和紧急程度，建议按以下优先级处理：

### 🔴 高优先级（立即处理）

1. **时区处理问题** - 影响结果准确性，可能导致日期错误
2. **输入验证** - 避免运行时错误，提升用户体验
3. **错误处理改进** - 更清晰的错误信息，减少调试时间

### 🟡 中优先级（近期处理）

4. **重构大函数** - 提升代码可维护性
5. **提取配置常量** - 提升可扩展性
6. **添加日志系统** - 便于问题排查

### 🟢 低优先级（长期规划）

7. **TypeScript迁移** - 提升类型安全（较大改动）
8. **单元测试** - 保证代码质量（需要时间投入）
9. **性能优化** - 当前性能已够用，非瓶颈
10. **文档完善** - 持续改进

---

## 总结

这个skill项目的整体架构合理，核心功能完整，主要问题集中在：

1. **代码质量层面**：函数过长、硬编码、缺少类型
2. **健壮性层面**：错误处理不够细致、输入验证不完善
3. **可维护性层面**：缺少测试、文档可以更详细
4. **性能层面**：JSON序列化效率、全局变量修改

**建议的改进路径**：
1. 第一阶段：修复高优先级问题（时区、验证、错误处理）
2. 第二阶段：重构代码结构（拆分函数、提取配置）
3. 第三阶段：添加测试和日志
4. 第四阶段（可选）：TypeScript迁移

按照这个路径，可以在不影响现有功能的前提下，逐步提升代码质量和可维护性。

---

**审查人**: Claude Sonnet 4.5
**日期**: 2026-02-05
