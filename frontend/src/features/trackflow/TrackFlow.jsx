import { useState, useEffect, useCallback, useRef } from "react";
import {
  hydrateStorageWriteAccess,
  signInStorageSession,
  signOutStorageSession,
} from "../../lib/storageClient.js";
import AthleteJogatina from "./jogatina/AthleteJogatina.jsx";

import './trackflow.css';

// ─── ZONES (km por intensidad) ─────────────────────────────────────────────────
const ZONES = [
  { id:"regen", label:"Regenerativo",       short:"REG", color:"#4ADE80" },
  { id:"ua",    label:"Umbral Aeróbico",     short:"UA",  color:"#60A5FA" },
  { id:"uan",   label:"Umbral Anaeróbico",   short:"UAN", color:"#FBBF24" },
  { id:"anae",  label:"Anaeróbico",          short:"ANE", color:"#F87171" },
];
const emptyZones = () => ({ regen:0, ua:0, uan:0, anae:0 });
const zonesTotal = z => z ? [z.regen,z.ua,z.uan,z.anae].reduce((s,v)=>s+Number(v||0),0) : 0;
const safeZones = z => {
  if (!z || typeof z !== "object") return emptyZones();
  return { regen:Number(z.regen||0), ua:Number(z.ua||0), uan:Number(z.uan||0), anae:Number(z.anae||0) };
};

// ─── MOCK DATA (from PESAS2024.xlsx) ─────────────────────────────────────────
// type: "weight" = peso×series×reps (%1RM→kg)
// type: "reps" = series×reps (sin carga externa)
// type: "time_reps" = tiempo×reps (con series)

const GYM_EXERCISES = [
  { id:"sq",    name:"Sentadilla",      emoji:"🏋️",  muscles:"Cuádriceps · Glúteos",   category:"compound",   type:"weight" },
  { id:"dl",    name:"Peso Muerto",     emoji:"⚡",   muscles:"Isquios · Espalda",      category:"compound",   type:"weight" },
  { id:"bp",    name:"Press Banca",     emoji:"💪",   muscles:"Pecho · Tríceps",        category:"upper",      type:"weight" },
  { id:"ht",    name:"Hip Thrust",      emoji:"🔥",   muscles:"Glúteos · Isquios",      category:"compound",   type:"weight" },
  { id:"lp",    name:"Prensa",          emoji:"🦵",   muscles:"Cuádriceps",             category:"compound",   type:"weight" },
  { id:"row",   name:"Remo con Barra",  emoji:"🚣",   muscles:"Dorsal · Bíceps",        category:"upper",      type:"weight" },
  { id:"lunge", name:"Zancadas",        emoji:"🚀",   muscles:"Cuádriceps · Glúteos",   category:"unilateral", type:"reps"   },
  { id:"rdl",   name:"RDL",             emoji:"🎯",   muscles:"Isquios · Glúteos",      category:"compound",   type:"weight" },
  { id:"calf",  name:"Gemelos",         emoji:"🦴",   muscles:"Sóleo · Gastrocnemio",   category:"isolation",  type:"reps"   },
  { id:"pm",    name:"Press Militar",   emoji:"💥",   muscles:"Hombros · Tríceps",      category:"upper",      type:"weight" },
  { id:"plank", name:"Plancha",         emoji:"⏱️",   muscles:"Core · Abdomen",         category:"core",       type:"time_reps" },
  { id:"box",   name:"Box Jump",        emoji:"📦",   muscles:"Cuádriceps · Glúteos",   category:"power",      type:"reps"   },
  { id:"sj",    name:"Salto Vertical",  emoji:"⬆️",   muscles:"Gemelos · Glúteos",      category:"power",      type:"reps"   },
];

const createAthleteSeed = (name, group = "por-asignar") => {
  const idBase = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return {
    id: `ath_${idBase || Date.now()}`,
    name,
    group,
    groups:[group],
    avatar: String(name || "").split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2),
    maxW:{},
    weekKms:[],
    password:"1234",
  };
};

const DEFAULT_ATHLETES = [
  "Nuria",
  "Ona",
  "Marina",
  "Eric",
  "Pelayo",
  "Marçal",
  "Teo",
  "Pablo Col",
  "Martí",
  "Pol Ferran",
  "Pol Serra",
  "Aram",
  "Gerard",
  "Pablo",
  "Jan",
  "Leo",
  "Ot",
  "Enric",
  "Roma",
  "Pau",
  "Mar",
  "Janna",
].map((name) => createAthleteSeed(name));

const DEFAULT_EXERCISE_LOAD_PROFILE = {
  sq:    { sets:4, reps:6,  pct:85, type:"weight", duration:0 },
  dl:    { sets:3, reps:5,  pct:80, type:"weight", duration:0 },
  bp:    { sets:4, reps:8,  pct:75, type:"weight", duration:0 },
  ht:    { sets:4, reps:10, pct:70, type:"weight", duration:0 },
  lp:    { sets:3, reps:12, pct:70, type:"weight", duration:0 },
  row:   { sets:4, reps:8,  pct:75, type:"weight", duration:0 },
  lunge: { sets:3, reps:12, pct:0,  type:"reps",   duration:0 },
  rdl:   { sets:4, reps:8,  pct:72, type:"weight", duration:0 },
  calf:  { sets:4, reps:15, pct:0,  type:"reps",   duration:0 },
  pm:    { sets:3, reps:10, pct:70, type:"weight", duration:0 },
  plank: { sets:3, reps:1,  pct:0,  type:"time_reps", duration:30 },
  box:   { sets:4, reps:8,  pct:0,  type:"reps",   duration:0 },
  sj:    { sets:4, reps:8,  pct:0,  type:"reps",   duration:0 },
};

const DEFAULT_ROUTINE_LIBRARY = [
  {
    id: "rt_lower_strength_a",
    name: "Lower Strength A",
    targetGroup: "all",
    exercises: [
      { exId:"sq", ...DEFAULT_EXERCISE_LOAD_PROFILE.sq },
      { exId:"ht", ...DEFAULT_EXERCISE_LOAD_PROFILE.ht },
      { exId:"rdl", ...DEFAULT_EXERCISE_LOAD_PROFILE.rdl },
      { exId:"calf", ...DEFAULT_EXERCISE_LOAD_PROFILE.calf },
    ],
  },
  {
    id: "rt_mixed_power_b",
    name: "Mixed Power B",
    targetGroup: "all",
    exercises: [
      { exId:"lp", ...DEFAULT_EXERCISE_LOAD_PROFILE.lp },
      { exId:"lunge", ...DEFAULT_EXERCISE_LOAD_PROFILE.lunge },
      { exId:"rdl", ...DEFAULT_EXERCISE_LOAD_PROFILE.rdl },
      { exId:"pm", ...DEFAULT_EXERCISE_LOAD_PROFILE.pm },
    ],
  },
  {
    id: "rt_full_body_c",
    name: "Full Body C",
    targetGroup: "all",
    exercises: [
      { exId:"sq", ...DEFAULT_EXERCISE_LOAD_PROFILE.sq },
      { exId:"bp", ...DEFAULT_EXERCISE_LOAD_PROFILE.bp },
      { exId:"row", ...DEFAULT_EXERCISE_LOAD_PROFILE.row },
      { exId:"calf", ...DEFAULT_EXERCISE_LOAD_PROFILE.calf },
    ],
  },
];

const DEFAULT_WEEK = {
  id: "week_base",
  name: "Semana Base",
  type: "Inicial",
  targetGroup: "all",
  days: [
    {
      am:"Rodaje 10km suave Z2", pm:"Técnica + 6×200m",
      targetGroup:"all",
      gym:true,
      gymPlan:{ mode:"saved", routineId:"rt_lower_strength_a" },
      gymFocus:["sq","ht","rdl","calf"]
    },
    { am:"Descanso activo", pm:"", targetGroup:"all", gym:false, gymPlan:null, gymFocus:[] },
    {
      am:"Fartlek 8×1' Z4", pm:"Rodaje 8km recuperación",
      targetGroup:"all",
      gym:true,
      gymPlan:{ mode:"saved", routineId:"rt_mixed_power_b" },
      gymFocus:["lp","lunge","rdl","pm"]
    },
    { am:"", pm:"Series 4×1000m", targetGroup:"all", gym:false, gymPlan:null, gymFocus:[] },
    {
      am:"Rodaje 12km Z2", pm:"Drills técnicos",
      targetGroup:"all",
      gym:true,
      gymPlan:{ mode:"saved", routineId:"rt_full_body_c" },
      gymFocus:["sq","bp","row","calf"]
    },
    { am:"Rodaje largo 18km", pm:"", targetGroup:"all", gym:false, gymPlan:null, gymFocus:[] },
    { am:"Descanso", pm:"", targetGroup:"all", gym:false, gymPlan:null, gymFocus:[] },
  ]
};

const WEEK_TYPES = ["Inicial","Competitiva","Volumen"];
const SESSION_TARGET_GROUPS = ["all","pequeños","1500m","800m"];

const TRAINING_DATASET = [
  { id:"tr_run_regen",  name:"Rodaje regenerativo",     description:"Trote suave de recuperación activa",          weekTypes:["Inicial","Competitiva","Volumen"], zones:{ regen:6,  ua:0,  uan:0, anae:0 } },
  { id:"tr_run_z2",     name:"Rodaje Z2 continuo",       description:"Carrera continua a ritmo aeróbico",          weekTypes:["Inicial","Volumen"],                zones:{ regen:2,  ua:8,  uan:0, anae:0 } },
  { id:"tr_run_z2_lng", name:"Rodaje largo Z2",          description:"Tirada larga de 80-100 minutos",             weekTypes:["Inicial","Volumen"],                zones:{ regen:4,  ua:14, uan:0, anae:0 } },
  { id:"tr_fartlek_s",  name:"Fartlek suave",            description:"Cambios de ritmo a UA/UAN",                  weekTypes:["Inicial","Volumen"],                zones:{ regen:2,  ua:4,  uan:3, anae:0 } },
  { id:"tr_fartlek_f",  name:"Fartlek intenso",          description:"Cambios de ritmo a UAN/Anae",                weekTypes:["Competitiva","Volumen"],            zones:{ regen:2,  ua:3,  uan:4, anae:1 } },
  { id:"tr_series_200", name:"Series 200m",              description:"6-10 series de 200m a ritmo competición",    weekTypes:["Competitiva"],                      zones:{ regen:2,  ua:1,  uan:2, anae:3 } },
  { id:"tr_series_400", name:"Series 400m",              description:"6-8 series de 400m a ritmo UAN/Anae",        weekTypes:["Inicial","Competitiva"],            zones:{ regen:2,  ua:1,  uan:4, anae:2 } },
  { id:"tr_series_1k",  name:"Series 1000m extensivo",  description:"8-10 series de 1000m a ritmo UA/UAN",        weekTypes:["Inicial","Volumen"],                zones:{ regen:2,  ua:2,  uan:6, anae:1 } },
  { id:"tr_series_800", name:"Series 800m",              description:"4-6 series de 800m a ritmo UAN",             weekTypes:["Competitiva"],                      zones:{ regen:2,  ua:1,  uan:5, anae:1 } },
  { id:"tr_tecnica",    name:"Técnica de carrera",       description:"Drills, ABC, skipping, pliometría",          weekTypes:["Inicial","Competitiva"],            zones:{ regen:2,  ua:0,  uan:0, anae:0 } },
  { id:"tr_precomp",    name:"Calentamiento precomp.",   description:"Calentamiento para competición",              weekTypes:["Competitiva"],                      zones:{ regen:2,  ua:1,  uan:1, anae:0 } },
  { id:"tr_competicion",name:"Competición",              description:"Carrera oficial o simulación de competición", weekTypes:["Competitiva"],                      zones:{ regen:1,  ua:1,  uan:2, anae:4 } },
  { id:"tr_movilidad",  name:"Movilidad y estiramiento", description:"Trabajo de movilidad articular y flexibilidad",weekTypes:["Inicial","Competitiva","Volumen"], zones:{ regen:0,  ua:0,  uan:0, anae:0 } },
  { id:"tr_pliometria", name:"Pliometría",               description:"Saltos, multisaltos, trabajo explosivo",      weekTypes:["Inicial","Competitiva"],            zones:{ regen:1,  ua:0,  uan:1, anae:1 } },
  { id:"tr_umbral",     name:"Umbral aeróbico continuo", description:"Carrera continua al ritmo de umbral aeróbico",weekTypes:["Inicial","Volumen"],                zones:{ regen:1,  ua:10, uan:1, anae:0 } },
];
const ADDITIONAL_GYM_EXERCISE_NAMES = [
  "PESO MUERTO A UNA PIERNA",
  "SENTADILLA GLOBET",
  "ELEVACION DE CADERA A UNA PIERNA",
  "PESO MUERTO MAS REMO ISO",
  "DEAD BUG",
  "HIP TRUST ISO",
  "PRESS PALOT",
  "SENTADILLA OVERHEAD",
  "SENTADILLA A UNA PIERNA ISO",
  "SUBIDA AL CAJON",
  "ELEVACION DE CADERA SUBIDA A CAJON",
  "REMO EN PLANCHA",
  "PLANCHA HORIZONTAL",
  "PLANCHA LATERAL",
  "REMO",
  "ISO SIN REBOTE 15\"",
  "ATERRIZAJE DOS PIERNAS",
  "DESACELERACION UNA PIERNA",
  "SENTADILLA FRONTAL",
  "HIP LOCK EN SKIPING 3\"",
  "ZANCADA A UNA PIERNA",
  "FARMER WALK 15 M",
  "SPLIT PALLOP",
  "REMO A UNA MANO",
  "HIP TRUST",
  "FLEXIONES",
  "20 X REBOTE DE TOBILLO",
  "SPLIT + SALTO",
  "20\" REBOTE TOBILLO ESTATICO",
  "PRESS HOMBRO",
  "SENTADILLA LAND MIND",
  "SALTOS BIPODAL",
  "ZANCADA EN SPLIT",
  "SPLIT CON SALTO EN MISMA PIERNA",
  "SALTOS BIPODALES SIN PARADA",
  "HIP LOCK ESTATICO",
  "ELEVACIONES ALTERNAS",
  "SALTO A CAJON UNIPODAL",
  "ARRANCADA",
  "ELEVACION LATERAL",
  "EXTENSION DE PIERNA LATERA-ATRÁS",
  "PASO LATERAL",
  "PUENTE DE GLUTEO CON ABDUCCION  DE PIERNAS",
  "ABDUCCION DE CADERA EN DEBITO PRONO",
  "PATADA LATERAL ATRÁS",
  "PATADA POSTERIOR",
  "RETROCESO DE GLUTEOS",
  "ROLLER GLUTEO",
  "ROLLER ISQUIOTIBIALES",
  "ROLLER TFL",
  "ROLLER LUMBAR",
  "ROLLER CUADRICEPS",
  "BANDA.ABDUCTORES",
  "BANDA-ROTADORES",
  "BAMDA-ISQUIOII",
  "BANDA -GLUTEO 2",
  "BANDA-SENTADILLA",
  "BANDA-GLUTEO ISO",
  "BANDA-GLUTEO",
  "BANDA -ISQUITIBIAL",
  "BANDA-SENTADO",
  "BANDA-SKIPING",
  "BANDA.ABDUCTORES Y ADDUCTORES",
  "BANDA.GLUTEOS-CUADROCEPS-ADDUCGTORES Y ABDUCTORES",
  "BANDA.GEMELOS Y SOLEO",
  "BANDA.ABDUCTORES Y GLUTEOS",
  "BANDA.PECTORAL MAYOR-DELTOIDES Y TRAPECIO",
  "BANDA.BICEPS",
  "BANDA.TRICEPS",
  "BANDA.REICEOS-DELTOIDES-TRAPECIO",
  "BANDA.DELTOIDES-TRICEPS Y BICEPS",
  "BANDA.DELTOIDES Y MUSCULOS ESPALDA MEDIA",
  "BANDA.DELTOIDES-POSTERIOR DE HOMBRO",
  "BANDA.HOMBRO Y MUSCULOS ESPALDA",
  "BANDA.DELTOIDES Y PECTORAL MAYOR",
  "BANDA.DELTOIDES Y MUSCULOS DE LA ESPALDA SUPERIOR",
  "BANDA.DELTOIDES -PECTORAL MAYOR Y ESPALDA ALTA Y MEDIA",
  "BANDA.MUSCULOS ANTERIORES HOMBRO",
  "BANDA.PECTORAL-DELTOIDES Y TRICEPS",
  "BANDA.DORSAL ANCHO Y TRICEPS",
  "BANDA.GLUTEOS Y CUADRICEPS",
  "BANDA.GLUTEOS-CUADRICEPS Y TENDONES",
  "BANDA.GLUTEOS Y MUSCULOS EXTERNOS DEL MUSLO",
  "BANDA.GLUTEOS Y CORE",
  "BANDA.GLUTEOS -CORE Y MUSCULOS EXTERNOS DEL MUSLO",
  "BANDA.DELETOIDES Y PECTORAL MAYOR",
  "BANDA.PECTORALES-DELTOIDES-TRICEPS Y BICEPS",
  "BANDA.DELTOIDES-ESPLADA MEDIA Y SUPERIOR",
  "BANDA.DELTOIDES-PECTORAL MAYOR YBICEPS",
  "BANDA.DELTOIDES-PECTORAL MAYOR Y MUSCULOS SUPERIORES ESPALDA",
  "DOS TIEMPOS",
  "LUNGES-SENTADILLA",
  "CARGADA",
  "nnnnnn",
  "PRESS HOMBRO1",
  "PRESS MILITAR IMPULSION PIERNA",
  "BRACEO",
  "sentadilla auna pierna",
];
const normalizeExerciseNameKey = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
const makeExerciseNameSet = (names = []) => new Set(names.map((name) => normalizeExerciseNameKey(name)));
const CUSTOM_TIME_EXERCISE_NAMES = makeExerciseNameSet([
  "ISO SIN REBOTE 15\"",
  "20\" REBOTE TOBILLO ESTATICO",
  "HIP LOCK ESTATICO",
  "PLANCHA HORIZONTAL",
  "PLANCHA LATERAL",
  "BRACEO",
  "ROLLER GLUTEO",
  "ROLLER ISQUIOTIBIALES",
  "ROLLER TFL",
  "ROLLER LUMBAR",
  "ROLLER CUADRICEPS",
]);
const CUSTOM_TIME_REPS_EXERCISE_NAMES = makeExerciseNameSet([
  "HIP LOCK EN SKIPING 3\"",
  "FARMER WALK 15 M",
  "20 X REBOTE DE TOBILLO",
  "SPLIT + SALTO",
  "SPLIT CON SALTO EN MISMA PIERNA",
  "SALTOS BIPODALES SIN PARADA",
  "ATERRIZAJE DOS PIERNAS",
  "DESACELERACION UNA PIERNA",
]);
const CUSTOM_WEIGHT_EXERCISE_NAMES = makeExerciseNameSet([
  "PESO MUERTO A UNA PIERNA",
  "SENTADILLA GLOBET",
  "PESO MUERTO MAS REMO ISO",
  "PRESS BANCA",
  "HIP TRUST ISO",
  "PRESS PALOT",
  "SENTADILLA OVERHEAD",
  "SENTADILLA A UNA PIERNA ISO",
  "SENTADILLA FRONTAL",
  "REMO A UNA MANO",
  "HIP TRUST",
  "PRESS HOMBRO",
  "SENTADILLA LAND MIND",
  "ARRANCADA",
  "ELEVACION LATERAL",
  "DOS TIEMPOS",
  "LUNGES-SENTADILLA",
  "CARGADA",
  "PRESS HOMBRO1",
  "PRESS MILITAR IMPULSION PIERNA",
]);
const inferBuiltinExerciseType = (name) => {
  const key = normalizeExerciseNameKey(name);
  if (CUSTOM_TIME_REPS_EXERCISE_NAMES.has(key)) return "time_reps";
  if (CUSTOM_TIME_EXERCISE_NAMES.has(key)) return "time_reps";
  if (CUSTOM_WEIGHT_EXERCISE_NAMES.has(key)) return "weight";
  if (/SKIPING 3|REBOTE DE TOBILLO|SIN PARADA|FARMER WALK/.test(key)) return "time_reps";
  if (/"|ROLLER|PLANCHA|BRACEO/.test(key)) return "time_reps";
  if (/PESO MUERTO|SENTADILLA|PRESS|REMO|ARRANCADA|CARGADA|DOS TIEMPOS|HIP TRUST/.test(key)) return "weight";
  return "reps";
};
const inferBuiltinExerciseCategory = (name, type) => {
  const key = normalizeExerciseNameKey(name);
  if (type === "time_reps" && (/PLANCHA|ROLLER|BRACEO|ISO/.test(key))) return "stability";
  if (type === "time_reps") return /SALTO|ATERRIZAJE|DESACELERACION|REBOTE/.test(key) ? "power" : "conditioning";
  if (/BANDA|ROLLER/.test(key)) return "activation";
  if (/SALTO|ATERRIZAJE|DESACELERACION|REBOTE/.test(key)) return "power";
  if (/PLANCHA|DEAD BUG|PALLOP|PALOT|CORE|LOCK/.test(key)) return "core";
  if (type === "weight") return "strength";
  return "movement";
};
const inferBuiltinExerciseEmoji = (type, name) => {
  const key = normalizeExerciseNameKey(name);
  if (/ROLLER/.test(key)) return "🌀";
  if (/BANDA/.test(key)) return "🟠";
  if (/SALTO|ATERRIZAJE|REBOTE/.test(key)) return "⚡";
  if (type === "time_reps") return "⌛";
  if (type === "weight") return "🏋️";
  return "🔁";
};
const inferBuiltinExerciseLoadProfile = (name, type) => {
  const key = normalizeExerciseNameKey(name);
  if (type === "weight") {
    if (/ARRANCADA|CARGADA|DOS TIEMPOS/.test(key)) return { sets:5, reps:3, pct:70, type:"weight", duration:0 };
    if (/PRESS/.test(key)) return { sets:4, reps:8, pct:65, type:"weight", duration:0 };
    if (/SENTADILLA|PESO MUERTO|HIP TRUST|REMO/.test(key)) return { sets:4, reps:6, pct:72, type:"weight", duration:0 };
    return { sets:3, reps:8, pct:65, type:"weight", duration:0 };
  }
  if (type === "time_reps") {
    if (/SKIPING 3/.test(key)) return { sets:3, reps:6, pct:0, type:"time_reps", duration:3 };
    if (/FARMER WALK 15 M/.test(key)) return { sets:4, reps:2, pct:0, type:"time_reps", duration:15 };
    if (/20 X REBOTE DE TOBILLO/.test(key)) return { sets:3, reps:20, pct:0, type:"time_reps", duration:20 };
    if (/SALTO|ATERRIZAJE|DESACELERACION/.test(key)) return { sets:3, reps:8, pct:0, type:"time_reps", duration:15 };
    if (/PLANCHA/.test(key)) return { sets:3, reps:1, pct:0, type:"time_reps", duration:30 };
    if (/ROLLER/.test(key)) return { sets:2, reps:1, pct:0, type:"time_reps", duration:45 };
    if (/ISO/.test(key)) return { sets:3, reps:1, pct:0, type:"time_reps", duration:20 };
    return { sets:3, reps:10, pct:0, type:"time_reps", duration:20 };
  }
  if (/BANDA/.test(key)) return { sets:3, reps:15, pct:0, type:"reps", duration:0 };
  if (/SALTO|ATERRIZAJE|DESACELERACION|REBOTE/.test(key)) return { sets:3, reps:8, pct:0, type:"reps", duration:0 };
  if (/DEAD BUG|PALLOP|PALOT|LOCK/.test(key)) return { sets:3, reps:10, pct:0, type:"reps", duration:0 };
  return { sets:3, reps:10, pct:0, type:"reps", duration:0 };
};
const builtinExerciseIdFromName = (name) =>
  `builtin_${normalizeExerciseNameKey(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
const ADDITIONAL_GYM_EXERCISES = ADDITIONAL_GYM_EXERCISE_NAMES.map((name) => {
  const type = inferBuiltinExerciseType(name);
  return {
    id: builtinExerciseIdFromName(name),
    name,
    emoji: inferBuiltinExerciseEmoji(type, name),
    muscles: "",
    category: inferBuiltinExerciseCategory(name, type),
    type,
  };
});
const ADDITIONAL_GYM_EXERCISE_LOAD_PROFILE = ADDITIONAL_GYM_EXERCISES.reduce((acc, exercise) => {
  acc[exercise.id] = inferBuiltinExerciseLoadProfile(exercise.name, exercise.type);
  return acc;
}, {});
const EXERCISE_LOAD_PROFILE = {
  ...DEFAULT_EXERCISE_LOAD_PROFILE,
  ...ADDITIONAL_GYM_EXERCISE_LOAD_PROFILE,
};
const ALL_BUILTIN_GYM_EXERCISES = [...GYM_EXERCISES, ...ADDITIONAL_GYM_EXERCISES];
const DAYS_SHORT = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const DAYS_FULL  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const GROUPS = ["por-asignar","1500m","800m","pequeños"];
const NAV_ITEMS = {
  coach: [
    { id:"semana", icon:"📅", label:"Plan Semanal", shortLabel:"Plan" },
    { id:"calendario", icon:"🗓️", label:"Calendario", shortLabel:"Calendario" },
    { id:"calendario_semanal", icon:"🗂️", label:"Calendario Semanal", shortLabel:"Semanal" },
    { id:"gym", icon:"🏋️", label:"Dataset Ejercicios", shortLabel:"Ejercicios" },
    { id:"dataset", icon:"🧪", label:"Dataset Entrenos", shortLabel:"Entrenos" },
    { id:"athletes", icon:"👥", label:"Gestión Atletas", shortLabel:"Atletas" },
    { id:"temporadas", icon:"🗃️", label:"Temporadas", shortLabel:"Temporadas" },
  ],
  athlete: [
    { id:"hoy", icon:"⚡", label:"Hoy", shortLabel:"Hoy" },
    { id:"semana", icon:"📅", label:"Mi Semana", shortLabel:"Semana" },
    { id:"jogatina", icon:"🎲", label:"Jogatina", shortLabel:"Jogatina" },
    { id:"gym", icon:"🏋️", label:"Mi Gym", shortLabel:"Gym" },
    { id:"calendario", icon:"🗓️", label:"Mi Calendario", shortLabel:"Calendario" },
    { id:"perfil", icon:"👤", label:"Mi Perfil", shortLabel:"Perfil" },
  ],
};
const getNavByRole = (role) => role === "coach" ? NAV_ITEMS.coach : NAV_ITEMS.athlete;

const COACH = { id:"coach", name:"Juan Carlos", role:"coach" };
const PESAS_DB_SOURCE = { file: "pesas2024_hardcoded_db.js", workbook: "PESAS2024.xlsx", format: "sparse-rows-trailing-null-trimmed" };
const HARDCODED_PESAS_DB = (typeof window !== "undefined" && window.PESAS2024_HARDCODED_DB) ? window.PESAS2024_HARDCODED_DB : null;

// ─── STYLES ───────────────────────────────────────────────────────────────────



// ─── UTILS ────────────────────────────────────────────────────────────────────
const calcWeight = (max, pct) => Math.round((max * pct) / 100 / 2.5) * 2.5;
const getToday = () => new Date().getDay(); // 0=Sun…6=Sat → convert to 0=Mon
const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };
const groupClass = (g) => g === "1500m" ? "g-1500" : g === "800m" ? "g-800" : "g-pq";
const groupBadge = (g) => g === "1500m" ? "b-or" : g === "800m" ? "b-bl" : "b-pu";
const avatarColor = (idx) => ["","blue","green","purple",""][idx % 4];
const groupLabel = (g) => g === "all" ? "Todos" : (g || "Todos");
const normalizeGroupName = (g) => String(g || "").trim().replace(/\s+/g, " ");
const exerciseTypeBadgeLabel = (type = "weight") => {
  const normalized = normalizeExerciseType(type);
  if (normalized === "weight") return "Peso";
  if (normalized === "time_reps") return "Tiempo x Reps";
  return "Reps";
};
const SEASON_ANCHOR_DATE = new Date(2025, 8, 15); // 15/09/2025 (lunes)
const DEFAULT_SEASON_ID = "25/26";
const DEFAULT_SEASON_WEEK_ONE_START_ISO = "2025-09-15";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const parseIsoDateToLocalDate = (value) => {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
};
const normalizeSeasonWeekOneStartIso = (value, fallback = DEFAULT_SEASON_WEEK_ONE_START_ISO) => {
  const parsed = parseIsoDateToLocalDate(value);
  if (!parsed) return fallback;
  return toIsoDate(parsed);
};
const normalizeSeasonId = (value, fallback = DEFAULT_SEASON_ID) => {
  const raw = String(value || "").trim();
  return /^\d{2}\/\d{2}$/.test(raw) ? raw : fallback;
};
const getNextSeasonId = (seasonId = DEFAULT_SEASON_ID) => {
  const current = normalizeSeasonId(seasonId, DEFAULT_SEASON_ID);
  const [start, end] = current.split("/").map((part) => Number(part));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "26/27";
  const nextStart = (start + 1) % 100;
  const nextEnd = (end + 1) % 100;
  return `${String(nextStart).padStart(2, "0")}/${String(nextEnd).padStart(2, "0")}`;
};
const toSeasonLabel = (seasonId) => `Temporada ${normalizeSeasonId(seasonId, DEFAULT_SEASON_ID)}`;
const buildSeasonRecord = ({
  id = DEFAULT_SEASON_ID,
  weekOneStartIso = DEFAULT_SEASON_WEEK_ONE_START_ISO,
  startedAt = null,
  finalizedAt = null,
  archived = null,
} = {}) => ({
  id: normalizeSeasonId(id, DEFAULT_SEASON_ID),
  label: toSeasonLabel(id),
  weekOneStartIso: normalizeSeasonWeekOneStartIso(weekOneStartIso, DEFAULT_SEASON_WEEK_ONE_START_ISO),
  startedAt: startedAt || new Date().toISOString(),
  finalizedAt: finalizedAt || null,
  archived: archived && typeof archived === "object" ? archived : null,
});
const normalizeSeasonCollection = (
  rawSeasons,
  activeSeasonId = DEFAULT_SEASON_ID,
  activeWeekOneStartIso = DEFAULT_SEASON_WEEK_ONE_START_ISO
) => {
  const targetSeasonId = normalizeSeasonId(activeSeasonId, DEFAULT_SEASON_ID);
  const targetWeekOneStartIso = normalizeSeasonWeekOneStartIso(activeWeekOneStartIso, DEFAULT_SEASON_WEEK_ONE_START_ISO);
  const list = Array.isArray(rawSeasons)
    ? rawSeasons
    : (rawSeasons && typeof rawSeasons === "object" ? Object.values(rawSeasons) : []);
  const byId = {};

  list.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const id = normalizeSeasonId(entry.id, "");
    if (!id) return;
    byId[id] = buildSeasonRecord({
      ...entry,
      id,
      weekOneStartIso: entry.weekOneStartIso || DEFAULT_SEASON_WEEK_ONE_START_ISO,
    });
  });

  if (byId[targetSeasonId]) {
    const current = byId[targetSeasonId];
    byId[targetSeasonId] = buildSeasonRecord({
      ...current,
      id: targetSeasonId,
      weekOneStartIso: targetWeekOneStartIso,
      finalizedAt: null,
    });
  } else {
    byId[targetSeasonId] = buildSeasonRecord({
      id: targetSeasonId,
      weekOneStartIso: targetWeekOneStartIso,
      startedAt: new Date().toISOString(),
      finalizedAt: null,
      archived: null,
    });
  }

  return Object.values(byId).sort((a, b) => String(a.id).localeCompare(String(b.id)));
};
const normalizeWeekNumber = (value, fallback = null) => {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  if (fallback != null) return normalizeWeekNumber(fallback, 1);
  return 1;
};
const getSeasonWeekNumberForDate = (date = new Date(), anchorDate = SEASON_ANCHOR_DATE) => {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sourceAnchor = anchorDate instanceof Date ? anchorDate : SEASON_ANCHOR_DATE;
  const anchor = new Date(sourceAnchor.getFullYear(), sourceAnchor.getMonth(), sourceAnchor.getDate());
  const diffDays = Math.floor((target.getTime() - anchor.getTime()) / MS_PER_DAY);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
};
const getTodaySeasonWeekNumber = (anchorDate = SEASON_ANCHOR_DATE) =>
  getSeasonWeekNumberForDate(new Date(), anchorDate);
const getSeasonWeekStartDate = (weekNumber, anchorDate = SEASON_ANCHOR_DATE) => {
  const safeWeek = normalizeWeekNumber(weekNumber, getTodaySeasonWeekNumber(anchorDate));
  const sourceAnchor = anchorDate instanceof Date ? anchorDate : SEASON_ANCHOR_DATE;
  return new Date(
    sourceAnchor.getFullYear(),
    sourceAnchor.getMonth(),
    sourceAnchor.getDate() + (safeWeek - 1) * 7
  );
};
const getSeasonWeekEndDate = (weekNumber, anchorDate = SEASON_ANCHOR_DATE) => {
  const start = getSeasonWeekStartDate(weekNumber, anchorDate);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
};
const mergeGroupOptions = (...sources) => {
  const out = [];
  const seen = new Set();
  sources.forEach((src) => {
    (Array.isArray(src) ? src : []).forEach((raw) => {
      const group = normalizeGroupName(raw);
      if (!group) return;
      const key = group.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(group);
    });
  });
  return out.length ? out : [...GROUPS];
};
const collectGroupValues = (...sources) => {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const group = normalizeGroupName(raw);
    if (!group || group === "all") return;
    const key = group.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(group);
  };
  sources.forEach((src) => {
    if (Array.isArray(src)) src.forEach(push);
    else push(src);
  });
  return out;
};
const getAthleteGroups = (athlete) => {
  const groups = collectGroupValues(athlete?.groups, athlete?.group);
  return groups.length ? groups : ["por-asignar"];
};
const getAthletePrimaryGroup = (athlete) => getAthleteGroups(athlete)[0] || "por-asignar";
const getAthleteGroupsLabel = (athlete) => getAthleteGroups(athlete).join(" · ");
const athleteBelongsToGroup = (athlete, group) =>
  (group || "all") === "all" || getAthleteGroups(athlete).includes(group);
const collectAthleteGroups = (athletes = []) =>
  (Array.isArray(athletes) ? athletes : []).flatMap((athlete) => getAthleteGroups(athlete));
const normalizeCompetitionList = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const dateIso = String(item?.dateIso || item?.date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
      return {
        id: item?.id || `comp_${dateIso}_${index}`,
        dateIso,
        name: String(item?.name || "Competición").trim() || "Competición",
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.dateIso).localeCompare(String(b.dateIso)));
};
const normalizeAthleteRecord = (rawAthlete, idx = 0) => {
  const source = rawAthlete && typeof rawAthlete === "object" ? rawAthlete : {};
  const name = String(source.name || `Atleta ${idx + 1}`).trim() || `Atleta ${idx + 1}`;
  const groups = getAthleteGroups(source);
  const idBase = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const maxW = source.maxW && typeof source.maxW === "object" ? source.maxW : {};
  const competitions = normalizeCompetitionList(source.competitions);
  const password = String(source.password ?? "1234").trim() || "1234";
  const passwordChangedOnce = source.passwordChangedOnce != null
    ? !!source.passwordChangedOnce
    : password !== "1234";
  return {
    id: source.id || `ath_${idBase || idx + 1}_${idx + 1}`,
    name,
    group: groups[0] || "por-asignar",
    groups,
    avatar: source.avatar || name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2),
    maxW,
    weekKms: Array.isArray(source.weekKms) ? source.weekKms.map((value) => Number(value || 0)) : [],
    todayDone: !!source.todayDone,
    competitions,
    password,
    passwordChangedOnce,
  };
};
const normalizeAthletes = (athletes) =>
  (Array.isArray(athletes) ? athletes : [])
    .map((athlete, idx) => normalizeAthleteRecord(athlete, idx))
    .filter((athlete) => athlete.id && athlete.name);
const ALLOWED_EXERCISE_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
const ALLOWED_EXERCISE_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg"];
const ALLOWED_EXERCISE_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml";
const isExerciseImageFileAllowed = (file) => {
  if (!file) return false;
  const mimeType = String(file.type || "").toLowerCase();
  if (ALLOWED_EXERCISE_IMAGE_MIME_TYPES.includes(mimeType)) return true;
  const fileName = String(file.name || "").toLowerCase();
  return ALLOWED_EXERCISE_IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
};
const normalizeAthleteNotificationsMap = (rawMap) => {
  if (!rawMap || typeof rawMap !== "object") return {};
  const out = {};
  Object.entries(rawMap).forEach(([athleteId, notifications]) => {
    out[athleteId] = (Array.isArray(notifications) ? notifications : [])
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        return {
          id: item.id || `notif_${athleteId}_${index}`,
          title: String(item.title || "Actualización").trim() || "Actualización",
          message: String(item.message || "").trim(),
          createdAt: item.createdAt || new Date().toISOString(),
          weekNumber: item.weekNumber != null ? Number(item.weekNumber) : null,
        };
      })
      .filter(Boolean)
      .slice(0, 50);
  });
  return out;
};
const cloneDeep = (value) => JSON.parse(JSON.stringify(value));
const normalizeWeekType = (type) => {
  const key = String(type || "").trim().toLowerCase();
  if (key.includes("compet")) return "Competitiva";
  if (key.includes("general") || key.includes("vol")) return "Volumen";
  return "Inicial";
};
const normalizeTrainingWeekTypes = (weekTypes) => {
  const source = Array.isArray(weekTypes) && weekTypes.length ? weekTypes : WEEK_TYPES;
  const normalized = source.map((type) => normalizeWeekType(type));
  return [...new Set(normalized)];
};
const isTrainingAvailableForWeekType = (training, weekType) => {
  const normalizedWeekType = normalizeWeekType(weekType);
  return normalizeTrainingWeekTypes(training?.weekTypes).includes(normalizedWeekType);
};
const buildExerciseFallbackProfile = (type = "weight") => (
  type === "time_reps"
    ? { sets:3, reps:10, pct:0, type:"time_reps", duration:20 }
    : type === "reps"
        ? { sets:3, reps:8, pct:0, type:"reps", duration:0 }
        : { sets:4, reps:8, pct:70, type:"weight", duration:0 }
);
const normalizeExerciseType = (type = "weight") => {
  if (type === "time_reps") return "time_reps";
  // Legacy data used "time"; canonicalizamos a tiempo x repeticiones.
  if (type === "time") return "time_reps";
  if (type === "reps") return "reps";
  return "weight";
};
const normalizeTraining = (training, idx = 0) => ({
  id: training?.id || `training_${Date.now()}_${idx}`,
  name: String(training?.name || `Entreno ${idx + 1}`).trim(),
  description: String(training?.description || "").trim(),
  zones: safeZones(training?.zones),
  weekTypes: normalizeTrainingWeekTypes(training?.weekTypes),
  source: training?.source || "dataset",
});
const normalizeTrainingCatalog = (raw) =>
  (Array.isArray(raw) && raw.length ? raw : TRAINING_DATASET).map(normalizeTraining);
const getTrainingById = (trainings, id) =>
  (Array.isArray(trainings) ? trainings : []).find((training) => training.id === id) || null;
const collectAthleteIdValues = (...sources) => {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const id = String(raw || "").trim();
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  sources.forEach((src) => {
    if (Array.isArray(src)) src.forEach(push);
    else push(src);
  });
  return out;
};
const normalizeSessionTargets = (source, fallbackTargetGroup = "all") => {
  const base = source && typeof source === "object" ? source : {};
  const legacyTarget = normalizeGroupName(base.targetGroup || fallbackTargetGroup || "all") || "all";
  const explicitGroups = collectGroupValues(base.targetGroups);
  const mergedGroups = collectGroupValues(explicitGroups, legacyTarget === "all" ? [] : [legacyTarget]);
  const targetAthleteIds = collectAthleteIdValues(base.targetAthleteIds);
  const hasScopedTarget = explicitGroups.length > 0 || targetAthleteIds.length > 0;
  const targetAllRaw = base.targetAll != null ? !!base.targetAll : (!hasScopedTarget && legacyTarget === "all");
  const targetAll = !targetAllRaw && mergedGroups.length === 0 && targetAthleteIds.length === 0 ? true : targetAllRaw;
  return {
    targetAll,
    targetGroups: mergedGroups,
    targetAthleteIds,
    // Campo legacy para compatibilidad de datos y serialización histórica.
    targetGroup: targetAll ? "all" : (mergedGroups[0] || "all"),
  };
};
const getTargetLabel = (source, athleteLookup = null) => {
  const target = normalizeSessionTargets(source, "all");
  const parts = [];
  if (target.targetAll) parts.push("Todos");
  target.targetGroups.forEach((group) => parts.push(groupLabel(group)));
  target.targetAthleteIds.forEach((athleteId) => {
    const fallbackLabel = `Atleta ${athleteId.slice(-4)}`;
    const label = athleteLookup?.[athleteId]?.name || athleteLookup?.[athleteId] || fallbackLabel;
    parts.push(String(label || athleteId));
  });
  return parts.length ? parts.join(" + ") : "Todos";
};
const makeTrainingSelection = (training, slot = "am", targetSource = "all", overrides = {}) => (
  training
    ? {
        id: overrides.id || `session_${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        slot,
        trainingId: training.id,
        name: training.name,
        description: training.description || "",
        ...normalizeSessionTargets(
          targetSource && typeof targetSource === "object"
            ? targetSource
            : { targetGroup: targetSource },
          "all"
        ),
        zones: safeZones(training.zones),
      }
    : null
);
const normalizeTrainingSelection = (selection, slot = "am", fallbackTargetGroup = "all") => {
  if (!selection || !selection.name) return null;
  const targets = normalizeSessionTargets(selection, fallbackTargetGroup);
  return {
    id: selection.id || `session_${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    slot: selection.slot || slot,
    trainingId: selection.trainingId || "",
    name: String(selection.name || "").trim(),
    description: String(selection.description || "").trim(),
    ...targets,
    zones: safeZones(selection.zones),
  };
};
const buildEmptyTrainingForm = () => ({
  name: "",
  description: "",
  zones: emptyZones(),
  weekTypes: [...WEEK_TYPES],
});
const isTargetVisibleForGroup = (source, group) => {
  const target = normalizeSessionTargets(source, "all");
  if (target.targetAll) return true;
  const groups = collectGroupValues(Array.isArray(group) ? group : [group]);
  return target.targetGroups.some((candidate) => groups.includes(candidate));
};
const isTargetVisibleForAthlete = (source, athlete) => {
  if (!athlete) return false;
  const target = normalizeSessionTargets(source, "all");
  if (target.targetAll) return true;
  const athleteId = String(athlete.id || "").trim();
  if (athleteId && target.targetAthleteIds.includes(athleteId)) return true;
  const athleteGroups = getAthleteGroups(athlete);
  return target.targetGroups.some((group) => athleteGroups.includes(group));
};
const getPrimarySessionForSlot = (day, slot, week) => {
  const direct = day?.sessions?.[slot];
  if (direct) return normalizeTrainingSelection(direct, slot, day?.targetGroup || week?.targetGroup || "all");
  const legacyName = slot === "am" ? day?.am : day?.pm;
  if (!legacyName) return null;
  return normalizeTrainingSelection({
    id: `legacy_${slot}_${String(legacyName).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    slot,
    trainingId: slot === "am" ? (day?.amTrainingId || "") : (day?.pmTrainingId || ""),
    name: legacyName,
    description: slot === "am" ? (day?.amDescription || "") : (day?.pmDescription || ""),
    targetAll: slot === "am" ? day?.amTargetAll : day?.pmTargetAll,
    targetGroups: slot === "am" ? day?.amTargetGroups : day?.pmTargetGroups,
    targetAthleteIds: slot === "am" ? day?.amTargetAthleteIds : day?.pmTargetAthleteIds,
    targetGroup: slot === "am"
      ? (day?.amTargetGroup || day?.targetGroup || week?.targetGroup || "all")
      : (day?.pmTargetGroup || day?.targetGroup || week?.targetGroup || "all"),
    zones: slot === "am" ? day?.amZones : day?.pmZones,
  }, slot, day?.targetGroup || week?.targetGroup || "all");
};
const getExtraSessionsForDay = (day) =>
  (Array.isArray(day?.extraSessions) ? day.extraSessions : [])
    .map((session) => normalizeTrainingSelection(session, session?.slot || "am", session?.targetGroup || "all"))
    .filter(Boolean);
