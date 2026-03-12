import { useState, useEffect, useCallback, useRef } from "react";

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
// type: "weight" = series×reps×%1RM→kg | "reps" = series×reps sin peso | "time" = series×segundos

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
  { id:"plank", name:"Plancha",         emoji:"⏱️",   muscles:"Core · Abdomen",         category:"core",       type:"time"   },
  { id:"box",   name:"Box Jump",        emoji:"📦",   muscles:"Cuádriceps · Glúteos",   category:"power",      type:"reps"   },
  { id:"sj",    name:"Salto Vertical",  emoji:"⬆️",   muscles:"Gemelos · Glúteos",      category:"power",      type:"reps"   },
];

const DEFAULT_ATHLETES = [
  { id:"marc",  name:"Marc Rodríguez",  group:"1500m",   isHR:true,  avatar:"MR", maxW:{ sq:100,dl:120,bp:80, ht:140,lp:180,row:70, lunge:60,rdl:90, calf:100,pm:55 }, stravaConnected:false, weekKms:[12,0,15,0,14,8,0] },
  { id:"alex",  name:"Àlex Puig",       group:"1500m",   isHR:true,  avatar:"AP", maxW:{ sq:95, dl:110,bp:75, ht:130,lp:170,row:65, lunge:55,rdl:85, calf:90, pm:50 }, stravaConnected:true,  weekKms:[10,0,13,0,12,6,0] },
  { id:"jordi", name:"Jordi Mas",       group:"1500m",   isHR:true,  avatar:"JM", maxW:{ sq:105,dl:125,bp:85, ht:150,lp:190,row:75, lunge:65,rdl:95, calf:110,pm:60 }, stravaConnected:true,  weekKms:[14,0,16,0,15,9,0] },
  { id:"pau",   name:"Pau Ferrer",      group:"800m",    isHR:true,  avatar:"PF", maxW:{ sq:110,dl:130,bp:90, ht:155,lp:200,row:80, lunge:70,rdl:100,calf:115,pm:65 }, stravaConnected:false, weekKms:[11,0,14,0,13,7,0] },
  { id:"sergi", name:"Sergi Vila",      group:"800m",    isHR:true,  avatar:"SV", maxW:{ sq:90, dl:105,bp:70, ht:120,lp:165,row:60, lunge:50,rdl:80, calf:85, pm:45 }, stravaConnected:true,  weekKms:[9, 0,12,0,11,5,0] },
  { id:"arnau", name:"Arnau Soler",     group:"800m",    isHR:true,  avatar:"AS", maxW:{ sq:115,dl:135,bp:92, ht:160,lp:205,row:82, lunge:72,rdl:105,calf:120,pm:67 }, stravaConnected:false, weekKms:[13,0,15,0,14,8,0] },
  { id:"marta", name:"Marta Bosch",     group:"1500m",   isHR:true,  avatar:"MB", maxW:{ sq:75, dl:85, bp:50, ht:110,lp:140,row:45, lunge:40,rdl:70, calf:80, pm:35 }, stravaConnected:true,  weekKms:[10,0,12,0,11,6,0] },
  { id:"laia",  name:"Laia Pons",       group:"800m",    isHR:true,  avatar:"LP", maxW:{ sq:70, dl:80, bp:45, ht:100,lp:135,row:42, lunge:38,rdl:65, calf:75, pm:32 }, stravaConnected:false, weekKms:[8, 0,10,0,9, 4,0] },
  { id:"carla", name:"Carla Vidal",     group:"1500m",   isHR:true,  avatar:"CV", maxW:{ sq:80, dl:90, bp:55, ht:115,lp:150,row:48, lunge:42,rdl:72, calf:85, pm:38 }, stravaConnected:true,  weekKms:[11,0,13,0,12,7,0] },
  { id:"roger", name:"Roger Blanco",    group:"pequeños",isHR:false, avatar:"RB", maxW:{}, stravaConnected:false, weekKms:[] },
  { id:"noa",   name:"Noa Camps",       group:"pequeños",isHR:false, avatar:"NC", maxW:{}, stravaConnected:false, weekKms:[] },
  { id:"jan",   name:"Jan Serra",       group:"1500m",   isHR:false, avatar:"JS", maxW:{ sq:60,dl:70 }, stravaConnected:false, weekKms:[] },
];

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
  plank: { sets:3, reps:1,  pct:0,  type:"time",   duration:30 },
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
  id: "week_base_car",
  name: "Semana Base CAR",
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
  { id:"tr_run_regen",  name:"Rodaje regenerativo",     description:"Trote suave de recuperación activa",         zones:{ regen:6,  ua:0,  uan:0, anae:0 } },
  { id:"tr_run_z2",     name:"Rodaje Z2 continuo",       description:"Carrera continua a ritmo aeróbico",           zones:{ regen:2,  ua:8,  uan:0, anae:0 } },
  { id:"tr_run_z2_lng", name:"Rodaje largo Z2",          description:"Tirada larga de 80-100 minutos",              zones:{ regen:4,  ua:14, uan:0, anae:0 } },
  { id:"tr_fartlek_s",  name:"Fartlek suave",            description:"Cambios de ritmo a UA/UAN",                   zones:{ regen:2,  ua:4,  uan:3, anae:0 } },
  { id:"tr_fartlek_f",  name:"Fartlek intenso",          description:"Cambios de ritmo a UAN/Anae",                 zones:{ regen:2,  ua:3,  uan:4, anae:1 } },
  { id:"tr_series_200", name:"Series 200m",              description:"6-10 series de 200m a ritmo competición",     zones:{ regen:2,  ua:1,  uan:2, anae:3 } },
  { id:"tr_series_400", name:"Series 400m",              description:"6-8 series de 400m a ritmo UAN/Anae",         zones:{ regen:2,  ua:1,  uan:4, anae:2 } },
  { id:"tr_series_1k",  name:"Series 1000m extensivo",  description:"8-10 series de 1000m a ritmo UA/UAN",         zones:{ regen:2,  ua:2,  uan:6, anae:1 } },
  { id:"tr_series_800", name:"Series 800m",              description:"4-6 series de 800m a ritmo UAN",              zones:{ regen:2,  ua:1,  uan:5, anae:1 } },
  { id:"tr_tecnica",    name:"Técnica de carrera",       description:"Drills, ABC, skipping, pliometría",            zones:{ regen:2,  ua:0,  uan:0, anae:0 } },
  { id:"tr_precomp",    name:"Calentamiento precomp.",   description:"Calentamiento para competición",              zones:{ regen:2,  ua:1,  uan:1, anae:0 } },
  { id:"tr_competicion",name:"Competición",              description:"Carrera oficial o simulación de competición",  zones:{ regen:1,  ua:1,  uan:2, anae:4 } },
  { id:"tr_movilidad",  name:"Movilidad y estiramiento", description:"Trabajo de movilidad articular y flexibilidad",zones:{ regen:0,  ua:0,  uan:0, anae:0 } },
  { id:"tr_pliometria", name:"Pliometría",               description:"Saltos, multisaltos, trabajo explosivo",       zones:{ regen:1,  ua:0,  uan:1, anae:1 } },
  { id:"tr_umbral",     name:"Umbral aeróbico continuo", description:"Carrera continua al ritmo de umbral aeróbico", zones:{ regen:1,  ua:10, uan:1, anae:0 } },
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
const CUSTOM_TIME_EXERCISE_NAMES = new Set([
  "ISO SIN REBOTE 15\"",
  "HIP LOCK EN SKIPING 3\"",
  "FARMER WALK 15 M",
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
const CUSTOM_WEIGHT_EXERCISE_NAMES = new Set([
  "PESO MUERTO A UNA PIERNA",
  "SENTADILLA GLOBET",
  "PESO MUERTO MAS REMO ISO",
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
  "CARGADA",
  "PRESS HOMBRO1",
  "PRESS MILITAR IMPULSION PIERNA",
]);
const normalizeExerciseNameKey = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
const inferBuiltinExerciseType = (name) => {
  const key = normalizeExerciseNameKey(name);
  if (CUSTOM_TIME_EXERCISE_NAMES.has(key)) return "time";
  if (CUSTOM_WEIGHT_EXERCISE_NAMES.has(key)) return "weight";
  if (/"|ROLLER|PLANCHA|BRACEO/.test(key)) return "time";
  if (/PESO MUERTO|SENTADILLA|PRESS|REMO|ARRANCADA|CARGADA|DOS TIEMPOS/.test(key)) return "weight";
  return "reps";
};
const inferBuiltinExerciseCategory = (name, type) => {
  const key = normalizeExerciseNameKey(name);
  if (type === "time") return "stability";
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
  if (type === "time") return "⏱️";
  if (type === "weight") return "🏋️";
  return "🔁";
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
const ALL_BUILTIN_GYM_EXERCISES = [...GYM_EXERCISES, ...ADDITIONAL_GYM_EXERCISES];
const DAYS_SHORT = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const DAYS_FULL  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const GROUPS = ["por-asignar","1500m","800m","pequeños"];

const COACH = { id:"coach", name:"Entrenador Jordi", role:"coach", password:"CAR2024" };
const PESAS_DB_SOURCE = { file: "pesas2024_hardcoded_db.js", workbook: "PESAS2024.xlsx", format: "sparse-rows-trailing-null-trimmed" };
const HARDCODED_PESAS_DB = (typeof window !== "undefined" && window.PESAS2024_HARDCODED_DB) ? window.PESAS2024_HARDCODED_DB : null;

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;600;700;800;900&family=Nunito:wght@300;400;500;600;700&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080811;--s1:#0D0D1C;--s2:#12122A;--s3:#181830;
  --border:#1E1E3A;--border2:#252545;
  --or:#FF6B1A;--am:#FFA726;--or2:#FF8C42;
  --tx:#F0F0FA;--mu:#5C5C80;--mu2:#8888AA;
  --gr:#4ADE80;--bl:#60A5FA;--re:#F87171;--pu:#A78BFA;--ya:#FBBF24;
}
body{background:var(--bg);color:var(--tx);font-family:'Nunito',sans-serif;min-height:100vh;overflow-x:hidden}
h1,h2,h3,h4,.display{font-family:'Barlow Condensed',sans-serif;letter-spacing:.03em}
button{cursor:pointer;font-family:'Nunito',sans-serif}
input,select,textarea{font-family:'Nunito',sans-serif}

/* Layout */
.app-wrap{display:flex;min-height:100vh}
.sidebar{width:230px;background:var(--s1);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;overflow-y:auto}
.main-area{margin-left:230px;flex:1;padding:36px 40px;max-width:calc(100vw - 230px)}

/* Sidebar */
.sb-logo{padding:28px 24px 24px;border-bottom:1px solid var(--border)}
.sb-logotype{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;letter-spacing:-1px;line-height:1}
.sb-logotype span{color:var(--or)}
.sb-tagline{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--mu);margin-top:3px}
.sb-section{padding:20px 12px 8px}
.sb-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);padding:0 10px;margin-bottom:8px;display:block}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:10px;border:none;background:none;color:var(--mu2);font-size:13.5px;font-weight:600;width:100%;text-align:left;transition:all .15s;margin-bottom:2px}
.nav-item:hover{background:var(--s2);color:var(--tx)}
.nav-item.active{background:rgba(255,107,26,.18);color:var(--or)}
.nav-item .ni{font-size:16px;width:22px;text-align:center}
.sb-notif{background:var(--or);color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:100px;margin-left:auto}
.sb-bottom{margin-top:auto;padding:16px 12px;border-top:1px solid var(--border)}
.user-chip{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--s2)}
.avatar{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,var(--or),var(--am));display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;color:white;flex-shrink:0}
.avatar.blue{background:linear-gradient(135deg,var(--bl),#3B82F6)}
.avatar.green{background:linear-gradient(135deg,var(--gr),#22C55E)}
.avatar.purple{background:linear-gradient(135deg,var(--pu),#8B5CF6)}
.u-name{font-size:13px;font-weight:700;line-height:1.2}
.u-role{font-size:10px;color:var(--mu);letter-spacing:.5px}

/* Page header */
.ph{margin-bottom:32px}
.ph-title{font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:900;text-transform:uppercase;line-height:1}
.ph-title span{color:var(--or)}
.ph-sub{color:var(--mu);font-size:14px;margin-top:4px}
.ph-row{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px}

/* Cards */
.card{background:var(--s1);border:1px solid var(--border);border-radius:18px;padding:24px}
.card-title{font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px}
.card-sm{padding:16px;border-radius:14px}

/* Stats */
.stat-card{background:var(--s1);border:1px solid var(--border);border-radius:18px;padding:20px;position:relative;overflow:hidden}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--or),var(--am))}
.stat-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);margin-bottom:10px}
.stat-val{font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:900;line-height:1}
.stat-unit{font-size:18px;color:var(--mu2);margin-left:2px}
.stat-change{font-size:12px;color:var(--gr);margin-top:4px}

/* Grids */
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:9px;font-size:13.5px;font-weight:700;border:none;transition:all .15s}
.btn-or{background:var(--or);color:white}
.btn-or:hover{background:var(--or2);transform:translateY(-1px);box-shadow:0 4px 16px rgba(255,107,26,.3)}
.btn-ghost{background:transparent;color:var(--mu2);border:1px solid var(--border2)}
.btn-ghost:hover{background:var(--s2);color:var(--tx)}
.btn-sm{padding:7px 14px;font-size:12px;border-radius:7px}
.btn-success{background:rgba(74,222,128,.15);color:var(--gr);border:1px solid rgba(74,222,128,.3)}
.btn-danger{background:rgba(248,113,113,.15);color:var(--re);border:1px solid rgba(248,113,113,.3)}

