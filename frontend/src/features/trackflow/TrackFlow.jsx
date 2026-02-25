import { useState, useEffect, useCallback } from "react";

// ─── MOCK DATA (from PESAS2024.xlsx) ─────────────────────────────────────────

const GYM_EXERCISES = [
  { id: "sq",    name: "Sentadilla",     emoji: "🏋️",  muscles: "Cuádriceps · Glúteos",  category: "compound" },
  { id: "dl",    name: "Peso Muerto",    emoji: "⚡",   muscles: "Isquios · Espalda",     category: "compound" },
  { id: "bp",    name: "Press Banca",    emoji: "💪",   muscles: "Pecho · Tríceps",       category: "upper"    },
  { id: "ht",    name: "Hip Thrust",     emoji: "🔥",   muscles: "Glúteos · Isquios",     category: "compound" },
  { id: "lp",    name: "Prensa",         emoji: "🦵",   muscles: "Cuádriceps",            category: "compound" },
  { id: "row",   name: "Remo con Barra", emoji: "🚣",   muscles: "Dorsal · Bíceps",       category: "upper"    },
  { id: "lunge", name: "Zancadas",       emoji: "🚀",   muscles: "Cuádriceps · Glúteos",  category: "unilateral"},
  { id: "rdl",   name: "RDL",            emoji: "🎯",   muscles: "Isquios · Glúteos",     category: "compound" },
  { id: "calf",  name: "Gemelos",        emoji: "🦴",   muscles: "Sóleo · Gastrocnemio",  category: "isolation"},
  { id: "pm",    name: "Press Militar",  emoji: "💥",   muscles: "Hombros · Tríceps",     category: "upper"    },
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
  sq:    { sets:4, reps:6,  pct:85 },
  dl:    { sets:3, reps:5,  pct:80 },
  bp:    { sets:4, reps:8,  pct:75 },
  ht:    { sets:4, reps:10, pct:70 },
  lp:    { sets:3, reps:12, pct:70 },
  row:   { sets:4, reps:8,  pct:75 },
  lunge: { sets:3, reps:12, pct:65 },
  rdl:   { sets:4, reps:8,  pct:72 },
  calf:  { sets:4, reps:15, pct:80 },
  pm:    { sets:3, reps:10, pct:70 },
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
  type: "Preparatoria",
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

const WEEK_TYPES = ["Adaptación","Preparatoria","Competitiva","Recuperación","Transición"];
const DAYS_SHORT = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const DAYS_FULL  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const GROUPS = ["1500m","800m","pequeños"];

const COACH = { id:"coach", name:"Entrenador Jordi", role:"coach", password:"CAR2024" };
const PESAS_DB_SOURCE = { file: "pesas2024_hardcoded_db.js", workbook: "PESAS2024.xlsx", format: "sparse-cells" };
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
`;

// ─── UTILS ────────────────────────────────────────────────────────────────────
const calcWeight = (max, pct) => Math.round((max * pct) / 100 / 2.5) * 2.5;
const getToday = () => new Date().getDay(); // 0=Sun…6=Sat → convert to 0=Mon
const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };
const groupClass = (g) => g === "1500m" ? "g-1500" : g === "800m" ? "g-800" : "g-pq";
const groupBadge = (g) => g === "1500m" ? "b-or" : g === "800m" ? "b-bl" : "b-pu";
const avatarColor = (idx) => ["","blue","green","purple",""][idx % 4];
const GROUPS_WITH_ALL = ["all", ...GROUPS];
const groupLabel = (g) => g === "all" ? "Todos" : (g || "Todos");
const displayTarget = (week, day) => groupLabel(day?.targetGroup || week?.targetGroup || "all");

const makeInlineRoutineFromExercises = (exerciseIds = [], name = "Rutina inline") => ({
  name,
  targetGroup: "all",
  exercises: exerciseIds.map(exId => ({ exId, ...(DEFAULT_EXERCISE_LOAD_PROFILE[exId] || { sets:3, reps:8, pct:70 }) })),
});

const sanitizeRoutine = (routine, idx = 0) => {
  const safeExercises = Array.isArray(routine?.exercises)
    ? routine.exercises
        .map((e) => ({
          exId: e?.exId,
          sets: Number(e?.sets || 3),
          reps: Number(e?.reps || 8),
          pct: Number(e?.pct || 70),
        }))
        .filter((e) => GYM_EXERCISES.some(x => x.id === e.exId))
    : [];
  const fallbackExercises = safeExercises.length
    ? safeExercises
    : [{ exId:"sq", ...DEFAULT_EXERCISE_LOAD_PROFILE.sq }];
  return {
    id: routine?.id || `rt_${Date.now()}_${idx}`,
    name: routine?.name || `Rutina ${idx + 1}`,
    targetGroup: routine?.targetGroup || "all",
    exercises: fallbackExercises,
  };
};

const normalizeRoutineLibrary = (raw) => {
  if (Array.isArray(raw) && raw.length) return raw.map(sanitizeRoutine);
  if (raw && typeof raw === "object") {
    const migratedExercises = Object.entries(raw)
      .filter(([exId, v]) => GYM_EXERCISES.some(e => e.id === exId) && v)
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
      exercises: day.gymFocus.map(exId => ({ exId, ...(DEFAULT_EXERCISE_LOAD_PROFILE[exId] || { sets:3, reps:8, pct:70 }) })),
    };
  }
  return null;
};

const getDayGymCount = (day, routines) => (getDayResolvedGymPlan(day, routines)?.exercises || []).length;

const getDayGymExercisesForAthlete = (day, routines, user) => {
  const plan = getDayResolvedGymPlan(day, routines);
  if (!plan) return [];
  return (plan.exercises || []).map(row => {
    const ex = GYM_EXERCISES.find(e => e.id === row.exId);
    if (!ex) return null;
    const max = user?.maxW?.[row.exId];
    const kg = max ? calcWeight(max, row.pct) : null;
    return { ...ex, ...row, id: row.exId, kg };
  }).filter(Boolean);
};

const normalizeWeek = (raw, routines = DEFAULT_ROUTINE_LIBRARY) => {
  const base = raw && typeof raw === "object" ? raw : DEFAULT_WEEK;
  const daysSrc = Array.isArray(base.days) ? base.days : DEFAULT_WEEK.days;
  const days = DAYS_FULL.map((_, i) => {
    const d = { ...(DEFAULT_WEEK.days[i] || {}), ...(daysSrc[i] || {}) };
    d.targetGroup = d.targetGroup || base.targetGroup || "all";
    d.gym = !!d.gym;
    if (!d.gym) {
      d.gymPlan = null;
      d.gymFocus = [];
      return d;
    }
    const resolved = getDayResolvedGymPlan(d, routines);
    if (resolved) {
      d.gymFocus = (resolved.exercises || []).map(e => e.exId);
      if (!d.gymPlan) {
        d.gymPlan = { mode:"inline", inline:{ name:resolved.name, targetGroup:resolved.targetGroup, exercises:resolved.exercises } };
      }
    } else {
      d.gymFocus = [];
      d.gym = false;
      d.gymPlan = null;
    }
    return d;
  });
  return {
    id: base.id || "week_custom",
    name: base.name || "Semana",
    type: base.type || "Preparatoria",
    targetGroup: base.targetGroup || "all",
    days,
  };
};

const planVisibleForGroup = (week, day, group) => {
  const target = day?.targetGroup || week?.targetGroup || "all";
  return target === "all" || target === group;
};

const cloneRoutineDraft = (routine) => JSON.parse(JSON.stringify(routine));

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
      group: pick("group", "1500m"),
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
function LoginScreen({ onLogin, athletes }) {
  const [tab, setTab] = useState("athlete"); // "coach" | "athlete"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("1500m");
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);

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
                {GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
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
    { id:"gym",        icon:"🏋️",  label:"Rutinas Gym" },
    { id:"grupos",     icon:"👥", label:"Grupos" },
    { id:"atletas",    icon:"🏃", label:"Seguimiento", notif: notifCount },
    { id:"volumen",    icon:"📈", label:"Volumen CAR" },
    { id:"calendario", icon:"🗓️", label:"Calendario" },
    { id:"historial",  icon:"📂", label:"Historial" },
  ];
  const athleteNav = [
    { id:"hoy",     icon:"⚡",  label:"Hoy" },
    { id:"semana",  icon:"📅",  label:"Mi Semana" },
    { id:"gym",     icon:"🏋️",  label:"Mi Gym" },
    { id:"strava",  icon:"🟠",  label:"Strava" },
    { id:"perfil",  icon:"👤",  label:"Mi Perfil" },
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
function CoachSemana({ week, setWeek, routines, setRoutines }) {
  const [editing, setEditing] = useState(null); // day index
  const [draft, setDraft] = useState(null);

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
              {GROUPS_WITH_ALL.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
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
                  {GROUPS_WITH_ALL.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
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
            <div className="form-group">
              <label className="form-label">🌆 Entrenamiento Tarde (PM)</label>
              <input className="input" value={draft.pm||""} onChange={e=>setDraft({...draft,pm:e.target.value})} placeholder="Ej: Técnica de carrera, Fartlek..." />
            </div>

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
                          {GROUPS_WITH_ALL.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
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
                          <div className="text-mu text-sm">Si marcas esto, se añade en “Rutinas Gym” y la semana guardará una referencia</div>
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

// ─── COACH: GYM ROUTINES ──────────────────────────────────────────────────────
function CoachGym({ routines, setRoutines }) {
  const [selectedId, setSelectedId] = useState(routines?.[0]?.id || null);

  useEffect(() => {
    if (!routines?.length) return;
    if (!selectedId || !routines.some(r => r.id === selectedId)) setSelectedId(routines[0].id);
  }, [routines, selectedId]);

  const selected = (routines || []).find(r => r.id === selectedId) || null;

  const patchSelected = (updater) => {
    setRoutines((prev) => prev.map(r => r.id === selectedId ? sanitizeRoutine(updater(cloneRoutineDraft(r))) : r));
  };

  const createRoutine = () => {
    const id = `rt_${Date.now()}`;
    const routine = sanitizeRoutine({
      id,
      name: `Nueva rutina ${new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`,
      targetGroup: "all",
      exercises: [{ exId:"sq", ...DEFAULT_EXERCISE_LOAD_PROFILE.sq }],
    });
    setRoutines(prev => [...(prev || []), routine]);
    setSelectedId(id);
  };

  const deleteRoutine = (id) => {
    setRoutines(prev => (prev || []).filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const toggleExercise = (exId) => {
    if (!selected) return;
    patchSelected((r) => {
      const exists = r.exercises.some(e => e.exId === exId);
      r.exercises = exists
        ? r.exercises.filter(e => e.exId !== exId)
        : [...r.exercises, { exId, ...(DEFAULT_EXERCISE_LOAD_PROFILE[exId] || { sets:3, reps:8, pct:70 }) }];
      return r;
    });
  };

  const updateExercise = (exId, field, value) => {
    if (!selected) return;
    patchSelected((r) => {
      r.exercises = r.exercises.map(e => e.exId === exId ? { ...e, [field]: Number(value || 0) } : e);
      return r;
    });
  };

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="ph-title">RUTINAS <span>GYM</span></div>
            <div className="ph-sub">Crea y guarda rutinas. Luego las seleccionas al planificar la semana.</div>
          </div>
          <button className="btn btn-or" onClick={createRoutine}>+ Nueva rutina</button>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-title">📚 Biblioteca de rutinas</div>
          {(routines || []).length === 0 && <div className="text-mu text-sm">No hay rutinas guardadas todavía</div>}
          {(routines || []).map((rt) => (
            <div key={rt.id} style={{
              border:"1px solid var(--border)",
              borderRadius:12,
              padding:"12px 14px",
              marginBottom:10,
              background: rt.id === selectedId ? "rgba(255,107,26,.08)" : "var(--s2)"
            }}>
              <div className="flex ic jb g2r">
                <button className="nav-item" style={{margin:0,padding:0,background:"transparent",color:"var(--tx)"}} onClick={()=>setSelectedId(rt.id)}>
                  <span className="ni">🏋️</span>
                  <span style={{fontWeight:700}}>{rt.name}</span>
                </button>
                <button className="btn btn-danger btn-sm" onClick={()=>deleteRoutine(rt.id)}>Eliminar</button>
              </div>
              <div className="flex ic g2r mt3" style={{flexWrap:"wrap"}}>
                <span className="badge b-pu">{(rt.exercises || []).length} ejercicios</span>
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
                  <input className="input" value={selected.name} onChange={e=>patchSelected(r => ({ ...r, name:e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Grupo objetivo</label>
                  <select className="select" value={selected.targetGroup || "all"} onChange={e=>patchSelected(r => ({ ...r, targetGroup:e.target.value }))}>
                    {GROUPS_WITH_ALL.map(g=><option key={g} value={g}>{groupLabel(g)}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Ejercicios</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {GYM_EXERCISES.map(ex => {
                    const active = selected.exercises.some(e => e.exId === ex.id);
                    return (
                      <button key={ex.id} className={`btn btn-sm ${active?"btn-or":"btn-ghost"}`} onClick={()=>toggleExercise(ex.id)}>
                        {ex.emoji} {ex.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{overflowX:"auto"}}>
                {(selected.exercises || []).map((row) => {
                  const ex = GYM_EXERCISES.find(e => e.id === row.exId);
                  return (
                    <div key={row.exId} className="ex-row">
                      <div className="ex-emoji">{ex?.emoji || "🏋️"}</div>
                      <div>
                        <div className="ex-info-name">{ex?.name || row.exId}</div>
                        <div className="ex-info-mu">{ex?.muscles || ""}</div>
                      </div>
                      <div>
                        <input type="number" className="input" style={{textAlign:"center",paddingLeft:0,paddingRight:0}} value={row.sets} min={1} max={10}
                          onChange={e=>updateExercise(row.exId,"sets",e.target.value)} />
                      </div>
                      <div>
                        <input type="number" className="input" style={{textAlign:"center",paddingLeft:0,paddingRight:0}} value={row.reps} min={1} max={30}
                          onChange={e=>updateExercise(row.exId,"reps",e.target.value)} />
                      </div>
                      <div>
                        <input type="number" className="input" style={{textAlign:"center",paddingLeft:0,paddingRight:0}} value={row.pct} min={40} max={105}
                          onChange={e=>updateExercise(row.exId,"pct",e.target.value)} />
                      </div>
                      <div>
                        <span className="badge b-or">{row.pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="divider" />
              <div style={{fontSize:13,color:"var(--mu)"}}>
                ✅ Estas rutinas se guardan y luego se pueden seleccionar en “Plan Semanal”, o crear una inline al momento.
              </div>
            </>
          )}
        </div>
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
function CoachVolumen({ athletes }) {
  const hrAthletes = athletes.filter(a => a.isHR);
  const maxKm = Math.max(...hrAthletes.flatMap(a => a.weekKms||[]).filter(Boolean));

  return (
    <div>
      <div className="ph">
        <div className="ph-title">VOLUMEN <span>CAR</span></div>
        <div className="ph-sub">Kilómetros semanales · Grupo de Alto Rendimiento</div>
      </div>

      <div className="card mb4">
        <div className="card-title">📊 Km por atleta esta semana</div>
        <div className="flex ic mb3" style={{gap:12,flexWrap:"wrap"}}>
          {DAYS_SHORT.map((d,i) => <div key={i} style={{flex:1,textAlign:"center",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:"var(--mu)",letterSpacing:1,fontWeight:700}}>{d}</div>)}
          <div style={{width:56,textAlign:"right",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:"var(--mu)",letterSpacing:1,fontWeight:700}}>TOTAL</div>
        </div>
        {hrAthletes.map((a,ai) => {
          const total = (a.weekKms||[]).reduce((s,k)=>s+k,0);
          return (
            <div key={a.id} className="km-row">
              <div className="km-name">{a.name.split(" ")[0]}</div>
              <div className="km-bars">
                {DAYS_SHORT.map((d,i) => {
                  const km = a.weekKms?.[i] || 0;
                  const h = maxKm > 0 ? (km / maxKm) * 40 : 0;
                  const colors = ["var(--or)","var(--bl)","var(--gr)","var(--pu)","var(--am)","var(--or)","var(--bl)"];
                  return (
                    <div key={i} title={`${km} km`} className="km-bar"
                      style={{height:h,background:colors[ai%colors.length],opacity:.75}} />
                  );
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
    </div>
  );
}

// ─── COACH: GRUPOS ────────────────────────────────────────────────────────────
function CoachGrupos({ athletes, setAthletes }) {
  const [creating, setCreating] = useState(false);
  const [newGrp, setNewGrp] = useState({ name:"", type:"1500m" });
  const groups = ["1500m","800m","pequeños",...new Set(athletes.filter(a=>!["1500m","800m","pequeños"].includes(a.group)).map(a=>a.group))];

  const changeGroup = (athId, g) => setAthletes(athletes.map(a => a.id===athId ? {...a, group:g} : a));

  return (
    <div>
      <div className="ph">
        <div className="ph-row">
          <div><div className="ph-title">GRUPOS <span>DE TRABAJO</span></div><div className="ph-sub">Gestiona los grupos de entrenamiento</div></div>
          <button className="btn btn-or" onClick={()=>setCreating(true)}>+ Nuevo grupo</button>
        </div>
      </div>

      <div className="g3">
        {groups.map(g => {
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

      {creating && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setCreating(false)}>
          <div className="modal" style={{width:400}}>
            <div className="flex ic jb mb4">
              <div className="modal-title">Nuevo Grupo</div>
              <button className="modal-close" onClick={()=>setCreating(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del grupo</label>
              <input className="input" value={newGrp.name} onChange={e=>setNewGrp({...newGrp,name:e.target.value})} placeholder="Ej: Lesionados, Especial..." />
            </div>
            <button className="btn btn-or" style={{width:"100%"}} onClick={()=>{setCreating(false)}}>Crear grupo</button>
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
  const weekTypeColors = { "Adaptación":"var(--bl)","Preparatoria":"var(--or)","Competitiva":"var(--re)","Recuperación":"var(--gr)","Transición":"var(--pu)" };

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
            const hasTrain = !!(week.days[dow]?.am || week.days[dow]?.pm);
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
function CoachHistorial() {
  const history = [
    { date:"Lun 19 Feb", group:"1500m", am:"Rodaje 10km Z2", pm:"Series 6×200m", gym:true, completion:89 },
    { date:"Mié 21 Feb", group:"800m",  am:"Fartlek 8×1'",  pm:"Rodaje 8km",    gym:true,  completion:92 },
    { date:"Vie 23 Feb", group:"Todo",  am:"Rodaje 12km Z2", pm:"Drills técnicos",gym:true, completion:78 },
    { date:"Sáb 24 Feb", group:"1500m", am:"Rodaje largo 18km", pm:"", gym:false, completion:100 },
  ];
  return (
    <div>
      <div className="ph"><div className="ph-title">HISTORIAL <span>DE ENTRENOS</span></div><div className="ph-sub">Registro de todas las sesiones completadas</div></div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Grupo</th><th>AM</th><th>PM</th><th>Gym</th><th>Completado</th></tr></thead>
          <tbody>
            {history.map((h,i)=>(
              <tr key={i}>
                <td style={{fontWeight:700}}>{h.date}</td>
                <td><span className={`g-tag ${groupClass(h.group)}`}>{h.group}</span></td>
                <td style={{fontSize:12}}>{h.am||"—"}</td>
                <td style={{fontSize:12}}>{h.pm||"—"}</td>
                <td>{h.gym ? <span className="badge b-pu">Sí</span> : <span className="badge b-mu">No</span>}</td>
                <td>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:h.completion>=90?"var(--gr)":h.completion>=70?"var(--or)":"var(--re)"}}>{h.completion}%</div>
                    <div style={{flex:1,background:"var(--s2)",borderRadius:100,height:4}}>
                      <div style={{height:4,borderRadius:100,width:`${h.completion}%`,background:h.completion>=90?"var(--gr)":h.completion>=70?"var(--or)":"var(--re)"}} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ATHLETE: HOY ─────────────────────────────────────────────────────────────
function AthleteHoy({ user, week, routines, onComplete, completed }) {
  const todayI = todayIdx();
  const rawTodayPlan = week.days[todayI];
  const visibleToday = planVisibleForGroup(week, rawTodayPlan, user.group);
  const todayPlan = visibleToday ? rawTodayPlan : { ...rawTodayPlan, am:"", pm:"", gym:false, gymFocus:[] };
  const [showGym, setShowGym] = useState(false);

  const gymExercises = getDayGymExercisesForAthlete(todayPlan, routines, user);
  const gymResolved = getDayResolvedGymPlan(todayPlan, routines);

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
          <span className={`badge ${visibleToday ? "b-gr" : "b-mu"}`} style={{fontSize:12,padding:"6px 12px"}}>
            {visibleToday ? `Plan asignado a ${displayTarget(week, rawTodayPlan)}` : "Sin plan para tu grupo hoy"}
          </span>
          {completed
            ? <span className="badge b-gr" style={{fontSize:13,padding:"6px 14px"}}>✓ Entrenamiento completado</span>
            : <span className="badge b-mu" style={{fontSize:13,padding:"6px 14px"}}>Pendiente de marcar</span>}
        </div>
      </div>

      <div className="g2 mb4">
        {todayPlan?.am ? (
          <div className="today-session">
            <div className="big-time">🌅 Mañana — AM</div>
            <div className="today-training">{todayPlan.am}</div>
          </div>
        ) : (
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120}}>
            <span style={{color:"var(--mu)",fontSize:14}}>{visibleToday ? "Sin sesión de mañana" : "No hay sesión para tu grupo"}</span>
          </div>
        )}

        {todayPlan?.pm ? (
          <div className="today-pm">
            <div className="big-time blue">🌆 Tarde — PM</div>
            <div className="today-training">{todayPlan.pm}</div>
          </div>
        ) : (
          <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:120}}>
            <span style={{color:"var(--mu)",fontSize:14}}>{visibleToday ? "Sin sesión de tarde" : "No hay sesión para tu grupo"}</span>
          </div>
        )}
      </div>

      {todayPlan?.gym && (
        <div className="card mb4">
          <div className="flex ic jb">
            <div>
              <div className="card-title" style={{margin:0}}>🏋️ Gym hoy</div>
              <div className="text-mu text-sm">{gymResolved?.name || "Rutina"} · {groupLabel(gymResolved?.targetGroup || todayPlan.targetGroup || "all")}</div>
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
                    <div className="ex-big">{ex.reps}</div>
                    <div className="ex-lbl">reps</div>
                  </div>
                  {ex.kg ? (
                    <div style={{textAlign:"center"}}>
                      <div className="ex-big">{ex.kg}</div>
                      <div className="ex-lbl">kg</div>
                    </div>
                  ) : (
                    <div style={{textAlign:"center",color:"var(--mu)",fontSize:12}}>—</div>
                  )}
                  <div>
                    <span className="badge b-or">{ex.pct}% 1RM</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!todayPlan?.am && !todayPlan?.pm && (
        <div className="card mb4" style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:48,marginBottom:12}}>😴</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:800}}>
            {visibleToday ? "DÍA DE DESCANSO" : "SIN PLAN ASIGNADO"}
          </div>
          <div style={{color:"var(--mu)",marginTop:8}}>
            {visibleToday ? "Recarga energías para mañana" : `El entrenador ha asignado hoy el plan a ${displayTarget(week, rawTodayPlan)}.`}
          </div>
        </div>
      )}

      {user.isHR && visibleToday && (todayPlan?.am || todayPlan?.pm) && (
        <button className={`complete-btn ${completed?"done":""}`} onClick={onComplete}>
          {completed ? "✓ ENTRENAMIENTO COMPLETADO" : "MARCAR ENTRENAMIENTO COMO HECHO"}
        </button>
      )}
    </div>
  );
}

// ─── ATHLETE: MI SEMANA ───────────────────────────────────────────────────────
function AthleteSemana({ week, routines, user }) {
  const [gymDay, setGymDay] = useState(null);
  const todayI = todayIdx();

  const visibleDays = week.days.map((d) => planVisibleForGroup(week, d, user.group));

  const gymForDay = (i) => getDayGymExercisesForAthlete(week.days[i], routines, user);

  return (
    <div>
      <div className="ph">
        <div className="ph-title">MI <span>SEMANA</span></div>
        <div className="ph-sub">Plan completo · Semana {week.type} · Grupo {user.group}</div>
      </div>

      <div className="wt-banner">
        <div><div className="wt-label">Tipo de semana</div><div className="wt-val">{week.type}</div></div>
        <div style={{marginLeft:"auto"}}><span className="badge b-bl" style={{fontSize:12,padding:"6px 12px"}}>Mostrando {user.group} + Todos</span></div>
      </div>

      <div className="week-grid">
        {DAYS_FULL.map((day, i) => {
          const d = week.days[i];
          const isToday = i === todayI;
          const visible = visibleDays[i];
          const gymCount = visible ? getDayGymCount(d, routines) : 0;
          const gymResolved = visible ? getDayResolvedGymPlan(d, routines) : null;
          return (
            <div key={i} className={`day-col ${isToday?"today":""}`}>
              <div className="day-hdr">
                <div className="day-name" style={{color:isToday?"var(--or)":""}}>{DAYS_SHORT[i]}</div>
                {isToday
                  ? <div className="day-date" style={{color:"var(--or)"}}>HOY</div>
                  : <div className="day-date">{displayTarget(week, d)}</div>}
              </div>
              <div className="day-body">
                {!visible && (
                  <div style={{fontSize:11,color:"var(--mu)",textAlign:"center",padding:"8px 0"}}>No asignado a tu grupo</div>
                )}
                {visible && d.am && <div className="session"><div className="sess-lbl">🌅 AM</div><div className="sess-txt">{d.am}</div></div>}
                {visible && d.pm && <div className="session pm"><div className="sess-lbl">🌆 PM</div><div className="sess-txt">{d.pm}</div></div>}
                {visible && d.gym && (
                  <div className="session gym" onClick={()=>setGymDay(gymDay===i?null:i)}>
                    <div className="sess-lbl">🏋️ GYM</div>
                    <div className="sess-txt">{gymResolved?.name || "Rutina"} · {gymCount} ejercicios · ver →</div>
                  </div>
                )}
                {visible && !d.am && !d.pm && !d.gym && <div style={{fontSize:11,color:"var(--mu)",textAlign:"center",padding:"8px 0"}}>Descanso</div>}
              </div>
              {visible && gymDay===i && gymForDay(i).length>0 && (
                <div style={{padding:"0 10px 10px"}}>
                  {gymForDay(i).map(ex => (
                    <div key={ex.id} style={{background:"var(--s2)",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:18}}>{ex.emoji}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:700}}>{ex.name}</div>
                          <div style={{fontSize:10,color:"var(--mu)"}}>{ex.sets}×{ex.reps} — {ex.pct}%</div>
                        </div>
                        {ex.kg && <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:"var(--or)"}}>{ex.kg}kg</div>}
                      </div>
                    </div>
                  ))}
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
function AthleteGym({ user, routines, week }) {
  const allDays = week.days
    .map((d, i) => ({ i, day: d }))
    .filter(({ day }) => planVisibleForGroup(week, day, user.group) && getDayGymCount(day, routines) > 0);

  const [selectedDay, setSelectedDay] = useState(allDays[0]?.i ?? 0);
  useEffect(() => {
    if (allDays.length && !allDays.some(d => d.i === selectedDay)) setSelectedDay(allDays[0].i);
  }, [allDays, selectedDay]);

  const focusExercises = getDayGymExercisesForAthlete(week.days[selectedDay], routines, user);
  const selectedPlan = getDayResolvedGymPlan(week.days[selectedDay], routines);

  return (
    <div>
      <div className="ph">
        <div className="ph-title">MI <span>GYM</span></div>
        <div className="ph-sub">Rutinas guardadas/inline asignadas para tu grupo · pesos calculados según tu 1RM</div>
      </div>

      <div className="flex ic g2r mb4" style={{flexWrap:"wrap"}}>
        {allDays.map(d=>(
          <button key={d.i} className={`btn ${selectedDay===d.i?"btn-or":"btn-ghost"}`} onClick={()=>setSelectedDay(d.i)}>
            {DAYS_SHORT[d.i]} · {getDayGymCount(d.day, routines)} ejercicios
          </button>
        ))}
      </div>

      {!allDays.length && <div className="card" style={{textAlign:"center",padding:40,color:"var(--mu)"}}>No hay rutinas de gym asignadas a tu grupo esta semana</div>}

      {allDays.length > 0 && selectedPlan && (
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

      {focusExercises.length === 0 && allDays.length > 0 && <div className="card" style={{textAlign:"center",padding:40,color:"var(--mu)"}}>No hay gym este día</div>}

      {focusExercises.map(ex => {
        const max = user.maxW?.[ex.id];
        return (
          <div key={ex.id} className="card mb3">
            <div style={{display:"grid",gridTemplateColumns:"60px 1fr repeat(3,100px)",gap:16,alignItems:"center"}}>
              <div style={{fontSize:44,textAlign:"center"}}>{ex.emoji}</div>
              <div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:800,lineHeight:1}}>{ex.name}</div>
                <div style={{fontSize:12,color:"var(--mu2)",marginTop:2}}>{ex.muscles}</div>
                {max ? (
                  <div style={{fontSize:11,color:"var(--mu)",marginTop:4}}>1RM: {max}kg · {ex.pct}%</div>
                ) : (
                  <div style={{fontSize:11,color:"var(--re)",marginTop:4}}>⚠ Actualiza tu peso máximo</div>
                )}
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,lineHeight:1}}>{ex.sets}</div>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>series</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,lineHeight:1}}>{ex.reps}</div>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"var(--mu)"}}>reps</div>
              </div>
              <div style={{textAlign:"center"}}>
                {ex.kg ? (
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
function AthletePerfil({ user, setUser, athletes }) {
  const [group, setGroup] = useState(user.group);
  const [editing, setEditing] = useState(false);
  const [maxW, setMaxW] = useState({...user.maxW});

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
              {GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function TrackFlow() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [athletes, setAthletes] = useState(DEFAULT_ATHLETES);
  const [week, setWeek] = useState(normalizeWeek(DEFAULT_WEEK, DEFAULT_ROUTINE_LIBRARY));
  const [routines, setRoutines] = useState(normalizeRoutineLibrary(DEFAULT_ROUTINE_LIBRARY));
  const [notifications, setNotifications] = useState([]);
  const [completed, setCompleted] = useState(false);

  // Load persisted session
  useEffect(() => {
    (async () => {
      const savedUser = await store.get("tf_user");
      const savedAthletes = await store.get("tf_athletes");
      const savedUsersCsv = await store.getRaw("tf_users_csv");
      const savedWeek = await store.get("tf_week");
      const savedRoutines = await store.get("tf_routines");
      const savedNotifs = await store.get("tf_notifs");
      const savedCompleted = await store.get("tf_completed");

      const loadedRoutines = normalizeRoutineLibrary(savedRoutines || DEFAULT_ROUTINE_LIBRARY);
      setRoutines(loadedRoutines);

      if (savedUser) setUser(savedUser);

      const csvAthletes = athletesFromCsv(savedUsersCsv);
      if (csvAthletes?.length) setAthletes(csvAthletes);
      else if (savedAthletes) setAthletes(savedAthletes);

      if (savedWeek) setWeek(normalizeWeek(savedWeek, loadedRoutines));
      if (savedNotifs) setNotifications(savedNotifs);
      if (savedCompleted) setCompleted(savedCompleted);
      setLoading(false);
    })();
  }, []);

  // Persist on change
  useEffect(() => { if(user) store.set("tf_user", user); }, [user]);
  useEffect(() => { store.set("tf_athletes", athletes); store.setRaw("tf_users_csv", athletesToCsv(athletes)); }, [athletes]);
  useEffect(() => { store.set("tf_week", normalizeWeek(week, routines)); }, [week, routines]);
  useEffect(() => { store.set("tf_routines", normalizeRoutineLibrary(routines)); }, [routines]);
  useEffect(() => { store.set("tf_notifs", notifications); }, [notifications]);
  useEffect(() => { store.set("tf_completed", completed); }, [completed]);

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

  const handleComplete = () => {
    const newCompleted = !completed;
    setCompleted(newCompleted);
    const todayI = todayIdx();
    if (newCompleted && user) {
      const notif = {
        athlete: user.name,
        msg: `Ha completado el entrenamiento de ${DAYS_FULL[todayI]}`,
        time: new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})
      };
      setNotifications(prev => [notif, ...prev].slice(0,10));
      setAthletes(prev => prev.map(a => a.id===user.id ? {...a, todayDone:true} : a));
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

  if (!user) return <LoginScreen onLogin={handleLogin} athletes={athletes} />;

  const isCoach = user.role === "coach";

  const renderPage = () => {
    if (isCoach) {
      switch(page) {
        case "dashboard":  return <CoachDashboard athletes={athletes} notifications={notifications} week={week} onClearNotif={()=>setNotifications([])} />;
        case "semana":     return <CoachSemana week={week} setWeek={setWeek} routines={routines} setRoutines={setRoutines} />;
        case "gym":        return <CoachGym routines={routines} setRoutines={setRoutines} />;
        case "grupos":     return <CoachGrupos athletes={athletes} setAthletes={setAthletes} />;
        case "atletas":    return <CoachAtletas athletes={athletes} setAthletes={setAthletes} week={week} />;
        case "volumen":    return <CoachVolumen athletes={athletes} />;
        case "calendario": return <CoachCalendario week={week} />;
        case "historial":  return <CoachHistorial />;
        default: return null;
      }
    } else {
      const currentUser = athletes.find(a=>a.id===user.id) || user;
      switch(page) {
        case "hoy":    return <AthleteHoy user={currentUser} week={week} routines={routines} onComplete={handleComplete} completed={completed} />;
        case "semana": return <AthleteSemana week={week} routines={routines} user={currentUser} />;
        case "gym":    return <AthleteGym user={currentUser} routines={routines} week={week} />;
        case "strava": return <AthleteStrava user={currentUser} setUser={u=>setUser(u)} />;
        case "perfil": return <AthletePerfil user={currentUser} setUser={u=>{setUser(u);setAthletes(prev=>prev.map(a=>a.id===u.id?u:a))}} athletes={athletes} />;
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
