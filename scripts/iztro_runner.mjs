#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(message) {
  console.error(`[ziwei-iztro-runner] ${message}`);
  process.exit(1);
}

function parseInputFile(filePath) {
  if (!filePath) {
    fail('Missing input JSON path. Usage: node iztro_runner.mjs <input.json>');
  }

  try {
    const content = readFileSync(resolve(process.cwd(), filePath), 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    fail(`Cannot read input file: ${error.message}`);
  }
}

function normalizeYmd(dateText, fieldName) {
  if (typeof dateText !== 'string') {
    fail(`${fieldName} must be a string in YYYY-M-D or YYYY-MM-DD.`);
  }

  const match = dateText.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    fail(`${fieldName} must match YYYY-M-D or YYYY-MM-DD.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    fail(`${fieldName} month must be 1..12.`);
  }

  if (day < 1 || day > 31) {
    fail(`${fieldName} day must be 1..31.`);
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) {
    fail(`${fieldName} is not a valid calendar date.`);
  }

  return `${year}-${month}-${day}`;
}

function dateInTimeZone(timeZone, instant = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    fail(`Cannot resolve date parts for timezone ${timeZone}.`);
  }

  return `${Number(year)}-${Number(month)}-${Number(day)}`;
}

function localNoonDate(dateText) {
  const [year, month, day] = dateText.split('-').map((v) => Number(v));
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return new Date(`${year}-${mm}-${dd}T12:00:00`);
}

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

function sanitizeForJson(data) {
  return JSON.parse(JSON.stringify(data, buildSafeReplacer()));
}

function sanitizeSnapshot(snapshot) {
  const clean = sanitizeForJson(snapshot);
  if (clean && typeof clean === 'object' && 'astrolabe' in clean) {
    delete clean.astrolabe;
  }
  return clean;
}

function buildMutagenMap(stars = [], scopeName) {
  const labelOrder = ['禄', '权', '科', '忌'];
  const map = new Map();

  stars.forEach((starName, index) => {
    if (!starName) {
      return;
    }

    const label = labelOrder[index] || String(index);
    const existing = map.get(starName) || [];
    existing.push(`${scopeName}${label}`);
    map.set(starName, existing);
  });

  return map;
}

function collectNatalMutagenTags(palaces = []) {
  const map = new Map();

  palaces.forEach((palace) => {
    const stars = [...(palace.majorStars || []), ...(palace.minorStars || [])];
    stars.forEach((star) => {
      if (!star?.name || !star?.mutagen) {
        return;
      }

      const existing = map.get(star.name) || [];
      existing.push(`本命${star.mutagen}`);
      map.set(star.name, existing);
    });
  });

  return map;
}

function buildScopePalaceMap(scope) {
  const palaceNameList = Array.isArray(scope?.palaceNames) ? scope.palaceNames : [];
  const starsList = Array.isArray(scope?.stars) ? scope.stars : [];

  const map = new Map();
  palaceNameList.forEach((palaceName, index) => {
    map.set(palaceName, starsList[index] || []);
  });

  return map;
}

function scopeStarsAtIndex(scope, index) {
  const starsList = Array.isArray(scope?.stars) ? scope.stars : [];
  return starsList[index] || [];
}

function scopeRoleAtIndex(scope, index) {
  const palaceNames = Array.isArray(scope?.palaceNames) ? scope.palaceNames : [];
  return palaceNames[index] || null;
}

function starEntryWithTags(star, tagMaps) {
  const tags = [];
  tagMaps.forEach((map) => {
    const matched = map.get(star.name);
    if (matched) {
      tags.push(...matched);
    }
  });

  return {
    name: star.name,
    type: star.type || null,
    scope: star.scope || null,
    brightness: star.brightness || null,
    mutagen: star.mutagen || null,
    tags,
  };
}

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

function buildDetailedPalaceReport(astrolabe, snapshot, options = {}) {
  const includeIndexMapping = options.includeIndexMapping === true;
  const natalMutagenMap = collectNatalMutagenTags(astrolabe.palaces || []);
  const decadalMutagenMap = buildMutagenMap(snapshot?.decadal?.mutagen, '大限');
  const yearlyMutagenMap = buildMutagenMap(snapshot?.yearly?.mutagen, '流年');
  const monthlyMutagenMap = buildMutagenMap(snapshot?.monthly?.mutagen, '流月');
  const dailyMutagenMap = buildMutagenMap(snapshot?.daily?.mutagen, '流日');
  const hourlyMutagenMap = buildMutagenMap(snapshot?.hourly?.mutagen, '流时');

  const tagMaps = [
    natalMutagenMap,
    decadalMutagenMap,
    yearlyMutagenMap,
    monthlyMutagenMap,
    dailyMutagenMap,
    hourlyMutagenMap,
  ];

  const yearlyPalaceStars = buildScopePalaceMap(snapshot?.yearly);
  const monthlyPalaceStars = buildScopePalaceMap(snapshot?.monthly);
  const dailyPalaceStars = buildScopePalaceMap(snapshot?.daily);
  const hourlyPalaceStars = buildScopePalaceMap(snapshot?.hourly);
  const decadalPalaceStars = buildScopePalaceMap(snapshot?.decadal);
  const agePalaceStars = buildScopePalaceMap(snapshot?.age);

  const yearlySuiqian = snapshot?.yearly?.yearlyDecStar?.suiqian12 || [];
  const yearlyJiangqian = snapshot?.yearly?.yearlyDecStar?.jiangqian12 || [];
  const yearlyPalaceNames = snapshot?.yearly?.palaceNames || [];

  const yearlyIndexByPalace = new Map();
  yearlyPalaceNames.forEach((name, index) => {
    yearlyIndexByPalace.set(name, index);
  });

  const palaceNameAlias = {
    官禄: '事业',
    仆役: '交友',
  };

  return (astrolabe.palaces || []).map((palace) => {
    const yearlyIndex = yearlyIndexByPalace.get(palace.name);
    const natalMajor = (palace.majorStars || []).map((star) => starEntryWithTags(star, tagMaps));
    const natalMinor = (palace.minorStars || []).map((star) => starEntryWithTags(star, tagMaps));
    const natalAdj = (palace.adjectiveStars || []).map((star) => starEntryWithTags(star, tagMaps));

    const flows = {
      decadal: (decadalPalaceStars.get(palace.name) || []).map((star) => starEntryWithTags(star, tagMaps)),
      age: (agePalaceStars.get(palace.name) || []).map((star) => starEntryWithTags(star, tagMaps)),
      yearly: (yearlyPalaceStars.get(palace.name) || []).map((star) => starEntryWithTags(star, tagMaps)),
      monthly: (monthlyPalaceStars.get(palace.name) || []).map((star) => starEntryWithTags(star, tagMaps)),
      daily: (dailyPalaceStars.get(palace.name) || []).map((star) => starEntryWithTags(star, tagMaps)),
      hourly: (hourlyPalaceStars.get(palace.name) || []).map((star) => starEntryWithTags(star, tagMaps)),
    };

    const flowsByIndex = includeIndexMapping
      ? {
          decadal: scopeStarsAtIndex(snapshot?.decadal, palace.index).map((star) => starEntryWithTags(star, tagMaps)),
          age: scopeStarsAtIndex(snapshot?.age, palace.index).map((star) => starEntryWithTags(star, tagMaps)),
          yearly: scopeStarsAtIndex(snapshot?.yearly, palace.index).map((star) => starEntryWithTags(star, tagMaps)),
          monthly: scopeStarsAtIndex(snapshot?.monthly, palace.index).map((star) => starEntryWithTags(star, tagMaps)),
          daily: scopeStarsAtIndex(snapshot?.daily, palace.index).map((star) => starEntryWithTags(star, tagMaps)),
          hourly: scopeStarsAtIndex(snapshot?.hourly, palace.index).map((star) => starEntryWithTags(star, tagMaps)),
        }
      : null;

    const flowRoleAtIndex = includeIndexMapping
      ? {
          decadal: scopeRoleAtIndex(snapshot?.decadal, palace.index),
          age: scopeRoleAtIndex(snapshot?.age, palace.index),
          yearly: scopeRoleAtIndex(snapshot?.yearly, palace.index),
          monthly: scopeRoleAtIndex(snapshot?.monthly, palace.index),
          daily: scopeRoleAtIndex(snapshot?.daily, palace.index),
          hourly: scopeRoleAtIndex(snapshot?.hourly, palace.index),
        }
      : null;

    return {
      palaceIndex: palace.index,
      palaceName: palace.name,
      palaceAlias: palaceNameAlias[palace.name] || null,
      palaceDisplayName: `${palaceNameAlias[palace.name] || palace.name}宫${palace.isBodyPalace ? '-身宫' : ''}`,
      heavenlyStem: palace.heavenlyStem,
      earthlyBranch: palace.earthlyBranch,
      isBodyPalace: Boolean(palace.isBodyPalace),
      isOriginalPalace: Boolean(palace.isOriginalPalace),
      changsheng12: palace.changsheng12 || null,
      boshi12: palace.boshi12 || null,
      jiangqian12: palace.jiangqian12 || null,
      suiqian12: palace.suiqian12 || null,
      yearlyDecStar: yearlyIndex === undefined
        ? { suiqian12: null, jiangqian12: null }
        : {
            suiqian12: yearlySuiqian[yearlyIndex] || null,
            jiangqian12: yearlyJiangqian[yearlyIndex] || null,
          },
      yearlyDecStarByIndex: includeIndexMapping
        ? {
            suiqian12: yearlySuiqian[palace.index] || null,
            jiangqian12: yearlyJiangqian[palace.index] || null,
          }
        : null,
      natal: {
        majorStars: natalMajor,
        minorStars: natalMinor,
        adjectiveStars: natalAdj,
      },
      flowStars: flows,
      flowStarsByRole: cloneFlowStars(flows),
      flowStarsByIndex: includeIndexMapping ? flowsByIndex : null,
      flowRoleAtIndex,
      decadalRange: Array.isArray(palace?.decadal?.range) ? [...palace.decadal.range] : null,
      decadalGanZhi: palace?.decadal
        ? `${palace.decadal.heavenlyStem}${palace.decadal.earthlyBranch}`
        : null,
      ages: Array.isArray(palace?.ages) ? [...palace.ages] : [],
    };
  });
}

function buildDetailedSnapshot(astrolabe, snapshot, targetSolarDate, options = {}) {
  return {
    targetSolarDate,
    targetLunarDate: snapshot?.lunarDate || null,
    age: sanitizeForJson(snapshot?.age || null),
    decadal: sanitizeForJson(snapshot?.decadal || null),
    yearly: sanitizeForJson(snapshot?.yearly || null),
    monthly: sanitizeForJson(snapshot?.monthly || null),
    daily: sanitizeForJson(snapshot?.daily || null),
    hourly: sanitizeForJson(snapshot?.hourly || null),
    palaces: buildDetailedPalaceReport(astrolabe, snapshot, options),
  };
}

const input = parseInputFile(process.argv[2]);

const birth = input.birth ?? {};
const query = input.query ?? {};

const calendar = birth.calendar;
if (calendar !== 'solar' && calendar !== 'lunar') {
  fail('birth.calendar must be either solar or lunar.');
}

if (birth.confirmed !== true) {
  fail('birth.confirmed must be true before generating chart output.');
}

const birthDate = normalizeYmd(birth.date, 'birth.date');
const timeIndex = Number(birth.timeIndex);
if (!Number.isInteger(timeIndex) || timeIndex < 0 || timeIndex > 12) {
  fail('birth.timeIndex must be an integer from 0 to 12.');
}

const gender = typeof birth.gender === 'string' ? birth.gender.toLowerCase() : '';
if (gender !== 'male' && gender !== 'female') {
  fail('birth.gender must be male or female.');
}

const birthplace = typeof birth.birthplace === 'string' ? birth.birthplace.trim() : '';
if (!birthplace) {
  fail('birth.birthplace must be a non-empty string.');
}

const timezone = query.timezone || 'Asia/Shanghai';
process.env.TZ = timezone;
const includeIndexMapping = query?.debug?.includeIndexMapping === true;

let baseDateText;
if (!query.baseDate || query.baseDate === 'today') {
  baseDateText = dateInTimeZone(timezone, new Date());
} else {
  baseDateText = normalizeYmd(query.baseDate, 'query.baseDate');
}

let astro;
try {
  ({ astro } = await import('iztro'));
} catch (error) {
  fail(`iztro is not installed. Run npm install in scripts/. Original error: ${error.message}`);
}

if (!astro?.bySolar || !astro?.byLunar) {
  fail('iztro API is not available: missing astro.bySolar/byLunar.');
}

const language = birth.language || 'zh-CN';
const fixLeap = birth.fixLeap ?? true;
const isLeapMonth = birth.isLeapMonth ?? false;

let astrolabe;
if (calendar === 'solar') {
  astrolabe = astro.bySolar(birthDate, timeIndex, gender, fixLeap, language);
} else {
  astrolabe = astro.byLunar(birthDate, timeIndex, gender, isLeapMonth, fixLeap, language);
}

if (!astrolabe?.horoscope) {
  fail('astrolabe.horoscope is not available from iztro result.');
}

const currentDate = localNoonDate(baseDateText);
const currentRaw = astrolabe.horoscope(currentDate);
const current = sanitizeSnapshot(currentRaw);
const currentDetailed = buildDetailedSnapshot(astrolabe, currentRaw, baseDateText, {
  includeIndexMapping,
});

const futureDates = Array.isArray(query.futureDates) ? query.futureDates : [];
const future = [];
const futureDetailed = [];

futureDates.forEach((rawDate, index) => {
  const normalized = normalizeYmd(rawDate, `query.futureDates[${index}]`);
  const targetDate = localNoonDate(normalized);
  const snapshotRaw = astrolabe.horoscope(targetDate);

  future.push({
    targetSolarDate: normalized,
    snapshot: sanitizeSnapshot(snapshotRaw),
  });

  futureDetailed.push(
    buildDetailedSnapshot(astrolabe, snapshotRaw, normalized, {
      includeIndexMapping,
    }),
  );
});

const output = {
  generatedAt: new Date().toISOString(),
  normalizedInput: {
    calendar,
    birthDate,
    timeIndex,
    gender,
    birthplace,
    birthConfirmed: true,
    timezone,
    baseDateSolar: baseDateText,
    baseDateLunar: currentRaw?.lunarDate ?? null,
  },
  outputPolicy: {
    detailLevel: 'full',
    mappingModes: includeIndexMapping ? ['by_role', 'by_index'] : ['by_role'],
    includeIndexMapping,
    requiredConfirmation: true,
    disclaimer:
      'For cultural study and entertainment reference only. No true-solar-time correction is applied by default.',
  },
  natal: astrolabe,
  current,
  future,
  currentDetailed,
  futureDetailed,
};

console.log(JSON.stringify(sanitizeForJson(output), null, 2));
