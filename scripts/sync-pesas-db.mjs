import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_SOURCE_XLSX = "C:/Users/User/Documents/PESAS2024.xlsx";
const SOURCE_XLSX = path.resolve(process.argv[2] || process.env.PESAS_XLSX_PATH || DEFAULT_SOURCE_XLSX);

const OUTPUT_RAW_JSON = path.resolve(REPO_ROOT, "frontend/src/data/pesas2024_hardcoded_db.json");
const OUTPUT_RAW_JS = path.resolve(REPO_ROOT, "frontend/src/data/pesas2024_hardcoded_db.js");
const OUTPUT_USERS_SEED = path.resolve(REPO_ROOT, "server/data/seeds/users.seed.csv");
const OUTPUT_APP_STORAGE_SEED = path.resolve(REPO_ROOT, "server/data/seeds/app_storage.seed.json");

const TRAINING_SHEETS = ["ADAPTACION I", "ADAPTACION II", "GOMAS", "ROLLER", "ENTRENODIARIO"];
const STATIC_GROUPS = ["por-asignar", "1500m", "800m", "pequeños"];
const DAYS_SHORT = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

const DEFAULT_EXERCISE_PROFILE = {
  sq: { sets: 4, reps: 6, pct: 85 },
  dl: { sets: 3, reps: 5, pct: 80 },
  bp: { sets: 4, reps: 8, pct: 75 },
  ht: { sets: 4, reps: 10, pct: 70 },
  lp: { sets: 3, reps: 12, pct: 70 },
  row: { sets: 4, reps: 8, pct: 75 },
  lunge: { sets: 3, reps: 12, pct: 65 },
  rdl: { sets: 4, reps: 8, pct: 72 },
  calf: { sets: 4, reps: 15, pct: 80 },
  pm: { sets: 3, reps: 10, pct: 70 },
};

const EXERCISE_STOPWORDS = new Set([
  "SERIES",
  "REPET.",
  "REPET",
  "REPET.",
  "SEMANA",
  "EJERCICIO",
  "EJERCICIO 1",
  "EJERCICIO 2",
  "EJERCICIO 3",
  "TEMPORADA",
  "NOTA",
  "PORCENTAJE",
  "VALOR EN TABLA",
  "POSICION",
  "PESO 1 RM",
  "PESO",
  "PES",
  "%",
  "TEST",
  "NO DATOS",
  "X1",
  "X2",
  "X3",
  "REC",
  "SESION",
  "SESION 1",
  "SESION 2",
  "SESION 3",
  "ADAPTACION I",
  "ADAPTACION II",
  "CICLO ADAPTACION",
  "TEMPORADA",
  "NOTA",
  "REP",
  "A",
  "-",
  " ",
]);

const NOISE_EXERCISE_REGEXES = [
  /^\d+$/,
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/i,
  /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?(\s*AL\s*\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?)?$/i,
  /^X\d+$/i,
  /^N+$/i,
  /^MES\s+/i,
];