const getSlotSessions = (day, slot, week) => {
  const primary = getPrimarySessionForSlot(day, slot, week);
  const extras = getExtraSessionsForDay(day).filter((session) => session.slot === slot);
  return [primary, ...extras].filter(Boolean);
};
const getDayAudienceLabel = (week, day) => {
  const labels = new Set(
    ["am", "pm"]
      .flatMap((slot) => getSlotSessions(day, slot, week).map((session) => getTargetLabel(session)))
      .concat(day?.gym ? [getTargetLabel({ targetGroup: day?.gymPlan?.inline?.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all" })] : [])
      .filter(Boolean)
  );
  if (!labels.size) return getTargetLabel({ targetGroup: week?.targetGroup || "all" });
  return labels.size === 1 ? Array.from(labels)[0] : "Mixto";
};
const displayTarget = (week, day) => getDayAudienceLabel(week, day);
const cloneWeekSnapshot = (week) => cloneDeep({
  id: week?.id || "week_custom",
  name: week?.name || "Semana",
  type: normalizeWeekType(week?.type),
  targetGroup: week?.targetGroup || "all",
  weekNumber: week?.weekNumber || null,
  startDate: week?.startDate || null,
  endDate: week?.endDate || null,
  days: Array.isArray(week?.days) ? week.days : [],
});

const makeInlineRoutineFromExercises = (exerciseIds = [], name = "Rutina inline") => ({
  name,
  targetGroup: "all",
  exercises: exerciseIds.map((exId) => ({ exId, ...buildExerciseFallbackProfile(normalizeExerciseType(getExerciseByIdFull(exId).type)) })),
});

const labelFromExId = (exId) =>
  String(exId || "Ejercicio")
    .replace(/^custom_/, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Ejercicio";

const sanitizeRoutine = (routine, idx = 0) => {
  const safeExercises = Array.isArray(routine?.exercises)
    ? routine.exercises
        .map((e) => {
          const defEx = ALL_BUILTIN_GYM_EXERCISES.find((exercise) => exercise.id === e?.exId);
          const defProfile = EXERCISE_LOAD_PROFILE[e?.exId] || buildExerciseFallbackProfile(normalizeExerciseType(defEx?.type || "weight"));
          const exType = normalizeExerciseType(e?.type || defProfile?.type || defEx?.type || "weight");
          return {
            exId: e?.exId,
            name: e?.name || labelFromExId(e?.exId),
            sets: Number(e?.sets ?? defProfile?.sets ?? 3),
            reps: Number(e?.reps ?? defProfile?.reps ?? (exType === "time_reps" ? 1 : 8)),
            pct: Number(e?.pct ?? defProfile?.pct ?? (exType === "weight" ? 70 : 0)),
            type: exType,
            duration: Number(e?.duration ?? defProfile?.duration ?? (exType === "time_reps" ? 20 : 0)),
            imageUrl: e?.imageUrl || null,
          };
        })
        .filter((e) => !!e.exId)
    : [];
  const fallbackExercises = safeExercises.length
    ? safeExercises
    : [{ exId:"sq", name:"Sentadilla", ...DEFAULT_EXERCISE_LOAD_PROFILE.sq, imageUrl:null }];
  return {
    id: routine?.id || `rt_${Date.now()}_${idx}`,
    name: routine?.name || `Rutina ${idx + 1}`,
    targetGroup: routine?.targetGroup || "all",
    sourceSheet: routine?.sourceSheet || null,
    weekNumber: routine?.weekNumber || null,
    exercises: fallbackExercises,
  };
};

const normalizeRoutineLibrary = (raw) => {
  if (Array.isArray(raw) && raw.length) return raw.map(sanitizeRoutine);
  if (raw && typeof raw === "object") {
    const migratedExercises = Object.entries(raw)
      .filter(([exId, v]) => ALL_BUILTIN_GYM_EXERCISES.some((exercise) => exercise.id === exId) && v)
      .map(([exId, v]) => ({
        exId,
        sets: Number(v.sets || 3),
        reps: Number(v.reps || 8),
        pct: Number(v.pct || 70),
      }));
    if (migratedExercises.length) {
      return [sanitizeRoutine({
        id: "rt_legacy_global",
        name: "Rutina global (migrada)",
        targetGroup: "all",
        exercises: migratedExercises,
      })];
    }
  }
  return DEFAULT_ROUTINE_LIBRARY.map(sanitizeRoutine);
};

const getRoutineById = (routines, id) =>
  (Array.isArray(routines) ? routines : []).find(r => r.id === id) || null;

const getDayResolvedGymPlan = (day, routines) => {
  if (!day?.gym) return null;
  const gp = day.gymPlan;
  if (gp?.mode === "saved") {
    const routine = getRoutineById(routines, gp.routineId);
    if (routine) {
      return { type:"saved", name:routine.name, targetGroup:routine.targetGroup || "all", exercises:routine.exercises || [] };
    }
  }
  if (gp?.mode === "inline" && gp.inline) {
    const inline = gp.inline;
    return { type:"inline", name:inline.name || "Rutina inline", targetGroup:inline.targetGroup || "all", exercises:inline.exercises || [] };
  }
  if (Array.isArray(day.gymFocus) && day.gymFocus.length) {
    return {
      type:"legacy",
      name:"Rutina legacy",
      targetGroup: day.targetGroup || "all",
      exercises: day.gymFocus.map((exId) => ({ exId, ...(EXERCISE_LOAD_PROFILE[exId] || buildExerciseFallbackProfile(normalizeExerciseType(getExerciseByIdFull(exId).type))) })),
    };
  }
  return null;
};

const getDayGymCount = (day, routines) => (getDayResolvedGymPlan(day, routines)?.exercises || []).length;

const getDayGymExercisesForAthlete = (day, routines, user, customExercises = [], exerciseImages = {}) => {
  const plan = getDayResolvedGymPlan(day, routines);
  if (!plan) return [];
  return (plan.exercises || []).map(row => {
    const ex = getExerciseByIdFull(row.exId, customExercises, exerciseImages);
    const exType = normalizeExerciseType(row.type || ex.type || "weight");
    const max = user?.maxW?.[row.exId];
    const kg = (exType === "weight" && max && row.pct) ? calcWeight(max, row.pct) : null;
    return {
      ...ex, ...row,
      id: row.exId,
      name: row.name || ex.name,
      imageUrl: exerciseImages[row.exId] || row.imageUrl || ex.imageUrl || null,
      type: exType,
      duration: row.duration || ex.duration || (exType === "time_reps" ? 20 : 0),
      kg,
    };
  });
};
const isGymVisibleForGroup = (week, day, group, routines = []) => {
  const plan = getDayResolvedGymPlan(day, routines);
  if (!plan) return false;
  return isTargetVisibleForGroup(
    { targetGroup: plan.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all" },
    group
  );
};
const getVisibleDayPlanForGroup = (week, day, group, routines = []) => {
  const am = getSlotSessions(day, "am", week).filter((session) => isTargetVisibleForGroup(session, group));
  const pm = getSlotSessions(day, "pm", week).filter((session) => isTargetVisibleForGroup(session, group));
  const gymPlan = getDayResolvedGymPlan(day, routines);
  const gymVisible = !!gymPlan && isTargetVisibleForGroup(
    { targetGroup: gymPlan.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all" },
    group
  );
  return {
    am,
    pm,
    gym: gymVisible,
    gymPlan: gymVisible ? gymPlan : null,
    hasContent: am.length > 0 || pm.length > 0 || gymVisible,
  };
};
const getVisibleDayPlanForAthlete = (week, day, athlete, routines = []) => {
  const am = getSlotSessions(day, "am", week).filter((session) => isTargetVisibleForAthlete(session, athlete));
  const pm = getSlotSessions(day, "pm", week).filter((session) => isTargetVisibleForAthlete(session, athlete));
  const gymPlan = getDayResolvedGymPlan(day, routines);
  const gymVisible = !!gymPlan && isTargetVisibleForAthlete(
    { targetGroup: gymPlan.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all" },
    athlete
  );
  return {
    am,
    pm,
    gym: gymVisible,
    gymPlan: gymVisible ? gymPlan : null,
    hasContent: am.length > 0 || pm.length > 0 || gymVisible,
  };
};

const normalizeWeek = (raw, routines = DEFAULT_ROUTINE_LIBRARY) => {
  const base = raw && typeof raw === "object" ? raw : DEFAULT_WEEK;
  const daysSrc = Array.isArray(base.days) ? base.days : DEFAULT_WEEK.days;
  const days = DAYS_FULL.map((_, i) => {
    const d = {
      am: "",
      pm: "",
      targetGroup: base.targetGroup || "all",
      gym: false,
      gymPlan: null,
      gymFocus: [],
      gymTargetGroup: null,
      sessions: { am:null, pm:null },
      extraSessions: [],
      ...(daysSrc[i] || {}),
    };
    const amSession = getPrimarySessionForSlot(d, "am", base);
    const pmSession = getPrimarySessionForSlot(d, "pm", base);
    const extraSessions = getExtraSessionsForDay(d);
    d.sessions = { am: amSession, pm: pmSession };
    d.extraSessions = extraSessions;
    d.am = amSession?.name || "";
    d.pm = pmSession?.name || "";
    d.amZones = safeZones(amSession?.zones);
    d.pmZones = safeZones(pmSession?.zones);
    d.targetGroup = amSession?.targetGroup || pmSession?.targetGroup || d.targetGroup || base.targetGroup || "all";
    d.gym = !!d.gym;
    if (!d.gym) {
      d.gymPlan = null;
      d.gymFocus = [];
      d.gymTargetGroup = null;
      return d;
    }
    const resolved = getDayResolvedGymPlan(d, routines);
    if (resolved) {
      d.gymFocus = (resolved.exercises || []).map((e) => e.exId);
      d.gymTargetGroup = resolved.targetGroup || d.gymTargetGroup || d.targetGroup || base.targetGroup || "all";
      if (!d.gymPlan) {
        d.gymPlan = { mode:"inline", inline:{ name:resolved.name, targetGroup:resolved.targetGroup, exercises:resolved.exercises } };
      }
    } else {
      d.gymFocus = [];
      d.gym = false;
      d.gymPlan = null;
      d.gymTargetGroup = null;
    }
    return d;
  });
  return {
    id: base.id || "week_custom",
    name: base.name || "Semana",
    type: normalizeWeekType(base.type),
    targetGroup: base.targetGroup || "all",
    weekNumber: base.weekNumber || null,
    startDate: base.startDate || null,
    endDate: base.endDate || null,
    published: !!base.published,
    publishedAt: base.publishedAt || null,
    updatedAt: base.updatedAt || null,
    isEditingPublished: !!base.isEditingPublished,
    publishedVersion: base.publishedVersion && typeof base.publishedVersion === "object"
      ? cloneWeekSnapshot(base.publishedVersion)
      : null,
    days,
  };
};
const resolvePublishedWeek = (week, routines = DEFAULT_ROUTINE_LIBRARY) => {
  if (!week?.published) return null;
  if (week.isEditingPublished && week.publishedVersion) {
    return normalizeWeek(week.publishedVersion, routines);
  }
  return normalizeWeek(week, routines);
};
const commitPublishedWeek = (week, routines = DEFAULT_ROUTINE_LIBRARY, publishedAt = null) => {
  const normalized = normalizeWeek(week, routines);
  const now = new Date().toISOString();
  return normalizeWeek({
    ...normalized,
    published: true,
    publishedAt: publishedAt || normalized.publishedAt || now,
    updatedAt: now,
    isEditingPublished: false,
    publishedVersion: cloneWeekSnapshot(normalized),
  }, routines);
};

const toIsoDate = (date = new Date()) => {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const withWeekMetadata = (
  rawWeek,
  weekNumber,
  routines = DEFAULT_ROUTINE_LIBRARY,
  seasonAnchorDate = SEASON_ANCHOR_DATE
) => {
  const safeWeekNumber = normalizeWeekNumber(
    weekNumber,
    rawWeek?.weekNumber || getTodaySeasonWeekNumber(seasonAnchorDate)
  );
  return normalizeWeek({
    ...rawWeek,
    id: rawWeek?.id || `week_${safeWeekNumber}`,
    name: `Semana ${safeWeekNumber}`,
    weekNumber: safeWeekNumber,
    startDate: rawWeek?.startDate || toIsoDate(getSeasonWeekStartDate(safeWeekNumber, seasonAnchorDate)),
    endDate: rawWeek?.endDate || toIsoDate(getSeasonWeekEndDate(safeWeekNumber, seasonAnchorDate)),
  }, routines);
};

const createWeekForNumber = (
  weekNumber,
  routines = DEFAULT_ROUTINE_LIBRARY,
  seed = {},
  seasonAnchorDate = SEASON_ANCHOR_DATE
) =>
  withWeekMetadata({
    ...DEFAULT_WEEK,
    ...seed,
    type: normalizeWeekType(seed?.type || DEFAULT_WEEK.type),
    published: !!seed?.published,
    publishedAt: seed?.publishedAt || null,
    updatedAt: seed?.updatedAt || null,
    isEditingPublished: !!seed?.isEditingPublished,
    publishedVersion: seed?.publishedVersion || null,
  }, weekNumber, routines, seasonAnchorDate);

const normalizeWeekPlansByNumber = (
  rawPlans,
  routines = DEFAULT_ROUTINE_LIBRARY,
  seasonAnchorDate = SEASON_ANCHOR_DATE
) => {
  const source = rawPlans && typeof rawPlans === "object" ? rawPlans : {};
  const entries = Array.isArray(source)
    ? source.map((week) => [week?.weekNumber, week])
    : Object.entries(source);
  const out = {};
  entries.forEach(([rawWeekNumber, rawWeek]) => {
    const weekNumber = normalizeWeekNumber(rawWeek?.weekNumber || rawWeekNumber, null);
    if (!weekNumber) return;
    out[weekNumber] = withWeekMetadata(rawWeek, weekNumber, routines, seasonAnchorDate);
  });
  return out;
};

const ensureWeekInPlans = (
  plansByNumber,
  weekNumber,
  routines = DEFAULT_ROUTINE_LIBRARY,
  seasonAnchorDate = SEASON_ANCHOR_DATE
) => {
  const safeWeekNumber = normalizeWeekNumber(weekNumber, getTodaySeasonWeekNumber(seasonAnchorDate));
  if (plansByNumber?.[safeWeekNumber]) return plansByNumber[safeWeekNumber];
  return createWeekForNumber(safeWeekNumber, routines, {}, seasonAnchorDate);
};

const getDateIsoForWeekDay = (weekNumber, dayIndex = 0, seasonAnchorDate = SEASON_ANCHOR_DATE) => {
  const start = getSeasonWeekStartDate(weekNumber, seasonAnchorDate);
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Number(dayIndex || 0));
  return toIsoDate(date);
};

const pickActiveCalendarWeek = (weeks) => {
  if (!Array.isArray(weeks) || !weeks.length) return null;
  const today = toIsoDate();
  return weeks.find((w) => w?.startDate && w?.endDate && w.startDate <= today && today <= w.endDate) || weeks[0] || null;
};

const buildWeekFromCalendarSeed = (calendarWeek, routines = []) => {
  if (!calendarWeek) return null;
  const offset = routines.length && calendarWeek?.weekNumber
    ? ((Number(calendarWeek.weekNumber) - 1) * 7) % routines.length
    : 0;
  const days = DAYS_FULL.map((_, i) => {
    const routine = routines.length ? routines[(offset + i) % routines.length] : null;
    return {
      am: "",
      pm: "",
      targetGroup: "all",
      gym: !!routine,
      gymPlan: routine ? { mode: "saved", routineId: routine.id } : null,
      gymFocus: routine ? (routine.exercises || []).map((e) => e.exId) : [],
    };
  });
  return {
    id: `week_${calendarWeek.weekNumber || "seed"}`,
    name: calendarWeek.name || `Semana ${calendarWeek.weekNumber || ""}`.trim(),
    weekNumber: calendarWeek.weekNumber || null,
    type: normalizeWeekType(calendarWeek.type),
    targetGroup: calendarWeek.targetGroup || "all",
    startDate: calendarWeek.startDate || null,
    endDate: calendarWeek.endDate || null,
    days,
  };
};

const planVisibleForGroup = (week, day, group) => {
  const visibleSessions = ["am", "pm"].some((slot) =>
    getSlotSessions(day, slot, week).some((session) => isTargetVisibleForGroup(session, group))
  );
  if (visibleSessions) return true;
  if (!day?.gym) return false;
  const target = {
    targetGroup: day?.gymPlan?.inline?.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all",
  };
  return isTargetVisibleForGroup(target, group);
};

const cloneRoutineDraft = (routine) => JSON.parse(JSON.stringify(routine));

// ─── EXERCISE LIBRARY UTILS ──────────────────────────────────────────────────
const getAllExercises = (customExercises = [], exerciseImages = {}) => {
  const merged = [...ALL_BUILTIN_GYM_EXERCISES, ...(customExercises || [])];
  return merged.map(ex => ({
    ...ex,
    imageUrl: exerciseImages[ex.id] || ex.imageUrl || null,
  }));
};

const getExerciseByIdFull = (id, customExercises = [], exerciseImages = {}) => {
  const all = getAllExercises(customExercises, exerciseImages);
  return all.find(e => e.id === id) || {
    id, name: labelFromExId(id), emoji:"🏋️", muscles:"Sin detalle", category:"custom", type:"weight", imageUrl:null,
  };
};
const getDefaultExerciseLoad = (exId, customExercises = [], exerciseImages = {}) => {
  const exercise = getExerciseByIdFull(exId, customExercises, exerciseImages);
  const baseProfile = EXERCISE_LOAD_PROFILE[exId] || buildExerciseFallbackProfile(normalizeExerciseType(exercise.type));
  const resolvedType = normalizeExerciseType(exercise.type || baseProfile.type || "weight");
  return {
    ...baseProfile,
    type: resolvedType,
    duration: Number(baseProfile.duration || (resolvedType === "time_reps" ? 20 : 0)),
  };
};

const formatExDuration = (sec) => {
  if (!sec) return "30s";
  const s = Number(sec);
  return s >= 60 ? `${Math.floor(s/60)}m${s%60>0?s%60+"s":""}` : `${s}s`;
};

// ─── ZONE UTILS ──────────────────────────────────────────────────────────────
const dayZoneSummary = (day, week = null) => {
  const out = emptyZones();
  if (!day) return { ...out, total:0 };
  [...getSlotSessions(day, "am", week), ...getSlotSessions(day, "pm", week)].forEach((session) => {
    ZONES.forEach(z => {
      out[z.id] += Number(session?.zones?.[z.id] || 0);
    });
  });
  out.total = zonesTotal(out);
  return out;
};
const weekZoneSummary = (week) => {
  const out = emptyZones();
  const days = Array.isArray(week?.days) ? week.days : [];
  days.forEach((day) => {
    const daySummary = dayZoneSummary(day, week);
    ZONES.forEach((zone) => {
      out[zone.id] += Number(daySummary[zone.id] || 0);
    });
  });
  out.total = zonesTotal(out);
  return out;
};
const getDaySlotPlanState = (visiblePlan) => {
  const amPlanned = (visiblePlan?.am || []).length > 0;
  const pmPlanned = (visiblePlan?.pm || []).length > 0;
  const gymPlanned = !!visiblePlan?.gym;
  const plannedSlots = Number(amPlanned) + Number(pmPlanned) + Number(gymPlanned);
  return { amPlanned, pmPlanned, gymPlanned, plannedSlots };
};
const getDayCompletionFromHistory = (visiblePlan, historyRow) => {
  const slotPlan = getDaySlotPlanState(visiblePlan);
  const amDone = slotPlan.amPlanned && !!historyRow?.amDone;
  const pmDone = slotPlan.pmPlanned && !!historyRow?.pmDone;
  const gymDone = slotPlan.gymPlanned && !!historyRow?.gymDone;
  const doneSlots = Number(amDone) + Number(pmDone) + Number(gymDone);
  const ratio = slotPlan.plannedSlots > 0 ? doneSlots / slotPlan.plannedSlots : 0;
  const status = slotPlan.plannedSlots === 0
    ? "none"
    : doneSlots === 0
      ? "none"
      : doneSlots < slotPlan.plannedSlots
        ? "partial"
        : "full";
  return { ...slotPlan, amDone, pmDone, gymDone, doneSlots, ratio, status };
};
const getCompletionDayStyle = (completion) => {
  if (!completion || completion.plannedSlots === 0) return {};
  if (completion.status === "full") {
    return { background:"rgba(74,222,128,.16)", borderColor:"rgba(74,222,128,.5)" };
  }
  if (completion.status === "partial") {
    return { background:"rgba(255,167,38,.16)", borderColor:"rgba(255,167,38,.5)" };
  }
  return { background:"rgba(248,113,113,.16)", borderColor:"rgba(248,113,113,.45)" };
};
const getNextCompetitionCountdown = (competitions, maxDays = 90, fromDateIso = toIsoDate()) => {
  const list = normalizeCompetitionList(competitions);
  if (!list.length) return null;
  const baseDate = new Date(`${fromDateIso}T00:00:00`);
  const inRange = list
    .map((item) => {
      const targetDate = new Date(`${item.dateIso}T00:00:00`);
      const diffMs = targetDate.getTime() - baseDate.getTime();
      const diffDays = Math.ceil(diffMs / MS_PER_DAY);
      return { ...item, diffDays };
    })
    .filter((item) => item.diffDays >= 0 && item.diffDays <= maxDays)
    .sort((a, b) => a.diffDays - b.diffDays);
  return inRange[0] || null;
};
const collectDayTargetGroups = (day, week, routines = []) => {
  const targets = new Set();
  ["am", "pm"].forEach((slot) => {
    getSlotSessions(day, slot, week).forEach((session) => {
      const target = normalizeSessionTargets(session, day?.targetGroup || week?.targetGroup || "all");
      if (target.targetAll) targets.add("all");
      target.targetGroups.forEach((group) => targets.add(group));
      target.targetAthleteIds.forEach((athleteId) => targets.add(`athlete:${athleteId}`));
    });
  });
  const gymPlan = getDayResolvedGymPlan(day, routines);
  if (gymPlan) targets.add(gymPlan.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all");
  if (!targets.size) targets.add(day?.targetGroup || week?.targetGroup || "all");
  return targets;
};
const collectWeekTargetGroups = (week, routines = []) => {
  const targets = new Set();
  (Array.isArray(week?.days) ? week.days : []).forEach((day) => {
    collectDayTargetGroups(day, week, routines).forEach((target) => targets.add(target));
  });
  if (!targets.size) targets.add(week?.targetGroup || "all");
  return targets;
};
const dayDiffSignature = (day, week, routines = []) => {
  const gymPlan = getDayResolvedGymPlan(day, routines);
  const serializeSession = (session) => ({
    slot: session?.slot || "",
    trainingId: session?.trainingId || "",
    name: String(session?.name || "").trim(),
    description: String(session?.description || "").trim(),
    ...normalizeSessionTargets(session, day?.targetGroup || week?.targetGroup || "all"),
    zones: safeZones(session?.zones),
  });
  return JSON.stringify({
    am: getSlotSessions(day, "am", week).map(serializeSession),
    pm: getSlotSessions(day, "pm", week).map(serializeSession),
    gym: gymPlan
      ? {
          name: gymPlan.name || "",
          targetGroup: gymPlan.targetGroup || "all",
          exercises: (gymPlan.exercises || []).map((exercise) => ({
            exId: exercise.exId,
            sets: Number(exercise.sets || 0),
            reps: Number(exercise.reps || 0),
            pct: Number(exercise.pct || 0),
            type: normalizeExerciseType(exercise.type || "weight"),
            duration: Number(exercise.duration || 0),
          })),
        }
      : null,
  });
};
const collectChangedTargetGroups = (previousWeek, nextWeek, routines = []) => {
  if (!previousWeek) return collectWeekTargetGroups(nextWeek, routines);
  const targets = new Set();
  DAYS_FULL.forEach((_, dayIndex) => {
    const prevDay = previousWeek?.days?.[dayIndex] || {};
    const nextDay = nextWeek?.days?.[dayIndex] || {};
    const prevSignature = dayDiffSignature(prevDay, previousWeek, routines);
    const nextSignature = dayDiffSignature(nextDay, nextWeek, routines);
    if (prevSignature !== nextSignature) {
      collectDayTargetGroups(prevDay, previousWeek, routines).forEach((target) => targets.add(target));
      collectDayTargetGroups(nextDay, nextWeek, routines).forEach((target) => targets.add(target));
    }
  });
  if (normalizeWeekType(previousWeek?.type) !== normalizeWeekType(nextWeek?.type)) {
    collectWeekTargetGroups(previousWeek, routines).forEach((target) => targets.add(target));
    collectWeekTargetGroups(nextWeek, routines).forEach((target) => targets.add(target));
  }
  return targets;
};

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
const LOCAL_STORAGE_PREFIX = "trackflow_local_";
const getLocalStorageKey = (key) => `${LOCAL_STORAGE_PREFIX}${key}`;
const localRawGet = (key) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(getLocalStorageKey(key));
  } catch {
    return null;
  }
};
const localRawSet = (key, value) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(getLocalStorageKey(key), String(value));
  } catch {}
};
const store = {
  getRaw: async (key) => {
    try {
      if (typeof window !== "undefined" && window.storage?.get) {
        const remote = await window.storage.get(key);
        if (remote?.value != null) {
          localRawSet(key, remote.value);
          return remote.value;
        }
      }
    } catch {}
    return localRawGet(key);
  },
  setRaw: async (key, value) => {
    const text = String(value);
    localRawSet(key, text);
    try {
      if (typeof window !== "undefined" && window.storage?.set) {
        await window.storage.set(key, text);
      }
    } catch {}
  },
  get: async (key) => {
    const raw = await store.getRaw(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  set: async (key, value) => {
    await store.setRaw(key, JSON.stringify(value));
  },
};

// ─── CSV REGISTRY (usuarios) ──────────────────────────────────────────────────
const ATHLETE_CSV_COLUMNS = [
  "id","name","group","groups","avatar","maxW","weekKms","todayDone","competitions","password","passwordChangedOnce"
];

const csvEsc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const parseCsvLine = (line) => {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') q = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
};

const athletesToCsv = (athletes) => {
  const rows = [ATHLETE_CSV_COLUMNS.join(",")];
  normalizeAthletes(athletes || []).forEach((a) => {
    const row = {
      id: a.id,
      name: a.name,
      group: getAthletePrimaryGroup(a),
      groups: JSON.stringify(getAthleteGroups(a)),
      avatar: a.avatar || "",
      maxW: JSON.stringify(a.maxW || {}),
      weekKms: JSON.stringify(a.weekKms || []),
      todayDone: a.todayDone ? "1" : "0",
      competitions: JSON.stringify(normalizeCompetitionList(a.competitions)),
      password: String(a.password || "1234"),
      passwordChangedOnce: a.passwordChangedOnce ? "1" : "0",
    };
    rows.push(ATHLETE_CSV_COLUMNS.map((c) => csvEsc(row[c])).join(","));
  });
  return rows.join("\n");
};

const athletesFromCsv = (csvText) => {
  if (!csvText || !csvText.trim()) return null;
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return null;
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const indexByHeader = Object.fromEntries(headers.map((h, i) => [h, i]));
  if (!("id" in indexByHeader) || !("name" in indexByHeader)) return null;

  return lines.slice(1).map((line, rowIndex) => {
    const cols = parseCsvLine(line);
    const pick = (k, d = "") => (indexByHeader[k] == null ? d : (cols[indexByHeader[k]] ?? d));
    let maxW = {};
    let weekKms = [];
    let groups = [];
    let competitions = [];
    try { maxW = JSON.parse(pick("maxW", "{}")) || {}; } catch {}
    try { weekKms = JSON.parse(pick("weekKms", "[]")) || []; } catch {}
    try {
      groups = JSON.parse(pick("groups", "[]")) || [];
    } catch {
      groups = String(pick("groups", "")).split("|").map((v) => v.trim()).filter(Boolean);
    }
    try {
      competitions = JSON.parse(pick("competitions", "[]")) || [];
    } catch {
      competitions = [];
    }
    return normalizeAthleteRecord({
      id: pick("id"),
      name: pick("name"),
      group: pick("group", "por-asignar"),
      groups,
      avatar: pick("avatar") || pick("name","").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2),
      maxW,
      weekKms,
      todayDone: pick("todayDone", "0") === "1",
      competitions,
      password: pick("password", "1234"),
      passwordChangedOnce: pick("passwordChangedOnce", "") === "1",
    }, rowIndex);
  }).filter(a => a.id && a.name);
};

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, athletes }) {
  const [tab, setTab] = useState("athlete"); // "coach" | "athlete"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const handleCoachLogin = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      const result = await onLogin(
        COACH,
        {
          coachLoginInput: username,
          coachPassword: password,
        }
      );
      if (result?.ok === false) {
        setError(result.error || "No se pudo iniciar sesi?n como entrenador.");
        return;
      }
      setError("");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAthleteLogin = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      const result = await onLogin(
        { role: "athlete", name: String(username || "").trim() },
        {
          athleteLoginInput: username,
          athletePassword: password,
        }
      );
      if (result?.ok === false) {
        setError(result.error || "No se pudo iniciar sesi?n.");
        return;
      }
      setError("");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-logo">TRACK<span>FLOW</span></div>

        <div className="tab-sw">
          <button className={`tab-btn ${tab==="athlete"?"active":""}`} onClick={()=>{setTab("athlete");setError("")}}>🏃 Atleta</button>
          <button className={`tab-btn ${tab==="coach"?"active":""}`} onClick={()=>{setTab("coach");setError("")}}>📋 Entrenador</button>
        </div>

        {tab === "coach" && (
          <>
            <div className="form-group">
              <label className="form-label">Usuario</label>
              <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Juan Carlos o email admin" autoComplete="username" disabled={authLoading} />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" onKeyDown={e=>e.key==="Enter"&&handleCoachLogin()} disabled={authLoading} />
            </div>
            {error && <div className="text-sm mb3 form-error">{error}</div>}
            <button className="login-btn" onClick={handleCoachLogin} disabled={authLoading}>
              {authLoading ? "Validando..." : "Entrar →"}
            </button>
          </>
        )}

        {tab === "athlete" && (
          <>
            <div className="form-group">
              <label className="form-label">Usuario</label>
              <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Nombre del atleta" autoComplete="username" onKeyDown={e=>e.key==="Enter"&&handleAthleteLogin()} disabled={authLoading} />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" onKeyDown={e=>e.key==="Enter"&&handleAthleteLogin()} disabled={authLoading} />
            </div>
            {error && <div className="text-sm mb3 form-error">{error}</div>}
            <button className="login-btn" onClick={handleAthleteLogin} disabled={authLoading}>
              {authLoading ? "Validando..." : "Entrar →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ user, page, setPage, onLogout, notifCount }) {
  const isCoach = user.role === "coach";
  const nav = getNavByRole(user.role);
  const badgePage = isCoach ? "semana" : "hoy";
  const homePage = nav[0]?.id || page;

  return (
    <div className="sidebar">
      <div className="sb-logo">
        <button className="sb-home" onClick={() => setPage(homePage)}>
          <div className="sb-logotype">TRACK<span>FLOW</span></div>
        </button>
      </div>

      <nav className="sb-section" aria-label="Navegación principal">
        <span className="sb-label">Navegación</span>
        {nav.map(n => (
          <button
            key={n.id}
            className={`nav-item ${page===n.id?"active":""}`}
            onClick={()=>setPage(n.id)}
            aria-current={page === n.id ? "page" : undefined}
          >
            <span className="ni">{n.icon}</span>
            {n.label}
            {n.id === badgePage && notifCount > 0 && <span className="sb-notif">{notifCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sb-bottom">
        <div className="user-chip">
          <div className={`avatar ${isCoach?"":"blue"}`}>
            {user.avatar || user.name.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div className="u-name">{user.name.split(" ")[0]}</div>
            <div className="u-role">{isCoach ? "Entrenador" : getAthleteGroupsLabel(user)}</div>
          </div>
        </div>
        <button className="nav-item nav-item-danger mt3" onClick={onLogout}>
          <span className="ni">🚪</span> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function MobileNavigation({ user, page, setPage, onLogout, notifCount }) {
  const isCoach = user.role === "coach";
  const nav = getNavByRole(user.role);
  const current = nav.find((item) => item.id === page) || nav[0];
  const badgePage = isCoach ? "semana" : "hoy";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [page, user.role]);

  return (
    <>
      <header className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-sheet"
        >
          ☰
        </button>
        <button className="mobile-brand" onClick={() => setPage(nav[0]?.id || page)}>
          <span className="mobile-brand-main">TRACKFLOW</span>
          <span className="mobile-brand-sub">{isCoach ? "Entrenador" : "Atleta"}</span>
        </button>
        <div className="mobile-current" title={current?.label || ""}>{current?.label || ""}</div>
        <button className="mobile-logout" onClick={onLogout} aria-label="Cerrar sesión">🚪</button>
      </header>

      {menuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)}>
          <div
            id="mobile-nav-sheet"
            className="mobile-menu-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menú principal"
          >
            <div className="mobile-menu-head">
              <div>
                <div className="card-title mobile-menu-title">Menú</div>
                <div className="text-sm text-mu">{isCoach ? "Entrenador" : "Atleta"} · {current?.label || ""}</div>
              </div>
              <button className="modal-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">✕</button>
            </div>
            <div className="mobile-menu-nav">
              {nav.map((item) => (
                <button
                  key={`menu_${item.id}`}
                  className={`mobile-menu-item ${page === item.id ? "active" : ""}`}
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={() => {
                    setPage(item.id);
                    setMenuOpen(false);
                  }}
                >
                  <span className="mobile-menu-icon">{item.icon}</span>
                  <span className="mobile-menu-label">{item.label}</span>
                  {item.id === badgePage && notifCount > 0 && <span className="mobile-menu-badge">{notifCount}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-tabbar" aria-label="Navegación móvil">
        {nav.map((item) => (
          <button
            key={item.id}
            className={`mobile-tab-btn ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
            aria-current={page === item.id ? "page" : undefined}
          >
            <span className="mt-icon">{item.icon}</span>
            <span className="mt-label">{item.shortLabel || item.label}</span>
            {item.id === badgePage && notifCount > 0 && <span className="mobile-notif">{notifCount}</span>}
          </button>
        ))}
      </nav>
    </>
  );
}

function SingleSelect({ options = [], value = "", onChange, placeholder = "Selecciona", disabled = false }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange?.(e.target.value)} disabled={disabled}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => {
        const item = typeof option === "string" ? { value: option, label: option } : option;
        return <option key={item.value} value={item.value}>{item.label}</option>;
      })}
    </select>
  );
}

function MultiSelect({ options = [], values = [], onChange, placeholder = "Selecciona", disabled = false, searchable = true }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);
  const selected = collectGroupValues(values);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const normalizedOptions = mergeGroupOptions(options);
  const filtered = normalizedOptions.filter((option) =>
    String(option).toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (value) => {
    const normalized = normalizeGroupName(value);
    if (!normalized) return;
    const hasOption = selected.includes(normalized);
    const next = hasOption
      ? selected.filter((item) => item !== normalized)
      : [...selected, normalized];
    onChange?.(next);
  };

  return (
    <div className={`multi-select ${disabled ? "disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`multi-select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <div className="multi-select-value">
          {selected.length > 0
            ? selected.map((group) => <span key={group} className="multi-chip">{group}</span>)
            : <span className="multi-placeholder">{placeholder}</span>}
        </div>
        <span className="multi-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="multi-panel">
          {searchable && (
            <input
              className="input multi-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar grupo..."
            />
          )}
          {filtered.map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} className="multi-option">
                <input type="checkbox" checked={checked} onChange={() => toggleOption(option)} />
                <span className="multi-option-label">{option}</span>
              </label>
            );
          })}
          {!filtered.length && <div className="text-sm text-mu" style={{padding:"6px 4px"}}>Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

function MultiSelectList({
  options = [],
  values = [],
  onChange,
  placeholder = "Selecciona",
  disabled = false,
  searchable = true,
  searchPlaceholder = "Buscar...",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);
  const selected = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const normalizedOptions = (() => {
    const seen = new Set();
    const out = [];
    (Array.isArray(options) ? options : []).forEach((option) => {
      const item = typeof option === "string"
        ? { value: option, label: option }
        : {
            value: option?.value ?? option?.id ?? "",
            label: option?.label ?? option?.name ?? option?.value ?? option?.id ?? "",
          };
      const value = String(item.value || "").trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      out.push({ value, label: String(item.label || value) });
    });
    return out;
  })();
  const labelByValue = normalizedOptions.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
  }, {});
  const filtered = normalizedOptions.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) return;
    const hasOption = selected.includes(value);
    const next = hasOption
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange?.(next);
  };

  return (
    <div className={`multi-select ${disabled ? "disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`multi-select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <div className="multi-select-value">
          {selected.length > 0
            ? selected.map((value) => <span key={value} className="multi-chip">{labelByValue[value] || value}</span>)
            : <span className="multi-placeholder">{placeholder}</span>}
        </div>
        <span className="multi-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="multi-panel">
          {searchable && (
            <input
              className="input multi-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
            />
          )}
          {filtered.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label key={option.value} className="multi-option">
                <input type="checkbox" checked={checked} onChange={() => toggleOption(option.value)} />
                <span className="multi-option-label">{option.label}</span>
              </label>
            );
          })}
          {!filtered.length && <div className="text-sm text-mu" style={{padding:"6px 4px"}}>Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

// ─── COACH: DASHBOARD ─────────────────────────────────────────────────────────
function CoachDashboard({ athletes, notifications, week, onClearNotif }) {
  const team = normalizeAthletes(athletes);
  const done = team.filter(a => a.todayDone).length;
  const totalKms = team.reduce((s,a) => s + (a.weekKms||[]).reduce((x,y)=>x+y,0), 0);
  const todayI = todayIdx();
  const todayPlan = week.days[todayI];

  return (
    <div>
      <div className="ph">
        <div className="ph-title">BUEN<span>OS DÍAS,</span></div>
        <div className="ph-title" style={{marginTop:-8}}>JORDI 👋</div>
        <div className="ph-sub">{new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</div>
      </div>

      {/* Stats */}
      <div className="g4 mb6">
        <div className="stat-card">
          <div className="stat-label">Atletas activos</div>
          <div className="stat-val">{team.length}<span className="stat-unit">ath</span></div>
          <div className="stat-change">Equipo total en la plataforma</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Entrenos hoy</div>
          <div className="stat-val">{done}<span className="stat-unit">/{team.length}</span></div>
          <div className="prog-bar mt3"><div className="prog-fill" style={{width:`${team.length?done/team.length*100:0}%`}} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Km totales semana</div>
          <div className="stat-val">{totalKms.toFixed(0)}<span className="stat-unit">km</span></div>
          <div className="stat-change">Suma semanal de todos los atletas</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tipo de semana</div>
          <div className="stat-val" style={{fontSize:28,marginTop:4}}>{week.type}</div>
          <div className="stat-change">· Planificación activa</div>
        </div>
      </div>

      <div className="g2">
        {/* Notifications */}
        <div className="card">
          <div className="flex ic jb mb4">
            <div className="card-title mb2" style={{margin:0}}>🔔 Notificaciones</div>
            {notifications.length > 0 && <button className="btn btn-ghost btn-sm" onClick={onClearNotif}>Limpiar</button>}
          </div>
          {notifications.length === 0 && <div className="text-mu text-sm">Sin notificaciones nuevas</div>}
          {notifications.map((n,i) => (
            <div key={i} className="notif">
              <span style={{fontSize:20}}>✅</span>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>{n.athlete}</div>
                <div style={{fontSize:12,color:"var(--mu2)"}}>{n.msg}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Today's plan */}
        <div className="card">
          <div className="card-title">📋 Plan de hoy — {DAYS_FULL[todayI]}</div>
          {todayPlan?.am && (
            <div className="mb3">
              <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--or)",fontWeight:700,marginBottom:4}}>🌅 Mañana</div>
              <div style={{fontWeight:700}}>{todayPlan.am}</div>
            </div>
          )}
          {todayPlan?.pm && (
            <div className="mb3">
              <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--bl)",fontWeight:700,marginBottom:4}}>🌆 Tarde</div>
              <div style={{fontWeight:700}}>{todayPlan.pm}</div>
            </div>
          )}
          {todayPlan?.gym && (
            <div>
              <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--pu)",fontWeight:700,marginBottom:4}}>🏋️ Gym</div>
              <div style={{fontWeight:700}}>Sesión de pesas — {todayPlan.gymFocus?.length} ejercicios</div>
            </div>
          )}
          {!todayPlan?.am && !todayPlan?.pm && <div className="text-mu text-sm">Sin entrenamiento planificado hoy</div>}
        </div>
      </div>
    </div>
  );
}

// ─── COACH: PLAN SEMANAL ──────────────────────────────────────────────────────
function CoachSemana({ week, setWeek, routines, setRoutines, groups }) {
  const [editing, setEditing] = useState(null); // day index
  const [draft, setDraft] = useState(null);
  const groupsWithAll = ["all", ...mergeGroupOptions(GROUPS, groups)];

  const buildInlineDraft = (day) => {
    const resolved = getDayResolvedGymPlan(day, routines);
    if (resolved) {
      return {
        name: resolved.name || "Rutina inline",
        targetGroup: resolved.targetGroup || "all",
        exercises: cloneRoutineDraft(resolved.exercises || []),
      };
    }
    return makeInlineRoutineFromExercises([]);
  };

  const openEdit = (i) => {
    const d = week.days[i];
    const resolved = getDayResolvedGymPlan(d, routines);
    const defaultMode = d.gym ? (d.gymPlan?.mode || (resolved?.type === "saved" ? "saved" : "inline")) : "saved";
    setEditing(i);
    setDraft({
      ...d,
      targetGroup: d.targetGroup || week.targetGroup || "all",
      gym: !!d.gym,
      gymMode: defaultMode,
      selectedRoutineId: d.gymPlan?.routineId || (routines[0]?.id || ""),
      inlineRoutine: buildInlineDraft(d),
      saveInlineToLibrary: false,
      saveInlineName: `${DAYS_FULL[i]} · ${groupLabel(d.targetGroup || week.targetGroup || "all")}`,
      amZones: safeZones(d.amZones),
      pmZones: safeZones(d.pmZones),
    });
  };

  const ensureInlineExerciseRow = (exId) => ({ exId, ...(EXERCISE_LOAD_PROFILE[exId] || buildExerciseFallbackProfile(normalizeExerciseType(getExerciseByIdFull(exId).type))) });

  const toggleInlineExercise = (exId) => {
    setDraft(prev => {
      const list = prev.inlineRoutine?.exercises || [];
      const exists = list.some(e => e.exId === exId);
      const next = exists ? list.filter(e => e.exId !== exId) : [...list, ensureInlineExerciseRow(exId)];
      return { ...prev, inlineRoutine: { ...(prev.inlineRoutine || {}), exercises: next } };
    });
  };

  const updateInlineExercise = (exId, field, value) => {
    setDraft(prev => ({
      ...prev,
      inlineRoutine: {
        ...(prev.inlineRoutine || {}),
        exercises: (prev.inlineRoutine?.exercises || []).map((exercise) => {
          if (exercise.exId !== exId) return exercise;
          if (field === "type") return { ...exercise, type: value };
          return { ...exercise, [field]: Number(value || 0) };
        }),
      },
    }));
  };

  const saveEdit = () => {
    if (editing == null || !draft) return;
    const days = [...week.days];
    const nextDay = {
      ...days[editing],
      am: draft.am || "",
      pm: draft.pm || "",
      amZones: safeZones(draft.amZones),
      pmZones: safeZones(draft.pmZones),
      targetGroup: draft.targetGroup || week.targetGroup || "all",
      gym: !!draft.gym,
    };

    if (!nextDay.gym) {
      nextDay.gymPlan = null;
      nextDay.gymFocus = [];
    } else if (draft.gymMode === "saved") {
      const selected = getRoutineById(routines, draft.selectedRoutineId) || routines[0];
      nextDay.gymPlan = selected ? { mode:"saved", routineId:selected.id } : null;
      nextDay.gymFocus = (selected?.exercises || []).map(e => e.exId);
    } else {
      const inline = sanitizeRoutine({
        id: "inline_temp",
        name: draft.inlineRoutine?.name || "Rutina inline",
        targetGroup: draft.inlineRoutine?.targetGroup || nextDay.targetGroup || "all",
        exercises: draft.inlineRoutine?.exercises || [],
      });
      nextDay.gymPlan = {
        mode:"inline",
        inline: {
          name: inline.name,
          targetGroup: inline.targetGroup,
          exercises: inline.exercises,
        },
      };
      nextDay.gymFocus = inline.exercises.map(e => e.exId);

      if (draft.saveInlineToLibrary) {
        const newId = `rt_${Date.now()}`;
        const name = (draft.saveInlineName || inline.name || "Rutina guardada").trim();
        setRoutines(prev => [...prev, {
          id: newId,
          name,
          targetGroup: inline.targetGroup || "all",
          exercises: inline.exercises,
        }]);
        nextDay.gymPlan = { mode:"saved", routineId:newId };
      }
    }

    days[editing] = nextDay;
    setWeek(normalizeWeek({ ...week, days }, routines));
    setEditing(null);
    setDraft(null);
  };

  const currentResolved = draft?.gym ? (
    draft.gymMode === "saved"
      ? getRoutineById(routines, draft.selectedRoutineId)
      : draft.inlineRoutine
  ) : null;

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">PLAN <span>SEMANAL</span></div>
            <div className="ph-sub">Entrenos AM/PM, rutina gym por día y grupo objetivo (o todos)</div>
          </div>
        </div>
      </div>

      <div className="g2 mb6">
        <div className="wt-banner" style={{margin:0}}>
          <div>
            <div className="wt-label">Semana</div>
            <div className="wt-val">{week.name || "Semana"}</div>
          </div>
          <input
            className="input"
            style={{marginLeft:"auto",maxWidth:240}}
            value={week.name || ""}
            onChange={e=>setWeek(normalizeWeek({ ...week, name:e.target.value }, routines))}
            placeholder="Nombre de semana"
          />
        </div>

        <div className="wt-banner" style={{margin:0}}>
          <div>
            <div className="wt-label">Tipo / grupo por defecto</div>
            <div className="wt-val" style={{fontSize:24}}>{week.type} · {groupLabel(week.targetGroup || "all")}</div>
          </div>
          <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
            <select className="select" value={week.type} onChange={e=>setWeek(normalizeWeek({ ...week, type:e.target.value }, routines))}>
              {WEEK_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select className="select" value={week.targetGroup || "all"} onChange={e=>setWeek(normalizeWeek({ ...week, targetGroup:e.target.value }, routines))}>
              {groupsWithAll.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="week-grid">
        {DAYS_FULL.map((day, i) => {
          const d = week.days[i];
          const isToday = i === todayIdx();
          const gymCount = getDayGymCount(d, routines);
          const resolved = getDayResolvedGymPlan(d, routines);
          return (
            <div key={i} className={`day-col ${isToday?"today":""}`}>
              <div className="day-hdr">
                <div className="day-name">{DAYS_SHORT[i]}</div>
                <div className="day-date" style={{color:isToday?"var(--or)":"var(--mu)"}}>
                  {isToday ? "HOY" : groupLabel(d.targetGroup || week.targetGroup || "all")}
                </div>
              </div>
              <div className="day-body">
                {d.am && (
                  <div className="session">
                    <div className="sess-lbl">🌅 AM · {displayTarget(week, d)}</div>
                    <div className="sess-txt">{d.am}</div>
                  </div>
                )}
                {d.pm && (
                  <div className="session pm">
                    <div className="sess-lbl">🌆 PM · {displayTarget(week, d)}</div>
                    <div className="sess-txt">{d.pm}</div>
                  </div>
                )}
                {d.gym && (
                  <div className="session gym">
                    <div className="sess-lbl">🏋️ GYM · {displayTarget(week, d)}</div>
                    <div className="sess-txt">{resolved?.name || "Rutina"} · {gymCount} ejercicios</div>
                  </div>
                )}
                {!d.am && !d.pm && !d.gym && (
                  <div style={{fontSize:11,color:"var(--mu)",textAlign:"center",padding:"8px 0"}}>Descanso</div>
                )}
                {/* Zone km pills */}
                {dayZoneSummary(d).total > 0 && (
                  <div className="zone-total-row" style={{marginTop:6}}>
                    {ZONES.filter(z => dayZoneSummary(d)[z.id] > 0).map(z => (
                      <span key={z.id} className="zone-pill" style={{background:z.color+"22",color:z.color}}>
                        <span className="zone-dot" style={{background:z.color}} />
                        {z.short} {Number(dayZoneSummary(d)[z.id]).toFixed(1)}
                      </span>
                    ))}
                    <span style={{fontSize:10,color:"var(--mu)",fontWeight:700}}>={dayZoneSummary(d).total.toFixed(1)}km</span>
                  </div>
                )}
                <button className="btn btn-ghost btn-sm mt3" style={{width:"100%",fontSize:11}} onClick={()=>openEdit(i)}>✏️ Editar</button>
              </div>
            </div>
          );
        })}
      </div>

      {editing !== null && draft && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditing(null)}>
          <div className="modal">
            <div className="flex ic jb mb4">
              <div className="modal-title">✏️ {DAYS_FULL[editing]}</div>
              <button className="modal-close" onClick={()=>setEditing(null)}>✕ Cerrar</button>
            </div>

            <div className="g2">
              <div className="form-group">
                <label className="form-label">Grupo objetivo del día</label>
                <select className="select" value={draft.targetGroup || "all"} onChange={e=>setDraft({...draft,targetGroup:e.target.value})}>
                  {groupsWithAll.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de semana (global)</label>
                <select className="select" value={week.type} onChange={e=>setWeek(normalizeWeek({...week,type:e.target.value}, routines))}>
                  {WEEK_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">🌅 Entrenamiento Mañana (AM)</label>
              <input className="input" value={draft.am||""} onChange={e=>setDraft({...draft,am:e.target.value})} placeholder="Ej: Rodaje 10km Z2, Series 6×200m..." />
            </div>
            {draft.am && (
              <div className="form-group">
                <label className="form-label">📊 Km AM por zona de intensidad</label>
                <div className="zone-inputs">
                  {ZONES.map(z => (
                    <div key={z.id} className="zone-input-wrap">
                      <div className="zone-input-label">
                        <span className="zone-dot" style={{background:z.color}} />
                        {z.short}
                      </div>
                      <input type="number" className="input" min={0} step={0.5}
                        value={draft.amZones?.[z.id] || ""}
                        onChange={e=>setDraft({...draft, amZones:{...(draft.amZones||emptyZones()), [z.id]:e.target.value}})}
                        placeholder="0" style={{padding:"6px 8px"}}
                      />
                    </div>
                  ))}
                </div>
                {zonesTotal(draft.amZones||{}) > 0 && (
                  <div style={{fontSize:12,color:"var(--mu)",marginTop:6}}>
                    Total AM: <strong style={{color:"var(--or)"}}>{zonesTotal(draft.amZones).toFixed(1)} km</strong>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">🌆 Entrenamiento Tarde (PM)</label>
              <input className="input" value={draft.pm||""} onChange={e=>setDraft({...draft,pm:e.target.value})} placeholder="Ej: Técnica de carrera, Fartlek..." />
            </div>
            {draft.pm && (
              <div className="form-group">
                <label className="form-label">📊 Km PM por zona de intensidad</label>
                <div className="zone-inputs">
                  {ZONES.map(z => (
                    <div key={z.id} className="zone-input-wrap">
                      <div className="zone-input-label">
                        <span className="zone-dot" style={{background:z.color}} />
                        {z.short}
                      </div>
                      <input type="number" className="input" min={0} step={0.5}
                        value={draft.pmZones?.[z.id] || ""}
                        onChange={e=>setDraft({...draft, pmZones:{...(draft.pmZones||emptyZones()), [z.id]:e.target.value}})}
                        placeholder="0" style={{padding:"6px 8px"}}
                      />
                    </div>
                  ))}
                </div>
                {zonesTotal(draft.pmZones||{}) > 0 && (
                  <div style={{fontSize:12,color:"var(--mu)",marginTop:6}}>
                    Total PM: <strong style={{color:"var(--bl)"}}>{zonesTotal(draft.pmZones).toFixed(1)} km</strong>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">🏋️ ¿Hay Gym este día?</label>
              <div className="flex ic g3r">
                <button className={`btn ${draft.gym?"btn-or":"btn-ghost"} btn-sm`} onClick={()=>setDraft({...draft,gym:true})}>✓ Sí</button>
                <button className={`btn ${!draft.gym?"btn-danger":"btn-ghost"} btn-sm`} onClick={()=>setDraft({...draft,gym:false})}>✕ No</button>
              </div>
            </div>

            {draft.gym && (
              <>
                <div className="g2">
                  <div className="form-group">
                    <label className="form-label">Modo de rutina gym</label>
                    <select className="select" value={draft.gymMode} onChange={e=>setDraft({...draft,gymMode:e.target.value})}>
                      <option value="saved">Usar rutina guardada</option>
                      <option value="inline">Crear rutina al momento</option>
                    </select>
                  </div>
                  {draft.gymMode === "saved" && (
                    <div className="form-group">
                      <label className="form-label">Rutina guardada</label>
                      <select className="select" value={draft.selectedRoutineId || ""} onChange={e=>setDraft({...draft,selectedRoutineId:e.target.value})}>
                        {(routines || []).map(rt => (
                          <option key={rt.id} value={rt.id}>{rt.name} · {groupLabel(rt.targetGroup)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {draft.gymMode === "inline" && (
                  <>
                    <div className="g2">
                      <div className="form-group">
                        <label className="form-label">Nombre rutina inline</label>
                        <input className="input" value={draft.inlineRoutine?.name || ""} onChange={e=>setDraft({...draft, inlineRoutine:{...(draft.inlineRoutine||{}), name:e.target.value}})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Grupo rutina inline</label>
                        <select className="select" value={draft.inlineRoutine?.targetGroup || "all"} onChange={e=>setDraft({...draft, inlineRoutine:{...(draft.inlineRoutine||{}), targetGroup:e.target.value}})}>
                          {groupsWithAll.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ejercicios (inline)</label>
                      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                        {GYM_EXERCISES.map(ex => {
                          const active = (draft.inlineRoutine?.exercises || []).some(e => e.exId === ex.id);
                          return (
                            <button
                              type="button"
                              key={ex.id}
                              className={`btn btn-sm ${active?"btn-or":"btn-ghost"}`}
                              onClick={()=>toggleInlineExercise(ex.id)}
                            >
                              {ex.emoji} {ex.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {(draft.inlineRoutine?.exercises || []).length > 0 && (
                      <div className="card card-sm" style={{marginTop:6}}>
                        {(draft.inlineRoutine.exercises || []).map((row) => {
                          const ex = GYM_EXERCISES.find(e => e.id === row.exId);
                          return (
                            <div key={row.exId} className="ex-row" style={{gridTemplateColumns:"42px 1fr 90px 90px 90px"}}>
                              <div className="ex-emoji">{ex?.emoji || "🏋️"}</div>
                              <div>
                                <div className="ex-info-name">{ex?.name || row.exId}</div>
                                <div className="ex-info-mu">{ex?.muscles || ""}</div>
                              </div>
                              <input type="number" min={1} max={10} className="input" value={row.sets} onChange={e=>updateInlineExercise(row.exId,"sets",e.target.value)} />
                              <input type="number" min={1} max={30} className="input" value={row.reps} onChange={e=>updateInlineExercise(row.exId,"reps",e.target.value)} />
                              <input type="number" min={30} max={110} className="input" value={row.pct} onChange={e=>updateInlineExercise(row.exId,"pct",e.target.value)} />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="card card-sm mt3">
                      <div className="flex ic jb">
                        <div>
                          <div className="fw7" style={{fontSize:13}}>¿Guardar también esta rutina en la biblioteca?</div>
                          <div className="text-mu text-sm">Si marcas esto, se añade en "Rutinas Gym" y la semana guardará una referencia</div>
                        </div>
                        <button className={`btn btn-sm ${draft.saveInlineToLibrary ? "btn-or" : "btn-ghost"}`} onClick={()=>setDraft({...draft, saveInlineToLibrary: !draft.saveInlineToLibrary})}>
                          {draft.saveInlineToLibrary ? "✓ Sí" : "No"}
                        </button>
                      </div>
                      {draft.saveInlineToLibrary && (
                        <input className="input mt3" value={draft.saveInlineName || ""} onChange={e=>setDraft({...draft,saveInlineName:e.target.value})} placeholder="Nombre para guardar en biblioteca" />
                      )}
                    </div>
                  </>
                )}

                {currentResolved && (
                  <div className="card card-sm mt3">
                    <div className="flex ic jb mb3">
                      <div className="fw7">Resumen gym del día</div>
                      <span className="badge b-pu">{(currentResolved.exercises || []).length} ejercicios</span>
                    </div>
                    <div className="text-sm text-mu">
                      {currentResolved.name || "Rutina"} · {groupLabel(currentResolved.targetGroup || draft.targetGroup || "all")}
                    </div>
                  </div>
                )}
              </>
            )}

            <button className="btn btn-or mt4" style={{width:"100%"}} onClick={saveEdit}>💾 Guardar día</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CoachSemanaV2({
  week,
  setWeek,
  routines,
  trainings,
  athletes,
  groups,
  customExercises,
  exerciseImages,
  activeWeekNumber,
  setActiveWeekNumber,
  onPublishWeek,
  seasonAnchorDate,
}) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editorWeek, setEditorWeek] = useState(normalizeWeek(week, routines));
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exercisePicker, setExercisePicker] = useState("");
  const targetGroups = mergeGroupOptions(groups, collectAthleteGroups(athletes));
  const targetGroupsWithAll = ["all", ...targetGroups];
  const athleteOptions = normalizeAthletes(athletes).map((athlete) => ({ value: athlete.id, label: athlete.name }));
  const athleteLookup = normalizeAthletes(athletes).reduce((acc, athlete) => {
    acc[athlete.id] = athlete;
    return acc;
  }, {});
  const trainingCatalog = normalizeTrainingCatalog(trainings);
  const allExercises = getAllExercises(customExercises, exerciseImages);
  const canEditWeek = !editorWeek.published || editorWeek.isEditingPublished;
  const currentWeekNumber = normalizeWeekNumber(
    activeWeekNumber,
    editorWeek.weekNumber || getTodaySeasonWeekNumber(seasonAnchorDate)
  );
  const weekTypeCatalog = trainingCatalog.filter((training) => isTrainingAvailableForWeekType(training, editorWeek.type));

  useEffect(() => {
    setEditorWeek(normalizeWeek(week, routines));
    setEditing(null);
    setDraft(null);
    setExerciseSearch("");
    setExercisePicker("");
  }, [week, routines]);

  const patchEditorWeek = (updater) => {
    setEditorWeek((prev) => {
      const nextWeek = normalizeWeek(typeof updater === "function" ? updater(prev) : updater, routines);
      setWeek(nextWeek);
      return nextWeek;
    });
  };

  const moveWeek = (delta) => {
    setEditing(null);
    setDraft(null);
    setActiveWeekNumber((prev) => Math.max(1, normalizeWeekNumber(prev, currentWeekNumber) + delta));
  };

  const buildInlineDraft = (day, index) => {
    const resolved = getDayResolvedGymPlan(day, routines);
    if (resolved) {
      return {
        name: resolved.name || `Rutina ${DAYS_FULL[index]}`,
        targetGroup: resolved.targetGroup || "all",
        exercises: cloneRoutineDraft(resolved.exercises || []),
      };
    }
    return makeInlineRoutineFromExercises([], `Rutina ${DAYS_FULL[index]}`);
  };

  const buildDayDraft = (day, index) => ({
    sessions: {
      am: getPrimarySessionForSlot(day, "am", editorWeek),
      pm: getPrimarySessionForSlot(day, "pm", editorWeek),
    },
    extraSessions: getExtraSessionsForDay(day),
    gym: !!day?.gym,
    inlineRoutine: buildInlineDraft(day, index),
  });

  const openEdit = (index) => {
    setEditing(index);
    setDraft(buildDayDraft(editorWeek.days[index], index));
    setExerciseSearch("");
    setExercisePicker("");
  };

  const ensureInlineExerciseRow = (exId) => ({ exId, ...getDefaultExerciseLoad(exId, customExercises, exerciseImages) });

  const addInlineExercise = (exId) => {
    if (!exId) return;
    setDraft((prev) => {
      const list = prev.inlineRoutine?.exercises || [];
      if (list.some((exercise) => exercise.exId === exId)) return prev;
      return {
        ...prev,
        inlineRoutine: {
          ...(prev.inlineRoutine || {}),
          exercises: [...list, ensureInlineExerciseRow(exId)],
        },
      };
    });
  };

  const removeInlineExercise = (exId) => {
    setDraft((prev) => ({
      ...prev,
      inlineRoutine: {
        ...(prev.inlineRoutine || {}),
        exercises: (prev.inlineRoutine?.exercises || []).filter((exercise) => exercise.exId !== exId),
      },
    }));
  };

  const updateInlineExercise = (exId, field, value) => {
    setDraft((prev) => ({
      ...prev,
      inlineRoutine: {
        ...(prev.inlineRoutine || {}),
        exercises: (prev.inlineRoutine?.exercises || []).map((exercise) => {
          if (exercise.exId !== exId) return exercise;
          if (field === "type") return { ...exercise, type: value };
          return { ...exercise, [field]: Number(value || 0) };
        }),
      },
    }));
  };

  const getSelectableTrainings = (selectedTrainingId = "") => {
    const selected = getTrainingById(trainingCatalog, selectedTrainingId);
    if (!selected) return weekTypeCatalog;
    if (weekTypeCatalog.some((training) => training.id === selected.id)) return weekTypeCatalog;
    return [...weekTypeCatalog, selected];
  };

  const sessionTemplate = (slot, targetSource = { targetGroup: editorWeek.targetGroup || "all" }) => ({
    id: `session_${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    slot,
    trainingId: "",
    name: "",
    description: "",
    ...normalizeSessionTargets(targetSource, editorWeek.targetGroup || "all"),
    zones: emptyZones(),
  });

  const setPrimaryTraining = (slot, trainingId) => {
    const training = getTrainingById(trainingCatalog, trainingId);
    setDraft((prev) => ({
      ...prev,
      sessions: {
        ...(prev.sessions || {}),
        [slot]: training
          ? makeTrainingSelection(
              training,
              slot,
              prev.sessions?.[slot] || { targetGroup: editorWeek.targetGroup || "all" },
              { id: prev.sessions?.[slot]?.id }
            )
          : null,
      },
    }));
  };

  const updatePrimaryField = (slot, field, value) => {
    setDraft((prev) => {
      const current = prev.sessions?.[slot] || sessionTemplate(slot);
      const nextSession = { ...current, [field]: value };
      if (field === "name" || field === "description" || field === "zones") {
        nextSession.trainingId = "";
      }
      const keepSession = String(nextSession.name || "").trim().length > 0 || String(nextSession.trainingId || "").trim().length > 0;
      return {
        ...prev,
        sessions: {
          ...(prev.sessions || {}),
          [slot]: keepSession ? nextSession : null,
        },
      };
    });
  };

  const updatePrimaryZone = (slot, zoneId, value) => {
    setDraft((prev) => {
      const current = prev.sessions?.[slot] || sessionTemplate(slot);
      const nextSession = {
        ...current,
        trainingId: "",
        zones: { ...(current.zones || emptyZones()), [zoneId]: value },
      };
      return {
        ...prev,
        sessions: {
          ...(prev.sessions || {}),
          [slot]: nextSession,
        },
      };
    });
  };

  const setPrimaryTargets = (slot, patch) => {
    setDraft((prev) => ({
      ...(prev || {}),
      sessions: {
        ...((prev && prev.sessions) || {}),
        [slot]: (() => {
          const current = prev?.sessions?.[slot] || sessionTemplate(slot);
          const merged = { ...current, ...patch };
          return {
            ...merged,
            ...normalizeSessionTargets(merged, editorWeek.targetGroup || "all"),
          };
        })(),
      },
    }));
  };

  const addExtraSession = (slot = "am") => {
    setDraft((prev) => ({
      ...prev,
      extraSessions: [
        ...(prev.extraSessions || []),
        {
          id: `extra_${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          slot,
          trainingId: "",
          name: "",
          description: "",
          ...normalizeSessionTargets({ targetGroup: editorWeek.targetGroup || "all" }, editorWeek.targetGroup || "all"),
          zones: emptyZones(),
        },
      ],
    }));
  };

  const updateExtraTraining = (sessionId, trainingId) => {
    const training = getTrainingById(trainingCatalog, trainingId);
    setDraft((prev) => ({
      ...prev,
      extraSessions: (prev.extraSessions || []).map((session) => {
        if (session.id !== sessionId) return session;
        return training
          ? makeTrainingSelection(training, session.slot || "am", session, { id: session.id })
          : { ...session, trainingId: "", name: "", description: "", zones: emptyZones() };
      }),
    }));
  };
  const setExtraTargets = (sessionId, patch) => {
    setDraft((prev) => ({
      ...prev,
      extraSessions: (prev.extraSessions || []).map((session) => (
        session.id === sessionId
          ? (() => {
              const merged = { ...session, ...patch };
              return {
                ...merged,
                ...normalizeSessionTargets(merged, editorWeek.targetGroup || "all"),
              };
            })()
          : session
      )),
    }));
  };

  const updateExtraField = (sessionId, field, value) => {
    setDraft((prev) => ({
      ...prev,
      extraSessions: (prev.extraSessions || []).map((session) => {
        if (session.id !== sessionId) return session;
        if (field === "name" || field === "description") {
          return { ...session, [field]: value, trainingId: "" };
        }
        return { ...session, [field]: value };
      }),
    }));
  };

  const updateExtraZone = (sessionId, zoneId, value) => {
    setDraft((prev) => ({
      ...prev,
      extraSessions: (prev.extraSessions || []).map((session) => (
        session.id === sessionId
          ? { ...session, trainingId: "", zones: { ...(session.zones || emptyZones()), [zoneId]: value } }
          : session
      )),
    }));
  };

  const removeExtraSession = (sessionId) => {
    setDraft((prev) => ({
      ...prev,
      extraSessions: (prev.extraSessions || []).filter((session) => session.id !== sessionId),
    }));
  };

  const normalizedExerciseSearch = exerciseSearch.trim().toLowerCase();
  const filteredExerciseOptions = allExercises.filter((exercise) => {
    if (!normalizedExerciseSearch) return true;
    return (
      String(exercise.name || "").toLowerCase().includes(normalizedExerciseSearch) ||
      String(exercise.muscles || "").toLowerCase().includes(normalizedExerciseSearch) ||
      String(exercise.category || "").toLowerCase().includes(normalizedExerciseSearch)
    );
  });

  useEffect(() => {
    if (editing == null) return;
    if (!filteredExerciseOptions.length) {
      if (exercisePicker) setExercisePicker("");
      return;
    }
    if (!filteredExerciseOptions.some((exercise) => exercise.id === exercisePicker)) {
      setExercisePicker(filteredExerciseOptions[0].id);
    }
  }, [editing, exercisePicker, filteredExerciseOptions]);

  const saveEdit = () => {
    if (!canEditWeek || editing == null || !draft) return;
    const days = [...editorWeek.days];
    const mainAm = normalizeTrainingSelection(draft.sessions?.am, "am", editorWeek.targetGroup || "all");
    const mainPm = normalizeTrainingSelection(draft.sessions?.pm, "pm", editorWeek.targetGroup || "all");
    const extras = (draft.extraSessions || [])
      .map((session) => normalizeTrainingSelection(session, session.slot || "am", session.targetGroup || editorWeek.targetGroup || "all"))
      .filter(Boolean);
    const nextDay = {
      ...days[editing],
      sessions: { am: mainAm, pm: mainPm },
      extraSessions: extras,
      am: mainAm?.name || "",
      pm: mainPm?.name || "",
      amZones: safeZones(mainAm?.zones),
      pmZones: safeZones(mainPm?.zones),
      targetGroup: mainAm?.targetGroup || mainPm?.targetGroup || editorWeek.targetGroup || "all",
      gym: !!draft.gym && (draft.inlineRoutine?.exercises || []).length > 0,
    };

    if (nextDay.gym) {
      const inline = sanitizeRoutine({
        id: `inline_${editing}`,
        name: draft.inlineRoutine?.name || `Rutina ${DAYS_FULL[editing]}`,
        targetGroup: draft.inlineRoutine?.targetGroup || nextDay.targetGroup || "all",
        exercises: draft.inlineRoutine?.exercises || [],
      });
      nextDay.gymPlan = { mode:"inline", inline:{ name:inline.name, targetGroup:inline.targetGroup, exercises:inline.exercises } };
      nextDay.gymFocus = inline.exercises.map((exercise) => exercise.exId);
      nextDay.gymTargetGroup = inline.targetGroup;
    } else {
      nextDay.gymPlan = null;
      nextDay.gymFocus = [];
      nextDay.gymTargetGroup = null;
    }

    days[editing] = nextDay;
    const nextWeek = normalizeWeek({ ...editorWeek, days }, routines);
    setEditorWeek(nextWeek);
    setWeek(nextWeek);
    setEditing(null);
    setDraft(null);
  };

  const publishWeek = () => {
    const wasPublished = !!editorWeek.published;
    const previousPublishedWeek = wasPublished ? resolvePublishedWeek(editorWeek, routines) : null;
    const committed = commitPublishedWeek(editorWeek, routines, editorWeek.publishedAt);
    setWeek(committed);
    setEditorWeek(committed);
    if (typeof onPublishWeek === "function") {
      const targetGroups = wasPublished
        ? collectChangedTargetGroups(previousPublishedWeek, committed, routines)
        : collectWeekTargetGroups(committed, routines);
      onPublishWeek({
        weekNumber: normalizeWeekNumber(committed.weekNumber, currentWeekNumber),
        isUpdate: wasPublished,
        targetGroups: Array.from(targetGroups),
      });
    }
  };

  const enableModifyMode = () => {
    const nextWeek = normalizeWeek({ ...editorWeek, isEditingPublished:true }, routines);
    setEditorWeek(nextWeek);
    setWeek(nextWeek);
  };
  const cancelModifyMode = () => {
    const restored = week.publishedVersion
      ? normalizeWeek({
          ...week.publishedVersion,
          published: true,
          publishedAt: week.publishedAt,
          updatedAt: week.updatedAt,
          isEditingPublished: false,
          publishedVersion: week.publishedVersion,
        }, routines)
      : normalizeWeek(week, routines);
    setEditorWeek(restored);
    setWeek(restored);
    setEditing(null);
    setDraft(null);
  };

  const currentGymPlan = draft?.gym
    ? sanitizeRoutine({
        id: "preview",
        name: draft.inlineRoutine?.name || "Rutina",
        targetGroup: draft.inlineRoutine?.targetGroup || "all",
        exercises: draft.inlineRoutine?.exercises || [],
      })
    : null;

  const renderTrainingSummary = (session, accent = "var(--or)") => {
    if (!session) return null;
    return (
      <div className="card card-sm mt3">
        <div className="flex ic jb mb3">
          <div style={{fontWeight:700,fontSize:13}}>{session.name}</div>
          <span className={`badge ${groupBadge(session.targetGroup)}`}>{getTargetLabel(session, athleteLookup)}</span>
        </div>
        {session.description && <div className="text-sm text-mu">{session.description}</div>}
        {zonesTotal(session.zones) > 0 && (
          <div className="zone-total-row mt3">
            {ZONES.filter((zone) => Number(session.zones?.[zone.id] || 0) > 0).map((zone) => (
              <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                <span className="zone-dot" style={{background:zone.color}} />
                {zone.short} {Number(session.zones[zone.id]).toFixed(1)}km
              </span>
            ))}
            <span style={{fontSize:11,color:accent,fontWeight:700}}>{zonesTotal(session.zones).toFixed(1)} km</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">PLAN <span>SEMANAL</span></div>
            <div className="ph-sub">Crea y publica la semana. Si ya está publicada, entra en modo consulta o modifica y guarda cambios.</div>
          </div>
          <div className="flex ic g2r" style={{flexWrap:"wrap",justifyContent:"flex-end"}}>
            <span className={`badge ${editorWeek.published ? "b-gr" : "b-re"}`} style={{fontSize:12,padding:"6px 12px"}}>
              {editorWeek.published ? "Publicada" : "Sin publicar"}
            </span>
            {editorWeek.publishedAt && (
              <span className="badge b-mu" style={{fontSize:12,padding:"6px 12px"}}>
                {new Date(editorWeek.publishedAt).toLocaleDateString("es-ES")}
              </span>
            )}
            {!editorWeek.published && <button className="btn btn-or" onClick={publishWeek}>Publicar</button>}
            {editorWeek.published && !canEditWeek && <button className="btn btn-or" onClick={enableModifyMode}>Modificar</button>}
            {editorWeek.published && canEditWeek && (
              <>
                <button className="btn btn-ghost" onClick={cancelModifyMode}>Cancelar</button>
                <button className="btn btn-or" onClick={publishWeek}>Guardar cambios</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="wt-banner mb6" style={{gap:14}}>
        <button className="btn btn-ghost btn-sm" onClick={() => moveWeek(-1)}>← Semana anterior</button>
        <div>
          <div className="wt-label">Semana</div>
          <div className="wt-val">Semana {currentWeekNumber}</div>
        </div>
        <div style={{marginLeft:"auto"}}>
          <div className="wt-label">Tipo de semana</div>
          <div className="flex ic g2r">
            <div className="wt-val" style={{fontSize:24}}>{editorWeek.type}</div>
            <select className="select" value={editorWeek.type} onChange={(e) => patchEditorWeek((prev) => ({ ...prev, type:e.target.value }))} disabled={!canEditWeek} style={{minWidth:180}}>
              {WEEK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => moveWeek(1)}>Semana siguiente →</button>
      </div>

      <div className="week-grid">
        {DAYS_FULL.map((day, index) => {
          const currentDay = editorWeek.days[index];
          const dayZones = dayZoneSummary(currentDay, editorWeek);
          const gymPlan = getDayResolvedGymPlan(currentDay, routines);
          const amSessions = getSlotSessions(currentDay, "am", editorWeek);
          const pmSessions = getSlotSessions(currentDay, "pm", editorWeek);
          const isToday = index === todayIdx();
          return (
            <div key={day} className={`day-col ${isToday ? "today" : ""}`}>
              <div className="day-hdr">
                <div className="day-name">{DAYS_SHORT[index]}</div>
                <div className="day-date" style={{color:isToday ? "var(--or)" : "var(--mu)"}}>
                  {isToday ? "HOY" : getDayAudienceLabel(editorWeek, currentDay)}
                </div>
              </div>
              <div className="day-body">
                {amSessions.map((session, sessionIndex) => (
                  <div key={session.id || `${session.name}_${sessionIndex}`} className="session">
                    <div className="sess-lbl">{sessionIndex === 0 ? "🌅 AM" : "➕ Extra AM"} · {getTargetLabel(session, athleteLookup)}</div>
                    <div className="sess-txt">{session.name}</div>
                  </div>
                ))}
                {pmSessions.map((session, sessionIndex) => (
                  <div key={session.id || `${session.name}_${sessionIndex}`} className="session pm">
                    <div className="sess-lbl">{sessionIndex === 0 ? "🌆 PM" : "➕ Extra PM"} · {getTargetLabel(session, athleteLookup)}</div>
                    <div className="sess-txt">{session.name}</div>
                  </div>
                ))}
                {currentDay.gym && (
                  <div className="session gym">
                    <div className="sess-lbl">🏋️ Rutina · {groupLabel(gymPlan?.targetGroup || currentDay.gymTargetGroup || "all")}</div>
                    <div className="sess-txt">{gymPlan?.name || "Rutina"} · {getDayGymCount(currentDay, routines)} ejercicios</div>
                  </div>
                )}
                {!amSessions.length && !pmSessions.length && !currentDay.gym && <div style={{fontSize:11,color:"var(--mu)",textAlign:"center",padding:"8px 0"}}>Descanso</div>}
                {dayZones.total > 0 && (
                  <div className="zone-total-row" style={{marginTop:6}}>
                    {ZONES.filter((zone) => dayZones[zone.id] > 0).map((zone) => (
                      <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                        <span className="zone-dot" style={{background:zone.color}} />
                        {zone.short} {Number(dayZones[zone.id]).toFixed(1)}
                      </span>
                    ))}
                    <span style={{fontSize:10,color:"var(--mu)",fontWeight:700}}>= {dayZones.total.toFixed(1)}km</span>
                  </div>
                )}
                <button className="btn btn-ghost btn-sm mt3" style={{width:"100%",fontSize:11}} onClick={() => openEdit(index)}>
                  {canEditWeek ? "✏️ Editar" : "👁️ Ver"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing !== null && draft && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <div className="flex ic jb mb4">
              <div className="modal-title">{canEditWeek ? "✏️" : "👁️"} {DAYS_FULL[editing]}</div>
              <button className="modal-close" onClick={() => { setEditing(null); setDraft(null); }}>✕ Cerrar</button>
            </div>

            <div className="g2">
              {["am", "pm"].map((slot) => {
                const session = draft.sessions?.[slot];
                const accent = slot === "am" ? "var(--or)" : "var(--bl)";
                return (
                  <div key={slot} className="card card-sm">
                    <div className="form-group">
                      <label className="form-label">{slot === "am" ? "🌅 Entreno principal AM" : "🌆 Entreno principal PM"}</label>
                      <select className="select" value={session?.trainingId || ""} onChange={(e) => setPrimaryTraining(slot, e.target.value)} disabled={!canEditWeek}>
                        <option value="">Escribir manualmente</option>
                        {getSelectableTrainings(session?.trainingId || "").map((training) => <option key={training.id} value={training.id}>{training.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Entreno manual</label>
                      <input
                        className="input"
                        value={session?.name || ""}
                        onChange={(e) => updatePrimaryField(slot, "name", e.target.value)}
                        placeholder="Escribe el entreno o selecciona del dataset"
                        disabled={!canEditWeek}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Descripción (opcional)</label>
                      <input
                        className="input"
                        value={session?.description || ""}
                        onChange={(e) => updatePrimaryField(slot, "description", e.target.value)}
                        placeholder="Notas del entreno"
                        disabled={!canEditWeek}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Destinatarios</label>
                      <div className="g2">
                        <label className="multi-option" style={{border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
                          <input
                            type="checkbox"
                            checked={!!session?.targetAll}
                            onChange={(e) => setPrimaryTargets(slot, { targetAll: e.target.checked })}
                            disabled={!canEditWeek}
                          />
                          <span className="multi-option-label">Todos</span>
                        </label>
                        <MultiSelect
                          options={targetGroups}
                          values={session?.targetGroups || []}
                          onChange={(nextGroups) => setPrimaryTargets(slot, { targetGroups: nextGroups })}
                          placeholder="Grupos"
                          disabled={!canEditWeek}
                        />
                        <MultiSelectList
                          options={athleteOptions}
                          values={session?.targetAthleteIds || []}
                          onChange={(nextAthletes) => setPrimaryTargets(slot, { targetAthleteIds: nextAthletes })}
                          placeholder="Atletas específicos"
                          searchPlaceholder="Buscar atleta..."
                          disabled={!canEditWeek}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Kms por zona</label>
                      <div className="zone-inputs">
                        {ZONES.map((zone) => (
                          <div key={`${slot}_${zone.id}`} className="zone-input-wrap">
                            <div className="zone-input-label">
                              <span className="zone-dot" style={{background:zone.color}} />
                              {zone.short}
                            </div>
                            <input
                              type="number"
                              className="input"
                              min={0}
                              step={0.5}
                              value={session?.zones?.[zone.id] || ""}
                              onChange={(e) => updatePrimaryZone(slot, zone.id, e.target.value)}
                              disabled={!canEditWeek}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    {renderTrainingSummary(session, accent)}
                  </div>
                );
              })}
            </div>

            <div className="card card-sm mt4">
              <div className="flex ic jb mb3">
                <div>
                  <div className="fw7" style={{fontSize:16}}>Entrenos extra</div>
                  <div className="text-sm text-mu">Añade sesiones extra AM/PM para grupos, atletas específicos o combinaciones.</div>
                </div>
                {canEditWeek && (
                  <div className="flex ic g2r">
                    <button className="btn btn-ghost btn-sm" onClick={() => addExtraSession("am")}>+ Extra AM</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => addExtraSession("pm")}>+ Extra PM</button>
                  </div>
                )}
              </div>

              {(draft.extraSessions || []).length === 0 && <div className="text-sm text-mu">No hay entrenos extra para este día.</div>}

              {(draft.extraSessions || []).map((session) => (
                <div key={session.id} className="card card-sm mt3" style={{background:"var(--s2)"}}>
                  <div className="g2">
                    <div className="form-group">
                      <label className="form-label">Franja</label>
                      <select className="select" value={session.slot || "am"} onChange={(e) => updateExtraField(session.id, "slot", e.target.value)} disabled={!canEditWeek}>
                        <option value="am">Mañana</option>
                        <option value="pm">Tarde</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Entreno desde dataset</label>
                      <select className="select" value={session.trainingId || ""} onChange={(e) => updateExtraTraining(session.id, e.target.value)} disabled={!canEditWeek}>
                        <option value="">Escribir manualmente</option>
                        {getSelectableTrainings(session.trainingId || "").map((training) => <option key={training.id} value={training.id}>{training.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="g2">
                    <div className="form-group">
                      <label className="form-label">Entreno manual</label>
                      <input
                        className="input"
                        value={session.name || ""}
                        onChange={(e) => updateExtraField(session.id, "name", e.target.value)}
                        placeholder="Escribe el entreno para esta franja"
                        disabled={!canEditWeek}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Descripción (opcional)</label>
                      <input
                        className="input"
                        value={session.description || ""}
                        onChange={(e) => updateExtraField(session.id, "description", e.target.value)}
                        placeholder="Notas del entreno"
                        disabled={!canEditWeek}
                      />
                    </div>
                  </div>
                  <div className="g2">
                    <div className="form-group">
                      <label className="form-label">Destinatarios</label>
                      <div className="g2">
                        <label className="multi-option" style={{border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
                          <input
                            type="checkbox"
                            checked={!!session?.targetAll}
                            onChange={(e) => setExtraTargets(session.id, { targetAll: e.target.checked })}
                            disabled={!canEditWeek}
                          />
                          <span className="multi-option-label">Todos</span>
                        </label>
                        <MultiSelect
                          options={targetGroups}
                          values={session?.targetGroups || []}
                          onChange={(nextGroups) => setExtraTargets(session.id, { targetGroups: nextGroups })}
                          placeholder="Grupos"
                          disabled={!canEditWeek}
                        />
                        <MultiSelectList
                          options={athleteOptions}
                          values={session?.targetAthleteIds || []}
                          onChange={(nextAthletes) => setExtraTargets(session.id, { targetAthleteIds: nextAthletes })}
                          placeholder="Atletas específicos"
                          searchPlaceholder="Buscar atleta..."
                          disabled={!canEditWeek}
                        />
                      </div>
                    </div>
                    {canEditWeek && (
                      <div className="form-group" style={{display:"flex",alignItems:"flex-end"}}>
                        <button className="btn btn-danger btn-sm" style={{width:"100%"}} onClick={() => removeExtraSession(session.id)}>Eliminar extra</button>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Kms por zona</label>
                    <div className="zone-inputs">
                      {ZONES.map((zone) => (
                        <div key={`${session.id}_${zone.id}`} className="zone-input-wrap">
                          <div className="zone-input-label">
                            <span className="zone-dot" style={{background:zone.color}} />
                            {zone.short}
                          </div>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            step={0.5}
                            value={session?.zones?.[zone.id] || ""}
                            onChange={(e) => updateExtraZone(session.id, zone.id, e.target.value)}
                            disabled={!canEditWeek}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {renderTrainingSummary(session, session.slot === "am" ? "var(--or)" : "var(--bl)")}
                </div>
              ))}
            </div>

            <div className="card card-sm mt4">
              <div className="flex ic jb mb3">
                <div>
                  <div className="fw7" style={{fontSize:16}}>Rutina del día</div>
                  <div className="text-sm text-mu">La rutina se crea inline aquí mismo. No se guarda en una biblioteca global.</div>
                </div>
                <div className="flex ic g2r">
                  <button className={`btn btn-sm ${draft.gym ? "btn-or" : "btn-ghost"}`} onClick={() => canEditWeek && setDraft({ ...draft, gym:true })}>Sí</button>
                  <button className={`btn btn-sm ${!draft.gym ? "btn-danger" : "btn-ghost"}`} onClick={() => canEditWeek && setDraft({ ...draft, gym:false })}>No</button>
                </div>
              </div>

              {draft.gym && (
                <>
                  <div className="g2">
                    <div className="form-group">
                      <label className="form-label">Nombre de rutina</label>
                      <input className="input" value={draft.inlineRoutine?.name || ""} onChange={(e) => setDraft({ ...draft, inlineRoutine:{ ...(draft.inlineRoutine || {}), name:e.target.value } })} disabled={!canEditWeek} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Grupo</label>
                      <select className="select" value={draft.inlineRoutine?.targetGroup || "all"} onChange={(e) => setDraft({ ...draft, inlineRoutine:{ ...(draft.inlineRoutine || {}), targetGroup:e.target.value } })} disabled={!canEditWeek}>
                        {targetGroupsWithAll.map((group) => <option key={group} value={group}>{groupLabel(group)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ejercicios</label>
                    <div className="g2">
                      <input
                        className="input"
                        value={exerciseSearch}
                        onChange={(e) => setExerciseSearch(e.target.value)}
                        placeholder="Buscar ejercicio..."
                        disabled={!canEditWeek}
                      />
                      <div className="flex ic g2r">
                        <select
                          className="select"
                          value={exercisePicker}
                          onChange={(e) => setExercisePicker(e.target.value)}
                          disabled={!canEditWeek || !filteredExerciseOptions.length}
                          style={{flex:1}}
                        >
                          {!filteredExerciseOptions.length && <option value="">Sin resultados</option>}
                          {filteredExerciseOptions.map((exercise) => (
                            <option key={exercise.id} value={exercise.id}>
                              {exercise.emoji} {exercise.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-or btn-sm"
                          onClick={() => addInlineExercise(exercisePicker)}
                          disabled={!canEditWeek || !exercisePicker}
                        >
                          Añadir
                        </button>
                      </div>
                    </div>
                  </div>

                  {(draft.inlineRoutine?.exercises || []).length > 0 && (
                    <div className="card card-sm">
                      {(draft.inlineRoutine?.exercises || []).map((row) => {
                        const exercise = allExercises.find((item) => item.id === row.exId) || getExerciseByIdFull(row.exId, customExercises, exerciseImages);
                        const exType = normalizeExerciseType(row.type || exercise.type || "weight");
                        return (
                          <div key={row.exId} className="inline-routine-row" style={{display:"grid",gridTemplateColumns:"42px 1fr 100px 80px 80px 80px auto",gap:8,alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                            <div className="ex-emoji">{exercise.emoji || "🏋️"}</div>
                            <div>
                              <div className="ex-info-name">{exercise.name}</div>
                              <div className="ex-info-mu">{exercise.muscles}</div>
                            </div>
                            <select className="select" value={exType} onChange={(e) => updateInlineExercise(row.exId, "type", e.target.value)} disabled={!canEditWeek}>
                              <option value="weight">Peso</option>
                              <option value="reps">Repeticiones</option>
                              <option value="time_reps">Tiempo x Repeticiones</option>
                            </select>
                            <input type="number" min={1} max={10} className="input" value={row.sets} onChange={(e) => updateInlineExercise(row.exId, "sets", e.target.value)} disabled={!canEditWeek} />
                            <input type="number" min={1} max={40} className="input" value={row.reps} onChange={(e) => updateInlineExercise(row.exId, "reps", e.target.value)} disabled={!canEditWeek} title="Repeticiones" />
                            {exType === "weight"
                              ? <input type="number" min={0} max={200} className="input" value={row.pct} onChange={(e) => updateInlineExercise(row.exId, "pct", e.target.value)} disabled={!canEditWeek} title="% de peso" />
                              : exType === "time_reps"
                                ? <input type="number" min={3} max={120} className="input" value={row.duration || 20} onChange={(e) => updateInlineExercise(row.exId, "duration", e.target.value)} disabled={!canEditWeek} title="Tiempo (segundos)" />
                                : <div style={{textAlign:"center"}}><span className="badge b-bl">Reps</span></div>}
                            {canEditWeek ? <button className="btn btn-danger btn-sm" onClick={() => removeInlineExercise(row.exId)}>✕</button> : <div />}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {currentGymPlan && (
                    <div className="card card-sm mt3">
                      <div className="flex ic jb mb3">
                        <div className="fw7">Resumen rutina</div>
                        <span className="badge b-pu">{(currentGymPlan.exercises || []).length} ejercicios</span>
                      </div>
                      <div className="text-sm text-mu">{currentGymPlan.name} · {groupLabel(currentGymPlan.targetGroup || "all")}</div>
                    </div>
                  )}
                </>
              )}
            </div>

            {canEditWeek && <button className="btn btn-or mt4" style={{width:"100%"}} onClick={saveEdit}>Guardar día</button>}
          </div>
        </div>
      )}

    </div>
  );
}

function CoachTrainingsDataset({ trainings, setTrainings }) {
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingDraft, setTrainingDraft] = useState(buildEmptyTrainingForm());
  const [datasetFilters, setDatasetFilters] = useState({
    weekType:"all",
    kmType:"all",
    minKm:"",
    maxKm:"",
    minKmType:"",
    maxKmType:"",
  });
  const [trainingDetailId, setTrainingDetailId] = useState(null);
  const [trainingDetailDraft, setTrainingDetailDraft] = useState(null);
  const [trainingDetailEditing, setTrainingDetailEditing] = useState(false);
  const trainingCatalog = normalizeTrainingCatalog(trainings);

  useEffect(() => {
    if (!trainingDetailId) return;
    const exists = trainingCatalog.some((training) => training.id === trainingDetailId);
    if (!exists) {
      setTrainingDetailId(null);
      setTrainingDetailDraft(null);
      setTrainingDetailEditing(false);
    }
  }, [trainingCatalog, trainingDetailId]);

  const toggleDraftWeekType = (type) => {
    setTrainingDraft((prev) => {
      const current = normalizeTrainingWeekTypes(prev.weekTypes);
      const next = current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type];
      return { ...prev, weekTypes: next.length ? next : [type] };
    });
  };

  const saveTraining = () => {
    if (!trainingDraft.name.trim()) return;
    const nextTraining = normalizeTraining({
      id: `custom_training_${Date.now()}`,
      name: trainingDraft.name,
      description: trainingDraft.description,
      zones: trainingDraft.zones,
      weekTypes: trainingDraft.weekTypes,
      source: "custom",
    });
    setTrainings((prev) => [...normalizeTrainingCatalog(prev), nextTraining]);
    setTrainingDraft(buildEmptyTrainingForm());
    setShowTrainingForm(false);
  };

  const openTrainingDetail = (training) => {
    setTrainingDetailId(training.id);
    setTrainingDetailDraft({
      id: training.id,
      name: training.name,
      description: training.description || "",
      zones: safeZones(training.zones),
      weekTypes: normalizeTrainingWeekTypes(training.weekTypes),
      source: training.source || "dataset",
    });
    setTrainingDetailEditing(false);
  };

  const closeTrainingDetail = () => {
    setTrainingDetailId(null);
    setTrainingDetailDraft(null);
    setTrainingDetailEditing(false);
  };

  const toggleDetailWeekType = (type) => {
    setTrainingDetailDraft((prev) => {
      const current = normalizeTrainingWeekTypes(prev?.weekTypes);
      const next = current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type];
      return { ...prev, weekTypes: next.length ? next : [type] };
    });
  };

  const saveTrainingDetail = () => {
    if (!trainingDetailDraft?.name?.trim()) return;
    const normalized = normalizeTraining(trainingDetailDraft);
    setTrainings((prev) => normalizeTrainingCatalog(prev).map((training) => (
      training.id === normalized.id ? normalized : training
    )));
    setTrainingDetailDraft(normalized);
    setTrainingDetailEditing(false);
  };

  const deleteTraining = (trainingId) => {
    setTrainings((prev) => normalizeTrainingCatalog(prev).filter((training) => training.id !== trainingId));
    if (trainingDetailId === trainingId) closeTrainingDetail();
  };

  const selectedTraining = trainingDetailId ? getTrainingById(trainingCatalog, trainingDetailId) : null;
  const minKm = datasetFilters.minKm === "" ? null : Number(datasetFilters.minKm);
  const maxKm = datasetFilters.maxKm === "" ? null : Number(datasetFilters.maxKm);
  const minKmType = datasetFilters.minKmType === "" ? null : Number(datasetFilters.minKmType);
  const maxKmType = datasetFilters.maxKmType === "" ? null : Number(datasetFilters.maxKmType);
  const filteredTrainingCatalog = trainingCatalog.filter((training) => {
    const weekTypes = normalizeTrainingWeekTypes(training.weekTypes);
    if (datasetFilters.weekType !== "all" && !weekTypes.includes(normalizeWeekType(datasetFilters.weekType))) return false;
    const totalKm = zonesTotal(training.zones);
    if (minKm != null && Number.isFinite(minKm) && totalKm < minKm) return false;
    if (maxKm != null && Number.isFinite(maxKm) && totalKm > maxKm) return false;
    if (datasetFilters.kmType !== "all") {
      const zoneKm = Number(training.zones?.[datasetFilters.kmType] || 0);
      const hasTypeRange =
        (minKmType != null && Number.isFinite(minKmType)) ||
        (maxKmType != null && Number.isFinite(maxKmType));
      if (!hasTypeRange && zoneKm <= 0) return false;
      if (minKmType != null && Number.isFinite(minKmType) && zoneKm < minKmType) return false;
      if (maxKmType != null && Number.isFinite(maxKmType) && zoneKm > maxKmType) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">DATASET <span>ENTRENOS</span></div>
            <div className="ph-sub">Listado compacto, filtros por tipo/kms/desagregado y edición con guardado.</div>
          </div>
          <div className="flex ic g2r">
            <button className="btn btn-or btn-sm" onClick={() => setShowTrainingForm((prev) => !prev)}>
              {showTrainingForm ? "Cerrar creador" : "+ Crear entreno"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {showTrainingForm && (
          <div className="card card-sm mb4">
            <div className="g2">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="input" value={trainingDraft.name} onChange={(e) => setTrainingDraft({ ...trainingDraft, name:e.target.value })} placeholder="Ej: Series 6x300 a ritmo 1500" />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input className="input" value={trainingDraft.description} onChange={(e) => setTrainingDraft({ ...trainingDraft, description:e.target.value })} placeholder="Notas del entreno" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipos de semana</label>
              <div className="flex ic g2r" style={{flexWrap:"wrap"}}>
                {WEEK_TYPES.map((type) => {
                  const active = normalizeTrainingWeekTypes(trainingDraft.weekTypes).includes(type);
                  return (
                    <button key={type} type="button" className={`btn btn-sm ${active ? "btn-or" : "btn-ghost"}`} onClick={() => toggleDraftWeekType(type)}>
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Kilómetros por zona</label>
              <div className="zone-inputs">
                {ZONES.map((zone) => (
                  <div key={zone.id} className="zone-input-wrap">
                    <div className="zone-input-label">
                      <span className="zone-dot" style={{background:zone.color}} />
                      {zone.short}
                    </div>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      step={0.5}
                      value={trainingDraft.zones?.[zone.id] || ""}
                      onChange={(e) => setTrainingDraft({ ...trainingDraft, zones:{ ...(trainingDraft.zones || emptyZones()), [zone.id]:e.target.value } })}
                      placeholder="0"
                      style={{padding:"6px 8px"}}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex ic jb">
              <div className="text-sm text-mu">Total: <strong style={{color:"var(--or)"}}>{zonesTotal(trainingDraft.zones).toFixed(1)} km</strong></div>
              <div className="flex ic g2r">
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowTrainingForm(false); setTrainingDraft(buildEmptyTrainingForm()); }}>Cancelar</button>
                <button className="btn btn-or btn-sm" onClick={saveTraining}>Guardar entreno</button>
              </div>
            </div>
          </div>
        )}

        <div className="g2 mb4">
          <div className="form-group">
            <label className="form-label">Filtro tipo semana</label>
            <select className="select" value={datasetFilters.weekType} onChange={(e) => setDatasetFilters((prev) => ({ ...prev, weekType:e.target.value }))}>
              <option value="all">Todos</option>
              {WEEK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Filtro tipo de kms</label>
            <select className="select" value={datasetFilters.kmType} onChange={(e) => setDatasetFilters((prev) => ({ ...prev, kmType:e.target.value }))}>
              <option value="all">Todos</option>
              {ZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.short}</option>)}
            </select>
          </div>
        </div>

        <div className="g2 mb4">
          <div className="form-group">
            <label className="form-label">Kms mínimos</label>
            <input className="input" type="number" min={0} step={0.5} value={datasetFilters.minKm} onChange={(e) => setDatasetFilters((prev) => ({ ...prev, minKm:e.target.value }))} placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Kms máximos</label>
            <input className="input" type="number" min={0} step={0.5} value={datasetFilters.maxKm} onChange={(e) => setDatasetFilters((prev) => ({ ...prev, maxKm:e.target.value }))} placeholder="Sin límite" />
          </div>
        </div>

        <div className="g2 mb4">
          <div className="form-group">
            <label className="form-label">Min km del tipo seleccionado</label>
            <input
              className="input"
              type="number"
              min={0}
              step={0.5}
              value={datasetFilters.minKmType}
              onChange={(e) => setDatasetFilters((prev) => ({ ...prev, minKmType:e.target.value }))}
              placeholder={datasetFilters.kmType === "all" ? "Selecciona tipo kms" : "0"}
              disabled={datasetFilters.kmType === "all"}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Max km del tipo seleccionado</label>
            <input
              className="input"
              type="number"
              min={0}
              step={0.5}
              value={datasetFilters.maxKmType}
              onChange={(e) => setDatasetFilters((prev) => ({ ...prev, maxKmType:e.target.value }))}
              placeholder={datasetFilters.kmType === "all" ? "Selecciona tipo kms" : "Sin límite"}
              disabled={datasetFilters.kmType === "all"}
            />
          </div>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th>Entreno</th>
              <th>Tipo semana</th>
              <th>Kms</th>
              <th>Tipos kms</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrainingCatalog.map((training) => (
              <tr key={training.id} style={{cursor:"pointer"}} onClick={() => openTrainingDetail(training)}>
                <td>
                  <div style={{fontWeight:700}}>{training.name}</div>
                  {training.description && <div style={{fontSize:11,color:"var(--mu)"}}>{training.description}</div>}
                </td>
                <td style={{fontSize:12}}>{normalizeTrainingWeekTypes(training.weekTypes).join(" · ")}</td>
                <td style={{fontWeight:700}}>{zonesTotal(training.zones).toFixed(1)} km</td>
                <td>
                  <div className="zone-total-row">
                    {ZONES.filter((zone) => Number(training.zones?.[zone.id] || 0) > 0).map((zone) => (
                      <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                        <span className="zone-dot" style={{background:zone.color}} />
                        {zone.short} {Number(training.zones[zone.id]).toFixed(1)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{training.source === "custom" ? <span className="badge b-or">Custom</span> : <span className="badge b-mu">Base</span>}</td>
              </tr>
            ))}
            {filteredTrainingCatalog.length === 0 && (
              <tr>
                <td colSpan={5} style={{textAlign:"center",color:"var(--mu)"}}>No hay entrenos con los filtros seleccionados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {trainingDetailDraft && selectedTraining && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeTrainingDetail()}>
          <div className="modal" style={{maxWidth:760}}>
            <div className="flex ic jb mb4">
              <div className="modal-title">{trainingDetailEditing ? "Editar entreno" : "Detalle entreno"}</div>
              <button className="modal-close" onClick={closeTrainingDetail}>✕ Cerrar</button>
            </div>
            <div className="g2">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="input" value={trainingDetailDraft.name} onChange={(e) => setTrainingDetailDraft((prev) => ({ ...prev, name:e.target.value }))} disabled={!trainingDetailEditing} />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input className="input" value={trainingDetailDraft.description} onChange={(e) => setTrainingDetailDraft((prev) => ({ ...prev, description:e.target.value }))} disabled={!trainingDetailEditing} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipos de semana</label>
              <div className="flex ic g2r" style={{flexWrap:"wrap"}}>
                {WEEK_TYPES.map((type) => {
                  const active = normalizeTrainingWeekTypes(trainingDetailDraft.weekTypes).includes(type);
                  return (
                    <button key={type} type="button" className={`btn btn-sm ${active ? "btn-or" : "btn-ghost"}`} onClick={() => trainingDetailEditing && toggleDetailWeekType(type)} disabled={!trainingDetailEditing}>
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Kilómetros por zona</label>
              <div className="zone-inputs">
                {ZONES.map((zone) => (
                  <div key={zone.id} className="zone-input-wrap">
                    <div className="zone-input-label">
                      <span className="zone-dot" style={{background:zone.color}} />
                      {zone.short}
                    </div>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      step={0.5}
                      value={trainingDetailDraft.zones?.[zone.id] || ""}
                      onChange={(e) => setTrainingDetailDraft((prev) => ({ ...prev, zones:{ ...(prev.zones || emptyZones()), [zone.id]:e.target.value } }))}
                      disabled={!trainingDetailEditing}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex ic jb">
              <div className="text-sm text-mu">Total: <strong style={{color:"var(--or)"}}>{zonesTotal(trainingDetailDraft.zones).toFixed(1)} km</strong></div>
              <div className="flex ic g2r">
                {!trainingDetailEditing && <button className="btn btn-ghost btn-sm" onClick={() => setTrainingDetailEditing(true)}>Editar</button>}
                {trainingDetailEditing && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => openTrainingDetail(selectedTraining)}>Cancelar</button>
                    <button className="btn btn-or btn-sm" onClick={saveTrainingDetail}>Guardar</button>
                  </>
                )}
                {selectedTraining.source === "custom" && (
                  <button className="btn btn-danger btn-sm" onClick={() => deleteTraining(selectedTraining.id)}>Eliminar</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COACH: GYM ROUTINES ──────────────────────────────────────────────────────
function CoachGym({ routines, setRoutines, groups, customExercises, setCustomExercises, exerciseImages, setExerciseImages }) {
  const [tab, setTab] = useState("routines"); // "routines" | "library"
  const [selectedId, setSelectedId] = useState(routines?.[0]?.id || null);
  const [newExForm, setNewExForm] = useState(null); // null | draft object
  const [imgUploadTarget, setImgUploadTarget] = useState(null); // exId being edited
  const fileInputRef = useRef(null);
  const groupsWithAll = ["all", ...mergeGroupOptions(GROUPS, groups)];
  const allExercises = getAllExercises(customExercises, exerciseImages);

  useEffect(() => {
    if (!routines?.length) return;
    if (!selectedId || !routines.some(r => r.id === selectedId)) setSelectedId(routines[0].id);
  }, [routines, selectedId]);

  const selected = (routines || []).find(r => r.id === selectedId) || null;

  const patchSelected = (updater) => {
    setRoutines(prev => prev.map(r => r.id === selectedId ? sanitizeRoutine(updater(cloneRoutineDraft(r))) : r));
  };

  const createRoutine = () => {
    const id = `rt_${Date.now()}`;
    setRoutines(prev => [...(prev || []), sanitizeRoutine({ id, name:`Nueva rutina ${new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`, targetGroup:"all", exercises:[{ exId:"sq", ...DEFAULT_EXERCISE_LOAD_PROFILE.sq }] })]);
    setSelectedId(id);
    setTab("routines");
  };

  const deleteRoutine = (id) => {
    setRoutines(prev => (prev || []).filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const toggleExercise = (exId) => {
    if (!selected) return;
    patchSelected(r => {
      const ex = allExercises.find(e => e.id === exId);
      const exists = r.exercises.some(e => e.exId === exId);
      r.exercises = exists
        ? r.exercises.filter(e => e.exId !== exId)
        : [...r.exercises, { exId, name: ex?.name || labelFromExId(exId), ...(EXERCISE_LOAD_PROFILE[exId] || buildExerciseFallbackProfile(normalizeExerciseType(ex?.type || "weight"))) }];
      return r;
    });
  };

  const updateExercise = (exId, field, value) => {
    if (!selected) return;
    patchSelected(r => {
      r.exercises = r.exercises.map(e => e.exId === exId ? { ...e, [field]: field === "type" ? value : Number(value || 0) } : e);
      return r;
    });
  };

  // Image upload
  const handleImageUpload = (exId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      setExerciseImages(prev => ({ ...prev, [exId]: e.target.result }));
      setImgUploadTarget(null);
    };
    reader.readAsDataURL(file);
  };

  // Add new exercise
  const saveNewExercise = () => {
    if (!newExForm?.name?.trim()) return;
    const id = `custom_${Date.now()}`;
    const ex = {
      id,
      name: newExForm.name.trim(),
      emoji: newExForm.emoji || "🏋️",
      muscles: newExForm.muscles || "",
      category: newExForm.category || "custom",
      type: newExForm.type || "weight",
    };
    setCustomExercises(prev => [...(prev || []), ex]);
    if (newExForm.imageFile) {
      const reader = new FileReader();
      reader.onload = e => setExerciseImages(prev => ({ ...prev, [id]: e.target.result }));
      reader.readAsDataURL(newExForm.imageFile);
    }
    setNewExForm(null);
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">DATASET DE <span>EJERCICIOS</span></div>
            <div className="ph-sub">Gestiona ejercicios y crea rutinas asignadas a cada día.</div>
          </div>
          <div className="flex ic g3r">
            <button className="btn btn-ghost" onClick={()=>setTab(tab==="library"?"routines":"library")}>
              {tab==="library" ? "← Rutinas" : "📚 Biblioteca ejercicios"}
            </button>
            {tab==="routines" && <button className="btn btn-or" onClick={createRoutine}>+ Nueva rutina</button>}
            {tab==="library" && <button className="btn btn-or" onClick={()=>setNewExForm({ name:"", emoji:"🏋️", muscles:"", category:"custom", type:"weight", imageFile:null })}>+ Nuevo ejercicio</button>}
          </div>
        </div>
      </div>

      {/* TAB: LIBRARY */}
      {tab === "library" && (
        <div>
          {/* Add exercise modal */}
          {newExForm && (
            <div className="card mb4">
              <div className="flex ic jb mb4">
                <div className="modal-title" style={{fontSize:22}}>➕ Nuevo ejercicio</div>
                <button className="modal-close" onClick={()=>setNewExForm(null)}>✕</button>
              </div>
              <div className="g2">
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input className="input" value={newExForm.name} onChange={e=>setNewExForm({...newExForm,name:e.target.value})} placeholder="Nombre del ejercicio" />
                </div>
                <div className="form-group">
                  <label className="form-label">Emoji</label>
                  <input className="input" value={newExForm.emoji} onChange={e=>setNewExForm({...newExForm,emoji:e.target.value})} style={{width:80}} />
                </div>
                <div className="form-group">
                  <label className="form-label">Músculos</label>
                  <input className="input" value={newExForm.muscles} onChange={e=>setNewExForm({...newExForm,muscles:e.target.value})} placeholder="Ej: Cuádriceps · Glúteos" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="select" value={newExForm.type} onChange={e=>setNewExForm({...newExForm,type:e.target.value})}>
                    <option value="weight">Peso (% 1RM → kg)</option>
                    <option value="reps">Repeticiones (sin peso)</option>
                    <option value="time_reps">Tiempo x Repeticiones</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Imagen (opcional)</label>
                <div className="img-upload-zone" onClick={()=>document.getElementById("new-ex-img").click()}>
                  {newExForm.imageFile
                    ? <div style={{fontSize:13,color:"var(--gr)"}}>✅ {newExForm.imageFile.name}</div>
                    : <div style={{fontSize:13,color:"var(--mu)"}}>📷 Clic para subir imagen</div>}
                </div>
                <input id="new-ex-img" type="file" accept="image/*" style={{display:"none"}} onChange={e=>setNewExForm({...newExForm,imageFile:e.target.files[0]||null})} />
              </div>
              <div className="flex ic g2r">
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setNewExForm(null)}>Cancelar</button>
                <button className="btn btn-or" style={{flex:1}} onClick={saveNewExercise}>Guardar ejercicio</button>
              </div>
            </div>
          )}

          {/* Exercise grid */}
          <div className="ex-lib-grid">
            {allExercises.map(ex => {
              const isCustom = (customExercises||[]).some(c => c.id === ex.id);
              const imgSrc = exerciseImages[ex.id] || ex.imageUrl;
              const isEditing = imgUploadTarget === ex.id;
              return (
                <div key={ex.id} className="ex-lib-card">
                  {imgSrc
                    ? <img src={imgSrc} alt={ex.name} className="ex-lib-img" />
                    : <div className="ex-lib-emoji">{ex.emoji}</div>}
                  <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{ex.name}</div>
                  {ex.muscles && <div style={{fontSize:10,color:"var(--mu)",marginBottom:6}}>{ex.muscles}</div>}
                  <div className="flex ic g2r" style={{flexWrap:"wrap"}}>
                    <span className={`ex-type-badge ex-type-${normalizeExerciseType(ex.type||"weight")}`}>
                      {exerciseTypeBadgeLabel(normalizeExerciseType(ex.type))}
                    </span>
                    {isCustom && <span className="badge b-pu" style={{fontSize:9}}>Custom</span>}
                  </div>
                  {/* Image upload per exercise */}
                  {isEditing ? (
                    <div className="mt3">
                      <input type="file" accept="image/*" style={{fontSize:11,width:"100%"}} onChange={e=>{ if(e.target.files[0]) handleImageUpload(ex.id, e.target.files[0]); }} />
                      <button className="btn btn-ghost btn-sm mt3" style={{width:"100%"}} onClick={()=>setImgUploadTarget(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm mt3" style={{width:"100%",fontSize:11}} onClick={()=>setImgUploadTarget(ex.id)}>
                      {imgSrc ? "🔄 Cambiar imagen" : "📷 Añadir imagen"}
                    </button>
                  )}
                  {isCustom && (
                    <button className="btn btn-danger btn-sm mt3" style={{width:"100%",fontSize:11}}
                      onClick={()=>setCustomExercises(prev=>(prev||[]).filter(c=>c.id!==ex.id))}>
                      Eliminar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: ROUTINES */}
      {tab === "routines" && (
        <div className="g2">
          <div className="card">
            <div className="card-title">📚 Biblioteca de rutinas</div>
            {(routines||[]).length===0 && <div className="text-mu text-sm">No hay rutinas guardadas</div>}
            {(routines||[]).map(rt => (
              <div key={rt.id} style={{
                border:`1px solid ${rt.id===selectedId?"var(--or)":"var(--border)"}`,
                borderRadius:12, padding:"12px 14px", marginBottom:10,
                background: rt.id===selectedId ? "rgba(255,107,26,.08)" : "var(--s2)",
              }}>
                <div className="flex ic jb g2r">
                  <button className="nav-item" style={{margin:0,padding:0,background:"transparent",color:"var(--tx)"}} onClick={()=>setSelectedId(rt.id)}>
                    <span className="ni">🏋️</span><span style={{fontWeight:700}}>{rt.name}</span>
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={()=>deleteRoutine(rt.id)}>Eliminar</button>
                </div>
                <div className="flex ic g2r mt3" style={{flexWrap:"wrap"}}>
                  <span className="badge b-pu">{(rt.exercises||[]).length} ejercicios</span>
                  <span className="badge b-bl">{groupLabel(rt.targetGroup)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">✍️ Editor de rutina</div>
            {!selected && <div className="text-mu text-sm">Selecciona o crea una rutina</div>}

            {selected && (
              <>
                <div className="g2">
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input className="input" value={selected.name} onChange={e=>patchSelected(r=>({...r,name:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Grupo objetivo</label>
                    <select className="select" value={selected.targetGroup||"all"} onChange={e=>patchSelected(r=>({...r,targetGroup:e.target.value}))}>
                      {groupsWithAll.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Añadir ejercicios</label>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {allExercises.map(ex => {
                      const active = selected.exercises.some(e=>e.exId===ex.id);
                      const imgSrc = exerciseImages[ex.id] || ex.imageUrl;
                      return (
                        <button key={ex.id} className={`btn btn-sm ${active?"btn-or":"btn-ghost"}`} onClick={()=>toggleExercise(ex.id)} style={{gap:6}}>
                          {imgSrc ? <img src={imgSrc} alt="" style={{width:18,height:18,borderRadius:3,objectFit:"cover"}} /> : <span>{ex.emoji}</span>}
                          {ex.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  {(selected.exercises||[]).map(row => {
                    const ex = allExercises.find(e=>e.id===row.exId) || { emoji:"🏋️", name:row.exId, muscles:"" };
                    const imgSrc = exerciseImages[row.exId] || row.imageUrl || ex.imageUrl;
                    const exType = normalizeExerciseType(row.type || ex.type || "weight");
                    return (
                      <div key={row.exId} style={{display:"grid",gridTemplateColumns:"52px 1fr auto auto auto auto auto",gap:8,alignItems:"center",padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
                        <div style={{textAlign:"center"}}>
                          {imgSrc
                            ? <img src={imgSrc} alt={ex.name} style={{width:44,height:44,objectFit:"cover",borderRadius:8}} />
                            : <span style={{fontSize:28}}>{ex.emoji}</span>}
                        </div>
                        <div>
                          <div className="ex-info-name">{ex.name}</div>
                          <div className="ex-info-mu">{ex.muscles}</div>
                          <select className="select" value={exType} onChange={e=>updateExercise(row.exId,"type",e.target.value)} style={{marginTop:4,fontSize:11,padding:"2px 6px",height:"auto"}}>
                            <option value="weight">Peso (%1RM)</option>
                            <option value="reps">Repeticiones</option>
                            <option value="time_reps">Tiempo x Repeticiones</option>
                          </select>
                        </div>
                        {/* Series */}
                        <div style={{textAlign:"center"}}>
                          <div className="ex-lbl">Series</div>
                          <input type="number" className="input" style={{width:56,textAlign:"center",padding:"6px 4px"}} value={row.sets} min={1} max={10} onChange={e=>updateExercise(row.exId,"sets",e.target.value)} />
                        </div>
                        {/* Reps */}
                        <div style={{textAlign:"center"}}>
                          <div className="ex-lbl">Reps</div>
                          <input type="number" className="input" style={{width:56,textAlign:"center",padding:"6px 4px"}} value={row.reps} min={1} max={50} onChange={e=>updateExercise(row.exId,"reps",e.target.value)} />
                        </div>
                        {/* Pct (only for weight) */}
                        {exType === "weight" ? (
                          <div style={{textAlign:"center"}}>
                            <div className="ex-lbl">% 1RM</div>
                            <input type="number" className="input" style={{width:64,textAlign:"center",padding:"6px 4px"}} value={row.pct} min={30} max={110} onChange={e=>updateExercise(row.exId,"pct",e.target.value)} />
                          </div>
                        ) : exType === "time_reps" ? (
                          <div style={{textAlign:"center"}}>
                            <div className="ex-lbl">Seg.</div>
                            <input type="number" className="input" style={{width:64,textAlign:"center",padding:"6px 4px"}} value={row.duration||20} min={3} step={1} onChange={e=>updateExercise(row.exId,"duration",e.target.value)} />
                          </div>
                        ) : <div />}
                        {/* Display badge */}
                        <div>
                          {exType === "weight" && <span className="badge b-or">{row.pct}%</span>}
                          {exType === "reps"   && <span className="badge b-bl">SIN PESO</span>}
                          {exType === "time_reps" && <span className="badge b-ya">{row.reps} x {formatExDuration(row.duration)}</span>}
                        </div>
                        <button className="btn btn-danger btn-sm" style={{padding:"4px 8px"}} onClick={()=>toggleExercise(row.exId)}>✕</button>
                      </div>
                    );
                  })}
                </div>

                <div className="divider" />
                <div style={{fontSize:12,color:"var(--mu)"}}>
                  ✅ Las rutinas guardadas se asignan en "Plan Semanal" a cada día. Los pesos se calculan automáticamente por atleta según su 1RM.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CoachGymV2({ customExercises, setCustomExercises, exerciseImages, setExerciseImages }) {
  const [newExForm, setNewExForm] = useState(null);
  const [imgUploadTarget, setImgUploadTarget] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [imageError, setImageError] = useState("");
  const allExercises = getAllExercises(customExercises, exerciseImages);
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredExercises = allExercises.filter((exercise) => {
    if (!normalizedSearch) return true;
    return (
      String(exercise.name || "").toLowerCase().includes(normalizedSearch) ||
      String(exercise.muscles || "").toLowerCase().includes(normalizedSearch) ||
      String(exercise.category || "").toLowerCase().includes(normalizedSearch) ||
      String(exerciseTypeBadgeLabel(exercise.type || "weight")).toLowerCase().includes(normalizedSearch)
    );
  });

  const handleImageUpload = (exId, file) => {
    if (!file) return;
    if (!isExerciseImageFileAllowed(file)) {
      setImageError("Solo se permiten imágenes SVG, PNG, JPG o JPEG.");
      return;
    }
    setImageError("");
    const reader = new FileReader();
    reader.onload = (event) => {
      setExerciseImages((prev) => ({ ...prev, [exId]: event.target.result }));
      setImgUploadTarget(null);
    };
    reader.readAsDataURL(file);
  };
  const handleNewExerciseImageFile = (file) => {
    if (!file) {
      setImageError("");
      setNewExForm((prev) => prev ? { ...prev, imageFile:null } : prev);
      return;
    }
    if (!isExerciseImageFileAllowed(file)) {
      setImageError("Solo se permiten imágenes SVG, PNG, JPG o JPEG.");
      return;
    }
    setImageError("");
    setNewExForm((prev) => prev ? { ...prev, imageFile:file } : prev);
  };

  const saveNewExercise = () => {
    if (!newExForm?.name?.trim()) return;
    if (newExForm.imageFile && !isExerciseImageFileAllowed(newExForm.imageFile)) {
      setImageError("Solo se permiten imágenes SVG, PNG, JPG o JPEG.");
      return;
    }
    const id = `custom_${Date.now()}`;
    const exercise = {
      id,
      name: newExForm.name.trim(),
      emoji: newExForm.emoji || "🏋️",
      muscles: newExForm.muscles || "",
      category: newExForm.category || "custom",
      type: newExForm.type || "weight",
    };
    setCustomExercises((prev) => [...(prev || []), exercise]);
    if (newExForm.imageFile) {
      const reader = new FileReader();
      reader.onload = (event) => setExerciseImages((prev) => ({ ...prev, [id]: event.target.result }));
      reader.readAsDataURL(newExForm.imageFile);
    }
    setImageError("");
    setNewExForm(null);
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">DATASET DE <span>EJERCICIOS</span></div>
            <div className="ph-sub">Las rutinas se crean dentro de cada día del plan semanal. Aquí gestionas el catálogo completo de ejercicios.</div>
          </div>
          <button className="btn btn-or" onClick={() => { setImageError(""); setNewExForm({ name:"", emoji:"🏋️", muscles:"", category:"custom", type:"weight", imageFile:null }); }}>+ Nuevo ejercicio</button>
        </div>
      </div>

      <div className="card mb6">
        <div className="g3">
          <div className="stat-card">
            <div className="stat-label">Ejercicios totales</div>
            <div className="stat-val">{allExercises.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Propios</div>
            <div className="stat-val">{(customExercises || []).length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Uso</div>
            <div className="stat-change" style={{marginTop:0,color:"var(--tx)"}}>Añádelos desde el editor de cada día al crear la rutina inline</div>
          </div>
        </div>
      </div>
      <div className="card mb4">
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Buscar ejercicio</label>
          <input
            className="input"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Nombre, músculos o tipo…"
          />
        </div>
      </div>
      {imageError && (
        <div className="card mb4" style={{borderColor:"rgba(248,113,113,.45)",background:"rgba(248,113,113,.09)"}}>
          <div className="text-sm" style={{color:"var(--re)"}}>{imageError}</div>
        </div>
      )}

      {newExForm && (
        <div className="card mb4">
          <div className="flex ic jb mb4">
            <div className="modal-title" style={{fontSize:22}}>➕ Nuevo ejercicio</div>
            <button className="modal-close" onClick={() => setNewExForm(null)}>✕</button>
          </div>
          <div className="g2">
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="input" value={newExForm.name} onChange={(e) => setNewExForm({ ...newExForm, name:e.target.value })} placeholder="Nombre del ejercicio" />
            </div>
            <div className="form-group">
              <label className="form-label">Emoji</label>
              <input className="input" value={newExForm.emoji} onChange={(e) => setNewExForm({ ...newExForm, emoji:e.target.value })} style={{width:80}} />
            </div>
            <div className="form-group">
              <label className="form-label">Músculos</label>
              <input className="input" value={newExForm.muscles} onChange={(e) => setNewExForm({ ...newExForm, muscles:e.target.value })} placeholder="Ej: Core · Glúteos" />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="select" value={newExForm.type} onChange={(e) => setNewExForm({ ...newExForm, type:e.target.value })}>
                <option value="weight">Peso</option>
                <option value="reps">Repeticiones</option>
                <option value="time_reps">Tiempo x Repeticiones</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Imagen (opcional)</label>
            <div className="img-upload-zone" onClick={() => document.getElementById("new-ex-img-v2").click()}>
              {newExForm.imageFile ? <div style={{fontSize:13,color:"var(--gr)"}}>✅ {newExForm.imageFile.name}</div> : <div style={{fontSize:13,color:"var(--mu)"}}>📷 Clic para subir imagen</div>}
            </div>
            <input
              id="new-ex-img-v2"
              type="file"
              accept={ALLOWED_EXERCISE_IMAGE_ACCEPT}
              style={{display:"none"}}
              onChange={(e) => handleNewExerciseImageFile(e.target.files[0] || null)}
            />
            <div className="text-sm text-mu mt3">Formatos permitidos: SVG, PNG, JPG, JPEG.</div>
          </div>
          <div className="flex ic g2r">
            <button className="btn btn-ghost" style={{flex:1}} onClick={() => { setImageError(""); setNewExForm(null); }}>Cancelar</button>
            <button className="btn btn-or" style={{flex:1}} onClick={saveNewExercise}>Guardar ejercicio</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex ic jb mb3" style={{paddingBottom:10,borderBottom:"1px solid var(--border)"}}>
          <div className="card-title" style={{margin:0}}>Listado compacto</div>
          <span className="badge b-mu">{filteredExercises.length} ejercicios</span>
        </div>
        {filteredExercises.length === 0 && (
          <div className="text-sm text-mu" style={{padding:"10px 0"}}>No hay ejercicios para ese filtro.</div>
        )}
        {filteredExercises.map((exercise) => {
          const isCustom = (customExercises || []).some((item) => item.id === exercise.id);
          const imgSrc = exerciseImages[exercise.id] || exercise.imageUrl;
          const isEditing = imgUploadTarget === exercise.id;
          return (
            <div key={exercise.id} className="exercise-compact-row" style={{display:"grid",gridTemplateColumns:"44px minmax(180px,1fr) minmax(130px,1fr) auto",gap:10,alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{display:"flex",justifyContent:"center"}}>
                {imgSrc
                  ? <img src={imgSrc} alt={exercise.name} style={{width:34,height:34,objectFit:"cover",borderRadius:8,border:"1px solid var(--border2)"}} />
                  : <span style={{fontSize:22}}>{exercise.emoji}</span>}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>{exercise.name}</div>
                <div className="text-sm text-mu">{exercise.muscles || "Sin grupo muscular"}</div>
              </div>
              <div className="flex ic g2r" style={{flexWrap:"wrap"}}>
                <span className={`ex-type-badge ex-type-${normalizeExerciseType(exercise.type || "weight")}`}>
                  {exerciseTypeBadgeLabel(normalizeExerciseType(exercise.type))}
                </span>
                {isCustom && <span className="badge b-pu">Custom</span>}
              </div>
              <div className="flex ic g2r" style={{justifyContent:"flex-end",flexWrap:"wrap"}}>
                {isEditing ? (
                  <>
                    <input
                      type="file"
                      accept={ALLOWED_EXERCISE_IMAGE_ACCEPT}
                      style={{fontSize:11,maxWidth:230}}
                      onChange={(e) => { if (e.target.files[0]) handleImageUpload(exercise.id, e.target.files[0]); }}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={() => setImgUploadTarget(null)}>Cancelar</button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setImgUploadTarget(exercise.id)}>
                    {imgSrc ? "Cambiar imagen" : "Añadir imagen"}
                  </button>
                )}
                {isCustom && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setCustomExercises((prev) => (prev || []).filter((item) => item.id !== exercise.id))}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COACH: GRUPOS ────────────────────────────────────────────────────────────
function CoachGrupos({ athletes, setAthletes, groups, setGroups }) {
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState("");
  const allGroups = mergeGroupOptions(GROUPS, groups, collectAthleteGroups(athletes));

  const changeGroup = (athId, nextGroup) => {
    setAthletes(athletes.map((a, idx) => a.id===athId ? normalizeAthleteRecord({ ...a, groups:[nextGroup], group:nextGroup }, idx) : normalizeAthleteRecord(a, idx)));
  };

  const createGroup = () => {
    const name = normalizeGroupName(newGroupName);
    if (!name) {
      setError("Escribe un nombre de grupo");
      return;
    }
    if (allGroups.some(g => g.toLowerCase() === name.toLowerCase())) {
      setError("Ese grupo ya existe");
      return;
    }
    setGroups(prev => mergeGroupOptions(prev, [name]));
    setNewGroupName("");
    setError("");
    setCreating(false);
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div><div className="ph-title">GRUPOS <span>DE TRABAJO</span></div><div className="ph-sub">Gestiona grupos base y grupos especiales (lesionados, readaptación, etc.)</div></div>
          <button className="btn btn-or" onClick={()=>{setCreating(true); setError("");}}>+ Nuevo grupo</button>
        </div>
      </div>

      <div className="g3 mb6">
        {allGroups.map(g => {
          const members = athletes.filter(a => athleteBelongsToGroup(a, g));
          return (
            <div key={g} className="card">
              <div className="flex ic jb mb4">
                <div className={`g-tag ${groupClass(g)}`} style={{fontSize:14,padding:"6px 14px"}}>{g}</div>
                <span className="badge b-mu">{members.length} atletas</span>
              </div>
              {members.map(a => (
                <div key={a.id} className="flex ic g3r mb3">
                  <div className="avatar" style={{width:28,height:28,fontSize:10}}>{a.avatar}</div>
                  <div style={{flex:1,fontSize:13,fontWeight:600}}>{a.name}</div>
                </div>
              ))}
              {members.length===0 && <div className="text-mu text-sm">Sin atletas</div>}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">🔁 Asignación de grupo por atleta</div>
        <div className="text-sm text-mu mb3">Puedes mover cualquier atleta entre 1500m, 800m, pequeños o grupos personalizados.</div>
        {athletes.map((a) => (
          <div key={a.id} className="flex ic g3r mb3" style={{alignItems:"center"}}>
            <div className="avatar" style={{width:30,height:30,fontSize:11}}>{a.avatar}</div>
            <div style={{minWidth:180}}>
              <div style={{fontSize:13,fontWeight:700}}>{a.name}</div>
              <div style={{fontSize:11,color:"var(--mu)"}}>{getAthleteGroupsLabel(a)}</div>
            </div>
            <select className="select" value={getAthletePrimaryGroup(a)} onChange={e=>changeGroup(a.id, e.target.value)} style={{maxWidth:220}}>
              {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        ))}
      </div>

      {creating && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setCreating(false)}>
          <div className="modal" style={{width:420}}>
            <div className="flex ic jb mb4">
              <div className="modal-title">Nuevo Grupo</div>
              <button className="modal-close" onClick={()=>setCreating(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del grupo</label>
              <input className="input" value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="Ej: Lesionados, Readaptación, Especial..." />
            </div>
            {error && <div className="text-sm mb3" style={{color:"var(--re)"}}>{error}</div>}
            <div className="flex ic g2r">
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setCreating(false)}>Cancelar</button>
              <button className="btn btn-or" style={{flex:1}} onClick={createGroup}>Crear grupo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COACH: CALENDARIO ────────────────────────────────────────────────────────
function CoachCalendario({ week, routines, history, activeWeekNumber, seasonAnchorDate }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(null); // { dateIso }
  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const todayIso = toIsoDate();
  const currentWeekNumber = normalizeWeekNumber(
    activeWeekNumber,
    week.weekNumber || getTodaySeasonWeekNumber(seasonAnchorDate)
  );
  const publishedWeek = resolvePublishedWeek(week, routines);
  const calendarWeek = publishedWeek || null;
  const weekPlansByDate = DAYS_FULL.reduce((acc, _day, dayIndex) => {
    const dateIso = getDateIsoForWeekDay(currentWeekNumber, dayIndex, seasonAnchorDate);
    acc[dateIso] = calendarWeek ? { dayIndex, dayPlan: calendarWeek.days?.[dayIndex] || {} } : null;
    return acc;
  }, {});
  const weekSummary = calendarWeek ? weekZoneSummary(calendarWeek) : { ...emptyZones(), total:0 };

  const historyByDate = {};
  (history || []).forEach((row) => {
    const key = row?.dateIso;
    if (!key) return;
    if (!historyByDate[key]) historyByDate[key] = [];
    historyByDate[key].push(row);
  });

  const goMonth = (delta) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) { nextMonth = 11; nextYear -= 1; }
    if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const selectedInfo = (() => {
    if (!selected) return null;
    const mapped = weekPlansByDate[selected.dateIso] || null;
    const dayPlan = mapped?.dayPlan || {};
    return {
      dayIndex: mapped?.dayIndex ?? null,
      dayPlan,
      am: mapped ? getSlotSessions(dayPlan, "am", calendarWeek) : [],
      pm: mapped ? getSlotSessions(dayPlan, "pm", calendarWeek) : [],
      gymPlan: mapped ? getDayResolvedGymPlan(dayPlan, routines) : null,
      dayZones: mapped ? dayZoneSummary(dayPlan, calendarWeek) : { ...emptyZones(), total:0 },
      records: historyByDate[selected.dateIso] || [],
    };
  })();

  return (
    <div>
      <div className="ph">
        <div className="ph-title">CALENDARIO <span>COACH</span></div>
        <div className="ph-sub">
          Semana {currentWeekNumber} · {calendarWeek ? "Haz clic en un día para ver entreno, gym, kms y estado." : "La semana aún no está publicada."}
        </div>
      </div>

      <div className="g2" style={{alignItems:"start"}}>
        <div className="card">
          <div className="flex ic jb mb4">
            <button className="btn btn-ghost btn-sm" onClick={() => goMonth(-1)}>← Ant.</button>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:24,fontWeight:700}}>{monthNames[viewMonth]} {viewYear}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => goMonth(1)}>Sig. →</button>
          </div>
          <div className="cal-grid" style={{marginBottom:8}}>
            {DAYS_SHORT.map((d) => <div key={d} style={{textAlign:"center",fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",fontWeight:700,padding:"6px 0"}}>{d}</div>)}
          </div>
          <div className="cal-grid">
            {Array(offset).fill(null).map((_, i) => <div key={`empty_${i}`} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day = i + 1;
              const dateIso = `${String(viewYear).padStart(4, "0")}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateIso === todayIso;
              const mapped = weekPlansByDate[dateIso] || null;
              const dayPlan = mapped?.dayPlan || null;
              const hasTrain = !!dayPlan && !!calendarWeek && (getSlotSessions(dayPlan, "am", calendarWeek).length > 0 || getSlotSessions(dayPlan, "pm", calendarWeek).length > 0);
              const hasGym = !!dayPlan?.gym;
              const records = historyByDate[dateIso] || [];
              const isSelected = selected?.dateIso === dateIso;
              return (
                <div key={day} className={`cal-cell ${hasTrain ? "has-training" : ""} ${isToday ? "today-cell" : ""}`} style={isSelected ? {borderColor:"var(--or)",background:"rgba(255,107,26,.1)"} : {}} onClick={() => setSelected({ dateIso })}>
                  <div className="cal-day-num" style={{color:isToday ? "var(--or)" : "var(--tx)"}}>{day}</div>
                  {records.length > 0 && <span className="cal-dot" style={{background:"var(--gr)"}} />}
                  {!records.length && hasTrain && <span className="cal-dot" style={{background:"var(--or)"}} />}
                  {hasGym && <span className="cal-dot" style={{background:"var(--pu)"}} />}
                </div>
              );
            })}
          </div>
          <div className="divider" />
          <div className="flex ic g4r" style={{flexWrap:"wrap"}}>
            <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--gr)"}} /> Realizado</div>
            <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--or)"}} /> Plan</div>
            <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--pu)"}} /> Gym</div>
          </div>
        </div>

        <div>
          <div className="card mb4">
            <div className="card-title" style={{marginBottom:8}}>Resumen semanal</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:900,color:"var(--or)"}}>{weekSummary.total.toFixed(1)}<span style={{fontSize:16,color:"var(--mu)"}}> km</span></div>
            <div className="zone-total-row mt3">
              {ZONES.map((zone) => (
                <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                  <span className="zone-dot" style={{background:zone.color}} />
                  {zone.short} {Number(weekSummary[zone.id] || 0).toFixed(1)} km
                </span>
              ))}
            </div>
            <div className="mt3" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
              {ZONES.map((zone) => (
                <div key={`wk_${zone.id}`} style={{background:"var(--s2)",border:"1px solid var(--border2)",borderRadius:10,padding:"8px 10px"}}>
                  <div style={{fontSize:10,letterSpacing:1.4,textTransform:"uppercase",color:"var(--mu)",fontWeight:700}}>{zone.short}</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,color:zone.color,lineHeight:1.05}}>
                    {Number(weekSummary[zone.id] || 0).toFixed(1)} <span style={{fontSize:11,color:"var(--mu2)",fontFamily:"'Nunito',sans-serif"}}>km</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!selected && (
            <div className="card" style={{textAlign:"center",padding:34}}>
              <div style={{fontSize:34,marginBottom:8}}>📅</div>
              <div style={{color:"var(--mu)"}}>Selecciona un día para ver el detalle.</div>
            </div>
          )}

          {selected && selectedInfo && (
              <div className="card">
                <div className="flex ic jb mb4">
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900}}>{selectedInfo.dayIndex != null ? DAYS_FULL[selectedInfo.dayIndex] : "Sin planificación"} {selected.dateIso}</div>
                    {selectedInfo.records.length > 0
                      ? <span className="badge b-gr">Realizado · {selectedInfo.records.length} registro(s)</span>
                      : selectedInfo.dayIndex == null
                        ? <span className="badge b-mu">Sin plan semanal</span>
                        : selected.dateIso <= todayIso
                        ? <span className="badge b-re">Sin registro</span>
                        : <span className="badge b-bl">Planificado</span>}
                  </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Cerrar</button>
              </div>
              {selectedInfo.am.map((session, idx) => <div key={session.id || `am_${idx}`} className="session"><div className="sess-lbl">{idx === 0 ? "🌅 AM" : "➕ Extra AM"} · {getTargetLabel(session)}</div><div className="sess-txt">{session.name}</div></div>)}
              {selectedInfo.pm.map((session, idx) => <div key={session.id || `pm_${idx}`} className="session pm"><div className="sess-lbl">{idx === 0 ? "🌆 PM" : "➕ Extra PM"} · {getTargetLabel(session)}</div><div className="sess-txt">{session.name}</div></div>)}
              {selectedInfo.dayPlan?.gym && <div className="session gym"><div className="sess-lbl">🏋️ Gym</div><div className="sess-txt">{selectedInfo.gymPlan?.name || "Rutina"} · {getDayGymCount(selectedInfo.dayPlan, routines)} ejercicios</div></div>}
              {!selectedInfo.am.length && !selectedInfo.pm.length && !selectedInfo.dayPlan?.gym && <div className="text-sm text-mu">Descanso</div>}
              <div className="divider" />
              <div className="card card-sm" style={{background:"var(--s2)"}}>
                <div className="fw7" style={{marginBottom:8}}>Resumen diario de kms</div>
                <div className="zone-total-row">
                  {ZONES.map((zone) => (
                    <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                      <span className="zone-dot" style={{background:zone.color}} />
                      {zone.short} {Number(selectedInfo.dayZones[zone.id] || 0).toFixed(1)} km
                    </span>
                  ))}
                </div>
                <div className="text-sm mt3">Total del día: <strong style={{color:"var(--or)"}}>{selectedInfo.dayZones.total.toFixed(1)} km</strong></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COACH: HISTORIAL ─────────────────────────────────────────────────────────
function CoachHistorial({
  weekPlansByNumber,
  routines,
  history,
  athletes,
  setAthletes,
  groups,
  setGroups,
  onRenameAthlete,
  onDeleteAthlete,
  view = "history",
  seasonAnchorDate,
}) {
  const [openWeekNumber, setOpenWeekNumber] = useState(null);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [newAthleteGroups, setNewAthleteGroups] = useState(["por-asignar"]);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState("");
  const [athleteNameFilter, setAthleteNameFilter] = useState("");
  const [athleteGroupFilter, setAthleteGroupFilter] = useState("all");
  const [athleteError, setAthleteError] = useState("");
  const [editingAthleteId, setEditingAthleteId] = useState(null);
  const [editingMaxW, setEditingMaxW] = useState({});
  const [showBulkWeightEditor, setShowBulkWeightEditor] = useState(false);
  const [bulkWeightDraft, setBulkWeightDraft] = useState({});
  const plans = normalizeWeekPlansByNumber(weekPlansByNumber, routines, seasonAnchorDate);
  const roster = normalizeAthletes(athletes || []);
  const allGroups = mergeGroupOptions(["por-asignar"], groups, collectAthleteGroups(roster));
  const normalizedAthleteNameFilter = String(athleteNameFilter || "").trim().toLowerCase();
  const filteredRoster = roster.filter((athlete) => {
    const matchesGroup = athleteGroupFilter === "all" || athleteBelongsToGroup(athlete, athleteGroupFilter);
    if (!matchesGroup) return false;
    if (!normalizedAthleteNameFilter) return true;
    return String(athlete.name || "").toLowerCase().includes(normalizedAthleteNameFilter);
  });
  const weightExercises = ALL_BUILTIN_GYM_EXERCISES.filter((exercise) => normalizeExerciseType(exercise.type) === "weight");
  const isAthletesView = view === "athletes";
  const publishedWeeks = Object.values(plans)
    .map((week) => normalizeWeek(week, routines))
    .filter((week) => week.published)
    .sort((a, b) => normalizeWeekNumber(b.weekNumber, 0) - normalizeWeekNumber(a.weekNumber, 0));

  useEffect(() => {
    if (openWeekNumber == null) return;
    const exists = publishedWeeks.some((week) => normalizeWeekNumber(week.weekNumber, 0) === openWeekNumber);
    if (!exists) setOpenWeekNumber(null);
  }, [openWeekNumber, publishedWeeks]);

  const historyByDate = {};
  (Array.isArray(history) ? history : []).forEach((row) => {
    const key = row?.dateIso;
    if (!key) return;
    if (!historyByDate[key]) historyByDate[key] = [];
    historyByDate[key].push(row);
  });

  const formatWeekRange = (week) => {
    if (!week?.startDate || !week?.endDate) return "Sin rango de fechas";
    return `${week.startDate} → ${week.endDate}`;
  };
  const parseSelectedGroups = (selectedValues) => {
    const normalized = collectGroupValues(selectedValues);
    return normalized.length ? normalized : ["por-asignar"];
  };
  const handleCreateGroup = () => {
    const name = normalizeGroupName(newGroupName);
    if (!name || name === "all") {
      setGroupError("Escribe un nombre de grupo válido.");
      return;
    }
    const exists = allGroups.some((group) => group.toLowerCase() === name.toLowerCase());
    if (exists) {
      setGroupError("Ese grupo ya existe.");
      return;
    }
    if (typeof setGroups === "function") {
      setGroups((prev) => mergeGroupOptions(prev, [name], ["por-asignar"]));
    }
    setNewGroupName("");
    setGroupError("");
  };
  const handleDeleteGroup = (groupName) => {
    const normalizedGroup = normalizeGroupName(groupName);
    if (!normalizedGroup || normalizedGroup === "por-asignar" || GROUPS.includes(normalizedGroup)) return;
    if (!window.confirm(`¿Eliminar el grupo "${normalizedGroup}"?`)) return;
    if (typeof setGroups === "function") {
      setGroups((prev) => mergeGroupOptions((prev || []).filter((group) => group.toLowerCase() !== normalizedGroup.toLowerCase()), ["por-asignar"]));
    }
    setNewAthleteGroups((prev) => {
      const cleaned = parseSelectedGroups((prev || []).filter((group) => group.toLowerCase() !== normalizedGroup.toLowerCase()));
      return cleaned;
    });
    setAthleteGroupFilter((prev) => (
      String(prev || "").toLowerCase() === normalizedGroup.toLowerCase()
        ? "all"
        : prev
    ));
    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) => {
      const remainingGroups = getAthleteGroups(athlete).filter((group) => group.toLowerCase() !== normalizedGroup.toLowerCase());
      return normalizeAthleteRecord({
        ...athlete,
        group: remainingGroups[0] || "por-asignar",
        groups: remainingGroups.length ? remainingGroups : ["por-asignar"],
      }, idx);
    }));
  };
  const buildBulkWeightDraft = (list) => {
    const draft = {};
    normalizeAthletes(list).forEach((athlete) => {
      draft[athlete.id] = {};
      weightExercises.forEach((exercise) => {
        const value = Number(athlete.maxW?.[exercise.id]);
        draft[athlete.id][exercise.id] = Number.isFinite(value) && value > 0 ? String(value) : "";
      });
    });
    return draft;
  };
  const handleCreateAthlete = () => {
    const name = String(newAthleteName || "").trim();
    if (!name) {
      setAthleteError("Escribe el nombre del atleta.");
      return;
    }
    const exists = roster.some((athlete) => athlete.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      setAthleteError("Ese atleta ya existe.");
      return;
    }
    const groupsForNewAthlete = parseSelectedGroups(newAthleteGroups);
    const created = normalizeAthleteRecord({
      id: `ath_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      group: groupsForNewAthlete[0],
      groups: groupsForNewAthlete,
      avatar: name.split(" ").map((word) => word[0]).join("").toUpperCase().slice(0, 2),
      maxW: {},
      weekKms: [],
      todayDone: false,
    }, roster.length);
    setAthletes((prev) => [...normalizeAthletes(prev), created]);
    setNewAthleteName("");
    setNewAthleteGroups(groupsForNewAthlete);
    setAthleteError("");
  };
  const updateAthleteGroups = (athleteId, selectedValues) => {
    const nextGroups = parseSelectedGroups(selectedValues);
    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) =>
      athlete.id === athleteId
        ? normalizeAthleteRecord({ ...athlete, group:nextGroups[0], groups:nextGroups }, idx)
        : normalizeAthleteRecord(athlete, idx)
    ));
  };
  const renameAthlete = (athlete) => {
    const nextName = window.prompt("Nuevo nombre del atleta", athlete?.name || "");
    if (nextName == null) return;
    const safeName = String(nextName || "").trim();
    if (!safeName) return;
    if (typeof onRenameAthlete === "function") {
      const result = onRenameAthlete(athlete.id, safeName);
      if (result && result.ok === false) {
        setAthleteError(result.error || "No se pudo actualizar el nombre.");
      } else {
        setAthleteError("");
      }
      return;
    }
    setAthletes((prev) => normalizeAthletes(prev).map((item, idx) =>
      item.id === athlete.id
        ? normalizeAthleteRecord({ ...item, name: safeName }, idx)
        : normalizeAthleteRecord(item, idx)
    ));
  };
  const removeAthlete = (athlete) => {
    if (!athlete?.id) return;
    if (!window.confirm(`¿Eliminar al atleta "${athlete.name}"?`)) return;
    if (typeof onDeleteAthlete === "function") onDeleteAthlete(athlete.id);
    else setAthletes((prev) => normalizeAthletes(prev).filter((item) => item.id !== athlete.id));
    if (editingAthleteId === athlete.id) closeWeightEditor();
  };
  const openWeightEditor = (athlete) => {
    setEditingAthleteId(athlete.id);
    setEditingMaxW({ ...(athlete.maxW || {}) });
  };
  const closeWeightEditor = () => {
    setEditingAthleteId(null);
    setEditingMaxW({});
  };
  const saveWeights = () => {
    if (!editingAthleteId) return;
    const cleaned = Object.fromEntries(
      Object.entries(editingMaxW || {})
        .map(([exId, value]) => [exId, Number(value)])
        .filter(([, value]) => Number.isFinite(value) && value > 0)
    );
    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) =>
      athlete.id === editingAthleteId
        ? normalizeAthleteRecord({ ...athlete, maxW: cleaned }, idx)
        : normalizeAthleteRecord(athlete, idx)
    ));
    closeWeightEditor();
  };
  const openBulkWeightEditor = () => {
    setBulkWeightDraft(buildBulkWeightDraft(roster));
    setShowBulkWeightEditor(true);
  };
  const closeBulkWeightEditor = () => {
    setShowBulkWeightEditor(false);
    setBulkWeightDraft({});
  };
  const setBulkWeightCell = (athleteId, exerciseId, value) => {
    setBulkWeightDraft((prev) => ({
      ...prev,
      [athleteId]: {
        ...(prev[athleteId] || {}),
        [exerciseId]: value,
      },
    }));
  };
  const saveBulkWeights = () => {
    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) => {
      const row = bulkWeightDraft[athlete.id] || {};
      const nextMaxW = { ...(athlete.maxW || {}) };
      weightExercises.forEach((exercise) => {
        const rawValue = row[exercise.id];
        const numeric = Number(rawValue);
        if (rawValue == null || rawValue === "" || !Number.isFinite(numeric) || numeric <= 0) {
          delete nextMaxW[exercise.id];
          return;
        }
        nextMaxW[exercise.id] = numeric;
      });
      return normalizeAthleteRecord({ ...athlete, maxW: nextMaxW }, idx);
    }));
    closeBulkWeightEditor();
  };
  const editingAthlete = roster.find((athlete) => athlete.id === editingAthleteId) || null;

  return (
    <div>
      <div className="ph">
        {isAthletesView
          ? <div className="ph-title">GESTIÓN <span>ATLETAS</span></div>
          : <div className="ph-title">HISTORIAL <span>SEMANAL</span></div>}
        <div className="ph-sub">
          {isAthletesView
            ? "Crear/modificar/eliminar atletas, gestionar grupos y editar pesos máximos (solo coach)."
            : "Semanas publicadas en formato compacto. Clic para ver entrenos, gym, kms y estado diario."}
        </div>
      </div>

      {isAthletesView && (
        <div className="card mb4">
          <div className="card-title">👥 Gestión de atletas</div>
          <div className="text-sm text-mu mb3">Solo el entrenador puede crear perfiles, asignar grupos y editar pesos máximos.</div>
          <div className="card card-sm mb3">
            <div className="fw7 mb3">Grupos</div>
            <div className="g2">
              <input
                className="input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nuevo grupo"
              />
              <button className="btn btn-ghost" onClick={handleCreateGroup}>+ Crear grupo</button>
            </div>
            {groupError && <div className="text-sm mt3" style={{color:"var(--re)"}}>{groupError}</div>}
            <div className="flex ic g2r mt3" style={{flexWrap:"wrap"}}>
              {allGroups.map((group) => (
                <div key={`manage_group_${group}`} className="flex ic g2r" style={{background:"var(--s2)",border:"1px solid var(--border)",borderRadius:999,padding:"6px 10px"}}>
                  <span className={`g-tag ${groupClass(group)}`} style={{padding:"4px 10px"}}>{groupLabel(group)}</span>
                  {!GROUPS.includes(group) && group !== "por-asignar" && (
                    <button className="btn btn-danger btn-sm" style={{padding:"4px 10px"}} onClick={() => handleDeleteGroup(group)}>Eliminar</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="g2 mb3">
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Nombre del atleta</label>
              <input
                className="input"
                value={newAthleteName}
                onChange={(e) => setNewAthleteName(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </div>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Grupos (multi-selección)</label>
              <MultiSelect
                options={allGroups}
                values={newAthleteGroups}
                onChange={setNewAthleteGroups}
                placeholder="Selecciona grupos"
              />
            </div>
          </div>
          <div className="flex ic g2r" style={{justifyContent:"space-between",flexWrap:"wrap"}}>
            <div className="text-sm text-mu">Puedes asignar uno o varios grupos por atleta.</div>
            <div className="flex ic g2r" style={{marginLeft:"auto",flexWrap:"wrap"}}>
              <button className="btn btn-ghost" onClick={openBulkWeightEditor}>⚖️ Modificar pesos generales</button>
              <button className="btn btn-or" onClick={handleCreateAthlete}>+ Crear atleta</button>
            </div>
          </div>
          {athleteError && <div className="text-sm mt3" style={{color:"var(--re)"}}>{athleteError}</div>}
          <div className="divider" />
          <div className="g2 mb3">
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Filtrar por nombre</label>
              <input
                className="input"
                value={athleteNameFilter}
                onChange={(e) => setAthleteNameFilter(e.target.value)}
                placeholder="Buscar atleta..."
              />
            </div>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Filtrar por grupo</label>
              <select
                className="select"
                value={athleteGroupFilter}
                onChange={(e) => setAthleteGroupFilter(e.target.value)}
              >
                <option value="all">Todos los grupos</option>
                {allGroups.map((group) => (
                  <option key={`ath_filter_${group}`} value={group}>{groupLabel(group)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-sm text-mu mb3">
            Mostrando {filteredRoster.length} de {roster.length} atletas.
          </div>
          <div className="g2">
            {filteredRoster.map((athlete) => (
              <div key={athlete.id} className="card card-sm">
                <div className="flex ic jb mb3">
                  <div className="flex ic g3r">
                    <div className="avatar" style={{width:34,height:34,fontSize:12}}>{athlete.avatar}</div>
                    <div>
                      <div style={{fontWeight:700}}>{athlete.name}</div>
                      <div className="text-sm text-mu">Grupos: {getAthleteGroupsLabel(athlete)}</div>
                    </div>
                  </div>
                  <div className="flex ic g2r" style={{flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button className="btn btn-ghost btn-sm" onClick={() => renameAthlete(athlete)}>✏️ Nombre</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openWeightEditor(athlete)}>⚖️ Pesos</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeAthlete(athlete)}>🗑️ Eliminar</button>
                  </div>
                </div>
                <MultiSelect
                  options={allGroups}
                  values={getAthleteGroups(athlete)}
                  onChange={(nextGroups) => updateAthleteGroups(athlete.id, nextGroups)}
                  placeholder="Selecciona grupos"
                />
              </div>
            ))}
            {roster.length === 0 && <div className="text-sm text-mu">No hay atletas creados todavía.</div>}
            {roster.length > 0 && filteredRoster.length === 0 && <div className="text-sm text-mu">No hay atletas con esos filtros.</div>}
          </div>
        </div>
      )}

      {!isAthletesView && publishedWeeks.length === 0 && (
        <div className="card">
          <div className="text-mu text-sm">Todavía no hay semanas publicadas en el historial.</div>
        </div>
      )}

      {!isAthletesView && publishedWeeks.map((week) => {
        const weekNumber = normalizeWeekNumber(week.weekNumber, getTodaySeasonWeekNumber(seasonAnchorDate));
        const isOpen = openWeekNumber === weekNumber;
        const summary = weekZoneSummary(week);
        return (
          <div key={week.id || `hist_week_${weekNumber}`} className="card mb3">
            <button
              className="btn btn-ghost"
              style={{width:"100%",textAlign:"left",padding:0,border:"none",background:"transparent"}}
              onClick={() => setOpenWeekNumber((prev) => prev === weekNumber ? null : weekNumber)}
            >
              <div className="flex ic jb" style={{alignItems:"flex-start",gap:16}}>
                <div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:30,fontWeight:900}}>Semana {weekNumber}</div>
                  <div className="text-sm text-mu">{week.type} · {formatWeekRange(week)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div className="text-sm text-mu" style={{textTransform:"uppercase",letterSpacing:1}}>Resumen kms</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:34,fontWeight:900,color:"var(--or)"}}>
                    {summary.total.toFixed(1)}<span style={{fontSize:14,color:"var(--mu)"}}> km</span>
                  </div>
                  <div className="zone-total-row" style={{justifyContent:"flex-end"}}>
                    {ZONES.filter((zone) => Number(summary[zone.id] || 0) > 0).map((zone) => (
                      <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                        <span className="zone-dot" style={{background:zone.color}} />
                        {zone.short} {Number(summary[zone.id]).toFixed(1)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>

            {isOpen && (
              <>
                <div className="divider" />
                <div className="g2">
                  {DAYS_FULL.map((dayName, dayIndex) => {
                    const day = week.days?.[dayIndex] || {};
                    const amSessions = getSlotSessions(day, "am", week);
                    const pmSessions = getSlotSessions(day, "pm", week);
                    const gymPlan = getDayResolvedGymPlan(day, routines);
                    const dayZones = dayZoneSummary(day, week);
                    const dateIso = getDateIsoForWeekDay(weekNumber, dayIndex, seasonAnchorDate);
                    const records = historyByDate[dateIso] || [];
                    return (
                      <div key={`${weekNumber}_${dayIndex}`} className="card card-sm">
                        <div className="flex ic jb mb3">
                          <div>
                            <div style={{fontWeight:800}}>{dayName}</div>
                            <div className="text-sm text-mu">{dateIso}</div>
                          </div>
                          {records.length > 0
                            ? <span className="badge b-gr">Realizado ({records.length})</span>
                            : dateIso <= toIsoDate()
                              ? <span className="badge b-re">Sin registro</span>
                              : <span className="badge b-bl">Planificado</span>}
                        </div>
                        {amSessions.map((session, idx) => (
                          <div key={session.id || `hist_am_${dayIndex}_${idx}`} className="session">
                            <div className="sess-lbl">{idx === 0 ? "🌅 AM" : "➕ Extra AM"} · {getTargetLabel(session)}</div>
                            <div className="sess-txt">{session.name}</div>
                          </div>
                        ))}
                        {pmSessions.map((session, idx) => (
                          <div key={session.id || `hist_pm_${dayIndex}_${idx}`} className="session pm">
                            <div className="sess-lbl">{idx === 0 ? "🌆 PM" : "➕ Extra PM"} · {getTargetLabel(session)}</div>
                            <div className="sess-txt">{session.name}</div>
                          </div>
                        ))}
                        {day.gym && (
                          <div className="session gym">
                            <div className="sess-lbl">🏋️ Gym</div>
                            <div className="sess-txt">{gymPlan?.name || "Rutina"} · {getDayGymCount(day, routines)} ejercicios</div>
                          </div>
                        )}
                        {!amSessions.length && !pmSessions.length && !day.gym && <div className="text-sm text-mu">Descanso</div>}
                        <div className="divider" />
                        <div className="text-sm">Kms día: <strong style={{color:"var(--or)"}}>{dayZones.total.toFixed(1)} km</strong></div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}

      {isAthletesView && editingAthlete && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeWeightEditor()}>
          <div className="modal" style={{maxWidth:760}}>
            <div className="flex ic jb mb4">
              <div className="modal-title">Pesos máximos · {editingAthlete.name}</div>
              <button className="modal-close" onClick={closeWeightEditor}>✕</button>
            </div>
            <div className="g3">
              {weightExercises.map((exercise) => (
                  <div key={exercise.id} className="form-group" style={{marginBottom:10}}>
                    <label className="form-label">{exercise.emoji} {exercise.name}</label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={editingMaxW[exercise.id] ?? ""}
                      onChange={(e) => setEditingMaxW((prev) => ({ ...prev, [exercise.id]: e.target.value }))}
                      placeholder="kg"
                    />
                  </div>
                ))}
            </div>
            <div className="flex ic g2r mt4">
              <button className="btn btn-ghost" style={{flex:1}} onClick={closeWeightEditor}>Cancelar</button>
              <button className="btn btn-or" style={{flex:1}} onClick={saveWeights}>Guardar pesos</button>
            </div>
          </div>
        </div>
      )}

      {isAthletesView && showBulkWeightEditor && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeBulkWeightEditor()}>
          <div className="modal modal-no-scroll" style={{width:"96vw",maxWidth:1400}}>
            <div className="flex ic jb mb4">
              <div className="modal-title">Modificar Pesos Generales</div>
              <button className="modal-close" onClick={closeBulkWeightEditor}>✕</button>
            </div>
            <div className="text-sm text-mu mb4">
              Edita pesos máximos por atleta y ejercicio. Al guardar se aplicarán todas las modificaciones de la tabla.
            </div>
            <div className="bulk-weight-table-wrap" style={{border:"1px solid var(--border)",borderRadius:12,overflow:"auto",maxHeight:"64vh",flex:1,minHeight:0}}>
              <table className="tbl bulk-weight-table" style={{minWidth:Math.max(860, 260 + (weightExercises.length * 130)),margin:0}}>
                <thead>
                  <tr>
                    <th style={{position:"sticky",left:0,zIndex:3,background:"var(--s2)"}}>Atleta</th>
                    {weightExercises.map((exercise) => (
                      <th key={exercise.id} style={{minWidth:130}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span>{exercise.emoji}</span>
                          <span>{exercise.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((athlete) => (
                    <tr key={`bulk_weight_${athlete.id}`}>
                      <td style={{position:"sticky",left:0,zIndex:2,background:"var(--s2)",fontWeight:700}}>
                        {athlete.name}
                      </td>
                      {weightExercises.map((exercise) => (
                        <td key={`${athlete.id}_${exercise.id}`}>
                          <input
                            type="number"
                            min="0"
                            className="input"
                            style={{minWidth:96,padding:"8px 10px"}}
                            value={bulkWeightDraft?.[athlete.id]?.[exercise.id] ?? ""}
                            onChange={(e) => setBulkWeightCell(athlete.id, exercise.id, e.target.value)}
                            placeholder="kg"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex ic g2r mt4">
              <button className="btn btn-ghost" style={{flex:1}} onClick={closeBulkWeightEditor}>Cancelar</button>
              <button className="btn btn-or" style={{flex:1}} onClick={saveBulkWeights}>Guardar todos los pesos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COACH: TEMPORADAS ───────────────────────────────────────────────────────
function CoachTemporadas({
  currentSeasonId,
  seasonWeekOneStartIso,
  seasons,
  onFinalizeSeason,
}) {
  const [nextSeasonId, setNextSeasonId] = useState(getNextSeasonId(currentSeasonId));
  const [nextWeekOneStartIso, setNextWeekOneStartIso] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setNextSeasonId(getNextSeasonId(currentSeasonId));
    const currentStart = parseIsoDateToLocalDate(seasonWeekOneStartIso) || SEASON_ANCHOR_DATE;
    const nextStart = new Date(currentStart.getFullYear() + 1, currentStart.getMonth(), currentStart.getDate());
    setNextWeekOneStartIso(toIsoDate(nextStart));
    setError("");
    setConfirming(false);
  }, [currentSeasonId, seasonWeekOneStartIso]);

  const archived = (Array.isArray(seasons) ? seasons : [])
    .filter((season) => season?.id !== currentSeasonId && season?.finalizedAt)
    .sort((a, b) => String(b.finalizedAt || "").localeCompare(String(a.finalizedAt || "")));

  const handleFinalize = () => {
    const normalizedNextSeason = normalizeSeasonId(nextSeasonId, getNextSeasonId(currentSeasonId));
    const normalizedWeekStart = normalizeSeasonWeekOneStartIso(nextWeekOneStartIso, "");
    if (!normalizedWeekStart) {
      setError("Selecciona la fecha de inicio de la semana 1 para la nueva temporada.");
      return;
    }
    if (normalizedNextSeason === normalizeSeasonId(currentSeasonId, DEFAULT_SEASON_ID)) {
      setError("La nueva temporada debe ser distinta a la temporada activa.");
      setConfirming(false);
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onFinalizeSeason?.({
      nextSeasonId: normalizedNextSeason,
      nextWeekOneStartIso: normalizedWeekStart,
    });
    setConfirming(false);
    setError("");
  };

  return (
    <div className="coach-temporadas-page">
      <div className="ph">
        <div className="ph-title">TEMPORADAS <span>COACH</span></div>
        <div className="ph-sub">Gestiona cierres de temporada y reinicio de planificación</div>
      </div>

      <div className="card season-card mb4">
        <div className="card-title">Temporada activa</div>
        <div className="g2">
          <div>
            <div className="form-label">Temporada</div>
            <div className="season-hero-value">{currentSeasonId}</div>
          </div>
          <div>
            <div className="form-label">Semana 1 inicia</div>
            <div className="season-hero-value season-hero-value-accent">
              {seasonWeekOneStartIso}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb4">
        <div className="card-title">Finalizar temporada</div>
        <div className="text-sm text-mu mb4">
          Al finalizar, se archiva todo el histórico de la temporada actual y se resetea la app para la nueva temporada.
          Los pesos de los atletas se conservan.
        </div>
        <div className="g2">
          <div className="form-group">
            <label className="form-label">Nueva temporada</label>
            <input
              className="input"
              value={nextSeasonId}
              onChange={(e) => setNextSeasonId(e.target.value)}
              placeholder="26/27"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Semana 1 (fecha inicio)</label>
            <input
              className="input"
              type="date"
              value={nextWeekOneStartIso}
              onChange={(e) => setNextWeekOneStartIso(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="text-sm inline-error">{error}</div>}
        <div className="flex ic g3r mt4 season-actions">
          <button className={`btn ${confirming ? "btn-danger" : "btn-or"}`} onClick={handleFinalize}>
            {confirming ? "Confirmar cierre de temporada" : `Finalizar ${currentSeasonId}`}
          </button>
          {confirming && (
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Temporadas archivadas</div>
        {archived.length === 0 && (
          <div className="text-sm text-mu">Todavía no hay temporadas finalizadas.</div>
        )}
        {archived.length > 0 && (
          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Temporada</th>
                  <th>Semana 1</th>
                  <th>Finalizada</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((season) => (
                  <tr key={season.id}>
                    <td className="season-id-cell">{season.id}</td>
                    <td>{season.weekOneStartIso}</td>
                    <td>{String(season.finalizedAt || "").slice(0, 19).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ATHLETE: HOY ─────────────────────────────────────────────────────────────
function AthleteHoy({
  user,
  week,
  routines,
  history,
  onToggleSlotCompletion,
  onDismissNotification,
  onClearNotifications,
  customExercises,
  exerciseImages,
  isWeekPublished,
  athleteNotifications,
}) {
  const todayI = todayIdx();
  const todayIso = toIsoDate();
  const rawTodayPlan = week.days[todayI] || {};
  const userGroups = getAthleteGroups(user);
  const visibleToday = getVisibleDayPlanForAthlete(week, rawTodayPlan, user, routines);
  const hasAnyAssignedToday = getSlotSessions(rawTodayPlan, "am", week).length > 0 || getSlotSessions(rawTodayPlan, "pm", week).length > 0 || !!rawTodayPlan.gym;
  const todayRecord = (history || []).find((row) => row?.athleteId === user.id && row?.dateIso === todayIso) || null;
  const completion = getDayCompletionFromHistory(visibleToday, todayRecord);
  const nextCompetition = getNextCompetitionCountdown(user.competitions || [], 90, todayIso);
  const [showGym, setShowGym] = useState(false);

  const gymExercises = visibleToday.gym ? getDayGymExercisesForAthlete(rawTodayPlan, routines, user, customExercises, exerciseImages) : [];
  const gymResolved = visibleToday.gym ? getDayResolvedGymPlan(rawTodayPlan, routines) : null;
  const notifList = Array.isArray(athleteNotifications) ? athleteNotifications : [];
  const completionLabel = completion.plannedSlots === 0
    ? "Sin bloques planificados hoy"
    : completion.status === "full"
      ? "Todo completado"
      : completion.status === "partial"
        ? `Completado ${completion.doneSlots}/${completion.plannedSlots}`
        : "Pendiente";

  const toggleSlot = (slot) => {
    if (typeof onToggleSlotCompletion !== "function") return;
    if (slot === "am" && !completion.amPlanned) return;
    if (slot === "pm" && !completion.pmPlanned) return;
    if (slot === "gym" && !completion.gymPlanned) return;
    const currentlyDone = slot === "am"
      ? completion.amDone
      : slot === "pm"
        ? completion.pmDone
        : completion.gymDone;
    onToggleSlotCompletion(slot, !currentlyDone);
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-title">HOY, <span>{DAYS_FULL[todayI].toUpperCase()}</span></div>
        <div className="ph-sub">{new Date().toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"})}</div>
      </div>

      <div className="wt-banner">
        <div>
          <div className="wt-label">Semana</div>
          <div className="wt-val">{week.type}</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <span className="badge b-bl" style={{fontSize:12,padding:"6px 12px"}}>Grupos: {userGroups.join(" · ")}</span>
          <span className={`badge ${isWeekPublished ? (visibleToday.hasContent ? "b-gr" : "b-mu") : "b-re"}`} style={{fontSize:12,padding:"6px 12px"}}>
            {!isWeekPublished ? "Semana pendiente de publicar" : visibleToday.hasContent ? "Plan publicado para tus grupos" : "Sin plan para tus grupos hoy"}
          </span>
          <span className={`badge ${completion.status === "full" ? "b-gr" : completion.status === "partial" ? "b-ya" : "b-re"}`} style={{fontSize:12,padding:"6px 12px"}}>
            {completionLabel}
          </span>
        </div>
      </div>

      {nextCompetition && (
        <div className="card mb4" style={{background:"linear-gradient(135deg,rgba(167,139,250,.16),rgba(167,139,250,.06))",borderColor:"rgba(167,139,250,.45)"}}>
          <div className="flex ic jb">
            <div>
              <div className="card-title" style={{margin:0}}>🏁 Cuenta atrás competición</div>
              <div className="text-sm text-mu mt3">{nextCompetition.name} · {nextCompetition.dateIso}</div>
            </div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:900,color:"var(--pu)"}}>
              {nextCompetition.diffDays}
              <span style={{fontSize:14,color:"var(--mu)",marginLeft:6}}>días</span>
            </div>
          </div>
        </div>
      )}

      {notifList.length > 0 && (
        <div className="card mb4">
          <div className="flex ic jb mb4">
            <div className="card-title" style={{margin:0}}>🔔 Notificaciones</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onClearNotifications?.()}>Limpiar todas</button>
          </div>
          {notifList.map((notification) => (
            <div key={notification.id} className="notif" style={{background:"rgba(96,165,250,.08)",borderColor:"rgba(96,165,250,.28)",justifyContent:"space-between"}}>
              <div className="flex ic g3r" style={{alignItems:"flex-start"}}>
                <span style={{fontSize:18}}>📣</span>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>{notification.title || "Actualización"}</div>
                  <div style={{fontSize:12,color:"var(--mu2)"}}>{notification.message}</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => onDismissNotification?.(notification.id)}>Quitar</button>
            </div>
          ))}
        </div>
      )}

      <div className="g2 mb4">
        {visibleToday.am.length > 0 ? (
          <div className="today-session">
            <div className="big-time">🌅 Mañana — AM</div>
            {visibleToday.am.map((session, index) => (
              <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 12}}>
                <div className="today-training" style={{fontSize:index === 0 ? 28 : 22}}>{session.name}</div>
                <span className={`badge ${index === 0 ? "b-or" : "b-ya"}`}>{index === 0 ? "Principal" : "Extra"} · {getTargetLabel(session)}</span>
              </div>
            ))}
            <button
              className={`btn ${completion.amDone ? "btn-ghost" : "btn-or"} mt4`}
              style={{width:"100%"}}
              onClick={() => toggleSlot("am")}
            >
              {completion.amDone ? "✓ AM completado" : "Marcar AM como completado"}
            </button>
          </div>
        ) : (
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120}}>
            <span style={{color:"var(--mu)",fontSize:14}}>
              {!isWeekPublished ? "La semana aún no está publicada" : hasAnyAssignedToday ? "No hay sesión AM para tus grupos" : "Sin sesión de mañana"}
            </span>
          </div>
        )}

        {visibleToday.pm.length > 0 ? (
          <div className="today-pm">
            <div className="big-time blue">🌆 Tarde — PM</div>
            {visibleToday.pm.map((session, index) => (
              <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 12}}>
                <div className="today-training" style={{fontSize:index === 0 ? 28 : 22}}>{session.name}</div>
                <span className={`badge ${index === 0 ? "b-bl" : "b-ya"}`}>{index === 0 ? "Principal" : "Extra"} · {getTargetLabel(session)}</span>
              </div>
            ))}
            <button
              className={`btn ${completion.pmDone ? "btn-ghost" : "btn-or"} mt4`}
              style={{width:"100%"}}
              onClick={() => toggleSlot("pm")}
            >
              {completion.pmDone ? "✓ PM completado" : "Marcar PM como completado"}
            </button>
          </div>
        ) : (
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120}}>
            <span style={{color:"var(--mu)",fontSize:14}}>
              {!isWeekPublished ? "La semana aún no está publicada" : hasAnyAssignedToday ? "No hay sesión PM para tus grupos" : "Sin sesión de tarde"}
            </span>
          </div>
        )}
      </div>

      {visibleToday.gym && (
        <div className="card mb4">
          <div className="flex ic jb">
            <div>
              <div className="card-title" style={{margin:0}}>🏋️ Gym hoy</div>
              <div className="text-mu text-sm">{gymResolved?.name || "Rutina"} · {groupLabel(gymResolved?.targetGroup || rawTodayPlan.gymTargetGroup || "all")}</div>
            </div>
            <div className="flex ic g2r">
              <span className={`badge ${completion.gymDone ? "b-gr" : "b-re"}`}>{completion.gymDone ? "Gym hecho" : "Gym pendiente"}</span>
              <button className="gym-pill" onClick={()=>setShowGym(!showGym)}>
                {showGym?"Ocultar":"Ver rutina"} {gymExercises.length} ejercicios
              </button>
            </div>
          </div>
          <button
            className={`btn ${completion.gymDone ? "btn-ghost" : "btn-or"} mt4`}
            style={{width:"100%"}}
            onClick={() => toggleSlot("gym")}
          >
            {completion.gymDone ? "✓ Gym completado" : "Marcar Gym como completado"}
          </button>
          {showGym && (
            <div className="mt4">
              {gymExercises.map(ex => {
                const exType = normalizeExerciseType(ex.type || "weight");
                return (
                  <div key={ex.id} className="ex-row">
                    <div className="ex-emoji">{ex.emoji}</div>
                    <div>
                      <div className="ex-info-name">{ex.name}</div>
                      <div className="ex-info-mu">{ex.muscles}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div className="ex-big">{ex.sets}</div>
                      <div className="ex-lbl">series</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div className="ex-big">
                        {exType === "time_reps"
                          ? `${ex.reps}x${formatExDuration(ex.duration)}`
                          : ex.reps}
                      </div>
                      <div className="ex-lbl">{exType === "time_reps" ? "reps x seg" : "reps"}</div>
                    </div>
                    {exType === "weight" && ex.kg ? (
                      <div style={{textAlign:"center"}}>
                        <div className="ex-big">{ex.kg}</div>
                        <div className="ex-lbl">kg</div>
                      </div>
                    ) : (
                      <div style={{textAlign:"center",color:"var(--mu)",fontSize:12}}>—</div>
                    )}
                    <div>
                      {exType === "weight" && <span className="badge b-or">{ex.pct}% 1RM</span>}
                      {exType === "reps" && <span className="badge b-bl">Reps</span>}
                      {exType === "time_reps" && <span className="badge b-ya">{ex.reps} x {formatExDuration(ex.duration)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!visibleToday.am.length && !visibleToday.pm.length && (
        <div className="card mb4" style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:48,marginBottom:12}}>😴</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:800}}>
            {!isWeekPublished ? "SEMANA NO PUBLICADA" : hasAnyAssignedToday ? "SIN PLAN ASIGNADO" : "DÍA DE DESCANSO"}
          </div>
          <div style={{color:"var(--mu)",marginTop:8}}>
            {!isWeekPublished
              ? "El entrenador todavía no ha publicado la semana."
              : hasAnyAssignedToday
                ? "Hoy hay trabajo para otros grupos, pero no para los tuyos."
                : "Recarga energías para mañana."}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ATHLETE: MI SEMANA ───────────────────────────────────────────────────────
function AthleteSemana({ week, routines, user, customExercises, exerciseImages, isWeekPublished }) {
  const [gymDay, setGymDay] = useState(null);
  const todayI = todayIdx();
  const userGroups = getAthleteGroups(user);
  const userGroupsLabel = userGroups.join(" · ");

  const gymForDay = (i) => getDayGymExercisesForAthlete(week.days[i], routines, user, customExercises, exerciseImages);

  return (
    <div>
      <div className="ph">
        <div className="ph-title">MI <span>SEMANA</span></div>
        <div className="ph-sub">Plan completo · Semana {week.type} · Grupos {userGroupsLabel}</div>
      </div>

      <div className="wt-banner">
        <div><div className="wt-label">Tipo de semana</div><div className="wt-val">{week.type}</div></div>
        <div style={{marginLeft:"auto"}}><span className={`badge ${isWeekPublished ? "b-bl" : "b-re"}`} style={{fontSize:12,padding:"6px 12px"}}>{isWeekPublished ? `Mostrando ${userGroupsLabel} + Todos` : "Semana pendiente de publicar"}</span></div>
      </div>

      <div className="week-grid">
        {DAYS_FULL.map((day, i) => {
          const d = week.days[i];
          const isToday = i === todayI;
          const visiblePlan = getVisibleDayPlanForAthlete(week, d, user, routines);
          const hasAssignedForOthers = getSlotSessions(d, "am", week).length > 0 || getSlotSessions(d, "pm", week).length > 0 || !!d.gym;
          const gymCount = visiblePlan.gym ? getDayGymCount(d, routines) : 0;
          const gymResolved = visiblePlan.gym ? getDayResolvedGymPlan(d, routines) : null;
          return (
            <div key={i} className={`day-col ${isToday?"today":""}`}>
              <div className="day-hdr">
                <div className="day-name" style={{color:isToday?"var(--or)":""}}>{DAYS_SHORT[i]}</div>
                {isToday
                  ? <div className="day-date" style={{color:"var(--or)"}}>HOY</div>
                  : <div className="day-date">{displayTarget(week, d)}</div>}
              </div>
              <div className="day-body">
                {!isWeekPublished && <div style={{fontSize:11,color:"var(--mu)",textAlign:"center",padding:"8px 0"}}>Pendiente de publicar</div>}
                {isWeekPublished && !visiblePlan.hasContent && (
                  <div style={{fontSize:11,color:"var(--mu)",textAlign:"center",padding:"8px 0"}}>{hasAssignedForOthers ? "No asignado a tus grupos" : "Descanso"}</div>
                )}
                {visiblePlan.am.map((session, index) => <div key={session.id || `${session.name}_${index}`} className="session"><div className="sess-lbl">{index === 0 ? "🌅 AM" : "➕ Extra AM"}</div><div className="sess-txt">{session.name}</div></div>)}
                {visiblePlan.pm.map((session, index) => <div key={session.id || `${session.name}_${index}`} className="session pm"><div className="sess-lbl">{index === 0 ? "🌆 PM" : "➕ Extra PM"}</div><div className="sess-txt">{session.name}</div></div>)}
                {visiblePlan.gym && (
                  <div className="session gym" onClick={()=>setGymDay(gymDay===i?null:i)}>
                    <div className="sess-lbl">🏋️ GYM</div>
                    <div className="sess-txt">{gymResolved?.name || "Rutina"} · {gymCount} ejercicios · ver →</div>
                  </div>
                )}
              </div>
              {visiblePlan.gym && gymDay===i && gymForDay(i).length>0 && (
                <div style={{padding:"0 10px 10px"}}>
                  {gymForDay(i).map(ex => {
                    const imgSrc = ex.imageUrl;
                    const exType = normalizeExerciseType(ex.type || "weight");
                    return (
                      <div key={ex.id} style={{background:"var(--s2)",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          {imgSrc
                            ? <img src={imgSrc} alt={ex.name} style={{width:32,height:32,borderRadius:6,objectFit:"cover"}} />
                            : <span style={{fontSize:18}}>{ex.emoji}</span>}
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,fontWeight:700}}>{ex.name}</div>
                            {exType==="time_reps"
                              ? <div style={{fontSize:10,color:"var(--mu)"}}>{ex.sets} × {ex.reps} × {formatExDuration(ex.duration)}</div>
                              : <div style={{fontSize:10,color:"var(--mu)"}}>{ex.sets}×{ex.reps}{exType==="weight"?` — ${ex.pct}%`:""}</div>}
                          </div>
                          {exType==="weight" && ex.kg
                            ? <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:"var(--or)"}}>{ex.kg}kg</div>
                            : exType==="time_reps"
                                ? <span className="badge b-ya">{ex.reps}x{formatExDuration(ex.duration)}</span>
                              : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ATHLETE: MI GYM ─────────────────────────────────────────────────────────
function AthleteGym({ user, routines, week, customExercises, exerciseImages, isWeekPublished }) {
  const userGroups = getAthleteGroups(user);
  const allDays = week.days
    .map((d, i) => ({ i, day: d }))
    .filter(({ day }) => isGymVisibleForGroup(week, day, userGroups, routines) && getDayGymCount(day, routines) > 0);

  const [selectedDay, setSelectedDay] = useState(allDays[0]?.i ?? 0);
  useEffect(() => {
    if (allDays.length && !allDays.some(d => d.i === selectedDay)) setSelectedDay(allDays[0].i);
  }, [allDays, selectedDay]);

  const focusExercises = getDayGymExercisesForAthlete(week.days[selectedDay], routines, user, customExercises, exerciseImages);
  const selectedPlan = getDayResolvedGymPlan(week.days[selectedDay], routines);

  return (
    <div>
      <div className="ph">
        <div className="ph-title">MI <span>GYM</span></div>
        <div className="ph-sub">Rutinas inline publicadas para tus grupos · pesos calculados según tu 1RM</div>
      </div>

      {!isWeekPublished && (
        <div className="card mb4" style={{textAlign:"center",padding:40,color:"var(--mu)"}}>
          La semana todavía no está publicada.
        </div>
      )}

      {isWeekPublished && <div className="flex ic g2r mb4" style={{flexWrap:"wrap"}}>
        {allDays.map(d=>(
          <button key={d.i} className={`btn ${selectedDay===d.i?"btn-or":"btn-ghost"}`} onClick={()=>setSelectedDay(d.i)}>
            {DAYS_SHORT[d.i]} · {getDayGymCount(d.day, routines)} ejercicios
          </button>
        ))}
      </div>}

      {isWeekPublished && !allDays.length && <div className="card empty-state-card">No hay rutinas de gym asignadas a tus grupos esta semana</div>}

      {isWeekPublished && allDays.length > 0 && selectedPlan && (
        <div className="card mb4">
          <div className="flex ic jb">
            <div>
              <div className="card-title" style={{margin:0}}>🏋️ {selectedPlan.name || "Rutina"}</div>
              <div className="text-mu text-sm">{DAYS_FULL[selectedDay]} · {groupLabel(selectedPlan.targetGroup || week.days[selectedDay]?.targetGroup || "all")}</div>
            </div>
            <span className="badge b-pu">{focusExercises.length} ejercicios</span>
          </div>
        </div>
      )}

      {isWeekPublished && focusExercises.length === 0 && allDays.length > 0 && <div className="card empty-state-card">No hay gym este día</div>}

      {isWeekPublished && focusExercises.map(ex => {
        const max = user.maxW?.[ex.id];
        const exType = normalizeExerciseType(ex.type || "weight");
        const imgSrc = ex.imageUrl;
        return (
          <div key={ex.id} className="card mb3">
            <div className="ath-gym-ex-row" style={{display:"grid",gridTemplateColumns:"108px 1fr repeat(3,minmax(78px,90px))",gap:16,alignItems:"center"}}>
              <div className="ath-gym-ex-media" style={{textAlign:"center"}}>
                {imgSrc ? (
                  <img className="ath-gym-ex-image" src={imgSrc} alt={ex.name} style={{width:92,height:92,objectFit:"cover",borderRadius:12,border:"1px solid var(--border2)"}} />
                ) : (
                  <div className="ath-gym-ex-emoji" style={{fontSize:58,textAlign:"center"}}>{ex.emoji}</div>
                )}
              </div>
              <div className="ath-gym-ex-main">
                <div className="ath-gym-ex-name" style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:800,lineHeight:1}}>{ex.name}</div>
                <div style={{fontSize:12,color:"var(--mu2)",marginTop:2}}>{ex.muscles}</div>
                {exType==="weight" && (
                  max
                    ? <div style={{fontSize:11,color:"var(--mu)",marginTop:4}}>1RM: {max}kg · {ex.pct}%</div>
                    : <div style={{fontSize:11,color:"var(--re)",marginTop:4}}>⚠ Sin peso máximo definido</div>
                )}
                {exType==="time_reps" && <div style={{fontSize:11,color:"var(--ya)",marginTop:4}}>Tiempo x repeticiones</div>}
                {exType==="reps"   && <div style={{fontSize:11,color:"var(--bl)",marginTop:4}}>Sin carga externa</div>}
              </div>
              <div className="ath-gym-ex-metric" style={{textAlign:"center"}}>
                <div className="ath-gym-ex-metric-value" style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,lineHeight:1}}>{ex.sets}</div>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>series</div>
              </div>
              {exType === "time_reps" ? (
                <div className="ath-gym-ex-metric" style={{textAlign:"center"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900,lineHeight:1,color:"var(--ya)"}}>{ex.reps} x {formatExDuration(ex.duration)}</div>
                  <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>reps x tiempo</div>
                </div>
              ) : (
                <div className="ath-gym-ex-metric" style={{textAlign:"center"}}>
                  <div className="ath-gym-ex-metric-value" style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,lineHeight:1}}>{ex.reps}</div>
                  <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>reps</div>
                </div>
              )}
              <div className="ath-gym-ex-metric" style={{textAlign:"center"}}>
                {exType==="weight" && ex.kg ? (
                  <>
                    <div className="ath-gym-ex-metric-value" style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,color:"var(--or)",lineHeight:1}}>{ex.kg}</div>
                    <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>kg</div>
                  </>
                ) : (
                  <div style={{color:"var(--mu)",fontSize:13}}>—</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ATHLETE: PERFIL ─────────────────────────────────────────────────────────
function AthletePerfil({ user, onUpdatePassword, onUpdateName }) {
  const athleteGroups = getAthleteGroups(user);
  const [nameDraft, setNameDraft] = useState(String(user?.name || ""));
  const [nameMsg, setNameMsg] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordMsg, setPasswordMsg] = useState(null);
  const maxEntries = GYM_EXERCISES.map((exercise) => {
    const numeric = Number(user.maxW?.[exercise.id]);
    const hasValue = Number.isFinite(numeric) && numeric > 0;
    return {
      ...exercise,
      hasValue,
      value: hasValue ? numeric : null,
    };
  });

  useEffect(() => {
    setNameDraft(String(user?.name || ""));
    setNameMsg(null);
  }, [user?.id, user?.name]);

  const saveName = () => {
    const nextName = String(nameDraft || "").trim();
    if (nextName.length < 2) {
      setNameMsg({ ok:false, text:"El nombre debe tener al menos 2 caracteres." });
      return;
    }
    const result = onUpdateName?.(nextName);
    if (result && result.ok === false) {
      setNameMsg({ ok:false, text: result.error || "No se pudo actualizar el nombre." });
      return;
    }
    setNameMsg({ ok:true, text:"Nombre actualizado." });
  };

  const savePassword = () => {
    const nextPassword = String(passwordDraft || "").trim();
    const confirmPassword = String(passwordConfirm || "").trim();
    if (nextPassword.length < 4) {
      setPasswordMsg({ ok:false, text:"La contraseña debe tener al menos 4 caracteres." });
      return;
    }
    if (nextPassword !== confirmPassword) {
      setPasswordMsg({ ok:false, text:"Las contraseñas no coinciden." });
      return;
    }
    onUpdatePassword?.(nextPassword);
    setPasswordMsg({ ok:true, text:"Contraseña actualizada." });
    setPasswordDraft("");
    setPasswordConfirm("");
  };

  return (
    <div className="athlete-profile-page">
      <div className="profile-grid">
        <div className="card profile-identity-card">
          <div className="profile-hero">
            <div className="avatar blue profile-avatar">{user.avatar}</div>
            <div className="profile-hero-copy">
              <div className="profile-kicker">Atleta</div>
              <div className="profile-name">{user.name}</div>
              <div className="profile-chip-row">
                {athleteGroups.map((group) => <span key={group} className={`g-tag ${groupClass(group)}`}>{group}</span>)}
              </div>
            </div>
          </div>

          <div className="profile-group-panel">
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Grupos asignados por el entrenador</label>
              <div className="profile-chip-row">
                {athleteGroups.map((group) => <span key={`profile_group_${group}`} className={`g-tag ${groupClass(group)}`}>{group}</span>)}
              </div>
              <div className="profile-group-hint">Solo el entrenador puede cambiar tus grupos.</div>
            </div>
          </div>

          <div className="profile-group-panel mt3">
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Tu nombre</label>
              <div className="flex ic g2r">
                <input
                  className="input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Nombre del atleta"
                />
                <button className="btn btn-ghost btn-sm" onClick={saveName}>Guardar</button>
              </div>
              {nameMsg && (
                <div className="text-sm mt3" style={{color: nameMsg.ok ? "var(--gr)" : "var(--re)"}}>
                  {nameMsg.text}
                </div>
              )}
            </div>
          </div>

          <div className="profile-group-panel mt3">
            <div className="profile-password-grid">
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Nueva contraseña</label>
                <input
                  type="password"
                  className="input"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                />
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Confirmar contraseña</label>
                <input
                  type="password"
                  className="input"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                />
              </div>
            </div>
            <div className="flex ic jb mt3" style={{flexWrap:"wrap",gap:8}}>
              <button className="btn btn-or btn-sm" onClick={savePassword}>Guardar contraseña</button>
            </div>
            {passwordMsg && (
              <div className="text-sm mt3" style={{color: passwordMsg.ok ? "var(--gr)" : "var(--re)"}}>
                {passwordMsg.text}
              </div>
            )}
          </div>
        </div>

        <div className="card profile-max-card">
          <div className="card-title">⚖️ Mis máximos</div>
          <div className="text-sm text-mu mb4">Solo el entrenador puede modificar los pesos.</div>
          <div className="max-list">
            {maxEntries.map((exercise) => (
              <div key={exercise.id} className="max-row">
                <div className="max-left">
                  <span className="max-emoji">{exercise.emoji}</span>
                  <span className="max-name">{exercise.name}</span>
                </div>
                {exercise.hasValue ? (
                  <div className="max-value">
                    {exercise.value}
                    <span className="max-unit">kg</span>
                  </div>
                ) : (
                  <div className="max-value max-empty">—</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ATHLETE: CALENDARIO ─────────────────────────────────────────────────────
function AthleteCalendario({
  user,
  week,
  routines,
  history,
  customExercises,
  exerciseImages,
  isWeekPublished,
  onAddCompetition,
  onRemoveCompetition,
}) {
  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selected, setSelected]   = useState(null); // { dateIso, dayOfWeek }
  const [competitionDate, setCompetitionDate] = useState("");
  const [competitionName, setCompetitionName] = useState("");
  const userGroups = getAthleteGroups(user);
  const competitions = normalizeCompetitionList(user.competitions || []);
  const competitionsByDate = competitions.reduce((acc, competition) => {
    if (!acc[competition.dateIso]) acc[competition.dateIso] = [];
    acc[competition.dateIso].push(competition);
    return acc;
  }, {});

  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const firstDow  = new Date(viewYear, viewMonth, 1).getDay();
  const daysInM   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const offset    = firstDow === 0 ? 6 : firstDow - 1;
  const todayIso  = toIsoDate();

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0)  { m = 11; y -= 1; }
    if (m > 11) { m = 0;  y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  const histMap = {};
  (history||[]).filter((h) => h.athleteId===user.id).forEach((h) => { histMap[h.dateIso] = h; });

  const weekDayForDate = (y,m,d) => {
    const dow = new Date(y,m,d).getDay();
    return dow === 0 ? 6 : dow - 1;
  };

  const handleAddCompetition = () => {
    if (!competitionDate || typeof onAddCompetition !== "function") return;
    onAddCompetition({
      id: `comp_${competitionDate}_${Date.now()}`,
      dateIso: competitionDate,
      name: competitionName.trim() || "Competición",
    });
    setCompetitionDate("");
    setCompetitionName("");
  };

  const getSelectedInfo = () => {
    if (!selected) return null;
    const hist = histMap[selected.dateIso] || null;
    const dow  = selected.dayOfWeek;
    const dayPlan = week.days[dow];
    const visiblePlan = getVisibleDayPlanForAthlete(week, dayPlan, user, routines);
    const completion = getDayCompletionFromHistory(visiblePlan, hist);
    const gymExs  = visiblePlan.gym ? getDayGymExercisesForAthlete(dayPlan, routines, user, customExercises, exerciseImages) : [];
    const gymPlan = visiblePlan.gym ? getDayResolvedGymPlan(dayPlan, routines) : null;
    return {
      hist,
      dayPlan,
      visiblePlan,
      completion,
      gymExs,
      gymPlan,
      dow,
      competitions: competitionsByDate[selected.dateIso] || [],
    };
  };

  const info = getSelectedInfo();

  return (
    <div className="athlete-calendar-page">
      <div className="athlete-cal-grid">
        <div className="athlete-cal-left">
          <div className="card mb3">
            <div className="card-title">🏁 Competiciones</div>
            <div className="athlete-comp-form mb3">
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Fecha</label>
                <input type="date" className="input" value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Nombre (opcional)</label>
                <input className="input" value={competitionName} onChange={(e) => setCompetitionName(e.target.value)} placeholder="Control 1500m, Campeonato..." />
              </div>
              <button className="btn btn-or" style={{height:42,whiteSpace:"nowrap"}} onClick={handleAddCompetition}>+ Añadir</button>
            </div>
            <div className="divider" style={{margin:"10px 0"}} />
            <div className="athlete-comp-list">
              {(competitions || []).length === 0 && <div className="text-sm text-mu">No hay competiciones añadidas.</div>}
              {(competitions || []).map((competition) => (
                <div key={competition.id} className="flex ic jb mb3">
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{competition.name}</div>
                    <div className="text-sm text-mu">{competition.dateIso}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => onRemoveCompetition?.(competition.id)}>Quitar</button>
                </div>
              ))}
            </div>
          </div>

          <div className="card athlete-cal-month">
            <div className="flex ic jb mb4">
              <button className="week-nav-btn" onClick={()=>goMonth(-1)}>← Ant.</button>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:700}}>{monthNames[viewMonth]} {viewYear}</div>
              <button className="week-nav-btn" onClick={()=>goMonth(1)}>Sig. →</button>
            </div>

            <div className="cal-grid" style={{marginBottom:6}}>
              {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",fontWeight:700,padding:"4px 0"}}>{d}</div>)}
            </div>

            <div className="cal-grid athlete-cal-month-grid">
              {Array(offset).fill(null).map((_,i)=><div key={"e"+i}/>)}
              {Array(daysInM).fill(null).map((_,i) => {
                const day    = i + 1;
                const y = viewYear;
                const m = viewMonth;
                const dateIso = `${String(y).padStart(4,"0")}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const dow    = weekDayForDate(y, m, day);
                const isToday = dateIso === todayIso;
                const hist   = histMap[dateIso] || null;
                const visiblePlan = getVisibleDayPlanForAthlete(week, week.days[dow], user, routines);
                const completion = getDayCompletionFromHistory(visiblePlan, hist);
                const hasTrain = visiblePlan.hasContent;
                const isCompetitionDay = !!competitionsByDate[dateIso]?.length;
                const selDate = selected?.dateIso === dateIso;
                const isFuture = dateIso > todayIso;
                const style = {
                  ...(hasTrain ? getCompletionDayStyle(completion) : {}),
                  ...(isFuture ? { background:"rgba(136,136,170,.15)", borderColor:"rgba(136,136,170,.45)" } : {}),
                  ...(isCompetitionDay ? { boxShadow:"inset 0 0 0 1px rgba(167,139,250,.45)" } : {}),
                  ...(selDate ? { borderColor:"var(--or)" } : {}),
                };
                return (
                  <div key={day}
                    className={`cal-cell ${hasTrain?"has-training":""} ${isToday?"today-cell":""}`}
                    style={style}
                    onClick={()=>setSelected({ dateIso, dayOfWeek:dow })}
                  >
                    <div className="cal-day-num" style={{color:isToday ? "var(--or)" : isFuture ? "var(--mu2)" : "var(--tx)"}}>{day}</div>
                    {hasTrain && completion.status === "full" && <span className="cal-dot" style={{background:"var(--gr)"}} title="Completado todo" />}
                    {hasTrain && completion.status === "partial" && <span className="cal-dot" style={{background:"var(--or)"}} title="Completado parcial" />}
                    {hasTrain && completion.status === "none" && <span className="cal-dot" style={{background:"var(--re)"}} title="Sin completar" />}
                    {week.days[dow]?.gym && <span className="cal-dot" style={{background:"var(--pu)"}} />}
                    {isCompetitionDay && <span className="cal-dot" style={{background:"#c084fc"}} title="Competición" />}
                  </div>
                );
              })}
            </div>

            <div className="divider" style={{margin:"12px 0"}} />
            <div className="flex ic g4r athlete-cal-legend" style={{flexWrap:"wrap"}}>
              <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--gr)"}} /> Día completo</div>
              <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--or)"}} /> Día parcial</div>
              <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--re)"}} /> Sin completar</div>
              <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--mu2)"}} /> Día futuro</div>
              <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"#c084fc"}} /> Competición</div>
            </div>
          </div>
        </div>

        <div className="athlete-cal-right">
          {!selected && (
            <div className="card athlete-cal-placeholder" style={{textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:12}}>📅</div>
              <div style={{color:"var(--mu)",fontSize:14}}>Selecciona un día para ver el detalle</div>
            </div>
          )}

          {selected && info && (
            <div className="athlete-cal-detail-stack">
              <div className="card athlete-cal-detail">
                <div className="flex ic jb mb4">
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900}}>
                      {DAYS_FULL[info.dow]} {selected.dateIso}
                    </div>
                    {info.completion.plannedSlots > 0 && (
                      <span className={`badge ${info.completion.status === "full" ? "b-gr" : info.completion.status === "partial" ? "b-ya" : "b-re"}`}>
                        {info.completion.status === "full"
                          ? "Completado todo"
                          : info.completion.status === "partial"
                            ? `Parcial (${info.completion.doneSlots}/${info.completion.plannedSlots})`
                            : "Sin completar"}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>✕</button>
                </div>

                {info.competitions.length > 0 && (
                  <div className="card card-sm mb3" style={{background:"rgba(167,139,250,.12)",borderColor:"rgba(167,139,250,.35)"}}>
                    <div className="fw7 mb3">🏁 Competiciones del día</div>
                    {info.competitions.map((competition) => (
                      <div key={competition.id} className="text-sm" style={{fontWeight:700}}>{competition.name}</div>
                    ))}
                  </div>
                )}

                {isWeekPublished && info.visiblePlan?.am?.length > 0 && (
                  <div className="mb3">
                    <div className="flex ic jb">
                      <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--or)",fontWeight:700,marginBottom:4}}>🌅 Mañana AM</div>
                      <span className={`badge ${info.completion.amDone ? "b-gr" : "b-re"}`}>{info.completion.amDone ? "Hecho" : "Pendiente"}</span>
                    </div>
                    {info.visiblePlan.am.map((session, index) => (
                      <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 6}}>
                        <div style={{fontWeight:700}}>{session.name}</div>
                        <div className="zone-total-row" style={{marginTop:6}}>
                          {ZONES.map((zone) => (session.zones?.[zone.id] || 0) > 0 ? (
                            <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                              <span className="zone-dot" style={{background:zone.color}} />
                              {zone.short} {Number(session.zones[zone.id]).toFixed(1)}km
                            </span>
                          ) : null)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {isWeekPublished && info.visiblePlan?.pm?.length > 0 && (
                  <div className="mb3">
                    <div className="flex ic jb">
                      <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--bl)",fontWeight:700,marginBottom:4}}>🌆 Tarde PM</div>
                      <span className={`badge ${info.completion.pmDone ? "b-gr" : "b-re"}`}>{info.completion.pmDone ? "Hecho" : "Pendiente"}</span>
                    </div>
                    {info.visiblePlan.pm.map((session, index) => (
                      <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 6}}>
                        <div style={{fontWeight:700}}>{session.name}</div>
                        <div className="zone-total-row" style={{marginTop:6}}>
                          {ZONES.map((zone) => (session.zones?.[zone.id] || 0) > 0 ? (
                            <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                              <span className="zone-dot" style={{background:zone.color}} />
                              {zone.short} {Number(session.zones[zone.id]).toFixed(1)}km
                            </span>
                          ) : null)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {isWeekPublished && info.visiblePlan?.gym && (
                  <div className="mb3">
                    <div className="flex ic jb">
                      <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--pu)",fontWeight:700,marginBottom:4}}>🏋️ Gym</div>
                      <span className={`badge ${info.completion.gymDone ? "b-gr" : "b-re"}`}>{info.completion.gymDone ? "Hecho" : "Pendiente"}</span>
                    </div>
                  </div>
                )}
                {(!isWeekPublished || (!info.visiblePlan?.am?.length && !info.visiblePlan?.pm?.length && !info.visiblePlan?.gym)) && (
                  <div style={{color:"var(--mu)",fontSize:14}}>
                    {!isWeekPublished ? "La semana todavía no está publicada." : "Sin plan asignado a tus grupos para este día."}
                  </div>
                )}
              </div>

              {info.gymExs.length > 0 && (
                <div className="card">
                  <div className="card-title" style={{marginBottom:12}}>🏋️ {info.gymPlan?.name || "Rutina gym"}</div>
                  {info.gymExs.map(ex => {
                    const imgSrc = ex.imageUrl;
                    const exType = normalizeExerciseType(ex.type || "weight");
                    return (
                      <div key={ex.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                        {imgSrc
                          ? <img src={imgSrc} alt={ex.name} style={{width:40,height:40,borderRadius:8,objectFit:"cover"}} />
                          : <span style={{fontSize:24}}>{ex.emoji}</span>}
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:13}}>{ex.name}</div>
                          <div style={{fontSize:11,color:"var(--mu)"}}>{ex.muscles}</div>
                          <div style={{fontSize:11,color:"var(--mu2)",marginTop:2}}>
                            {exType==="time_reps"
                              ? `${ex.sets} × ${ex.reps} × ${formatExDuration(ex.duration)}`
                              : `${ex.sets} × ${ex.reps} reps`}
                          </div>
                        </div>
                        {exType==="weight" && ex.kg && (
                          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900,color:"var(--or)"}}>{ex.kg}<span style={{fontSize:12,color:"var(--mu)"}}>kg</span></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function TrackFlow() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("semana");
  const [athletes, setAthletes] = useState(normalizeAthletes(DEFAULT_ATHLETES));
  const [groups, setGroups] = useState([...GROUPS]);
  const [currentSeasonId, setCurrentSeasonId] = useState(DEFAULT_SEASON_ID);
  const [seasonWeekOneStartIso, setSeasonWeekOneStartIso] = useState(DEFAULT_SEASON_WEEK_ONE_START_ISO);
  const [seasons, setSeasons] = useState(() =>
    normalizeSeasonCollection([], DEFAULT_SEASON_ID, DEFAULT_SEASON_WEEK_ONE_START_ISO)
  );
  const seasonAnchorDate = parseIsoDateToLocalDate(seasonWeekOneStartIso) || SEASON_ANCHOR_DATE;
  const initialSeasonWeek = getTodaySeasonWeekNumber(seasonAnchorDate);
  const [weekPlansByNumber, setWeekPlansByNumber] = useState(() => ({
    [initialSeasonWeek]: createWeekForNumber(initialSeasonWeek, DEFAULT_ROUTINE_LIBRARY, {}, seasonAnchorDate),
  }));
  const [activeWeekNumber, setActiveWeekNumber] = useState(initialSeasonWeek);
  const [routines, setRoutines] = useState(normalizeRoutineLibrary(DEFAULT_ROUTINE_LIBRARY));
  const [trainings, setTrainings] = useState(normalizeTrainingCatalog(TRAINING_DATASET));
  const [notifications, setNotifications] = useState([]);
  const [athleteNotificationsById, setAthleteNotificationsById] = useState({});
  const [history, setHistory] = useState([]);
  const [calendarWeeks, setCalendarWeeks] = useState([]);
  const [seedMeta, setSeedMeta] = useState(null);
  const [customExercises, setCustomExercises] = useState([]);
  const [exerciseImages, setExerciseImages] = useState({});
  const week = normalizeWeek(
    ensureWeekInPlans(weekPlansByNumber, activeWeekNumber, routines, seasonAnchorDate),
    routines
  );
  const setWeek = useCallback((updater) => {
    setWeekPlansByNumber((prev) => {
      const current = ensureWeekInPlans(prev, activeWeekNumber, routines, seasonAnchorDate);
      const nextRaw = typeof updater === "function" ? updater(current) : updater;
      const nextWeek = withWeekMetadata(nextRaw, activeWeekNumber, routines, seasonAnchorDate);
      return {
        ...prev,
        [activeWeekNumber]: nextWeek,
      };
    });
  }, [activeWeekNumber, routines, seasonAnchorDate]);

  // Load persisted session
  useEffect(() => {
    (async () => {
      await hydrateStorageWriteAccess();
      const [
        savedUser,
        savedAthletes,
        savedUsersCsv,
        savedCurrentSeasonId,
        savedSeasonWeekOneStart,
        savedSeasons,
        savedWeek,
        savedWeekPlans,
        savedActiveWeekNumber,
        savedRoutines,
        savedTrainings,
        savedNotifs,
        savedAthleteNotifs,
        savedGroups,
        savedHistory,
        savedCalendarWeeks,
        savedSeedMeta,
        savedPesasRaw,
        savedCustomEx,
        savedExImages,
      ] = await Promise.all([
        store.get("tf_user"),
        store.get("tf_athletes"),
        store.getRaw("tf_users_csv"),
        store.get("tf_current_season_id"),
        store.get("tf_season_week_one_start"),
        store.get("tf_seasons"),
        store.get("tf_week"),
        store.get("tf_week_plans"),
        store.get("tf_active_week_number"),
        store.get("tf_routines"),
        store.get("tf_trainings"),
        store.get("tf_notifs"),
        store.get("tf_athlete_notifs"),
        store.get("tf_groups"),
        store.get("tf_history"),
        store.get("tf_calendar_weeks"),
        store.get("tf_seed_meta"),
        store.get("tf_pesas_raw"),
        store.get("tf_custom_exercises"),
        store.get("tf_exercise_images"),
      ]);

      const loadedCurrentSeasonId = normalizeSeasonId(savedCurrentSeasonId, DEFAULT_SEASON_ID);
      const loadedSeasonWeekOneStartIso = normalizeSeasonWeekOneStartIso(
        savedSeasonWeekOneStart,
        DEFAULT_SEASON_WEEK_ONE_START_ISO
      );
      const loadedSeasonAnchorDate = parseIsoDateToLocalDate(loadedSeasonWeekOneStartIso) || SEASON_ANCHOR_DATE;
      const loadedSeasons = normalizeSeasonCollection(
        savedSeasons,
        loadedCurrentSeasonId,
        loadedSeasonWeekOneStartIso
      );
      setCurrentSeasonId(loadedCurrentSeasonId);
      setSeasonWeekOneStartIso(loadedSeasonWeekOneStartIso);
      setSeasons(loadedSeasons);

      const loadedRoutines = normalizeRoutineLibrary(savedRoutines || DEFAULT_ROUTINE_LIBRARY);
      setRoutines(loadedRoutines);
      setTrainings(normalizeTrainingCatalog(savedTrainings || TRAINING_DATASET));

      if (savedUser) {
        setUser(savedUser);
        if (savedUser.role !== "coach") {
          await signOutStorageSession();
        }
      }
      if (Array.isArray(savedCalendarWeeks)) setCalendarWeeks(savedCalendarWeeks);
      if (savedSeedMeta) setSeedMeta(savedSeedMeta);
      if (savedPesasRaw && typeof window !== "undefined") {
        window.PESAS2024_HARDCODED_DB = savedPesasRaw;
      }
      if (Array.isArray(savedCustomEx)) setCustomExercises(savedCustomEx);
      if (savedExImages && typeof savedExImages === "object") setExerciseImages(savedExImages);

      const csvAthletes = athletesFromCsv(savedUsersCsv);
      const loadedAthletes = normalizeAthletes(csvAthletes?.length ? csvAthletes : (savedAthletes || DEFAULT_ATHLETES));
      setAthletes(loadedAthletes);
      setGroups(mergeGroupOptions(GROUPS, savedGroups, collectAthleteGroups(loadedAthletes)));

      const defaultWeekNumber = getTodaySeasonWeekNumber(loadedSeasonAnchorDate);
      const loadedWeekPlans = normalizeWeekPlansByNumber(savedWeekPlans, loadedRoutines, loadedSeasonAnchorDate);
      if (!Object.keys(loadedWeekPlans).length && savedWeek) {
        const legacyWeekNumber = normalizeWeekNumber(savedWeek.weekNumber, defaultWeekNumber);
        loadedWeekPlans[legacyWeekNumber] = withWeekMetadata(
          savedWeek,
          legacyWeekNumber,
          loadedRoutines,
          loadedSeasonAnchorDate
        );
      }
      if (!Object.keys(loadedWeekPlans).length) {
        const activeCalendarWeek = pickActiveCalendarWeek(savedCalendarWeeks);
        const seededWeek = buildWeekFromCalendarSeed(activeCalendarWeek, loadedRoutines);
        if (seededWeek) {
          const seededWeekNumber = normalizeWeekNumber(seededWeek.weekNumber, defaultWeekNumber);
          loadedWeekPlans[seededWeekNumber] = withWeekMetadata(
            seededWeek,
            seededWeekNumber,
            loadedRoutines,
            loadedSeasonAnchorDate
          );
        }
      }
      if (!Object.keys(loadedWeekPlans).length) {
        loadedWeekPlans[defaultWeekNumber] = createWeekForNumber(
          defaultWeekNumber,
          loadedRoutines,
          {},
          loadedSeasonAnchorDate
        );
      }
      const firstLoadedWeek = Number(Object.keys(loadedWeekPlans)[0]);
      const initialActiveWeek = normalizeWeekNumber(
        savedActiveWeekNumber,
        savedWeek?.weekNumber || firstLoadedWeek || defaultWeekNumber
      );
      if (!loadedWeekPlans[initialActiveWeek]) {
        loadedWeekPlans[initialActiveWeek] = createWeekForNumber(
          initialActiveWeek,
          loadedRoutines,
          {},
          loadedSeasonAnchorDate
        );
      }
      setWeekPlansByNumber(loadedWeekPlans);
      setActiveWeekNumber(initialActiveWeek);

      if (savedNotifs) setNotifications(savedNotifs);
      if (savedAthleteNotifs) setAthleteNotificationsById(normalizeAthleteNotificationsMap(savedAthleteNotifs));
      if (Array.isArray(savedHistory)) setHistory(savedHistory);
      setLoading(false);
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (loading) return;
    if (user) store.set("tf_user", user);
  }, [loading, user]);
  useEffect(() => {
    if (loading) return;
    const normalized = normalizeAthletes(athletes);
    store.set("tf_athletes", normalized);
    store.setRaw("tf_users_csv", athletesToCsv(normalized));
  }, [loading, athletes]);
  useEffect(() => {
    if (loading) return;
    setGroups((prev) => {
      const merged = mergeGroupOptions(GROUPS, prev, collectAthleteGroups(athletes));
      return merged.length === prev.length && merged.every((g, i) => g === prev[i]) ? prev : merged;
    });
  }, [loading, athletes]);
  useEffect(() => {
    if (loading) return;
    const safeWeekNumber = normalizeWeekNumber(activeWeekNumber, getTodaySeasonWeekNumber(seasonAnchorDate));
    setWeekPlansByNumber((prev) => {
      if (prev?.[safeWeekNumber]) return prev;
      return {
        ...prev,
        [safeWeekNumber]: createWeekForNumber(safeWeekNumber, routines, {}, seasonAnchorDate),
      };
    });
  }, [loading, activeWeekNumber, routines, seasonAnchorDate]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_groups", groups);
  }, [loading, groups]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_week_plans", normalizeWeekPlansByNumber(weekPlansByNumber, routines, seasonAnchorDate));
  }, [loading, weekPlansByNumber, routines, seasonAnchorDate]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_active_week_number", normalizeWeekNumber(activeWeekNumber, getTodaySeasonWeekNumber(seasonAnchorDate)));
  }, [loading, activeWeekNumber, seasonAnchorDate]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_week", normalizeWeek(week, routines));
  }, [loading, week, routines]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_routines", normalizeRoutineLibrary(routines));
  }, [loading, routines]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_trainings", normalizeTrainingCatalog(trainings));
  }, [loading, trainings]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_notifs", notifications);
  }, [loading, notifications]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_athlete_notifs", normalizeAthleteNotificationsMap(athleteNotificationsById));
  }, [loading, athleteNotificationsById]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_history", history);
  }, [loading, history]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_calendar_weeks", Array.isArray(calendarWeeks) ? calendarWeeks : []);
  }, [loading, calendarWeeks]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_seed_meta", seedMeta || null);
  }, [loading, seedMeta]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_custom_exercises", customExercises);
  }, [loading, customExercises]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_exercise_images", exerciseImages);
  }, [loading, exerciseImages]);
  useEffect(() => {
    if (loading) return;
    const normalized = normalizeSeasonCollection(seasons, currentSeasonId, seasonWeekOneStartIso);
    store.set("tf_seasons", normalized);
  }, [loading, seasons, currentSeasonId, seasonWeekOneStartIso]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_current_season_id", normalizeSeasonId(currentSeasonId, DEFAULT_SEASON_ID));
  }, [loading, currentSeasonId]);
  useEffect(() => {
    if (loading) return;
    store.set("tf_season_week_one_start", normalizeSeasonWeekOneStartIso(seasonWeekOneStartIso, DEFAULT_SEASON_WEEK_ONE_START_ISO));
  }, [loading, seasonWeekOneStartIso]);

  const handleLogin = async (u, authMeta = null) => {
    let resolvedUser = u || null;

    if (u?.role === "coach") {
      const fallbackLogin = String(authMeta?.coachLoginInput || "").trim();
      const configuredAdminEmail = String(import.meta.env.VITE_ADMIN_EMAIL || "").trim();
      const adminLogin = configuredAdminEmail || fallbackLogin || String(COACH?.name || "").trim();
      const authResult = await signInStorageSession({
        email: adminLogin,
        password: String(authMeta?.coachPassword || ""),
      });
      if (!authResult?.ok) {
        return { ok:false, error: authResult?.error || "No se pudo validar la sesi?n del entrenador." };
      }
      resolvedUser = COACH;
    } else if (u?.role === "athlete") {
      const authResult = await signInStorageSession({
        email: String(authMeta?.athleteLoginInput || u?.name || "").trim(),
        password: String(authMeta?.athletePassword || u?.password || ""),
        role: "athlete",
      });
      if (!authResult?.ok) {
        return { ok:false, error: authResult?.error || "No se pudo validar la sesi?n del atleta." };
      }

      const roster = normalizeAthletes(athletes);
      const resolvedAthleteId = String(authResult?.user?.athleteId || "").trim();
      const requestedName = String(authMeta?.athleteLoginInput || u?.name || "")
        .trim()
        .toLowerCase();
      const athleteProfile = roster.find((athlete) => athlete.id === resolvedAthleteId)
        || roster.find((athlete) => athlete.name.trim().toLowerCase() === requestedName);

      if (!athleteProfile) {
        return { ok:false, error: "El atleta autenticado no existe en el roster cargado." };
      }

      resolvedUser = { ...athleteProfile, role: "athlete" };
    } else {
      return { ok:false, error: "Rol de usuario no v?lido." };
    }

    setUser(resolvedUser);
    setPage(resolvedUser.role === "coach" ? "semana" : "hoy");
    return { ok:true, user: resolvedUser };
  };

  const handleLogout = async () => {
    setUser(null);
    await signOutStorageSession();
    store.set("tf_user", null);
  };

  const pushAthleteNotifications = (targets, payload) => {
    const rawTargets = Array.isArray(targets) ? targets : [targets];
    const groupSet = new Set();
    const athleteSet = new Set();
    let includeAll = false;
    rawTargets.forEach((rawTarget) => {
      const token = String(rawTarget || "").trim();
      if (!token) return;
      if (token === "all") {
        includeAll = true;
        return;
      }
      if (token.startsWith("athlete:")) {
        const athleteId = token.slice("athlete:".length).trim();
        if (athleteId) athleteSet.add(athleteId);
        return;
      }
      const group = normalizeGroupName(token);
      if (group) groupSet.add(group);
    });
    if (!includeAll && !groupSet.size && !athleteSet.size) includeAll = true;
    const createdAt = new Date().toISOString();
    setAthleteNotificationsById((prev) => {
      const next = { ...normalizeAthleteNotificationsMap(prev) };
      normalizeAthletes(athletes).forEach((athlete) => {
        const athleteGroups = getAthleteGroups(athlete);
        const isTargeted = includeAll
          || athleteSet.has(String(athlete.id || "").trim())
          || athleteGroups.some((group) => groupSet.has(group));
        if (!isTargeted) return;
        const entry = {
          id: `notif_${athlete.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: payload?.title || "Actualización",
          message: payload?.message || "",
          weekNumber: payload?.weekNumber != null ? Number(payload.weekNumber) : null,
          createdAt,
        };
        const list = Array.isArray(next[athlete.id]) ? next[athlete.id] : [];
        next[athlete.id] = [entry, ...list].slice(0, 50);
      });
      return next;
    });
  };
  const handlePublishWeek = ({ weekNumber, isUpdate, targetGroups }) => {
    const hasTargets = Array.isArray(targetGroups) && targetGroups.length > 0;
    if (isUpdate && !hasTargets) return;
    const targets = hasTargets ? targetGroups : ["all"];
    const safeWeekNumber = normalizeWeekNumber(
      weekNumber,
      activeWeekNumber || getTodaySeasonWeekNumber(seasonAnchorDate)
    );
    pushAthleteNotifications(targets, {
      title: isUpdate ? `Semana ${safeWeekNumber} modificada` : `Semana ${safeWeekNumber} publicada`,
      message: isUpdate
        ? "Se ha actualizado tu plan semanal (grupo o asignación directa)."
        : "Tu nueva semana ya está publicada y disponible en calendario.",
      weekNumber: safeWeekNumber,
    });
  };
  const handleFinalizeSeason = ({ nextSeasonId, nextWeekOneStartIso }) => {
    const safeNextSeasonIdRaw = normalizeSeasonId(nextSeasonId, getNextSeasonId(currentSeasonId));
    const safeNextSeasonId = safeNextSeasonIdRaw === currentSeasonId
      ? getNextSeasonId(currentSeasonId)
      : safeNextSeasonIdRaw;
    const safeNextWeekOneStartIso = normalizeSeasonWeekOneStartIso(nextWeekOneStartIso, "");
    if (!safeNextWeekOneStartIso) return;

    const nowIso = new Date().toISOString();
    const archivedSnapshot = {
      weekPlansByNumber: normalizeWeekPlansByNumber(weekPlansByNumber, routines, seasonAnchorDate),
      activeWeekNumber: normalizeWeekNumber(activeWeekNumber, getTodaySeasonWeekNumber(seasonAnchorDate)),
      history: Array.isArray(history) ? history : [],
      notifications: Array.isArray(notifications) ? notifications : [],
      athleteNotificationsById: normalizeAthleteNotificationsMap(athleteNotificationsById),
      calendarWeeks: Array.isArray(calendarWeeks) ? calendarWeeks : [],
      athletes: normalizeAthletes(athletes),
      groups: mergeGroupOptions(groups),
      trainings: normalizeTrainingCatalog(trainings),
      routines: normalizeRoutineLibrary(routines),
      customExercises: Array.isArray(customExercises) ? customExercises : [],
      exerciseImages: exerciseImages && typeof exerciseImages === "object" ? exerciseImages : {},
      seedMeta: seedMeta || null,
      archivedAt: nowIso,
    };

    setSeasons((prev) => {
      const normalized = normalizeSeasonCollection(prev, currentSeasonId, seasonWeekOneStartIso);
      const withClosedCurrent = normalized.map((season) => (
        season.id === currentSeasonId
          ? buildSeasonRecord({
              ...season,
              id: currentSeasonId,
              weekOneStartIso: seasonWeekOneStartIso,
              finalizedAt: nowIso,
              archived: archivedSnapshot,
            })
          : season
      ));
      const hasNext = withClosedCurrent.some((season) => season.id === safeNextSeasonId);
      const withNext = hasNext
        ? withClosedCurrent.map((season) => (
            season.id === safeNextSeasonId
              ? buildSeasonRecord({
                  ...season,
                  id: safeNextSeasonId,
                  weekOneStartIso: safeNextWeekOneStartIso,
                  finalizedAt: null,
                  startedAt: season.startedAt || nowIso,
                })
              : season
          ))
        : [
            ...withClosedCurrent,
            buildSeasonRecord({
              id: safeNextSeasonId,
              weekOneStartIso: safeNextWeekOneStartIso,
              startedAt: nowIso,
              finalizedAt: null,
              archived: null,
            }),
          ];
      return normalizeSeasonCollection(withNext, safeNextSeasonId, safeNextWeekOneStartIso);
    });

    const nextAnchorDate = parseIsoDateToLocalDate(safeNextWeekOneStartIso) || SEASON_ANCHOR_DATE;
    const resetAthletes = normalizeAthletes(athletes).map((athlete, idx) =>
      normalizeAthleteRecord({
        ...athlete,
        weekKms: [],
        todayDone: false,
        competitions: [],
      }, idx)
    );

    setCurrentSeasonId(safeNextSeasonId);
    setSeasonWeekOneStartIso(safeNextWeekOneStartIso);
    setWeekPlansByNumber({
      1: createWeekForNumber(1, routines, {}, nextAnchorDate),
    });
    setActiveWeekNumber(1);
    setHistory([]);
    setNotifications([]);
    setAthleteNotificationsById({});
    setCalendarWeeks([]);
    setSeedMeta(null);
    setAthletes(resetAthletes);
    setPage("semana");
  };
  const handleDismissAthleteNotification = (athleteId, notificationId) => {
    if (!athleteId || !notificationId) return;
    setAthleteNotificationsById((prev) => {
      const next = { ...normalizeAthleteNotificationsMap(prev) };
      const list = Array.isArray(next[athleteId]) ? next[athleteId] : [];
      next[athleteId] = list.filter((item) => item.id !== notificationId);
      if (!next[athleteId].length) delete next[athleteId];
      return next;
    });
  };
  const handleClearAthleteNotifications = (athleteId) => {
    if (!athleteId) return;
    setAthleteNotificationsById((prev) => {
      const next = { ...normalizeAthleteNotificationsMap(prev) };
      delete next[athleteId];
      return next;
    });
  };
  const handleUpdateAthleteName = (athleteId, nextName) => {
    if (!athleteId) return { ok:false, error:"Atleta no válido." };
    const safeName = String(nextName || "").trim();
    if (safeName.length < 2) return { ok:false, error:"El nombre debe tener al menos 2 caracteres." };
    const normalized = safeName.toLowerCase();
    const exists = normalizeAthletes(athletes).some((athlete) =>
      athlete.id !== athleteId && String(athlete.name || "").trim().toLowerCase() === normalized
    );
    if (exists) return { ok:false, error:"Ya existe otro atleta con ese nombre." };

    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) =>
      athlete.id === athleteId
        ? normalizeAthleteRecord({ ...athlete, name: safeName }, idx)
        : normalizeAthleteRecord(athlete, idx)
    ));
    setUser((prev) => (prev && prev.id === athleteId ? { ...prev, name: safeName } : prev));
    return { ok:true };
  };
  const handleDeleteAthlete = (athleteId) => {
    if (!athleteId) return;
    setAthletes((prev) => normalizeAthletes(prev).filter((athlete) => athlete.id !== athleteId));
    setAthleteNotificationsById((prev) => {
      const next = { ...normalizeAthleteNotificationsMap(prev) };
      delete next[athleteId];
      return next;
    });
    setHistory((prev) => (Array.isArray(prev) ? prev.filter((row) => row?.athleteId !== athleteId) : []));
    setUser((prev) => (prev && prev.id === athleteId ? null : prev));
  };
  const handleUpdateAthletePassword = (athleteId, nextPassword) => {
    if (!athleteId) return;
    const safePassword = String(nextPassword || "").trim() || "1234";
    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) =>
      athlete.id === athleteId
        ? normalizeAthleteRecord({ ...athlete, password:safePassword, passwordChangedOnce:true }, idx)
        : normalizeAthleteRecord(athlete, idx)
    ));
    setUser((prev) => (prev && prev.id === athleteId
      ? { ...prev, password:safePassword, passwordChangedOnce:true }
      : prev
    ));
  };
  const handleAddCompetition = (athleteId, competition) => {
    if (!athleteId || !competition) return;
    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) => {
      if (athlete.id !== athleteId) return normalizeAthleteRecord(athlete, idx);
      const competitions = normalizeCompetitionList([...(athlete.competitions || []), competition]);
      return normalizeAthleteRecord({ ...athlete, competitions }, idx);
    }));
  };
  const handleRemoveCompetition = (athleteId, competitionId) => {
    if (!athleteId || !competitionId) return;
    setAthletes((prev) => normalizeAthletes(prev).map((athlete, idx) => {
      if (athlete.id !== athleteId) return normalizeAthleteRecord(athlete, idx);
      const competitions = normalizeCompetitionList((athlete.competitions || []).filter((competition) => competition.id !== competitionId));
      return normalizeAthleteRecord({ ...athlete, competitions }, idx);
    }));
  };
  const handleToggleSlotCompletion = (athlete, slot, nextDone) => {
    if (!athlete || !["am", "pm", "gym"].includes(slot)) return;
    const todayI = todayIdx();
    const todayIso = toIsoDate();
    const publishedWeek = resolvePublishedWeek(week, routines);
    const todayPlan = publishedWeek?.days?.[todayI] || {};
    const visibleToday = getVisibleDayPlanForAthlete(publishedWeek || week, todayPlan, athlete, routines);
    const slotPlan = getDaySlotPlanState(visibleToday);
    if (slot === "am" && !slotPlan.amPlanned) return;
    if (slot === "pm" && !slotPlan.pmPlanned) return;
    if (slot === "gym" && !slotPlan.gymPlanned) return;

    const existingRow = (history || []).find((row) => row?.athleteId === athlete.id && row?.dateIso === todayIso) || null;
    const prevAmDone = slotPlan.amPlanned ? !!existingRow?.amDone : false;
    const prevPmDone = slotPlan.pmPlanned ? !!existingRow?.pmDone : false;
    const prevGymDone = slotPlan.gymPlanned ? !!existingRow?.gymDone : false;

    const amDone = slotPlan.amPlanned ? (slot === "am" ? !!nextDone : prevAmDone) : false;
    const pmDone = slotPlan.pmPlanned ? (slot === "pm" ? !!nextDone : prevPmDone) : false;
    const gymDone = slotPlan.gymPlanned ? (slot === "gym" ? !!nextDone : prevGymDone) : false;
    const doneSlots = Number(amDone) + Number(pmDone) + Number(gymDone);
    const completed = slotPlan.plannedSlots > 0 && doneSlots >= slotPlan.plannedSlots;

    setAthletes((prev) => prev.map((item) => item.id === athlete.id ? { ...item, todayDone: completed } : item));

    const now = new Date();
    const historyId = `${todayIso}_${athlete.id}`;
    setHistory((prev) => {
      const rest = (prev || []).filter((row) => !(row?.athleteId === athlete.id && row?.dateIso === todayIso));
      if (doneSlots === 0) return rest;
      const historyRow = {
        id: historyId,
        athleteId: athlete.id,
        athlete: athlete.name,
        group: getAthletePrimaryGroup(athlete),
        groups: getAthleteGroups(athlete),
        dateIso: todayIso,
        dateLabel: now.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}),
        time: now.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}),
        am: (visibleToday.am || []).map((session) => session.name).join(" · "),
        pm: (visibleToday.pm || []).map((session) => session.name).join(" · "),
        gym: !!visibleToday.gym,
        amDone,
        pmDone,
        gymDone,
        completed,
      };
      return [historyRow, ...rest].slice(0, 500);
    });
  };

  if (loading) return (
    <div className="app-loading">
      <div className="app-loading-inner">
        <div className="login-logo app-loading-logo">TRACK<span>FLOW</span></div>
        <div className="pulse app-loading-text">Cargando...</div>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin} athletes={athletes} />;

  const isCoach = user.role === "coach";
  const isCoachScrollablePage = isCoach && ["gym", "dataset", "athletes", "calendario_semanal", "temporadas"].includes(page);
  const isAthleteScrollablePage = !isCoach && ["gym", "jogatina"].includes(page);
  const allowPageScroll = isCoachScrollablePage || isAthleteScrollablePage;
  const mainAreaClass = `main-area ${allowPageScroll ? "main-area-scroll" : "main-area-fit"}`;
  const pageShellClass = `page-shell ${allowPageScroll ? "page-shell-scroll" : "page-shell-fit"}`;
  const publishedWeek = resolvePublishedWeek(week, routines);
  const currentAthlete = !isCoach ? normalizeAthleteRecord(athletes.find((athlete) => athlete.id === user.id) || user) : null;
  const athleteWeek = publishedWeek || normalizeWeek({
    id: "week_unpublished",
    name: week.name || "Semana pendiente",
    type: week.type || "Inicial",
    days: DAYS_FULL.map(() => ({ })),
  }, routines);
  const athleteNotifications = currentAthlete ? (athleteNotificationsById[currentAthlete.id] || []) : [];

  const renderPage = () => {
    if (isCoach) {
      switch(page) {
        case "semana":     return <CoachSemanaV2 week={week} setWeek={setWeek} routines={routines} trainings={trainings} athletes={athletes} groups={groups} customExercises={customExercises} exerciseImages={exerciseImages} activeWeekNumber={activeWeekNumber} setActiveWeekNumber={setActiveWeekNumber} onPublishWeek={handlePublishWeek} seasonAnchorDate={seasonAnchorDate} />;
        case "calendario": return <CoachCalendario week={week} routines={routines} history={history} activeWeekNumber={activeWeekNumber} seasonAnchorDate={seasonAnchorDate} />;
        case "calendario_semanal": return <CoachHistorial weekPlansByNumber={weekPlansByNumber} routines={routines} history={history} athletes={athletes} setAthletes={setAthletes} groups={groups} setGroups={setGroups} onRenameAthlete={handleUpdateAthleteName} onDeleteAthlete={handleDeleteAthlete} view="history" seasonAnchorDate={seasonAnchorDate} />;
        case "gym":        return <CoachGymV2 customExercises={customExercises} setCustomExercises={setCustomExercises} exerciseImages={exerciseImages} setExerciseImages={setExerciseImages} />;
        case "dataset":    return <CoachTrainingsDataset trainings={trainings} setTrainings={setTrainings} />;
        case "athletes":   return <CoachHistorial weekPlansByNumber={weekPlansByNumber} routines={routines} history={history} athletes={athletes} setAthletes={setAthletes} groups={groups} setGroups={setGroups} onRenameAthlete={handleUpdateAthleteName} onDeleteAthlete={handleDeleteAthlete} view="athletes" seasonAnchorDate={seasonAnchorDate} />;
        case "temporadas": return <CoachTemporadas currentSeasonId={currentSeasonId} seasonWeekOneStartIso={seasonWeekOneStartIso} seasons={seasons} onFinalizeSeason={handleFinalizeSeason} />;
        default:           return <CoachSemanaV2 week={week} setWeek={setWeek} routines={routines} trainings={trainings} athletes={athletes} groups={groups} customExercises={customExercises} exerciseImages={exerciseImages} activeWeekNumber={activeWeekNumber} setActiveWeekNumber={setActiveWeekNumber} onPublishWeek={handlePublishWeek} seasonAnchorDate={seasonAnchorDate} />;
      }
    } else {
      const currentUser = currentAthlete;
      if (!currentUser) return null;
      switch(page) {
        case "hoy":        return <AthleteHoy user={currentUser} week={athleteWeek} routines={routines} history={history} onToggleSlotCompletion={(slot, done) => handleToggleSlotCompletion(currentUser, slot, done)} onDismissNotification={(notificationId) => handleDismissAthleteNotification(currentUser?.id, notificationId)} onClearNotifications={() => handleClearAthleteNotifications(currentUser?.id)} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} athleteNotifications={athleteNotifications} />;
        case "semana":     return <AthleteSemana week={athleteWeek} routines={routines} user={currentUser} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} />;
        case "jogatina":   return <AthleteJogatina athlete={currentUser} />;
        case "gym":        return <AthleteGym user={currentUser} routines={routines} week={athleteWeek} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} />;
        case "perfil":     return <AthletePerfil user={currentUser} onUpdateName={(nextName) => handleUpdateAthleteName(currentUser?.id, nextName)} onUpdatePassword={(nextPassword) => handleUpdateAthletePassword(currentUser?.id, nextPassword)} />;
        case "calendario": return <AthleteCalendario user={currentUser} week={athleteWeek} routines={routines} history={history} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} onAddCompetition={(competition) => handleAddCompetition(currentUser.id, competition)} onRemoveCompetition={(competitionId) => handleRemoveCompetition(currentUser.id, competitionId)} />;
        default: return null;
      }
    }
  };

  return (
    <div className="app-wrap">
      <Sidebar
        user={user}
        page={page}
        setPage={setPage}
        onLogout={handleLogout}
        notifCount={isCoach ? notifications.length : athleteNotifications.length}
      />
      <MobileNavigation
        user={user}
        page={page}
        setPage={setPage}
        onLogout={handleLogout}
        notifCount={isCoach ? notifications.length : athleteNotifications.length}
      />
      <div className={mainAreaClass}>
        <div className={pageShellClass}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