/* Form */
.input,.select{background:var(--s2);border:1px solid var(--border2);border-radius:9px;padding:10px 14px;color:var(--tx);font-size:14px;width:100%;transition:border-color .15s}
.input:focus,.select:focus{outline:none;border-color:var(--or)}
.input::placeholder{color:var(--mu)}
.form-group{margin-bottom:14px}
.form-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);margin-bottom:6px;display:block;font-weight:700}

/* Badges */
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:100px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.b-or{background:rgba(255,107,26,.2);color:var(--or)}
.b-gr{background:rgba(74,222,128,.2);color:var(--gr)}
.b-bl{background:rgba(96,165,250,.2);color:var(--bl)}
.b-mu{background:var(--s2);color:var(--mu2)}
.b-pu{background:rgba(167,139,250,.2);color:var(--pu)}
.b-re{background:rgba(248,113,113,.2);color:var(--re)}
.b-ya{background:rgba(251,191,36,.2);color:var(--ya)}

/* Table */
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);padding:8px 14px;border-bottom:1px solid var(--border)}
.tbl td{padding:13px 14px;border-bottom:1px solid var(--border);font-size:13.5px}
.tbl tbody tr:last-child td{border-bottom:none}
.tbl tbody tr:hover td{background:rgba(255,255,255,.02)}

/* Week grid */
.week-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}
.day-col{background:var(--s1);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.day-col.today{border-color:var(--or);box-shadow:0 0 0 1px rgba(255,107,26,.2)}
.day-hdr{background:var(--s2);padding:10px 12px;text-align:center;border-bottom:1px solid var(--border)}
.day-name{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px}
.day-date{font-size:10px;color:var(--mu);margin-top:1px}
.day-body{padding:10px}
.session{background:var(--s2);border-radius:8px;padding:8px 10px;margin-bottom:6px;border-left:3px solid var(--or);font-size:11.5px}
.session.pm{border-left-color:var(--bl)}
.session.gym{border-left-color:var(--pu);cursor:pointer;transition:background .15s}
.session.gym:hover{background:rgba(167,139,250,.1)}
.sess-lbl{font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--mu);margin-bottom:2px}
.sess-txt{font-weight:600;font-size:11.5px}

/* Gym routine */
.ex-row{display:grid;grid-template-columns:42px 1fr 80px 70px 70px auto;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)}
.ex-row:last-child{border-bottom:none}
.ex-emoji{font-size:28px;text-align:center}
.ex-info-name{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700}
.ex-info-mu{font-size:11px;color:var(--mu2)}
.ex-big{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;color:var(--or);line-height:1;text-align:center}
.ex-lbl{font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--mu);text-align:center}

/* Progress */
.prog-bar{background:var(--s2);border-radius:100px;height:5px;overflow:hidden;margin-top:6px}
.prog-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,var(--or),var(--am));transition:width .5s ease}

/* Notification */
.notif{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.25);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:8px;animation:slideIn .3s ease}
@keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}

/* Login */
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden}
.login-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 25% 50%,rgba(255,107,26,.1) 0%,transparent 60%),radial-gradient(ellipse at 75% 20%,rgba(96,165,250,.06) 0%,transparent 50%),radial-gradient(ellipse at 50% 90%,rgba(167,139,250,.05) 0%,transparent 50%)}
.login-card{background:var(--s1);border:1px solid var(--border);border-radius:24px;padding:48px;width:440px;position:relative;z-index:1;box-shadow:0 40px 80px rgba(0,0,0,.4)}
.login-logo{font-family:'Barlow Condensed',sans-serif;font-size:60px;font-weight:900;letter-spacing:-2px;line-height:1;margin-bottom:4px}
.login-logo span{color:var(--or)}
.login-sub{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);margin-bottom:32px}
.tab-sw{display:flex;background:var(--s2);border-radius:10px;padding:4px;margin-bottom:24px}
.tab-btn{flex:1;padding:9px;border-radius:7px;border:none;background:transparent;color:var(--mu2);font-size:13px;font-weight:700;transition:all .2s;letter-spacing:.5px}
.tab-btn.active{background:var(--s1);color:var(--tx);box-shadow:0 2px 8px rgba(0,0,0,.3)}
.login-btn{width:100%;padding:13px;background:linear-gradient(135deg,var(--or),var(--am));color:white;border:none;border-radius:10px;font-size:15px;font-weight:800;letter-spacing:.5px;margin-top:8px;transition:all .2s}
.login-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(255,107,26,.4)}
.login-hint{font-size:12px;color:var(--mu);text-align:center;margin-top:16px}

/* Complete button */
.complete-btn{background:linear-gradient(135deg,var(--or),var(--am));color:white;border:none;border-radius:14px;padding:18px 32px;font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:800;letter-spacing:1px;text-transform:uppercase;width:100%;transition:all .2s;box-shadow:0 4px 24px rgba(255,107,26,.3)}
.complete-btn:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(255,107,26,.4)}
.complete-btn.done{background:linear-gradient(135deg,#4ADE80,#22C55E);box-shadow:0 4px 24px rgba(74,222,128,.3)}

/* Week type banner */
.wt-banner{background:linear-gradient(135deg,rgba(255,107,26,.12),rgba(255,167,38,.04));border:1px solid rgba(255,107,26,.25);border-radius:14px;padding:16px 22px;display:flex;align-items:center;gap:20px;margin-bottom:24px}
.wt-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--mu)}
.wt-val{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;text-transform:uppercase;color:var(--or);line-height:1}

/* Km volume view */
.km-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.km-name{width:120px;font-size:13px;font-weight:600;flex-shrink:0}
.km-bars{display:flex;gap:3px;flex:1;align-items:flex-end;height:44px}
.km-bar{flex:1;border-radius:4px 4px 0 0;min-height:3px;transition:opacity .2s;position:relative}
.km-bar:hover{opacity:.85}
.km-total{width:56px;text-align:right;font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:var(--or);flex-shrink:0}

/* Athlete tracking */
.ath-track-row{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)}
.ath-track-row:last-child{border-bottom:none}
.check-dot{width:30px;height:30px;border-radius:50%;border:2px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;transition:all .2s}
.check-dot.done{background:rgba(74,222,128,.2);border-color:var(--gr);color:var(--gr)}
.check-dot.nd{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.25);color:var(--re)}

/* Strava-like */
.strava-card{background:linear-gradient(135deg,rgba(252,76,2,.1),rgba(252,76,2,.03));border:1px solid rgba(252,76,2,.3);border-radius:14px;padding:20px}
.strava-connect{background:#FC4C02;color:white;border:none;border-radius:8px;padding:11px 20px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;transition:all .15s}
.strava-connect:hover{background:#e04500}

/* Group tag */
.g-tag{display:inline-block;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.g-1500{background:rgba(255,107,26,.2);color:var(--or)}
.g-800{background:rgba(96,165,250,.2);color:var(--bl)}
.g-pq{background:rgba(167,139,250,.2);color:var(--pu)}

/* Calendar month */
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cal-cell{background:var(--s2);border-radius:8px;padding:8px;min-height:70px;cursor:pointer;transition:border .15s;border:1px solid transparent}
.cal-cell:hover{border-color:var(--border2)}
.cal-cell.has-training{border-color:rgba(255,107,26,.3)}
.cal-cell.today-cell{border-color:var(--or);background:rgba(255,107,26,.06)}
.cal-day-num{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;margin-bottom:4px}
.cal-dot{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:3px}

/* Misc */
.divider{height:1px;background:var(--border);margin:20px 0}
.flex{display:flex}.fc{flex-direction:column}.ic{align-items:center}.jb{justify-content:space-between}.je{justify-content:flex-end}
.g2r{gap:8px}.g3r{gap:12px}.g4r{gap:16px}
.mb2{margin-bottom:8px}.mb3{margin-bottom:12px}.mb4{margin-bottom:16px}.mb6{margin-bottom:24px}
.mt3{margin-top:12px}.mt4{margin-top:16px}.mt6{margin-top:24px}
.text-mu{color:var(--mu)}.text-sm{font-size:13px}.fw7{font-weight:700}
.scroll-y{overflow-y:auto}
.opacity-50{opacity:.5}

/* Athlete today card */
.today-session{background:linear-gradient(135deg,rgba(255,107,26,.12),rgba(255,167,38,.04));border:1px solid rgba(255,107,26,.3);border-radius:18px;padding:24px}
.today-pm{background:linear-gradient(135deg,rgba(96,165,250,.1),rgba(96,165,250,.02));border:1px solid rgba(96,165,250,.25);border-radius:18px;padding:24px}
.big-time{font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--or);margin-bottom:8px}
.big-time.blue{color:var(--bl)}
.today-training{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;line-height:1.2;margin-bottom:8px}
.gym-pill{background:rgba(167,139,250,.2);color:var(--pu);border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
.gym-pill:hover{background:rgba(167,139,250,.35);transform:translateY(-1px)}

/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.modal{background:var(--s1);border:1px solid var(--border2);border-radius:20px;padding:32px;width:680px;max-width:90vw;max-height:85vh;overflow-y:auto}
.modal-title{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;text-transform:uppercase;margin-bottom:4px}
.modal-close{background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:6px 14px;color:var(--mu2);font-size:13px;font-weight:700}
.modal-close:hover{background:var(--s3);color:var(--tx)}

/* Pulse animation */
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
.pulse{animation:pulse 2s infinite}

/* Scrollbar */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:100px}

/* Zone pills */
.zone-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:10px;font-weight:700;letter-spacing:.5px}
.zone-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.zone-inputs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.zone-input-wrap{background:var(--s2);border-radius:10px;padding:10px 12px;border:1px solid var(--border)}
.zone-input-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:4px}
.zone-total-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}

/* Zone bar chart */
.zone-bar-wrap{display:flex;align-items:flex-end;gap:3px;height:48px}
.zone-bar{border-radius:3px 3px 0 0;min-height:2px;transition:height .3s ease}

/* Exercise library */
.ex-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.ex-lib-card{background:var(--s2);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;transition:all .15s;position:relative}
.ex-lib-card:hover{border-color:var(--border2);background:var(--s3)}
.ex-lib-card.selected{border-color:var(--or);background:rgba(255,107,26,.08)}
.ex-lib-img{width:100%;height:80px;object-fit:cover;border-radius:8px;margin-bottom:8px}
.ex-lib-emoji{font-size:32px;text-align:center;height:80px;display:flex;align-items:center;justify-content:center}
.ex-type-badge{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:100px}
.ex-type-weight{background:rgba(255,107,26,.2);color:var(--or)}
.ex-type-reps{background:rgba(96,165,250,.2);color:var(--bl)}
.ex-type-time{background:rgba(167,139,250,.2);color:var(--pu)}

/* Image upload */
.img-upload-zone{border:2px dashed var(--border2);border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:border-color .15s}
.img-upload-zone:hover{border-color:var(--or)}
.img-preview{width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:10px}

/* Tabs */
.tab-nav{display:flex;gap:4px;background:var(--s2);border-radius:10px;padding:4px;margin-bottom:20px}
.tab-nav-btn{flex:1;padding:8px 12px;border-radius:7px;border:none;background:transparent;color:var(--mu2);font-size:13px;font-weight:700;transition:all .2s;cursor:pointer}
.tab-nav-btn.active{background:var(--s1);color:var(--tx);box-shadow:0 2px 8px rgba(0,0,0,.3)}