const NOISE_EXERCISE_KEYWORDS = [
  "TEMPORADA",
  "SEMANA",
  "SERIES",
  "REPET",
  "PORCENTAJE",
  "VALOR EN TABLA",
  "POSICION",
  "INICIO",
  "FIN",
  "SESION",
  "ADAPTACION",
  "NOTA",
  "PREFERENTEMENTE",
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripDiacritics(value) {
  return normalizeWhitespace(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value) {
  return stripDiacritics(value).toUpperCase();
}

function slugify(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function trimTrailingNulls(row) {
  const out = Array.isArray(row) ? [...row] : [];
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last === null || last === undefined || last === "") {
      out.pop();
      continue;
    }
    break;
  }
  return out;
}

function formatIsoDatePart(date) {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatIsoDateTimePart(date) {
  return `${formatIsoDatePart(date)}T00:00:00`;
}

function excelSerialToIsoDate(value) {
  if (value instanceof Date) {
    return formatIsoDatePart(value);
  }
  if (typeof value === "string") {
    const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) {
    return null;
  }
  const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  return formatIsoDatePart(date);
}

function normalizeCellValue(value) {
  if (value instanceof Date) {
    return formatIsoDateTimePart(value);
  }
  return value;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
    if (cleaned) return Number(cleaned[0]);
  }
  return null;
}

function toPositiveInt(value, fallback) {
  const n = toNumber(value);
  if (n == null) return fallback;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : fallback;
}

function toTitleName(value) {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  return clean
    .split(" ")
    .map((w) => (w ? `${w[0]}${w.slice(1).toLowerCase()}` : w))
    .join(" ");
}

function mapExerciseNameToId(exerciseName, fallbackPrefix = "custom") {
  const key = normalizeKey(exerciseName);
  if (!key) return `${fallbackPrefix}_exercise`;
  if (key.includes("SENTADILLA")) return "sq";
  if (key.includes("PESO MUERTO") && key.includes("UNA PIERNA")) return "rdl";
  if (key.includes("PESO MUERTO")) return "dl";
  if (key.includes("PRESS BANCA") || key.includes("PECTORAL")) return "bp";
  if (key.includes("HIP TRUST") || key.includes("HIP THRUST") || key.includes("ELEVACION DE CADERA")) return "ht";
  if (key.includes("PRENSA")) return "lp";
  if (key.includes("REMO")) return "row";
  if (key.includes("ZANCADA") || key.includes("LUNGE") || key.includes("SPLIT")) return "lunge";
  if (key.includes("RDL")) return "rdl";
  if (key.includes("GEMELO") || key.includes("SOLEO")) return "calf";
  if (key.includes("PRESS MILITAR") || key.includes("PRESS HOMBRO")) return "pm";
  return `${fallbackPrefix}_${slugify(key) || "exercise"}`;
}

function ensureUniqueId(baseId, usedIds) {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function isLikelyAthleteName(value) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  const key = normalizeKey(text);
  if (EXERCISE_STOPWORDS.has(key)) return false;
  if (/^\d+$/.test(text)) return false;
  if (text.length < 2 || text.length > 32) return false;
  if (/[._]/.test(text)) return false;
  if (/"/.test(text)) return false;
  return /^[A-Za-zÀ-ÿ' ]+$/.test(text);
}

function isNoiseExerciseLabel(value) {
  const text = normalizeWhitespace(value);
  if (!text) return true;
  const key = normalizeKey(text);
  if (key.startsWith("COMPLEM") || key === "LIBRE") return true;
  if (EXERCISE_STOPWORDS.has(key)) return true;
  if (NOISE_EXERCISE_REGEXES.some((re) => re.test(text))) return true;
  if (NOISE_EXERCISE_KEYWORDS.some((kw) => key.includes(kw))) return true;
  if (/^\d/.test(text) && key.includes("T")) return true;
  return false;
}

function isLikelyExerciseLabel(value) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  if (isNoiseExerciseLabel(text)) return false;
  if (text.length < 3 || text.length > 80) return false;
  return /[A-Za-zÀ-ÿ]/.test(text);
}

function countNonEmptyCells(ws) {
  let total = 0;
  for (const key of Object.keys(ws || {})) {
    if (key.startsWith("!")) continue;
    const cell = ws[key];
    if (!cell) continue;
    const v = cell.v;
    if (v === null || v === undefined || v === "") continue;
    total += 1;
  }
  return total;
}

function buildRawDb(workbook) {
  const sheets = [];
  let totalNonEmpty = 0;

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(ws?.["!ref"] || "A1:A1");
    const rawRows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const rows = rawRows.map((row) => trimTrailingNulls(row.map(normalizeCellValue)));
    const nonEmptyCells = countNonEmptyCells(ws);
    totalNonEmpty += nonEmptyCells;

    sheets.push({
      name,
      maxRow: range.e.r + 1,
      maxCol: range.e.c + 1,
      nonEmptyCells,
      rows,
    });
  }

  return {
    workbook: path.basename(SOURCE_XLSX),
    generatedAt: new Date().toISOString(),
    format: "sparse-rows-trailing-null-trimmed",
    nonEmptyCells: totalNonEmpty,
    sheets,
  };
}

function getSheetRows(rawDb, sheetName) {
  return rawDb.sheets.find((s) => s.name === sheetName)?.rows || [];
}

function buildExerciseCatalog(baseRows) {
  const usedIds = new Set();
  const catalog = [];
  const seenByName = new Set();

  for (const row of baseRows) {
    const code = normalizeWhitespace(row?.[0]);
    const name = normalizeWhitespace(row?.[2]);
    if (!/^codigo\s+\d+/i.test(code) || !name) continue;
    if (isNoiseExerciseLabel(name)) continue;

    const normalizedName = normalizeKey(name);
    if (!normalizedName || seenByName.has(normalizedName)) continue;
    seenByName.add(normalizedName);

    const mapped = mapExerciseNameToId(name);
    const exId = ensureUniqueId(mapped, usedIds);

    catalog.push({
      code,
      exercise: name,
      exId,
      imageUrl: null,
    });
  }

  return catalog;
}

function getControlContext(controlRows) {
  const headerIndex = controlRows.findIndex((row) => {
    const first = normalizeKey(row?.[0]);
    return first === "EJERCICIO" && row.some((v) => normalizeKey(v) === "PES");
  });
  if (headerIndex < 1) return null;

  const headerRow = controlRows[headerIndex] || [];
  const namesRow = controlRows[headerIndex - 1] || [];

  const athletes = [];
  const seen = new Set();
  for (let col = 1; col < headerRow.length; col += 1) {
    if (normalizeKey(headerRow[col]) !== "PES") continue;
    const rawName = namesRow[col] ?? namesRow[col - 1];
    if (!isLikelyAthleteName(rawName)) continue;
    const normalizedName = toTitleName(rawName);
    if (!normalizedName || seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    athletes.push({
      name: normalizedName,
      pesCol: col,
      repCol: col + 1,
    });
  }

  if (!athletes.length) return null;

  const endIndex = controlRows.findIndex((row, idx) => {
    if (idx <= headerIndex) return false;
    const first = normalizeKey(row?.[0]);
    return first.startsWith("COMPLEM") || first === "LIBRE";
  });

  return {
    headerIndex,
    endIndex: endIndex > headerIndex ? endIndex : controlRows.length,
    athletes,
  };
}

function collectAthleteNames(controlRows, entrenoRows) {
  const out = [];
  const seen = new Set();

  const controlCtx = getControlContext(controlRows);
  for (const a of controlCtx?.athletes || []) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    out.push(a.name);
  }

  for (const row of entrenoRows) {
    const hasNuria = row.some((v) => normalizeKey(v) === "NURIA");
    if (!hasNuria) continue;
    for (const cell of row) {
      if (!isLikelyAthleteName(cell)) continue;
      const normalizedName = toTitleName(cell);
      if (!normalizedName || seen.has(normalizedName)) continue;
      seen.add(normalizedName);
      out.push(normalizedName);
    }
  }

  return out;
}

function buildExerciseLookup(catalog) {
  const lookup = new Map();
  for (const item of catalog) {
    const normalizedName = normalizeKey(item.exercise);
    if (!lookup.has(normalizedName)) lookup.set(normalizedName, item.exId);
  }
  return lookup;
}

function resolveExerciseId(exerciseName, exerciseLookup) {
  const key = normalizeKey(exerciseName);
  if (exerciseLookup.has(key)) {
    return exerciseLookup.get(key);
  }
  return mapExerciseNameToId(exerciseName);
}

function extractAthleteMaxW(controlRows, controlContext, exerciseLookup) {
  const maxW = new Map();
  if (!controlContext) return maxW;

  for (const athlete of controlContext.athletes) {
    maxW.set(athlete.name, {});
  }

  for (let r = controlContext.headerIndex + 1; r < controlContext.endIndex; r += 1) {
    const row = controlRows[r] || [];
    const exerciseName = normalizeWhitespace(row[0]);
    if (!exerciseName) continue;
    const exerciseKey = normalizeKey(exerciseName);
    if (exerciseKey.startsWith("COMPLEM") || exerciseKey === "LIBRE") continue;
    if (isNoiseExerciseLabel(exerciseName)) continue;

    const exId = resolveExerciseId(exerciseName, exerciseLookup);
    for (const athlete of controlContext.athletes) {
      const athleteName = athlete.name;
      const pesValue = toNumber(row[athlete.pesCol]);
      if (pesValue == null || pesValue <= 0) continue;

      const repValue = toNumber(row[athlete.repCol]);
      if (repValue != null && repValue < 0) continue;

      const athleteLoads = maxW.get(athleteName) || {};
      const prev = athleteLoads[exId] || 0;
      athleteLoads[exId] = pesValue > prev ? pesValue : prev;
      maxW.set(athleteName, athleteLoads);
    }
  }

  return maxW;
}

function buildAthletes(athleteNames, maxWByAthlete) {
  const out = [];
  const usedIds = new Set();

  for (const name of athleteNames) {
    const baseId = slugify(name) || "athlete";
    const id = ensureUniqueId(baseId, usedIds);
    const avatar = name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("");

    out.push({
      id,
      name,
      group: "por-asignar",
      groups: ["por-asignar"],
      avatar: avatar || "AT",
      maxW: maxWByAthlete.get(name) || {},
      weekKms: [],
      todayDone: false,
      competitions: [],
    });
  }

  return out;
}

function parseWeekNumber(rows) {
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (normalizeKey(row[i]) !== "SEMANA") continue;
      for (let j = i + 1; j < Math.min(i + 5, row.length); j += 1) {
        const n = toNumber(row[j]);
        if (n != null && n > 0) return Math.round(n);
      }
    }
  }
  return null;
}

function getWeekType(weekNumber) {
  const n = Number(weekNumber || 1);
  const cycleIndex = ((n - 1) % 22) + 1;
  if (cycleIndex <= 2) return "Adaptación";
  if (cycleIndex <= 10) return "General";
  if (cycleIndex <= 16) return "Preparatoria";
  return "Competitiva";
}

function parseCalendarWeeks(calendarRows) {
  const headerIndex = calendarRows.findIndex((row) => {
    const keys = row.map(normalizeKey);
    return keys.includes("SEMANA") && keys.includes("INICIO") && keys.includes("FIN");
  });
  if (headerIndex < 0) return [];

  const header = calendarRows[headerIndex];
  const weekIdx = header.findIndex((v) => normalizeKey(v) === "SEMANA");
  const startIdx = header.findIndex((v) => normalizeKey(v) === "INICIO");
  const endIdx = header.findIndex((v) => normalizeKey(v) === "FIN");
  if (weekIdx < 0 || startIdx < 0 || endIdx < 0) return [];

  const weeks = [];
  for (let r = headerIndex + 1; r < calendarRows.length; r += 1) {
    const row = calendarRows[r] || [];
    const weekNumber = toNumber(row[weekIdx]);
    const startDate = excelSerialToIsoDate(row[startIdx]);
    const endDate = excelSerialToIsoDate(row[endIdx]);
    if (weekNumber == null || !startDate || !endDate) continue;

    const n = Math.round(weekNumber);
    weeks.push({
      id: `cal_week_${n}_${startDate}`,
      weekNumber: n,
      name: `Semana ${n}`,
      type: getWeekType(n),
      startDate,
      endDate,
      targetGroup: "all",
    });
  }

  return weeks;
}