/* Week navigation */
.week-nav{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.week-nav-btn{background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;color:var(--mu2);font-size:13px;font-weight:700;cursor:pointer;transition:all .15s}
.week-nav-btn:hover{background:var(--s3);color:var(--tx)}
.week-nav-btn:disabled{opacity:.35;cursor:default}
`;


// ─── UTILS ────────────────────────────────────────────────────────────────────
const calcWeight = (max, pct) => Math.round((max * pct) / 100 / 2.5) * 2.5;
const getToday = () => new Date().getDay(); // 0=Sun…6=Sat → convert to 0=Mon
const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };
const groupClass = (g) => g === "1500m" ? "g-1500" : g === "800m" ? "g-800" : "g-pq";
const groupBadge = (g) => g === "1500m" ? "b-or" : g === "800m" ? "b-bl" : "b-pu";
const avatarColor = (idx) => ["","blue","green","purple",""][idx % 4];
const groupLabel = (g) => g === "all" ? "Todos" : (g || "Todos");
const normalizeGroupName = (g) => String(g || "").trim().replace(/\s+/g, " ");
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
const cloneDeep = (value) => JSON.parse(JSON.stringify(value));
const normalizeWeekType = (type) => {
  const key = String(type || "").trim().toLowerCase();
  if (key.includes("compet")) return "Competitiva";
  if (key.includes("general") || key.includes("vol")) return "Volumen";
  return "Inicial";
};
const buildExerciseFallbackProfile = (type = "weight") => (
  type === "time"
    ? { sets:3, reps:1, pct:0, type:"time", duration:30 }
    : type === "reps"
      ? { sets:3, reps:8, pct:0, type:"reps", duration:0 }
      : { sets:4, reps:8, pct:70, type:"weight", duration:0 }
);
const normalizeTraining = (training, idx = 0) => ({
  id: training?.id || `training_${Date.now()}_${idx}`,
  name: String(training?.name || `Entreno ${idx + 1}`).trim(),
  description: String(training?.description || "").trim(),
  zones: safeZones(training?.zones),
  source: training?.source || "dataset",
});
const normalizeTrainingCatalog = (raw) =>
  (Array.isArray(raw) && raw.length ? raw : TRAINING_DATASET).map(normalizeTraining);
const getTrainingById = (trainings, id) =>
  (Array.isArray(trainings) ? trainings : []).find((training) => training.id === id) || null;
const makeTrainingSelection = (training, slot = "am", targetGroup = "all", overrides = {}) => (
  training
    ? {
        id: overrides.id || `session_${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        slot,
        trainingId: training.id,
        name: training.name,
        description: training.description || "",
        targetGroup: targetGroup || "all",
        zones: safeZones(training.zones),
      }
    : null
);
const normalizeTrainingSelection = (selection, slot = "am", fallbackTargetGroup = "all") => {
  if (!selection || !selection.name) return null;
  return {
    id: selection.id || `session_${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    slot: selection.slot || slot,
    trainingId: selection.trainingId || "",
    name: String(selection.name || "").trim(),
    description: String(selection.description || "").trim(),
    targetGroup: selection.targetGroup || fallbackTargetGroup || "all",
    zones: safeZones(selection.zones),
  };
};
const buildEmptyTrainingForm = () => ({
  name: "",
  description: "",
  zones: emptyZones(),
});
const isTargetVisibleForGroup = (targetGroup, group) => {
  const target = targetGroup || "all";
  return target === "all" || target === group;
};
const getPrimarySessionForSlot = (day, slot, week) => {
  const direct = day?.sessions?.[slot];
  if (direct) return normalizeTrainingSelection(direct, slot, direct.targetGroup || day?.targetGroup || week?.targetGroup || "all");
  const legacyName = slot === "am" ? day?.am : day?.pm;
  if (!legacyName) return null;
  return normalizeTrainingSelection({
    id: `legacy_${slot}_${String(legacyName).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    slot,
    trainingId: slot === "am" ? (day?.amTrainingId || "") : (day?.pmTrainingId || ""),
    name: legacyName,
    description: slot === "am" ? (day?.amDescription || "") : (day?.pmDescription || ""),
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
  const targets = new Set(
    ["am", "pm"]
      .flatMap((slot) => getSlotSessions(day, slot, week).map((session) => session.targetGroup || "all"))
      .concat(day?.gym ? [day?.gymPlan?.inline?.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all"] : [])
      .filter(Boolean)
  );
  if (!targets.size) return groupLabel(week?.targetGroup || "all");
  if (targets.has("all")) return "Todos";
  return targets.size === 1 ? groupLabel(Array.from(targets)[0]) : "Mixto";
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
  exercises: exerciseIds.map((exId) => ({ exId, ...buildExerciseFallbackProfile(getExerciseByIdFull(exId).type) })),
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
          const defProfile = DEFAULT_EXERCISE_LOAD_PROFILE[e?.exId] || buildExerciseFallbackProfile(defEx?.type || "weight");
          const exType = e?.type || defProfile?.type || defEx?.type || "weight";
          return {
            exId: e?.exId,
            name: e?.name || labelFromExId(e?.exId),
            sets: Number(e?.sets || 3),
            reps: Number(e?.reps || 8),
            pct: Number(e?.pct ?? (exType === "weight" ? 70 : 0)),
            type: exType,
            duration: Number(e?.duration || defProfile?.duration || 30),
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
      exercises: day.gymFocus.map((exId) => ({ exId, ...(DEFAULT_EXERCISE_LOAD_PROFILE[exId] || buildExerciseFallbackProfile(getExerciseByIdFull(exId).type)) })),
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
    const exType = row.type || ex.type || "weight";
    const max = user?.maxW?.[row.exId];
    const kg = (exType === "weight" && max && row.pct) ? calcWeight(max, row.pct) : null;
    return {
      ...ex, ...row,
      id: row.exId,
      name: row.name || ex.name,
      imageUrl: exerciseImages[row.exId] || row.imageUrl || ex.imageUrl || null,
      type: exType,
      duration: row.duration || ex.duration || 30,
      kg,
    };
  });
};
const isGymVisibleForGroup = (week, day, group, routines = []) => {
  const plan = getDayResolvedGymPlan(day, routines);
  if (!plan) return false;
  return isTargetVisibleForGroup(plan.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all", group);
};
const getVisibleDayPlanForGroup = (week, day, group, routines = []) => {
  const am = getSlotSessions(day, "am", week).filter((session) => isTargetVisibleForGroup(session.targetGroup, group));
  const pm = getSlotSessions(day, "pm", week).filter((session) => isTargetVisibleForGroup(session.targetGroup, group));
  const gymPlan = getDayResolvedGymPlan(day, routines);
  const gymVisible = !!gymPlan && isTargetVisibleForGroup(gymPlan.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all", group);
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
    getSlotSessions(day, slot, week).some((session) => isTargetVisibleForGroup(session.targetGroup, group))
  );
  if (visibleSessions) return true;
  if (!day?.gym) return false;
  const target = day?.gymPlan?.inline?.targetGroup || day?.gymTargetGroup || day?.targetGroup || week?.targetGroup || "all";
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
  return {
    ...(DEFAULT_EXERCISE_LOAD_PROFILE[exId] || buildExerciseFallbackProfile(exercise.type)),
    type: exercise.type || DEFAULT_EXERCISE_LOAD_PROFILE[exId]?.type || "weight",
  };
};

const formatExDuration = (sec) => {
  if (!sec) return "30s";
  const s = Number(sec);
  return s >= 60 ? `${Math.floor(s/60)}m${s%60>0?s%60+"s":""}` : `${s}s`;
};

// ─── ZONE UTILS ──────────────────────────────────────────────────────────────
const weekZoneSummary = (week) => {
  const out = emptyZones();
  (week?.days || []).forEach((day) => {
    [...getSlotSessions(day, "am", week), ...getSlotSessions(day, "pm", week)].forEach((session) => {
      ZONES.forEach((zone) => {
        out[zone.id] += Number(session?.zones?.[zone.id] || 0);
      });
    });
  });
  out.total = zonesTotal(out);
  return out;
};

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

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
const store = {
  getRaw: async (k) => { try { const r = await window.storage.get(k); return r ? r.value : null; } catch { return null; } },
  setRaw: async (k, v) => { try { await window.storage.set(k, String(v)); } catch {} },
  get: async (k) => { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  set: async (k, v) => { try { await window.storage.set(k, JSON.stringify(v)); } catch {} },
};

// ─── CSV REGISTRY (usuarios) ──────────────────────────────────────────────────
const ATHLETE_CSV_COLUMNS = [
  "id","name","group","isHR","avatar","stravaConnected","maxW","weekKms","todayDone"
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
  (athletes || []).forEach((a) => {
    const row = {
      id: a.id,
      name: a.name,
      group: a.group,
      isHR: a.isHR ? "1" : "0",
      avatar: a.avatar || "",
      stravaConnected: a.stravaConnected ? "1" : "0",
      maxW: JSON.stringify(a.maxW || {}),
      weekKms: JSON.stringify(a.weekKms || []),
      todayDone: a.todayDone ? "1" : "0",
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
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  if (!("id" in idx) || !("name" in idx)) return null;

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const pick = (k, d = "") => (idx[k] == null ? d : (cols[idx[k]] ?? d));
    let maxW = {};
    let weekKms = [];
    try { maxW = JSON.parse(pick("maxW", "{}")) || {}; } catch {}
    try { weekKms = JSON.parse(pick("weekKms", "[]")) || []; } catch {}
    return {
      id: pick("id"),
      name: pick("name"),
      group: pick("group", "por-asignar"),
      isHR: pick("isHR", "0") === "1",
      avatar: pick("avatar") || pick("name","").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2),
      stravaConnected: pick("stravaConnected", "0") === "1",
      maxW,
      weekKms,
      todayDone: pick("todayDone", "0") === "1",
    };
  }).filter(a => a.id && a.name);
};

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, athletes, groups }) {
  const [tab, setTab] = useState("athlete"); // "coach" | "athlete"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("1500m");
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const groupOptions = mergeGroupOptions(GROUPS, groups, athletes.map(a => a.group));

  const handleCoachLogin = () => {
    if (username === COACH.name.split(" ")[0] || username === "coach" || username === "Jordi") {
      if (password === COACH.password) { onLogin(COACH); setError(""); }
      else setError("Contraseña incorrecta");
    } else setError("Usuario no encontrado");
  };

  const handleAthleteLogin = () => {
    const found = athletes.find(a => a.name.toLowerCase().includes(username.toLowerCase()));
    if (found) { onLogin({ ...found, role: "athlete" }); setError(""); }
    else setError("Atleta no encontrado. ¿Tienes que registrarte?");
  };

  const handleAthleteRegister = () => {
    if (!newName.trim()) { setError("Introduce tu nombre"); return; }
    const newAth = {
      id: newName.toLowerCase().replace(/\s+/g,"_") + Date.now(),
      name: newName.trim(), group: newGroup, isHR: false,
      avatar: newName.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2),
      maxW: {}, stravaConnected: false, weekKms: [], role: "athlete"
    };
    onLogin(newAth, true);
  };

  return (
    <div className="login-wrap">
      <style>{CSS}</style>
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-logo">TRACK<span>FLOW</span></div>
        <div className="login-sub">Centro de Alto Rendimiento · CAR</div>

        <div className="tab-sw">
          <button className={`tab-btn ${tab==="athlete"?"active":""}`} onClick={()=>{setTab("athlete");setError("")}}>🏃 Atleta</button>
          <button className={`tab-btn ${tab==="coach"?"active":""}`} onClick={()=>{setTab("coach");setError("")}}>📋 Entrenador</button>
        </div>

        {tab === "coach" && (
          <>
            <div className="form-group">
              <label className="form-label">Usuario</label>
              <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Jordi" />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&handleCoachLogin()} />
            </div>
            {error && <div className="text-sm mb3" style={{color:"var(--re)"}}>{error}</div>}
            <button className="login-btn" onClick={handleCoachLogin}>Entrar como Entrenador →</button>
            <div className="login-hint">Contraseña: <strong>CAR2024</strong></div>
          </>
        )}

        {tab === "athlete" && !registering && (
          <>
            <div className="form-group">
              <label className="form-label">Tu nombre</label>
              <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Marc, Àlex, Marta..." onKeyDown={e=>e.key==="Enter"&&handleAthleteLogin()} />
            </div>
            {error && <div className="text-sm mb3" style={{color:"var(--re)"}}>{error}</div>}
            <button className="login-btn" onClick={handleAthleteLogin}>Entrar →</button>
            <div className="login-hint" style={{cursor:"pointer",color:"var(--or)"}} onClick={()=>setRegistering(true)}>¿Primera vez? Regístrate aquí</div>
          </>
        )}

        {tab === "athlete" && registering && (
          <>
            <div className="form-group">
              <label className="form-label">Tu nombre completo</label>
              <input className="input" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nombre Apellido" />
            </div>
            <div className="form-group">
              <label className="form-label">Tu grupo</label>
              <select className="select" value={newGroup} onChange={e=>setNewGroup(e.target.value)}>
                {groupOptions.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {error && <div className="text-sm mb3" style={{color:"var(--re)"}}>{error}</div>}
            <button className="login-btn" onClick={handleAthleteRegister}>Crear cuenta →</button>
            <div className="login-hint" style={{cursor:"pointer",color:"var(--or)"}} onClick={()=>setRegistering(false)}>← Ya tengo cuenta</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ user, page, setPage, onLogout, notifCount }) {
  const isCoach = user.role === "coach";
  const coachNav = [
    { id:"dashboard",  icon:"🏠", label:"Dashboard" },
    { id:"semana",     icon:"📅", label:"Plan Semanal" },
    { id:"gym",        icon:"🏋️",  label:"Creador Rutinas" },
    { id:"grupos",     icon:"👥", label:"Grupos" },
    { id:"atletas",    icon:"🏃", label:"Seguimiento", notif: notifCount },
    { id:"volumen",    icon:"📈", label:"Volumen CAR" },
    { id:"calendario", icon:"🗓️", label:"Calendario" },
    { id:"historial",  icon:"📂", label:"Historial" },
  ];
  const athleteNav = [
    { id:"hoy",        icon:"⚡",  label:"Hoy" },
    { id:"semana",     icon:"📅",  label:"Mi Semana" },
    { id:"gym",        icon:"🏋️",  label:"Mi Gym" },
    { id:"calendario", icon:"🗓️",  label:"Mi Calendario" },
    { id:"strava",     icon:"🟠",  label:"Strava" },
    { id:"perfil",     icon:"👤",  label:"Mi Perfil" },
  ];
  const nav = isCoach ? coachNav : athleteNav;

  return (
    <div className="sidebar">
      <div className="sb-logo">
        <div className="sb-logotype">TRACK<span>FLOW</span></div>
        <div className="sb-tagline">CAR · Barcelona</div>
      </div>

      <div className="sb-section">
        <span className="sb-label">Navegación</span>
        {nav.map(n => (
          <button key={n.id} className={`nav-item ${page===n.id?"active":""}`} onClick={()=>setPage(n.id)}>
            <span className="ni">{n.icon}</span>
            {n.label}
            {n.notif > 0 && <span className="sb-notif">{n.notif}</span>}
          </button>
        ))}
      </div>

      <div className="sb-bottom">
        <div className="user-chip">
          <div className={`avatar ${isCoach?"":"blue"}`}>
            {user.avatar || user.name.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div className="u-name">{user.name.split(" ")[0]}</div>
            <div className="u-role">{isCoach ? "Entrenador" : user.group}</div>
          </div>
        </div>
        <button className="nav-item mt3" onClick={onLogout} style={{color:"var(--re)"}}>
          <span className="ni">🚪</span> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ─── COACH: DASHBOARD ─────────────────────────────────────────────────────────
function CoachDashboard({ athletes, notifications, week, onClearNotif }) {
  const hrAthletes = athletes.filter(a => a.isHR);
  const done = hrAthletes.filter(a => a.todayDone).length;
  const totalKms = hrAthletes.reduce((s,a) => s + (a.weekKms||[]).reduce((x,y)=>x+y,0), 0);
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
          <div className="stat-label">Atletas Alto Rendimiento</div>
          <div className="stat-val">{hrAthletes.length}<span className="stat-unit">ath</span></div>
          <div className="stat-change">↑ Grupo de Alto Rendimiento CAR</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Entrenos hoy</div>
          <div className="stat-val">{done}<span className="stat-unit">/{hrAthletes.length}</span></div>
          <div className="prog-bar mt3"><div className="prog-fill" style={{width:`${hrAthletes.length?done/hrAthletes.length*100:0}%`}} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Km totales semana</div>
          <div className="stat-val">{totalKms.toFixed(0)}<span className="stat-unit">km</span></div>
          <div className="stat-change">↑ Grupo Alto Rendimiento esta semana</div>
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

  const ensureInlineExerciseRow = (exId) => ({ exId, ...(DEFAULT_EXERCISE_LOAD_PROFILE[exId] || { sets:3, reps:8, pct:70 }) });

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
        exercises: (prev.inlineRoutine?.exercises || []).map(e => e.exId === exId ? { ...e, [field]: Number(value || 0) } : e),
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

function CoachSemanaV2({ week, setWeek, routines, groups, trainings, setTrainings, customExercises, exerciseImages }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editorWeek, setEditorWeek] = useState(normalizeWeek(week, routines));
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingDraft, setTrainingDraft] = useState(buildEmptyTrainingForm());
  const targetGroups = SESSION_TARGET_GROUPS;
  const trainingCatalog = normalizeTrainingCatalog(trainings);
  const allExercises = getAllExercises(customExercises, exerciseImages);
  const canEditWeek = !editorWeek.published || editorWeek.isEditingPublished;

  useEffect(() => {
    setEditorWeek(normalizeWeek(week, routines));
  }, [week, routines]);

  const patchEditorWeek = (updater) => {
    setEditorWeek((prev) => {
      const nextWeek = normalizeWeek(typeof updater === "function" ? updater(prev) : updater, routines);
      setWeek(nextWeek);
      return nextWeek;
    });
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
  };

  const ensureInlineExerciseRow = (exId) => ({ exId, ...getDefaultExerciseLoad(exId, customExercises, exerciseImages) });

  const toggleInlineExercise = (exId) => {
    setDraft((prev) => {
      const list = prev.inlineRoutine?.exercises || [];
      const exists = list.some((exercise) => exercise.exId === exId);
      return {
        ...prev,
        inlineRoutine: {
          ...(prev.inlineRoutine || {}),
          exercises: exists
            ? list.filter((exercise) => exercise.exId !== exId)
            : [...list, ensureInlineExerciseRow(exId)],
        },
      };
    });
  };

  const updateInlineExercise = (exId, field, value) => {
    setDraft((prev) => ({
      ...prev,
      inlineRoutine: {
        ...(prev.inlineRoutine || {}),
        exercises: (prev.inlineRoutine?.exercises || []).map((exercise) => {
          if (exercise.exId !== exId) return exercise;
          return { ...exercise, [field]: field === "type" ? value : Number(value || 0) };
        }),
      },
    }));
  };

  const setPrimaryTraining = (slot, trainingId) => {
    const training = getTrainingById(trainingCatalog, trainingId);
    setDraft((prev) => ({
      ...prev,
      sessions: {
        ...(prev.sessions || {}),
        [slot]: training
          ? makeTrainingSelection(training, slot, prev.sessions?.[slot]?.targetGroup || editorWeek.targetGroup || "all", { id: prev.sessions?.[slot]?.id })
          : null,
      },
    }));
  };

  const setPrimaryTarget = (slot, targetGroup) => {
    setDraft((prev) => ({
      ...prev,
      sessions: {
        ...(prev.sessions || {}),
        [slot]: prev.sessions?.[slot]
          ? { ...prev.sessions[slot], targetGroup }
          : null,
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
          targetGroup: editorWeek.targetGroup || "all",
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
          ? makeTrainingSelection(training, session.slot || "am", session.targetGroup || editorWeek.targetGroup || "all", { id: session.id })
          : { ...session, trainingId: "", name: "", description: "", zones: emptyZones() };
      }),
    }));
  };

  const updateExtraField = (sessionId, field, value) => {
    setDraft((prev) => ({
      ...prev,
      extraSessions: (prev.extraSessions || []).map((session) => session.id === sessionId ? { ...session, [field]: value } : session),
    }));
  };

  const removeExtraSession = (sessionId) => {
    setDraft((prev) => ({
      ...prev,
      extraSessions: (prev.extraSessions || []).filter((session) => session.id !== sessionId),
    }));
  };

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
    const committed = commitPublishedWeek(editorWeek, routines, editorWeek.publishedAt);
    setWeek(committed);
    setEditorWeek(committed);
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

  const saveTraining = () => {
    if (!trainingDraft.name.trim()) return;
    const nextTraining = normalizeTraining({
      id: `custom_training_${Date.now()}`,
      name: trainingDraft.name,
      description: trainingDraft.description,
      zones: trainingDraft.zones,
      source: "custom",
    });
    setTrainings((prev) => [...normalizeTrainingCatalog(prev), nextTraining]);
    setTrainingDraft(buildEmptyTrainingForm());
    setShowTrainingForm(false);
  };

  const deleteTraining = (trainingId) => {
    setTrainings((prev) => normalizeTrainingCatalog(prev).filter((training) => training.id !== trainingId));
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
          <span className={`badge ${groupBadge(session.targetGroup)}`}>{groupLabel(session.targetGroup)}</span>
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
            <div className="ph-sub">Semana por tipo, entrenos desde dataset, extras por grupo y rutina inline sin biblioteca.</div>
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

      <div className="g2 mb6">
        <div className="wt-banner" style={{margin:0}}>
          <div>
            <div className="wt-label">Semana</div>
            <div className="wt-val">{editorWeek.name || "Semana"}</div>
          </div>
          <input
            className="input"
            style={{marginLeft:"auto",maxWidth:260}}
            value={editorWeek.name || ""}
            onChange={(e) => patchEditorWeek((prev) => ({ ...prev, name:e.target.value }))}
            placeholder="Nombre de semana"
            disabled={!canEditWeek}
          />
        </div>

        <div className="wt-banner" style={{margin:0}}>
          <div>
            <div className="wt-label">Tipo de semana</div>
            <div className="wt-val" style={{fontSize:24}}>{editorWeek.type}</div>
          </div>
          <select className="select" value={editorWeek.type} onChange={(e) => patchEditorWeek((prev) => ({ ...prev, type:e.target.value }))} disabled={!canEditWeek}>
            {WEEK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>

      <div className="card mb6">
        <div className="flex ic jb mb4" style={{alignItems:"flex-start"}}>
          <div>
            <div className="card-title" style={{marginBottom:6}}>🏃 Dataset de Entrenos</div>
            <div className="text-mu text-sm">Selecciona estos entrenos al montar la semana. Cada uno ya lleva sus kilómetros desagregados por zona.</div>
          </div>
          {canEditWeek && (
            <button className="btn btn-or btn-sm" onClick={() => setShowTrainingForm((prev) => !prev)}>
              {showTrainingForm ? "Cerrar creador" : "+ Crear entreno"}
            </button>
          )}
        </div>

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

        <div className="ex-lib-grid">
          {trainingCatalog.map((training) => (
            <div key={training.id} className="ex-lib-card">
              <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>{training.name}</div>
              {training.description && <div style={{fontSize:11,color:"var(--mu)",marginBottom:8}}>{training.description}</div>}
              <div className="zone-total-row">
                {ZONES.filter((zone) => Number(training.zones?.[zone.id] || 0) > 0).map((zone) => (
                  <span key={zone.id} className="zone-pill" style={{background:`${zone.color}22`,color:zone.color}}>
                    <span className="zone-dot" style={{background:zone.color}} />
                    {zone.short} {Number(training.zones[zone.id]).toFixed(1)}
                  </span>
                ))}
              </div>
              <div className="text-sm text-mu mt3">Total {zonesTotal(training.zones).toFixed(1)} km</div>
              {training.source === "custom" && canEditWeek && (
                <button className="btn btn-danger btn-sm mt3" style={{width:"100%"}} onClick={() => deleteTraining(training.id)}>Eliminar</button>
              )}
            </div>
          ))}
        </div>
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
                    <div className="sess-lbl">{sessionIndex === 0 ? "🌅 AM" : "➕ Extra AM"} · {groupLabel(session.targetGroup)}</div>
                    <div className="sess-txt">{session.name}</div>
                  </div>
                ))}
                {pmSessions.map((session, sessionIndex) => (
                  <div key={session.id || `${session.name}_${sessionIndex}`} className="session pm">
                    <div className="sess-lbl">{sessionIndex === 0 ? "🌆 PM" : "➕ Extra PM"} · {groupLabel(session.targetGroup)}</div>
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
                        <option value="">Sin entreno</option>
                        {trainingCatalog.map((training) => <option key={training.id} value={training.id}>{training.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Grupo</label>
                      <select className="select" value={session?.targetGroup || "all"} onChange={(e) => setPrimaryTarget(slot, e.target.value)} disabled={!canEditWeek || !session}>
                        {targetGroups.map((group) => <option key={group} value={group}>{groupLabel(group)}</option>)}
                      </select>
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
                  <div className="text-sm text-mu">Añade sesiones extra por la mañana o por la tarde para grupos concretos.</div>
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
                      <label className="form-label">Entreno</label>
                      <select className="select" value={session.trainingId || ""} onChange={(e) => updateExtraTraining(session.id, e.target.value)} disabled={!canEditWeek}>
                        <option value="">Selecciona un entreno</option>
                        {trainingCatalog.map((training) => <option key={training.id} value={training.id}>{training.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="g2">
                    <div className="form-group">
                      <label className="form-label">Grupo</label>
                      <select className="select" value={session.targetGroup || "all"} onChange={(e) => updateExtraField(session.id, "targetGroup", e.target.value)} disabled={!canEditWeek}>
                        {targetGroups.map((group) => <option key={group} value={group}>{groupLabel(group)}</option>)}
                      </select>
                    </div>
                    {canEditWeek && (
                      <div className="form-group" style={{display:"flex",alignItems:"flex-end"}}>
                        <button className="btn btn-danger btn-sm" style={{width:"100%"}} onClick={() => removeExtraSession(session.id)}>Eliminar extra</button>
                      </div>
                    )}
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
                        {targetGroups.map((group) => <option key={group} value={group}>{groupLabel(group)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ejercicios</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,maxHeight:180,overflowY:"auto"}}>
                      {allExercises.map((exercise) => {
                        const active = (draft.inlineRoutine?.exercises || []).some((row) => row.exId === exercise.id);
                        return (
                          <button type="button" key={exercise.id} className={`btn btn-sm ${active ? "btn-or" : "btn-ghost"}`} onClick={() => canEditWeek && toggleInlineExercise(exercise.id)} disabled={!canEditWeek}>
                            {exercise.emoji} {exercise.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(draft.inlineRoutine?.exercises || []).length > 0 && (
                    <div className="card card-sm">
                      {(draft.inlineRoutine?.exercises || []).map((row) => {
                        const exercise = allExercises.find((item) => item.id === row.exId) || getExerciseByIdFull(row.exId, customExercises, exerciseImages);
                        const exType = row.type || exercise.type || "weight";
                        return (
                          <div key={row.exId} style={{display:"grid",gridTemplateColumns:"42px 1fr 80px 80px 80px auto",gap:8,alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                            <div className="ex-emoji">{exercise.emoji || "🏋️"}</div>
                            <div>
                              <div className="ex-info-name">{exercise.name}</div>
                              <div className="ex-info-mu">{exercise.muscles}</div>
                            </div>
                            <input type="number" min={1} max={10} className="input" value={row.sets} onChange={(e) => updateInlineExercise(row.exId, "sets", e.target.value)} disabled={!canEditWeek} />
                            {exType === "time"
                              ? <input type="number" min={5} step={5} className="input" value={row.duration || 30} onChange={(e) => updateInlineExercise(row.exId, "duration", e.target.value)} disabled={!canEditWeek} />
                              : <input type="number" min={1} max={40} className="input" value={row.reps} onChange={(e) => updateInlineExercise(row.exId, "reps", e.target.value)} disabled={!canEditWeek} />}
                            {exType === "weight"
                              ? <input type="number" min={30} max={110} className="input" value={row.pct} onChange={(e) => updateInlineExercise(row.exId, "pct", e.target.value)} disabled={!canEditWeek} />
                              : <div style={{textAlign:"center"}}><span className={`badge ${exType === "time" ? "b-pu" : "b-bl"}`}>{exType === "time" ? formatExDuration(row.duration) : "Reps"}</span></div>}
                            {canEditWeek ? <button className="btn btn-danger btn-sm" onClick={() => toggleInlineExercise(row.exId)}>✕</button> : <div />}
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
        : [...r.exercises, { exId, name: ex?.name || labelFromExId(exId), ...(DEFAULT_EXERCISE_LOAD_PROFILE[exId] || { sets:3, reps:8, pct:70, type: ex?.type || "weight", duration:30 }) }];
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
            <div className="ph-title">RUTINAS <span>GYM</span></div>
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
                    <option value="time">Tiempo (segundos)</option>
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
                    <span className={`ex-type-badge ex-type-${ex.type||"weight"}`}>
                      {ex.type==="weight"?"Peso":ex.type==="time"?"Tiempo":"Reps"}
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
                    const exType = row.type || ex.type || "weight";
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
                            <option value="time">Tiempo</option>
                          </select>
                        </div>
                        {/* Series */}
                        <div style={{textAlign:"center"}}>
                          <div className="ex-lbl">Series</div>
                          <input type="number" className="input" style={{width:56,textAlign:"center",padding:"6px 4px"}} value={row.sets} min={1} max={10} onChange={e=>updateExercise(row.exId,"sets",e.target.value)} />
                        </div>
                        {/* Reps or Duration */}
                        {exType === "time" ? (
                          <div style={{textAlign:"center"}}>
                            <div className="ex-lbl">Seg.</div>
                            <input type="number" className="input" style={{width:64,textAlign:"center",padding:"6px 4px"}} value={row.duration||30} min={5} step={5} onChange={e=>updateExercise(row.exId,"duration",e.target.value)} />
                          </div>
                        ) : (
                          <div style={{textAlign:"center"}}>
                            <div className="ex-lbl">Reps</div>
                            <input type="number" className="input" style={{width:56,textAlign:"center",padding:"6px 4px"}} value={row.reps} min={1} max={50} onChange={e=>updateExercise(row.exId,"reps",e.target.value)} />
                          </div>
                        )}
                        {/* Pct (only for weight) */}
                        {exType === "weight" ? (
                          <div style={{textAlign:"center"}}>
                            <div className="ex-lbl">% 1RM</div>
                            <input type="number" className="input" style={{width:64,textAlign:"center",padding:"6px 4px"}} value={row.pct} min={30} max={110} onChange={e=>updateExercise(row.exId,"pct",e.target.value)} />
                          </div>
                        ) : <div />}
                        {/* Display badge */}
                        <div>
                          {exType === "weight" && <span className="badge b-or">{row.pct}%</span>}
                          {exType === "reps"   && <span className="badge b-bl">SIN PESO</span>}
                          {exType === "time"   && <span className="badge b-pu">{formatExDuration(row.duration)}</span>}
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
  const allExercises = getAllExercises(customExercises, exerciseImages);

  const handleImageUpload = (exId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setExerciseImages((prev) => ({ ...prev, [exId]: event.target.result }));
      setImgUploadTarget(null);
    };
    reader.readAsDataURL(file);
  };

  const saveNewExercise = () => {
    if (!newExForm?.name?.trim()) return;
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
    setNewExForm(null);
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">CREADOR DE <span>RUTINAS</span></div>
            <div className="ph-sub">Las rutinas se crean dentro de cada día del plan semanal. Aquí gestionas el catálogo completo de ejercicios.</div>
          </div>
          <button className="btn btn-or" onClick={() => setNewExForm({ name:"", emoji:"🏋️", muscles:"", category:"custom", type:"weight", imageFile:null })}>+ Nuevo ejercicio</button>
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
                <option value="time">Tiempo</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Imagen (opcional)</label>
            <div className="img-upload-zone" onClick={() => document.getElementById("new-ex-img-v2").click()}>
              {newExForm.imageFile ? <div style={{fontSize:13,color:"var(--gr)"}}>✅ {newExForm.imageFile.name}</div> : <div style={{fontSize:13,color:"var(--mu)"}}>📷 Clic para subir imagen</div>}
            </div>
            <input id="new-ex-img-v2" type="file" accept="image/*" style={{display:"none"}} onChange={(e) => setNewExForm({ ...newExForm, imageFile:e.target.files[0] || null })} />
          </div>
          <div className="flex ic g2r">
            <button className="btn btn-ghost" style={{flex:1}} onClick={() => setNewExForm(null)}>Cancelar</button>
            <button className="btn btn-or" style={{flex:1}} onClick={saveNewExercise}>Guardar ejercicio</button>
          </div>
        </div>
      )}

      <div className="ex-lib-grid">
        {allExercises.map((exercise) => {
          const isCustom = (customExercises || []).some((item) => item.id === exercise.id);
          const imgSrc = exerciseImages[exercise.id] || exercise.imageUrl;
          const isEditing = imgUploadTarget === exercise.id;
          return (
            <div key={exercise.id} className="ex-lib-card">
              {imgSrc ? <img src={imgSrc} alt={exercise.name} className="ex-lib-img" /> : <div className="ex-lib-emoji">{exercise.emoji}</div>}
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{exercise.name}</div>
              {exercise.muscles && <div style={{fontSize:10,color:"var(--mu)",marginBottom:6}}>{exercise.muscles}</div>}
              <div className="flex ic g2r" style={{flexWrap:"wrap"}}>
                <span className={`ex-type-badge ex-type-${exercise.type || "weight"}`}>
                  {exercise.type === "weight" ? "Peso" : exercise.type === "time" ? "Tiempo" : "Reps"}
                </span>
                {isCustom && <span className="badge b-pu" style={{fontSize:9}}>Custom</span>}
              </div>
              {isEditing ? (
                <div className="mt3">
                  <input type="file" accept="image/*" style={{fontSize:11,width:"100%"}} onChange={(e) => { if (e.target.files[0]) handleImageUpload(exercise.id, e.target.files[0]); }} />
                  <button className="btn btn-ghost btn-sm mt3" style={{width:"100%"}} onClick={() => setImgUploadTarget(null)}>Cancelar</button>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm mt3" style={{width:"100%",fontSize:11}} onClick={() => setImgUploadTarget(exercise.id)}>
                  {imgSrc ? "🔄 Cambiar imagen" : "📷 Añadir imagen"}
                </button>
              )}
              {isCustom && (
                <button className="btn btn-danger btn-sm mt3" style={{width:"100%",fontSize:11}} onClick={() => setCustomExercises((prev) => (prev || []).filter((item) => item.id !== exercise.id))}>
                  Eliminar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COACH: SEGUIMIENTO ATLETAS ───────────────────────────────────────────────
function CoachAtletas({ athletes, setAthletes, week }) {
  const [selectedAth, setSelectedAth] = useState(null);
  const hrAthletes = athletes.filter(a => a.isHR);
  const todayI = todayIdx();

  const toggleDone = (athId) => {
    setAthletes(athletes.map(a => a.id === athId ? { ...a, todayDone: !a.todayDone } : a));
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-title">SEGUIMIENTO <span>ATLETAS</span></div>
        <div className="ph-sub">Control del grupo de Alto Rendimiento · CAR</div>
      </div>

      <div className="g2 mb6">
        <div className="card">
          <div className="card-title">✅ Estado de hoy — {DAYS_FULL[todayI]}</div>
          {hrAthletes.map((a,i) => (
            <div key={a.id} className="ath-track-row">
              <div className={`check-dot ${a.todayDone?"done":"nd"}`}>{a.todayDone?"✓":"·"}</div>
              <div className={`avatar ${avatarColor(i)}`} style={{width:30,height:30,fontSize:11}}>{a.avatar}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13}}>{a.name}</div>
                <div style={{fontSize:11,color:"var(--mu)"}}>{a.group}</div>
              </div>
              <div>
                {a.todayDone
                  ? <span className="badge b-gr">Completado</span>
                  : <span className="badge b-re">Pendiente</span>}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setSelectedAth(a)}>Ver</button>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">⚖️ Pesos Máximos por Atleta</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th>Sentadilla</th>
                  <th>Peso Muerto</th>
                  <th>Hip Thrust</th>
                  <th>Press B.</th>
                </tr>
              </thead>
              <tbody>
                {hrAthletes.map(a => (
                  <tr key={a.id}>
                    <td><div style={{fontWeight:700}}>{a.name}</div><div style={{fontSize:11,color:"var(--mu)"}}>{a.group}</div></td>
                    <td><span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--or)"}}>{a.maxW?.sq||"—"}</span><span style={{fontSize:10,color:"var(--mu)"}}> kg</span></td>
                    <td><span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--or)"}}>{a.maxW?.dl||"—"}</span><span style={{fontSize:10,color:"var(--mu)"}}> kg</span></td>
                    <td><span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--or)"}}>{a.maxW?.ht||"—"}</span><span style={{fontSize:10,color:"var(--mu)"}}> kg</span></td>
                    <td><span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--or)"}}>{a.maxW?.bp||"—"}</span><span style={{fontSize:10,color:"var(--mu)"}}> kg</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Athlete detail modal */}
      {selectedAth && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSelectedAth(null)}>
          <div className="modal">
            <div className="flex ic jb mb4">
              <div>
                <div className="modal-title">{selectedAth.name}</div>
                <span className={`g-tag ${groupClass(selectedAth.group)}`}>{selectedAth.group}</span>
              </div>
              <button className="modal-close" onClick={()=>setSelectedAth(null)}>✕</button>
            </div>
            <div className="g3 mb4">
              {GYM_EXERCISES.slice(0,6).map(ex => (
                selectedAth.maxW?.[ex.id] ? (
                  <div key={ex.id} style={{background:"var(--s2)",borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:"var(--mu)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{ex.name}</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900,color:"var(--or)",lineHeight:1}}>{selectedAth.maxW[ex.id]}<span style={{fontSize:12,color:"var(--mu)"}}>kg</span></div>
                  </div>
                ) : null
              ))}
            </div>
            <div className="card-title">Volumen esta semana</div>
            <div className="flex ic g2r">
              {DAYS_SHORT.map((d,i) => (
                <div key={i} style={{textAlign:"center",flex:1}}>
                  <div style={{background:"var(--s2)",borderRadius:6,marginBottom:4,height:50,display:"flex",alignItems:"flex-end",justifyContent:"center",overflow:"hidden"}}>
                    <div style={{width:"70%",background:"var(--or)",borderRadius:"4px 4px 0 0",opacity:.8,height:`${Math.max(0,(selectedAth.weekKms?.[i]||0)/20*100)}%`,minHeight:selectedAth.weekKms?.[i]>0?4:0,transition:"height .3s"}} />
                  </div>
                  <div style={{fontSize:10,color:"var(--mu)"}}>{d}</div>
                  <div style={{fontSize:11,fontWeight:700}}>{selectedAth.weekKms?.[i]||0}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COACH: VOLUMEN CAR ───────────────────────────────────────────────────────
function CoachVolumen({ athletes, week }) {
  const hrAthletes = athletes.filter(a => a.isHR);
  const maxKm = Math.max(1, ...hrAthletes.flatMap(a => a.weekKms||[]).filter(Boolean));
  const weekSummary = weekZoneSummary(week);
  const [tab, setTab] = useState("zones"); // "zones" | "athletes"

  return (
    <div>
      <div className="ph">
        <div className="ph-title">VOLUMEN <span>CAR</span></div>
        <div className="ph-sub">Kilómetros por zona de intensidad · Semana {week.type}</div>
      </div>

      <div className="tab-nav mb4">
        <button className={`tab-nav-btn ${tab==="zones"?"active":""}`} onClick={()=>setTab("zones")}>📊 Por zonas</button>
        <button className={`tab-nav-btn ${tab==="athletes"?"active":""}`} onClick={()=>setTab("athletes")}>🏃 Por atleta</button>
      </div>

      {tab === "zones" && (
        <>
          {/* Zone totals summary */}
          <div className="g4 mb4">
            {ZONES.map(z => (
              <div key={z.id} className="stat-card" style={{"--accent":z.color}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:z.color}} />
                <div className="stat-label">{z.label}</div>
                <div className="stat-val" style={{color:z.color,fontSize:40}}>
                  {(weekSummary[z.id]||0).toFixed(1)}<span className="stat-unit">km</span>
                </div>
              </div>
            ))}
          </div>
          <div className="card mb4">
            <div className="stat-card" style={{background:"transparent",border:"none",padding:0}}>
              <div className="stat-label">TOTAL SEMANA</div>
              <div className="stat-val">{(weekSummary.total||0).toFixed(1)}<span className="stat-unit">km</span></div>
            </div>
          </div>

          {/* Per-day zone breakdown */}
          <div className="card">
            <div className="card-title">📅 Desglose por día</div>
            <div style={{display:"grid",gridTemplateColumns:"80px repeat(7,1fr) 80px",gap:8,marginBottom:8}}>
              <div style={{fontSize:10,color:"var(--mu)",letterSpacing:1,textTransform:"uppercase"}}>Zona</div>
              {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:"var(--mu)",letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>{d}</div>)}
              <div style={{textAlign:"right",fontSize:10,color:"var(--mu)",letterSpacing:1,textTransform:"uppercase"}}>TOTAL</div>
            </div>
            {ZONES.map(z => {
              const dayVals = (week.days||[]).map((day) => Number(dayZoneSummary(day, week)[z.id] || 0));
              const rowTotal = dayVals.reduce((s,v)=>s+v,0);
              return (
                <div key={z.id} style={{display:"grid",gridTemplateColumns:"80px repeat(7,1fr) 80px",gap:8,padding:"8px 0",borderBottom:"1px solid var(--border)",alignItems:"center"}}>
                  <div className="flex ic g2r">
                    <span className="zone-dot" style={{background:z.color,width:8,height:8}} />
                    <span style={{fontSize:11,fontWeight:700,color:z.color}}>{z.short}</span>
                  </div>
                  {dayVals.map((v,i) => (
                    <div key={i} style={{textAlign:"center"}}>
                      {v > 0
                        ? <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:z.color}}>{v.toFixed(1)}</span>
                        : <span style={{color:"var(--border2)",fontSize:12}}>—</span>}
                    </div>
                  ))}
                  <div style={{textAlign:"right",fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:900,color:z.color}}>{rowTotal.toFixed(1)}</div>
                </div>
              );
            })}
            {/* Totals row */}
            <div style={{display:"grid",gridTemplateColumns:"80px repeat(7,1fr) 80px",gap:8,padding:"10px 0",alignItems:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--mu)"}}>TOTAL</div>
              {(week.days||[]).map((d,i) => {
                const t = dayZoneSummary(d).total;
                return (
                  <div key={i} style={{textAlign:"center"}}>
                    {t > 0
                      ? <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:"var(--or)"}}>{t.toFixed(1)}</span>
                      : <span style={{color:"var(--border2)",fontSize:12}}>—</span>}
                  </div>
                );
              })}
              <div style={{textAlign:"right",fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:"var(--or)"}}>{(weekSummary.total||0).toFixed(1)}</div>
            </div>
          </div>
        </>
      )}

      {tab === "athletes" && (
        <div className="card">
          <div className="card-title">📊 Km por atleta esta semana</div>
          <div className="flex ic mb3" style={{gap:12}}>
            {DAYS_SHORT.map((d,i)=><div key={i} style={{flex:1,textAlign:"center",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:"var(--mu)",letterSpacing:1,fontWeight:700}}>{d}</div>)}
            <div style={{width:56,textAlign:"right",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:"var(--mu)",letterSpacing:1,fontWeight:700}}>TOTAL</div>
          </div>
          {hrAthletes.map((a,ai) => {
            const total = (a.weekKms||[]).reduce((s,k)=>s+k,0);
            const colors = ["var(--or)","var(--bl)","var(--gr)","var(--pu)","var(--am)","var(--or)","var(--bl)"];
            return (
              <div key={a.id} className="km-row">
                <div className="km-name">{a.name.split(" ")[0]}</div>
                <div className="km-bars">
                  {DAYS_SHORT.map((_,i)=>{
                    const km = a.weekKms?.[i]||0;
                    const h = maxKm > 0 ? (km/maxKm)*40 : 0;
                    return <div key={i} title={`${km} km`} className="km-bar" style={{height:h,background:colors[ai%colors.length],opacity:.75}} />;
                  })}
                </div>
                <div className="km-total">{total}</div>
              </div>
            );
          })}
          <div className="divider" />
          <div className="flex ic jb">
            <div style={{fontSize:12,color:"var(--mu)"}}>📡 Datos sincronizados con Strava · {new Date().toLocaleDateString("es-ES")}</div>
            <button className="btn btn-ghost btn-sm">🔄 Sincronizar Strava</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COACH: GRUPOS ────────────────────────────────────────────────────────────
function CoachGrupos({ athletes, setAthletes, groups, setGroups }) {
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState("");
  const allGroups = mergeGroupOptions(GROUPS, groups, athletes.map(a => a.group));

  const changeGroup = (athId, nextGroup) => {
    setAthletes(athletes.map(a => a.id===athId ? {...a, group:nextGroup} : a));
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
          const members = athletes.filter(a=>a.group===g);
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
                  {a.isHR && <span className="badge b-ya">Alto Rend.</span>}
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
              <div style={{fontSize:11,color:"var(--mu)"}}>{a.group}</div>
            </div>
            <select className="select" value={a.group} onChange={e=>changeGroup(a.id, e.target.value)} style={{maxWidth:220}}>
              {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {a.isHR && <span className="badge b-ya">Alto Rend.</span>}
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
function CoachCalendario({ week }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const [viewMonth, setViewMonth] = useState(month);
  const firstDay = new Date(year, viewMonth, 1).getDay();
  const daysInMonth = new Date(year, viewMonth+1, 0).getDate();
  const today = now.getDate();
  const offset = firstDay===0 ? 6 : firstDay-1;

  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const weekTypeColors = {
    "Adaptación":"var(--bl)",
    "General":"var(--ya)",
    "Preparatoria":"var(--or)",
    "Inicial":"var(--or)",
    "Volumen":"var(--ya)",
    "Competitiva":"var(--re)",
    "Recuperación":"var(--gr)",
    "Transición":"var(--pu)"
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-title">CALENDARIO <span>MENSUAL</span></div>
        <div className="ph-sub">Vista de todos los entrenamientos · {monthNames[viewMonth]} {year}</div>
      </div>

      {/* Week type */}
      <div className="wt-banner mb6">
        <div style={{width:10,height:10,borderRadius:"50%",background:weekTypeColors[week.type]||"var(--or)"}} />
        <div>
          <div className="wt-label">Semana actual</div>
          <div className="wt-val">{week.type}</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          {WEEK_TYPES.map(t=>(
            <div key={t} className="flex ic g2r" style={{fontSize:11,color:"var(--mu)"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:weekTypeColors[t]}} />
              {t}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex ic jb mb4">
          <button className="btn btn-ghost btn-sm" onClick={()=>setViewMonth(v=>Math.max(0,v-1))}>← Ant.</button>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:24,fontWeight:700}}>{monthNames[viewMonth]} {year}</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setViewMonth(v=>Math.min(11,v+1))}>Sig. →</button>
        </div>

        <div className="cal-grid" style={{marginBottom:8}}>
          {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",fontWeight:700,padding:"6px 0"}}>{d}</div>)}
        </div>

        <div className="cal-grid">
          {Array(offset).fill(null).map((_,i)=><div key={"e"+i} />)}
          {Array(daysInMonth).fill(null).map((_,i)=>{
            const day = i+1;
            const isToday = viewMonth===month && day===today;
            const dow = (offset+i) % 7;
            const hasTrain = getSlotSessions(week.days[dow], "am", week).length > 0 || getSlotSessions(week.days[dow], "pm", week).length > 0;
            const hasGym = !!week.days[dow]?.gym;
            return (
              <div key={day} className={`cal-cell ${hasTrain?"has-training":""} ${isToday?"today-cell":""}`}>
                <div className="cal-day-num" style={{color:isToday?"var(--or)":"var(--tx)"}}>{day}</div>
                {hasTrain && <span className="cal-dot" style={{background:"var(--or)"}} />}
                {hasGym && <span className="cal-dot" style={{background:"var(--pu)"}} />}
              </div>
            );
          })}
        </div>

        <div className="divider" />
        <div className="flex ic g4r" style={{flexWrap:"wrap"}}>
          <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--or)"}} /> Entrenamiento</div>
          <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--pu)"}} /> Gym</div>
        </div>
      </div>
    </div>
  );
}

// ─── COACH: HISTORIAL ─────────────────────────────────────────────────────────
function CoachHistorial({ history }) {
  const rows = Array.isArray(history) ? history : [];
  return (
    <div>
      <div className="ph"><div className="ph-title">HISTORIAL <span>DE ENTRENOS</span></div><div className="ph-sub">Registro de todas las sesiones completadas</div></div>
      <div className="card">
        {rows.length === 0 ? (
          <div className="text-mu text-sm">Aún no hay entrenos completados registrados.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Atleta</th><th>Grupo</th><th>AM</th><th>PM</th><th>Gym</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.map((h)=>(
                <tr key={h.id}>
                  <td style={{fontWeight:700}}>
                    {h.dateLabel || h.date || h.dateIso || "—"}
                    {h.time && <div style={{fontSize:11,color:"var(--mu)"}}>{h.time}</div>}
                  </td>
                  <td style={{fontWeight:700}}>{h.athlete || "—"}</td>
                  <td><span className={`g-tag ${groupClass(h.group)}`}>{h.group || "—"}</span></td>
                  <td style={{fontSize:12}}>{h.am||"—"}</td>
                  <td style={{fontSize:12}}>{h.pm||"—"}</td>
                  <td>{h.gym ? <span className="badge b-pu">Sí</span> : <span className="badge b-mu">No</span>}</td>
                  <td>{h.completed !== false ? <span className="badge b-gr">Completado</span> : <span className="badge b-re">Pendiente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── ATHLETE: HOY ─────────────────────────────────────────────────────────────
function AthleteHoy({ user, week, routines, onComplete, completed, customExercises, exerciseImages, isWeekPublished }) {
  const todayI = todayIdx();
  const rawTodayPlan = week.days[todayI] || {};
  const visibleToday = getVisibleDayPlanForGroup(week, rawTodayPlan, user.group, routines);
  const hasAnyAssignedToday = getSlotSessions(rawTodayPlan, "am", week).length > 0 || getSlotSessions(rawTodayPlan, "pm", week).length > 0 || !!rawTodayPlan.gym;
  const [showGym, setShowGym] = useState(false);

  const gymExercises = visibleToday.gym ? getDayGymExercisesForAthlete(rawTodayPlan, routines, user, customExercises, exerciseImages) : [];
  const gymResolved = visibleToday.gym ? getDayResolvedGymPlan(rawTodayPlan, routines) : null;

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
          <span className="badge b-bl" style={{fontSize:12,padding:"6px 12px"}}>Grupo: {user.group}</span>
          <span className={`badge ${isWeekPublished ? (visibleToday.hasContent ? "b-gr" : "b-mu") : "b-re"}`} style={{fontSize:12,padding:"6px 12px"}}>
            {!isWeekPublished ? "Semana pendiente de publicar" : visibleToday.hasContent ? "Plan publicado para tu grupo" : "Sin plan para tu grupo hoy"}
          </span>
          {completed
            ? <span className="badge b-gr" style={{fontSize:13,padding:"6px 14px"}}>✓ Entrenamiento completado</span>
            : <span className="badge b-mu" style={{fontSize:13,padding:"6px 14px"}}>Pendiente de marcar</span>}
        </div>
      </div>

      <div className="g2 mb4">
        {visibleToday.am.length > 0 ? (
          <div className="today-session">
            <div className="big-time">🌅 Mañana — AM</div>
            {visibleToday.am.map((session, index) => (
              <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 12}}>
                <div className="today-training" style={{fontSize:index === 0 ? 28 : 22}}>{session.name}</div>
                <span className={`badge ${index === 0 ? "b-or" : "b-ya"}`}>{index === 0 ? "Principal" : "Extra"} · {groupLabel(session.targetGroup)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120}}>
            <span style={{color:"var(--mu)",fontSize:14}}>
              {!isWeekPublished ? "La semana aún no está publicada" : hasAnyAssignedToday ? "No hay sesión AM para tu grupo" : "Sin sesión de mañana"}
            </span>
          </div>
        )}

        {visibleToday.pm.length > 0 ? (
          <div className="today-pm">
            <div className="big-time blue">🌆 Tarde — PM</div>
            {visibleToday.pm.map((session, index) => (
              <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 12}}>
                <div className="today-training" style={{fontSize:index === 0 ? 28 : 22}}>{session.name}</div>
                <span className={`badge ${index === 0 ? "b-bl" : "b-ya"}`}>{index === 0 ? "Principal" : "Extra"} · {groupLabel(session.targetGroup)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120}}>
            <span style={{color:"var(--mu)",fontSize:14}}>
              {!isWeekPublished ? "La semana aún no está publicada" : hasAnyAssignedToday ? "No hay sesión PM para tu grupo" : "Sin sesión de tarde"}
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
            <button className="gym-pill" onClick={()=>setShowGym(!showGym)}>
              {showGym?"Ocultar":"Ver rutina"} {gymExercises.length} ejercicios
            </button>
          </div>
          {showGym && (
            <div className="mt4">
              {gymExercises.map(ex => (
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
                    <div className="ex-big">{ex.type === "time" ? formatExDuration(ex.duration) : ex.reps}</div>
                    <div className="ex-lbl">{ex.type === "time" ? "tiempo" : "reps"}</div>
                  </div>
                  {ex.type === "weight" && ex.kg ? (
                    <div style={{textAlign:"center"}}>
                      <div className="ex-big">{ex.kg}</div>
                      <div className="ex-lbl">kg</div>
                    </div>
                  ) : (
                    <div style={{textAlign:"center",color:"var(--mu)",fontSize:12}}>—</div>
                  )}
                  <div>
                    {ex.type === "weight" && <span className="badge b-or">{ex.pct}% 1RM</span>}
                    {ex.type === "reps" && <span className="badge b-bl">Reps</span>}
                    {ex.type === "time" && <span className="badge b-pu">{formatExDuration(ex.duration)}</span>}
                  </div>
                </div>
              ))}
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
                ? "Hoy hay trabajo para otros grupos, pero no para el tuyo."
                : "Recarga energías para mañana."}
          </div>
        </div>
      )}

      {user.isHR && isWeekPublished && visibleToday.hasContent && (
        <button className={`complete-btn ${completed?"done":""}`} onClick={onComplete}>
          {completed ? "✓ ENTRENAMIENTO COMPLETADO" : "MARCAR ENTRENAMIENTO COMO HECHO"}
        </button>
      )}
    </div>
  );
}

// ─── ATHLETE: MI SEMANA ───────────────────────────────────────────────────────
function AthleteSemana({ week, routines, user, customExercises, exerciseImages, isWeekPublished }) {
  const [gymDay, setGymDay] = useState(null);
  const todayI = todayIdx();

  const gymForDay = (i) => getDayGymExercisesForAthlete(week.days[i], routines, user, customExercises, exerciseImages);

  return (
    <div>
      <div className="ph">
        <div className="ph-title">MI <span>SEMANA</span></div>
        <div className="ph-sub">Plan completo · Semana {week.type} · Grupo {user.group}</div>
      </div>

      <div className="wt-banner">
        <div><div className="wt-label">Tipo de semana</div><div className="wt-val">{week.type}</div></div>
        <div style={{marginLeft:"auto"}}><span className={`badge ${isWeekPublished ? "b-bl" : "b-re"}`} style={{fontSize:12,padding:"6px 12px"}}>{isWeekPublished ? `Mostrando ${user.group} + Todos` : "Semana pendiente de publicar"}</span></div>
      </div>

      <div className="week-grid">
        {DAYS_FULL.map((day, i) => {
          const d = week.days[i];
          const isToday = i === todayI;
          const visiblePlan = getVisibleDayPlanForGroup(week, d, user.group, routines);
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
                  <div style={{fontSize:11,color:"var(--mu)",textAlign:"center",padding:"8px 0"}}>{hasAssignedForOthers ? "No asignado a tu grupo" : "Descanso"}</div>
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
                    return (
                      <div key={ex.id} style={{background:"var(--s2)",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          {imgSrc
                            ? <img src={imgSrc} alt={ex.name} style={{width:32,height:32,borderRadius:6,objectFit:"cover"}} />
                            : <span style={{fontSize:18}}>{ex.emoji}</span>}
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,fontWeight:700}}>{ex.name}</div>
                            {ex.type==="time"
                              ? <div style={{fontSize:10,color:"var(--mu)"}}>{ex.sets} × {formatExDuration(ex.duration)}</div>
                              : <div style={{fontSize:10,color:"var(--mu)"}}>{ex.sets}×{ex.reps}{ex.type==="weight"?` — ${ex.pct}%`:""}</div>}
                          </div>
                          {ex.type==="weight" && ex.kg
                            ? <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:"var(--or)"}}>{ex.kg}kg</div>
                            : ex.type==="time"
                              ? <span className="badge b-pu">{formatExDuration(ex.duration)}</span>
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
  const allDays = week.days
    .map((d, i) => ({ i, day: d }))
    .filter(({ day }) => isGymVisibleForGroup(week, day, user.group, routines) && getDayGymCount(day, routines) > 0);

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
        <div className="ph-sub">Rutinas inline publicadas para tu grupo · pesos calculados según tu 1RM</div>
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

      {isWeekPublished && !allDays.length && <div className="card" style={{textAlign:"center",padding:40,color:"var(--mu)"}}>No hay rutinas de gym asignadas a tu grupo esta semana</div>}

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

      {isWeekPublished && focusExercises.length === 0 && allDays.length > 0 && <div className="card" style={{textAlign:"center",padding:40,color:"var(--mu)"}}>No hay gym este día</div>}

      {isWeekPublished && focusExercises.map(ex => {
        const max = user.maxW?.[ex.id];
        const exType = ex.type || "weight";
        const imgSrc = ex.imageUrl;
        return (
          <div key={ex.id} className="card mb3">
            <div style={{display:"grid",gridTemplateColumns:"64px 1fr repeat(3,90px)",gap:16,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                {imgSrc ? (
                  <img src={imgSrc} alt={ex.name} style={{width:56,height:56,objectFit:"cover",borderRadius:10,border:"1px solid var(--border2)"}} />
                ) : (
                  <div style={{fontSize:44,textAlign:"center"}}>{ex.emoji}</div>
                )}
              </div>
              <div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:800,lineHeight:1}}>{ex.name}</div>
                <div style={{fontSize:12,color:"var(--mu2)",marginTop:2}}>{ex.muscles}</div>
                {exType==="weight" && (
                  max
                    ? <div style={{fontSize:11,color:"var(--mu)",marginTop:4}}>1RM: {max}kg · {ex.pct}%</div>
                    : <div style={{fontSize:11,color:"var(--re)",marginTop:4}}>⚠ Sin peso máximo definido</div>
                )}
                {exType==="time"   && <div style={{fontSize:11,color:"var(--pu)",marginTop:4}}>Ejercicio por tiempo</div>}
                {exType==="reps"   && <div style={{fontSize:11,color:"var(--bl)",marginTop:4}}>Sin carga externa</div>}
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,lineHeight:1}}>{ex.sets}</div>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>series</div>
              </div>
              {exType === "time" ? (
                <div style={{textAlign:"center"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:36,fontWeight:900,lineHeight:1,color:"var(--pu)"}}>{formatExDuration(ex.duration)}</div>
                  <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>tiempo</div>
                </div>
              ) : (
                <div style={{textAlign:"center"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,lineHeight:1}}>{ex.reps}</div>
                  <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>reps</div>
                </div>
              )}
              <div style={{textAlign:"center"}}>
                {exType==="weight" && ex.kg ? (
                  <>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,color:"var(--or)",lineHeight:1}}>{ex.kg}</div>
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

// ─── ATHLETE: STRAVA ─────────────────────────────────────────────────────────
function AthleteStrava({ user, setUser }) {
  const weekTotal = (user.weekKms||[]).reduce((s,k)=>s+k,0);
  const [connected, setConnected] = useState(user.stravaConnected || false);

  const doConnect = () => { setConnected(true); setUser({...user, stravaConnected:true}); };

  return (
    <div>
      <div className="ph">
        <div className="ph-title">STRAVA <span>CONNECT</span></div>
        <div className="ph-sub">Visualiza tu volumen semanal de kilómetros</div>
      </div>

      {!connected ? (
        <div className="card strava-card" style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:64,marginBottom:16}}>🟠</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:32,fontWeight:900,marginBottom:8}}>Conecta tu Strava</div>
          <div style={{color:"var(--mu)",marginBottom:24,fontSize:14}}>Sincroniza tus actividades del CAR automáticamente</div>
          <button className="strava-connect" style={{margin:"0 auto"}} onClick={doConnect}>
            <span style={{fontSize:18}}>🟠</span> Conectar con Strava
          </button>
        </div>
      ) : (
        <>
          <div className="card strava-card mb4">
            <div className="flex ic jb mb4">
              <div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:800}}>Strava conectado ✓</div>
                <div style={{fontSize:12,color:"var(--mu)"}}>Sincronización activa</div>
              </div>
              <button className="strava-connect btn-sm"><span>🟠</span> Sincronizar</button>
            </div>

            <div className="g4 mb4">
              <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",marginBottom:4}}>Esta semana</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:900,color:"#FC4C02",lineHeight:1}}>{weekTotal}<span style={{fontSize:16,color:"var(--mu)"}}>km</span></div>
              </div>
              <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",marginBottom:4}}>Actividades</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:900,lineHeight:1}}>{(user.weekKms||[]).filter(k=>k>0).length}</div>
              </div>
              <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",marginBottom:4}}>Mejor día</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:900,lineHeight:1,color:"var(--gr)"}}>{Math.max(...(user.weekKms||[0]))}<span style={{fontSize:16,color:"var(--mu)"}}>km</span></div>
              </div>
              <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",marginBottom:4}}>Avg/día</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:900,lineHeight:1}}>{weekTotal ? (weekTotal/(user.weekKms||[]).filter(k=>k>0).length).toFixed(1) : 0}<span style={{fontSize:16,color:"var(--mu)"}}>km</span></div>
              </div>
            </div>

            {/* Bar chart */}
            <div>
              <div style={{display:"flex",gap:8,alignItems:"flex-end",height:80,marginBottom:6}}>
                {DAYS_SHORT.map((d,i) => {
                  const km = user.weekKms?.[i] || 0;
                  const maxKm = Math.max(...(user.weekKms||[0]),1);
                  const h = (km / maxKm) * 70;
                  const isToday = i === todayIdx();
                  return (
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:11,fontWeight:700,color:km>0?"var(--tx)":"var(--mu)"}}>{km||""}</div>
                      <div style={{width:"100%",height:h||3,background:isToday?"#FC4C02":"rgba(252,76,2,.5)",borderRadius:"4px 4px 0 0",minHeight:3,transition:"height .5s ease"}} />
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:8}}>
                {DAYS_SHORT.map((d,i)=><div key={i} style={{flex:1,textAlign:"center",fontSize:10,color:"var(--mu)",letterSpacing:1,fontWeight:700}}>{d}</div>)}
              </div>
            </div>
          </div>

          {/* Activities list */}
          <div className="card">
            <div className="card-title">📋 Actividades recientes</div>
            {(user.weekKms||[]).map((km,i)=>km>0&&(
              <div key={i} className="flex ic jb" style={{padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
                <div className="flex ic g3r">
                  <div style={{fontSize:24}}>🏃</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Rodaje {DAYS_FULL[i]}</div>
                    <div style={{fontSize:12,color:"var(--mu)"}}>{DAYS_FULL[i]}, esta semana</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:24,fontWeight:900,color:"#FC4C02"}}>{km}km</div>
                </div>
              </div>
            )).filter(Boolean)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ATHLETE: PERFIL ─────────────────────────────────────────────────────────
function AthletePerfil({ user, setUser, athletes, groups }) {
  const [group, setGroup] = useState(user.group);
  const [editing, setEditing] = useState(false);
  const [maxW, setMaxW] = useState({...user.maxW});
  const groupOptions = mergeGroupOptions(GROUPS, groups, athletes.map(a => a.group));

  const save = () => { setUser({...user,group,maxW}); setEditing(false); };

  return (
    <div>
      <div className="ph"><div className="ph-title">MI <span>PERFIL</span></div></div>
      <div className="g2">
        <div className="card">
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
            <div className="avatar blue" style={{width:64,height:64,fontSize:24,borderRadius:14}}>{user.avatar}</div>
            <div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900}}>{user.name}</div>
              <span className={`g-tag ${groupClass(user.group)}`}>{user.group}</span>
              {user.isHR && <span className="badge b-ya" style={{marginLeft:6}}>Alto Rendimiento</span>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cambiar grupo</label>
            <select className="select" value={group} onChange={e=>setGroup(e.target.value)}>
              {groupOptions.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button className="btn btn-or" onClick={()=>setUser({...user,group})} style={{width:"100%"}}>Guardar cambios</button>
        </div>

        <div className="card">
          <div className="flex ic jb mb4">
            <div className="card-title" style={{margin:0}}>⚖️ Mis máximos</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(!editing)}>{editing?"Guardar":"Editar"}</button>
          </div>
          {GYM_EXERCISES.map(ex => (
            <div key={ex.id} className="flex ic jb" style={{padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
              <div className="flex ic g3r">
                <span style={{fontSize:18}}>{ex.emoji}</span>
                <span style={{fontSize:13,fontWeight:600}}>{ex.name}</span>
              </div>
              {editing ? (
                <input type="number" className="input" style={{width:80,textAlign:"center"}} value={maxW[ex.id]||""} onChange={e=>setMaxW({...maxW,[ex.id]:Number(e.target.value)})} placeholder="kg" />
              ) : (
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,color:"var(--or)"}}>{user.maxW?.[ex.id]||<span style={{fontSize:13,color:"var(--mu)"}}>—</span>}{user.maxW?.[ex.id]&&<span style={{fontSize:12,color:"var(--mu)"}}>kg</span>}</div>
              )}
            </div>
          ))}
          {editing && <button className="btn btn-or mt4" style={{width:"100%"}} onClick={save}>💾 Guardar pesos</button>}
        </div>
      </div>
    </div>
  );
}

// ─── ATHLETE: CALENDARIO ─────────────────────────────────────────────────────
function AthleteCalendario({ user, week, routines, history, customExercises, exerciseImages, isWeekPublished }) {
  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selected, setSelected]   = useState(null); // { dateIso, dayOfWeek }

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

  // Historial de este atleta
  const histMap = {};
  (history||[]).filter(h=>h.athleteId===user.id).forEach(h=>{ histMap[h.dateIso]=h; });

  // Plan de la semana actual por día de semana (0=Lun)
  const weekDayForDate = (y,m,d) => {
    const dow = new Date(y,m,d).getDay();
    return dow === 0 ? 6 : dow - 1;
  };

  const getSelectedInfo = () => {
    if (!selected) return null;
    const hist = histMap[selected.dateIso];
    const dow  = selected.dayOfWeek;
    const dayPlan = week.days[dow];
    const visiblePlan = getVisibleDayPlanForGroup(week, dayPlan, user.group, routines);
    const gymExs  = visiblePlan.gym ? getDayGymExercisesForAthlete(dayPlan, routines, user, customExercises, exerciseImages) : [];
    const gymPlan = visiblePlan.gym ? getDayResolvedGymPlan(dayPlan, routines) : null;
    return { hist, dayPlan, visiblePlan, gymExs, gymPlan, dow };
  };

  const info = getSelectedInfo();

  return (
    <div>
      <div className="ph">
        <div className="ph-title">MI <span>CALENDARIO</span></div>
        <div className="ph-sub">Historial de entrenos y plan futuro</div>
      </div>

      <div className="g2" style={{alignItems:"start"}}>
        <div className="card">
          <div className="flex ic jb mb4">
            <button className="week-nav-btn" onClick={()=>goMonth(-1)}>← Ant.</button>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:700}}>{monthNames[viewMonth]} {viewYear}</div>
            <button className="week-nav-btn" onClick={()=>goMonth(1)}>Sig. →</button>
          </div>

          {/* Day headers */}
          <div className="cal-grid" style={{marginBottom:6}}>
            {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)",fontWeight:700,padding:"4px 0"}}>{d}</div>)}
          </div>

          <div className="cal-grid">
            {Array(offset).fill(null).map((_,i)=><div key={"e"+i}/>)}
            {Array(daysInM).fill(null).map((_,i) => {
              const day    = i + 1;
              const y = viewYear, m = viewMonth;
              const dateIso = `${String(y).padStart(4,"0")}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dow    = weekDayForDate(y, m, day);
              const isToday = dateIso === todayIso;
              const hist   = histMap[dateIso];
              const hasTrain = getVisibleDayPlanForGroup(week, week.days[dow], user.group, routines).hasContent;
              const selDate = selected?.dateIso === dateIso;
              return (
                <div key={day}
                  className={`cal-cell ${hasTrain?"has-training":""} ${isToday?"today-cell":""}`}
                  style={selDate?{borderColor:"var(--or)",background:"rgba(255,107,26,.1)"}:{}}
                  onClick={()=>setSelected({ dateIso, dayOfWeek:dow })}
                >
                  <div className="cal-day-num" style={{color:isToday?"var(--or)":"var(--tx)"}}>{day}</div>
                  {hist && <span className="cal-dot" style={{background:"var(--gr)"}} title="Completado" />}
                  {hasTrain && !hist && <span className="cal-dot" style={{background:"var(--or)"}} />}
                  {week.days[dow]?.gym && <span className="cal-dot" style={{background:"var(--pu)"}} />}
                </div>
              );
            })}
          </div>

          <div className="divider" />
          <div className="flex ic g4r" style={{flexWrap:"wrap"}}>
            <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--gr)"}} /> Completado</div>
            <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--or)"}} /> Plan</div>
            <div className="flex ic g2r text-sm"><span className="cal-dot" style={{width:8,height:8,background:"var(--pu)"}} /> Gym</div>
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {!selected && (
            <div className="card" style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:36,marginBottom:12}}>📅</div>
              <div style={{color:"var(--mu)",fontSize:14}}>Selecciona un día para ver el detalle</div>
            </div>
          )}

          {selected && info && (
            <div>
              <div className="card mb3">
                <div className="flex ic jb mb4">
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900}}>
                      {DAYS_FULL[info.dow]} {selected.dateIso}
                    </div>
                    {info.hist
                      ? <span className="badge b-gr">✓ Entrenamiento completado</span>
                      : selected.dateIso <= todayIso
                        ? <span className="badge b-re">Sin registrar</span>
                        : <span className="badge b-bl">Planificado</span>}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>✕</button>
                </div>

                {isWeekPublished && info.visiblePlan?.am?.length > 0 && (
                  <div className="mb3">
                    <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--or)",fontWeight:700,marginBottom:4}}>🌅 Mañana AM</div>
                    {info.visiblePlan.am.map((session, index) => (
                      <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 10}}>
                        <div style={{fontWeight:700}}>{session.name}</div>
                        <div className="zone-total-row mt3">
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
                    <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--bl)",fontWeight:700,marginBottom:4}}>🌆 Tarde PM</div>
                    {info.visiblePlan.pm.map((session, index) => (
                      <div key={session.id || `${session.name}_${index}`} style={{marginTop:index === 0 ? 0 : 10}}>
                        <div style={{fontWeight:700}}>{session.name}</div>
                        <div className="zone-total-row mt3">
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
                {(!isWeekPublished || (!info.visiblePlan?.am?.length && !info.visiblePlan?.pm?.length)) && (
                  <div style={{color:"var(--mu)",fontSize:14}}>
                    {!isWeekPublished ? "La semana todavía no está publicada." : "Sin plan asignado a tu grupo para este día."}
                  </div>
                )}
              </div>

              {info.gymExs.length > 0 && (
                <div className="card">
                  <div className="card-title" style={{marginBottom:12}}>🏋️ {info.gymPlan?.name || "Rutina gym"}</div>
                  {info.gymExs.map(ex => {
                    const imgSrc = ex.imageUrl;
                    return (
                      <div key={ex.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                        {imgSrc
                          ? <img src={imgSrc} alt={ex.name} style={{width:40,height:40,borderRadius:8,objectFit:"cover"}} />
                          : <span style={{fontSize:24}}>{ex.emoji}</span>}
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:13}}>{ex.name}</div>
                          <div style={{fontSize:11,color:"var(--mu)"}}>{ex.muscles}</div>
                          <div style={{fontSize:11,color:"var(--mu2)",marginTop:2}}>
                            {ex.type==="time"
                              ? `${ex.sets} × ${formatExDuration(ex.duration)}`
                              : `${ex.sets} × ${ex.reps} reps`}
                          </div>
                        </div>
                        {ex.type==="weight" && ex.kg && (
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
  const [page, setPage] = useState("dashboard");
  const [athletes, setAthletes] = useState(DEFAULT_ATHLETES);
  const [groups, setGroups] = useState([...GROUPS]);
  const [week, setWeek] = useState(normalizeWeek(DEFAULT_WEEK, DEFAULT_ROUTINE_LIBRARY));
  const [routines, setRoutines] = useState(normalizeRoutineLibrary(DEFAULT_ROUTINE_LIBRARY));
  const [trainings, setTrainings] = useState(normalizeTrainingCatalog(TRAINING_DATASET));
  const [notifications, setNotifications] = useState([]);
  const [history, setHistory] = useState([]);
  const [calendarWeeks, setCalendarWeeks] = useState([]);
  const [seedMeta, setSeedMeta] = useState(null);
  const [customExercises, setCustomExercises] = useState([]);
  const [exerciseImages, setExerciseImages] = useState({});

  // Load persisted session
  useEffect(() => {
    (async () => {
      const savedUser = await store.get("tf_user");
      const savedAthletes = await store.get("tf_athletes");
      const savedUsersCsv = await store.getRaw("tf_users_csv");
      const savedWeek = await store.get("tf_week");
      const savedRoutines = await store.get("tf_routines");
      const savedTrainings = await store.get("tf_trainings");
      const savedNotifs = await store.get("tf_notifs");
      const savedGroups = await store.get("tf_groups");
      const savedHistory = await store.get("tf_history");
      const savedCalendarWeeks = await store.get("tf_calendar_weeks");
      const savedSeedMeta = await store.get("tf_seed_meta");
      const savedPesasRaw = await store.get("tf_pesas_raw");
      const savedCustomEx = await store.get("tf_custom_exercises");
      const savedExImages = await store.get("tf_exercise_images");

      const loadedRoutines = normalizeRoutineLibrary(savedRoutines || DEFAULT_ROUTINE_LIBRARY);
      setRoutines(loadedRoutines);
      setTrainings(normalizeTrainingCatalog(savedTrainings || TRAINING_DATASET));

      if (savedUser) setUser(savedUser);
      if (Array.isArray(savedCalendarWeeks)) setCalendarWeeks(savedCalendarWeeks);
      if (savedSeedMeta) setSeedMeta(savedSeedMeta);
      if (savedPesasRaw && typeof window !== "undefined") {
        window.PESAS2024_HARDCODED_DB = savedPesasRaw;
      }
      if (Array.isArray(savedCustomEx)) setCustomExercises(savedCustomEx);
      if (savedExImages && typeof savedExImages === "object") setExerciseImages(savedExImages);

      const csvAthletes = athletesFromCsv(savedUsersCsv);
      const loadedAthletes = csvAthletes?.length ? csvAthletes : (savedAthletes || DEFAULT_ATHLETES);
      setAthletes(loadedAthletes);
      setGroups(mergeGroupOptions(GROUPS, savedGroups, loadedAthletes.map(a => a.group)));

      if (savedWeek) {
        setWeek(normalizeWeek(savedWeek, loadedRoutines));
      } else {
        const activeCalendarWeek = pickActiveCalendarWeek(savedCalendarWeeks);
        const seededWeek = buildWeekFromCalendarSeed(activeCalendarWeek, loadedRoutines);
        if (seededWeek) setWeek(normalizeWeek(seededWeek, loadedRoutines));
      }
      if (savedNotifs) setNotifications(savedNotifs);
      if (Array.isArray(savedHistory)) setHistory(savedHistory);
      setLoading(false);
    })();
  }, []);

  // Persist on change
  useEffect(() => { if(user) store.set("tf_user", user); }, [user]);
  useEffect(() => { store.set("tf_athletes", athletes); store.setRaw("tf_users_csv", athletesToCsv(athletes)); }, [athletes]);
  useEffect(() => {
    setGroups((prev) => {
      const merged = mergeGroupOptions(GROUPS, prev, athletes.map(a => a.group));
      return merged.length === prev.length && merged.every((g, i) => g === prev[i]) ? prev : merged;
    });
  }, [athletes]);
  useEffect(() => { store.set("tf_groups", groups); }, [groups]);
  useEffect(() => { store.set("tf_week", normalizeWeek(week, routines)); }, [week, routines]);
  useEffect(() => { store.set("tf_routines", normalizeRoutineLibrary(routines)); }, [routines]);
  useEffect(() => { store.set("tf_trainings", normalizeTrainingCatalog(trainings)); }, [trainings]);
  useEffect(() => { store.set("tf_notifs", notifications); }, [notifications]);
  useEffect(() => { store.set("tf_history", history); }, [history]);
  useEffect(() => { if (Array.isArray(calendarWeeks) && calendarWeeks.length) store.set("tf_calendar_weeks", calendarWeeks); }, [calendarWeeks]);
  useEffect(() => { if (seedMeta) store.set("tf_seed_meta", seedMeta); }, [seedMeta]);
  useEffect(() => { store.set("tf_custom_exercises", customExercises); }, [customExercises]);
  useEffect(() => { store.set("tf_exercise_images", exerciseImages); }, [exerciseImages]);

  const handleLogin = (u, isNew = false) => {
    setUser(u);
    setPage(u.role === "coach" ? "dashboard" : "hoy");
    if (isNew && u.role !== "coach") {
      setAthletes(prev => {
        const exists = prev.find(a=>a.id===u.id);
        return exists ? prev : [...prev, u];
      });
    }
  };

  const handleLogout = () => { setUser(null); store.set("tf_user", null); };

  const handleComplete = (athlete) => {
    if (!athlete) return;
    const newCompleted = !athlete.todayDone;
    const todayI = todayIdx();
    const publicWeek = resolvePublishedWeek(week, routines);
    const rawTodayPlan = publicWeek?.days?.[todayI] || null;
    const visibleToday = rawTodayPlan ? getVisibleDayPlanForGroup(publicWeek, rawTodayPlan, athlete.group, routines) : { am:[], pm:[], gym:false };
    const now = new Date();
    const dateIso = now.toISOString().slice(0, 10);
    const historyId = `${dateIso}_${athlete.id}`;

    setAthletes(prev => prev.map(a => a.id===athlete.id ? {...a, todayDone:newCompleted} : a));

    if (newCompleted) {
      const notif = {
        athlete: athlete.name,
        msg: `Ha completado el entrenamiento de ${DAYS_FULL[todayI]}`,
        time: now.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})
      };
      setNotifications(prev => [notif, ...prev].slice(0,10));
      setHistory(prev => [
        {
          id: historyId,
          athleteId: athlete.id,
          athlete: athlete.name,
          group: athlete.group,
          dateIso,
          dateLabel: now.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}),
          time: now.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}),
          am: (visibleToday.am || []).map((session) => session.name).join(" · "),
          pm: (visibleToday.pm || []).map((session) => session.name).join(" · "),
          gym: !!visibleToday.gym,
          completed: true,
        },
        ...prev.filter(h => h.id !== historyId),
      ].slice(0,500));
    } else {
      setHistory(prev => prev.filter(h => h.id !== historyId));
    }
  };

  if (loading) return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center"}}>
        <div className="login-logo" style={{fontSize:64,marginBottom:8}}>TRACK<span style={{color:"var(--or)"}}>FLOW</span></div>
        <div className="pulse" style={{color:"var(--mu)",fontSize:13,letterSpacing:3,textTransform:"uppercase"}}>Cargando...</div>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin} athletes={athletes} groups={groups} />;

  const isCoach = user.role === "coach";
  const publishedWeek = resolvePublishedWeek(week, routines);
  const athleteWeek = publishedWeek || normalizeWeek({
    id: "week_unpublished",
    name: week.name || "Semana pendiente",
    type: week.type || "Inicial",
    days: DAYS_FULL.map(() => ({ })),
  }, routines);

  const renderPage = () => {
    if (isCoach) {
      switch(page) {
        case "dashboard":  return <CoachDashboard athletes={athletes} notifications={notifications} week={week} onClearNotif={()=>setNotifications([])} />;
        case "semana":     return <CoachSemanaV2 week={week} setWeek={setWeek} routines={routines} groups={groups} trainings={trainings} setTrainings={setTrainings} customExercises={customExercises} exerciseImages={exerciseImages} />;
        case "gym":        return <CoachGymV2 customExercises={customExercises} setCustomExercises={setCustomExercises} exerciseImages={exerciseImages} setExerciseImages={setExerciseImages} />;
        case "grupos":     return <CoachGrupos athletes={athletes} setAthletes={setAthletes} groups={groups} setGroups={setGroups} />;
        case "atletas":    return <CoachAtletas athletes={athletes} setAthletes={setAthletes} week={week} />;
        case "volumen":    return <CoachVolumen athletes={athletes} week={week} />;
        case "calendario": return <CoachCalendario week={week} />;
        case "historial":  return <CoachHistorial history={history} />;
        default: return null;
      }
    } else {
      const currentUser = athletes.find(a=>a.id===user.id) || user;
      switch(page) {
        case "hoy":        return <AthleteHoy user={currentUser} week={athleteWeek} routines={routines} onComplete={()=>handleComplete(currentUser)} completed={!!currentUser.todayDone} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} />;
        case "semana":     return <AthleteSemana week={athleteWeek} routines={routines} user={currentUser} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} />;
        case "gym":        return <AthleteGym user={currentUser} routines={routines} week={athleteWeek} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} />;
        case "strava":     return <AthleteStrava user={currentUser} setUser={u=>setUser(u)} />;
        case "perfil":     return <AthletePerfil user={currentUser} setUser={u=>{setUser(u);setAthletes(prev=>prev.map(a=>a.id===u.id?u:a))}} athletes={athletes} groups={groups} />;
        case "calendario": return <AthleteCalendario user={currentUser} week={athleteWeek} routines={routines} history={history} customExercises={customExercises} exerciseImages={exerciseImages} isWeekPublished={!!publishedWeek} />;
        default: return null;
      }
    }
  };

  return (
    <div className="app-wrap">
      <style>{CSS}</style>
      <Sidebar
        user={user}
        page={page}
        setPage={setPage}
        onLogout={handleLogout}
        notifCount={notifications.length}
      />
      <div className="main-area">
        {renderPage()}
      </div>
    </div>
  );
}