function pickActiveCalendarWeek(calendarWeeks) {
  if (!calendarWeeks.length) return null;
  const today = formatIsoDatePart(new Date());
  const found = calendarWeeks.find((w) => w.startDate <= today && today <= w.endDate);
  return found || calendarWeeks[0];
}

function parseReps(value, fallback) {
  const n = toNumber(value);
  if (n != null && n > 0) return Math.round(n);
  return fallback;
}

function dedupeExercises(exercises) {
  const seen = new Set();
  const out = [];
  for (const ex of exercises) {
    const key = String(ex.exId || "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ex);
  }
  return out;
}

function buildExerciseFromCell(labelValue, setsValue, repsValue, athleteNameSet, exerciseLookup) {
  const label = normalizeWhitespace(labelValue);
  if (!isLikelyExerciseLabel(label)) return null;

  const displayName = toTitleName(label);
  if (!displayName || athleteNameSet.has(displayName)) return null;

  const exId = resolveExerciseId(label, exerciseLookup);
  const profile = DEFAULT_EXERCISE_PROFILE[exId] || { sets: 3, reps: 8, pct: 70 };
  const sets = toPositiveInt(setsValue, profile.sets);
  const reps = parseReps(repsValue, profile.reps);

  return {
    exId,
    name: displayName,
    sets,
    reps,
    pct: profile.pct,
    imageUrl: null,
  };
}

function extractExercisesFromBlocks(row, blockStarts, athleteNameSet, exerciseLookup) {
  const exercises = [];
  for (const startCol of blockStarts) {
    const ex = buildExerciseFromCell(row[startCol + 2], row[startCol], row[startCol + 1], athleteNameSet, exerciseLookup);
    if (!ex) continue;
    exercises.push(ex);
  }
  return dedupeExercises(exercises);
}

function buildGridSheetRoutines(sheetName, rows, athleteNameSet, exerciseLookup) {
  const weekNumber = parseWeekNumber(rows);
  const out = [];
  const gridStarts = [0, 4, 8, 12];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const exercises = extractExercisesFromBlocks(row, gridStarts, athleteNameSet, exerciseLookup);
    if (!exercises.length) continue;

    out.push({
      sourceSheet: sheetName,
      weekNumber: weekNumber || null,
      targetGroup: "all",
      name: `${sheetName} · Bloque ${out.length + 1}`,
      exercises,
      sourceRow: rowIndex + 1,
    });
  }
  return out;
}

function buildRollerRoutines(rows, athleteNameSet, exerciseLookup) {
  const out = [];
  let inferredSets = 3;
  let inferredReps = 8;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const setHint = toPositiveInt(row[1], null);
    if (setHint != null && setHint <= 12) inferredSets = setHint;
    const repHint = toPositiveInt(row[11], null);
    if (repHint != null && repHint <= 40) inferredReps = repHint;

    const labels = [row[1], row[2], row[5], row[8]];
    const exercises = dedupeExercises(
      labels
        .map((label) => buildExerciseFromCell(label, inferredSets, inferredReps, athleteNameSet, exerciseLookup))
        .filter(Boolean)
    );
    if (!exercises.length) continue;

    out.push({
      sourceSheet: "ROLLER",
      weekNumber: null,
      targetGroup: "all",
      name: `ROLLER · Bloque ${out.length + 1}`,
      exercises,
      sourceRow: rowIndex + 1,
    });
  }
  return out;
}

function parseEntrenoWeekNumber(rows) {
  for (const row of rows.slice(0, 10)) {
    const hasIsoDate = row.some((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v));
    if (!hasIsoDate) continue;

    for (const cell of row) {
      const n = toNumber(cell);
      if (n == null) continue;
      const rounded = Math.round(n);
      if (rounded >= 1 && rounded <= 120) return rounded;
    }
  }
  return null;
}

function buildEntrenoDiarioRoutines(rows, athleteNameSet, exerciseLookup) {
  const out = [];
  const weekNumber = parseEntrenoWeekNumber(rows);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const loadRow = rows[rowIndex + 2] || [];
    const setsValue = loadRow[0];
    const repsValue = loadRow[1];

    const exA = buildExerciseFromCell(row[3], setsValue, repsValue, athleteNameSet, exerciseLookup);
    const exB = buildExerciseFromCell(row[28], setsValue, repsValue, athleteNameSet, exerciseLookup);
    const exercises = dedupeExercises([exA, exB].filter(Boolean));
    if (!exercises.length) continue;

    const rawLabel = normalizeWhitespace(row[3]);
    const blockName = rawLabel && !isNoiseExerciseLabel(rawLabel) ? rawLabel : `Bloque ${out.length + 1}`;
    out.push({
      sourceSheet: "ENTRENODIARIO",
      weekNumber,
      targetGroup: "all",
      name: `ENTRENODIARIO · ${toTitleName(blockName)}`,
      exercises,
      sourceRow: rowIndex + 1,
    });
  }
  return out;
}

function buildRoutines(rawDb, athleteNames, exerciseLookup) {
  const candidates = [];
  const athleteNameSet = new Set(athleteNames.map((n) => toTitleName(n)));

  for (const sheetName of TRAINING_SHEETS) {
    const rows = getSheetRows(rawDb, sheetName);
    if (!rows.length) continue;

    if (sheetName === "ROLLER") {
      candidates.push(...buildRollerRoutines(rows, athleteNameSet, exerciseLookup));
      continue;
    }
    if (sheetName === "ENTRENODIARIO") {
      candidates.push(...buildEntrenoDiarioRoutines(rows, athleteNameSet, exerciseLookup));
      continue;
    }
    candidates.push(...buildGridSheetRoutines(sheetName, rows, athleteNameSet, exerciseLookup));
  }

  const routines = [];
  const usedIds = new Set();
  const seenSignatures = new Set();
  const sheetSeq = new Map();
  for (const item of candidates) {
    const exSig = item.exercises.map((e) => `${e.exId}:${e.sets}:${e.reps}`).join(",");
    const signature = `${item.sourceSheet}|${item.weekNumber || "0"}|${exSig}`;
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);

    const seq = (sheetSeq.get(item.sourceSheet) || 0) + 1;
    sheetSeq.set(item.sourceSheet, seq);

    const baseId = `rt_${slugify(item.sourceSheet)}_${item.weekNumber || "0"}_${seq}`;
    const id = ensureUniqueId(baseId, usedIds);
    routines.push({
      id,
      name: item.name || `${item.sourceSheet} · Bloque ${seq}`,
      sourceSheet: item.sourceSheet,
      weekNumber: item.weekNumber || null,
      targetGroup: item.targetGroup || "all",
      exercises: item.exercises,
    });
  }

  return routines;
}

function buildWeekFromCalendar(activeCalendarWeek, routines) {
  const target = activeCalendarWeek || {
    weekNumber: 1,
    name: "Semana 1",
    type: "Adaptación",
    startDate: formatIsoDatePart(new Date()),
    endDate: formatIsoDatePart(new Date()),
  };

  const offset = routines.length ? (((target.weekNumber || 1) - 1) * 7) % routines.length : 0;
  const days = DAYS_SHORT.map((_, i) => {
    const routine = routines.length ? routines[(offset + i) % routines.length] : null;
    return {
      am: "",
      pm: "",
      targetGroup: "all",
      gym: !!routine,
      gymPlan: routine ? { mode: "saved", routineId: routine.id } : null,
      gymFocus: routine ? routine.exercises.map((ex) => ex.exId) : [],
    };
  });

  return {
    id: `week_${target.weekNumber || "active"}`,
    name: target.name || `Semana ${target.weekNumber || ""}`.trim(),
    weekNumber: target.weekNumber || null,
    type: target.type || "Adaptación",
    targetGroup: "all",
    startDate: target.startDate || null,
    endDate: target.endDate || null,
    days,
  };
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function athletesToCsv(athletes) {
  const columns = ["id", "name", "group", "groups", "avatar", "maxW", "weekKms", "todayDone", "competitions"];
  const rows = [columns.join(",")];

  for (const athlete of athletes) {
    const groups = Array.isArray(athlete.groups) && athlete.groups.length
      ? athlete.groups
      : [athlete.group || "por-asignar"];
    const row = {
      id: athlete.id,
      name: athlete.name,
      group: athlete.group || groups[0] || "por-asignar",
      groups: JSON.stringify(groups),
      avatar: athlete.avatar || "",
      maxW: JSON.stringify(athlete.maxW || {}),
      weekKms: JSON.stringify(athlete.weekKms || []),
      todayDone: athlete.todayDone ? "1" : "0",
      competitions: JSON.stringify(Array.isArray(athlete.competitions) ? athlete.competitions : []),
    };
    rows.push(columns.map((c) => csvEscape(row[c])).join(","));
  }

  return `${rows.join("\n")}\n`;
}

async function sha256File(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const workbook = XLSX.readFile(SOURCE_XLSX, { cellDates: true });
  const rawDb = buildRawDb(workbook);

  const baseRows = getSheetRows(rawDb, "BASE");
  const controlRows = getSheetRows(rawDb, "control pesas");
  const entrenoRows = getSheetRows(rawDb, "ENTRENODIARIO");
  const calendarRows = getSheetRows(rawDb, "CALENDARIO ");

  const exerciseCatalog = buildExerciseCatalog(baseRows);
  const exerciseLookup = buildExerciseLookup(exerciseCatalog);

  const athleteNames = collectAthleteNames(controlRows, entrenoRows);
  const controlContext = getControlContext(controlRows);
  const maxWByAthlete = extractAthleteMaxW(controlRows, controlContext, exerciseLookup);
  const athletes = buildAthletes(athleteNames, maxWByAthlete);

  const calendarWeeks = parseCalendarWeeks(calendarRows);
  const activeCalendarWeek = pickActiveCalendarWeek(calendarWeeks);

  const routines = buildRoutines(rawDb, athleteNames, exerciseLookup);
  const week = buildWeekFromCalendar(activeCalendarWeek, routines);

  const sourceHash = await sha256File(SOURCE_XLSX);
  const seedMeta = {
    sourceWorkbook: path.basename(SOURCE_XLSX),
    sourceWorkbookPath: SOURCE_XLSX,
    sourceSha256: sourceHash,
    generatedAt: new Date().toISOString(),
    sheetCount: rawDb.sheets.length,
    athleteCount: athletes.length,
    routineCount: routines.length,
    calendarWeekCount: calendarWeeks.length,
    groupPolicy: "manual-csv-mapping",
    weekTypeCycle: "2 Adaptación + 8 General + 6 Preparatoria + 6 Competitiva",
    includesImageExtraction: false,
    notes: "imageUrl preparado como null y editable",
    exerciseCatalog,
  };

  const usersSeedCsv = athletesToCsv(athletes);
  const appStorageSeed = {
    tf_athletes: JSON.stringify(athletes),
    tf_groups: JSON.stringify(STATIC_GROUPS),
    tf_routines: JSON.stringify(routines),
    tf_week_plans: JSON.stringify({ [week.weekNumber || 1]: week }),
    tf_active_week_number: JSON.stringify(week.weekNumber || 1),
    tf_week: JSON.stringify(week),
    tf_calendar_weeks: JSON.stringify(calendarWeeks),
    tf_pesas_raw: JSON.stringify(rawDb),
    tf_seed_meta: JSON.stringify(seedMeta),
    tf_notifs: "[]",
    tf_history: "[]",
  };

  await writeJson(OUTPUT_RAW_JSON, rawDb);
  await ensureParentDir(OUTPUT_RAW_JS);
  await fs.writeFile(
    OUTPUT_RAW_JS,
    `export const PESAS2024_HARDCODED_DB = ${JSON.stringify(rawDb)};\nexport default PESAS2024_HARDCODED_DB;\n`,
    "utf8"
  );
  await ensureParentDir(OUTPUT_USERS_SEED);
  await fs.writeFile(OUTPUT_USERS_SEED, usersSeedCsv, "utf8");
  await writeJson(OUTPUT_APP_STORAGE_SEED, appStorageSeed);

  console.log("Sync completado.");
  console.log(`Fuente: ${SOURCE_XLSX}`);
  console.log(`Hojas: ${rawDb.sheets.length}`);
  console.log(`Atletas seed: ${athletes.length}`);
  console.log(`Rutinas seed: ${routines.length}`);
  console.log(`Semanas calendario: ${calendarWeeks.length}`);
  for (const sheet of rawDb.sheets) {
    console.log(`- ${sheet.name}: ${sheet.nonEmptyCells} celdas no vacias`);
  }
  console.log(`Salida RAW JSON: ${OUTPUT_RAW_JSON}`);
  console.log(`Salida RAW JS: ${OUTPUT_RAW_JS}`);
  console.log(`Salida users seed: ${OUTPUT_USERS_SEED}`);
  console.log(`Salida app storage seed: ${OUTPUT_APP_STORAGE_SEED}`);
}

main().catch((err) => {
  console.error("Fallo al sincronizar PESAS:", err);
  process.exit(1);
});
