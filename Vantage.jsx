import React, { useState, useMemo, useEffect, useRef } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList } from "recharts";
import { Send, Plus, Trash2, TriangleAlert, Sparkles, RefreshCw } from "lucide-react";

/* ───────────────────────── design tokens ───────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.vt * { box-sizing: border-box; }
.vt {
  --ink:#0E1116; --surface:#161A21; --surface2:#1B2029; --line:#262C36;
  --txt:#E7E3DA; --muted:#8A8F99; --faint:#5A616C;
  --gold:#CDA434; --gold-dim:#9A7C2C;
  --red:#C75D5D; --green:#5FA37E; --blue:#6E8BB0; --violet:#9C7BB0; --orange:#D98C5F; --slate:#7A8FA6;
  font-family:'Hanken Grotesk', sans-serif;
  background:
    radial-gradient(900px 500px at 85% -8%, rgba(205,164,52,0.07), transparent 60%),
    radial-gradient(700px 500px at -5% 100%, rgba(110,139,176,0.06), transparent 55%),
    var(--ink);
  color:var(--txt); min-height:100vh; width:100%;
  letter-spacing:0.1px;
}
.vt .mono { font-family:'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
.vt .serif { font-family:'Fraunces', serif; }
.vt .wrap { max-width:1120px; margin:0 auto; padding:28px 24px 64px; }

.vt .topbar { display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap;
  padding-bottom:18px; border-bottom:1px solid var(--line); margin-bottom:24px; }
.vt .brand { display:flex; align-items:baseline; gap:12px; }
.vt .mark { font-family:'Fraunces', serif; font-weight:600; font-size:26px; letter-spacing:0.5px; }
.vt .mark b { color:var(--gold); font-weight:600; }
.vt .tagline { color:var(--faint); font-size:12px; letter-spacing:1.5px; text-transform:uppercase; }
.vt .asof { color:var(--muted); font-size:12px; }

.vt .nav { display:flex; gap:4px; margin-bottom:24px; background:var(--surface); padding:4px; border-radius:10px;
  border:1px solid var(--line); width:fit-content; }
.vt .nav button { font-family:inherit; font-size:13px; font-weight:600; letter-spacing:0.3px; color:var(--muted);
  background:transparent; border:none; padding:9px 18px; border-radius:7px; cursor:pointer; transition:.18s; }
.vt .nav button:hover { color:var(--txt); }
.vt .nav button.on { background:var(--surface2); color:var(--txt); box-shadow:0 1px 0 rgba(255,255,255,.03) inset; }

.vt .card { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:22px; }
.vt .eyebrow { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--faint); margin-bottom:6px; }

/* hero concentration */
.vt .hero { display:grid; grid-template-columns:1.05fr 1fr; gap:18px; margin-bottom:18px; }
@media (max-width:840px){ .vt .hero{ grid-template-columns:1fr; } }
.vt .total { font-family:'IBM Plex Mono', monospace; font-size:46px; font-weight:500; line-height:1; letter-spacing:-1px; }
.vt .totalsub { color:var(--muted); font-size:13px; margin-top:10px; }
.vt .gain { color:var(--green); font-weight:600; }

.vt .meter { margin-top:18px; }
.vt .meterhead { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
.vt .meterhead .big { font-family:'IBM Plex Mono', monospace; font-size:30px; font-weight:500; color:var(--red); }
.vt .track { position:relative; height:12px; background:var(--surface2); border-radius:8px; overflow:visible; border:1px solid var(--line); }
.vt .fill { position:absolute; left:0; top:0; bottom:0; border-radius:8px;
  background:linear-gradient(90deg, var(--orange), var(--red)); }
.vt .thresh { position:absolute; top:-5px; bottom:-5px; width:2px; background:var(--gold); }
.vt .thresh span { position:absolute; top:-18px; left:50%; transform:translateX(-50%); white-space:nowrap;
  font-size:10px; color:var(--gold); letter-spacing:.5px; }
.vt .meternote { color:var(--muted); font-size:12.5px; margin-top:14px; line-height:1.5; }
.vt .meternote b { color:var(--txt); font-weight:600; }

/* metric strip */
.vt .strip { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px; }
@media (max-width:840px){ .vt .strip{ grid-template-columns:repeat(2,1fr);} }
.vt .metric .v { font-family:'IBM Plex Mono', monospace; font-size:24px; font-weight:500; }
.vt .metric .l { color:var(--muted); font-size:12px; margin-top:3px; }
.vt .metric small { color:var(--faint); }

/* two col */
.vt .cols { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
@media (max-width:840px){ .vt .cols{ grid-template-columns:1fr; } }

.vt .legend { margin-top:6px; }
.vt .legrow { display:flex; align-items:center; gap:10px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13px; }
.vt .legrow:last-child{ border-bottom:none; }
.vt .dot { width:9px; height:9px; border-radius:50%; flex:0 0 auto; }
.vt .legrow .nm { flex:1; }
.vt .legrow .pc { font-family:'IBM Plex Mono', monospace; color:var(--muted); }
.vt .legrow .vl { font-family:'IBM Plex Mono', monospace; min-width:84px; text-align:right; }

.vt .acctbar { padding:10px 0; border-bottom:1px solid var(--line); }
.vt .acctbar:last-child{ border-bottom:none; }
.vt .acctbar .row { display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px; }
.vt .acctbar .row .mono { color:var(--muted); }
.vt .barbg { height:7px; background:var(--surface2); border-radius:6px; overflow:hidden; }
.vt .barfg { height:100%; background:linear-gradient(90deg, var(--gold-dim), var(--gold)); border-radius:6px; }

.vt .flags .flag { display:flex; gap:11px; padding:11px 0; border-bottom:1px solid var(--line); }
.vt .flags .flag:last-child{ border-bottom:none; }
.vt .flags .flag svg { flex:0 0 auto; margin-top:1px; }
.vt .flags .flag .t { font-weight:600; font-size:13.5px; }
.vt .flags .flag .d { color:var(--muted); font-size:12.5px; line-height:1.5; margin-top:2px; }

/* holdings table */
.vt table { width:100%; border-collapse:collapse; }
.vt .acctlbl { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:var(--gold);
  padding:18px 0 8px; font-weight:600; }
.vt th { text-align:left; font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:var(--faint);
  font-weight:600; padding:6px 8px; border-bottom:1px solid var(--line); }
.vt th.r, .vt td.r { text-align:right; }
.vt td { padding:9px 8px; border-bottom:1px solid var(--line); font-size:13.5px; vertical-align:middle; }
.vt td .sym { font-weight:700; }
.vt td .nm { color:var(--muted); font-size:12px; }
.vt td input { width:96px; background:var(--surface2); border:1px solid var(--line); color:var(--txt);
  font-family:'IBM Plex Mono', monospace; font-size:13px; padding:5px 8px; border-radius:6px; text-align:right; }
.vt td input:focus { outline:none; border-color:var(--gold-dim); }
.vt .tag { font-size:10px; padding:2px 7px; border-radius:20px; border:1px solid var(--line); color:var(--muted); white-space:nowrap; }
.vt .iconbtn { background:transparent; border:none; color:var(--faint); cursor:pointer; padding:4px; border-radius:6px; }
.vt .iconbtn:hover { color:var(--red); background:var(--surface2); }
.vt .addbtn { display:inline-flex; align-items:center; gap:7px; margin-top:16px; background:var(--surface2);
  border:1px solid var(--line); color:var(--txt); font-family:inherit; font-size:13px; font-weight:600;
  padding:9px 16px; border-radius:8px; cursor:pointer; }
.vt .addbtn:hover { border-color:var(--gold-dim); }

/* strategist */
.vt .chat { display:flex; flex-direction:column; height:560px; }
.vt .msgs { flex:1; overflow-y:auto; padding-right:6px; }
.vt .msg { margin-bottom:16px; }
.vt .msg .who { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:6px; }
.vt .msg.user .who { color:var(--blue); }
.vt .msg.ai .who { color:var(--gold); }
.vt .bubble { font-size:14px; line-height:1.62; white-space:pre-wrap; }
.vt .msg.user .bubble { color:var(--muted); }
.vt .chips { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 14px; }
.vt .chip { font-family:inherit; font-size:12.5px; color:var(--muted); background:var(--surface2);
  border:1px solid var(--line); padding:7px 13px; border-radius:20px; cursor:pointer; }
.vt .chip:hover { color:var(--txt); border-color:var(--gold-dim); }
.vt .inbar { display:flex; gap:10px; margin-top:14px; border-top:1px solid var(--line); padding-top:14px; }
.vt .inbar input { flex:1; background:var(--surface2); border:1px solid var(--line); color:var(--txt);
  font-family:inherit; font-size:14px; padding:12px 14px; border-radius:10px; }
.vt .inbar input:focus { outline:none; border-color:var(--gold-dim); }
.vt .sendbtn { background:var(--gold); color:#1a160a; border:none; border-radius:10px; padding:0 16px; cursor:pointer;
  display:flex; align-items:center; }
.vt .sendbtn:disabled { opacity:.4; cursor:not-allowed; }
.vt .think { color:var(--gold); font-size:13px; display:flex; align-items:center; gap:8px; }
.vt .spin { animation:sp 1s linear infinite; }
@keyframes sp { to { transform:rotate(360deg); } }
.vt .disc { color:var(--faint); font-size:11px; line-height:1.5; margin-top:12px; }
.vt .sectit { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:var(--faint); margin:0 0 14px; font-weight:600; }

/* dashboard: kpi strip, donuts, positions */
.vt .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px; }
@media (max-width:840px){ .vt .kpis{ grid-template-columns:repeat(2,1fr);} }
.vt .kpi { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px 20px; }
.vt .kpi.risk { border-color:rgba(199,93,93,0.35); }
.vt .kl { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:var(--faint); margin-bottom:10px; }
.vt .kv { font-family:'IBM Plex Mono',monospace; font-size:29px; font-weight:500; line-height:1; letter-spacing:-0.5px; }
.vt .ks { font-size:12px; color:var(--muted); margin-top:8px; }
.vt .pos { color:var(--green); } .vt .neg { color:var(--red); }
.vt .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-bottom:18px; }
@media (max-width:900px){ .vt .grid3{ grid-template-columns:1fr; } }
.vt .donutwrap { display:flex; gap:14px; align-items:center; }
.vt .ring { width:124px; height:124px; flex:0 0 auto; position:relative; }
.vt .ring .center { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
.vt .ring .center .ct { font-family:'IBM Plex Mono',monospace; font-size:13px; color:var(--txt); }
.vt .donutleg { flex:1; min-width:0; }
.vt .dlrow { display:flex; align-items:center; gap:8px; font-size:12px; padding:3px 0; }
.vt .dlrow .nm { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted); }
.vt .dlrow .pc { font-family:'IBM Plex Mono',monospace; color:var(--txt); }
.vt .postable td { font-size:13px; }
.vt .nm2 { color:var(--muted); }
.vt .tag2 { display:inline-flex; align-items:center; gap:7px; font-size:11px; color:var(--muted); white-space:nowrap; }

/* plan: target vs actual */
.vt .tgtrow { padding:13px 0; border-bottom:1px solid var(--line); }
.vt .tgtrow:last-child { border-bottom:none; }
.vt .tgthead { display:flex; justify-content:space-between; align-items:center; font-size:13.5px; margin-bottom:8px; }
.vt .tgthead .rt { display:flex; align-items:center; gap:8px; color:var(--muted); }
.vt .tgthead input { width:48px; background:var(--surface2); border:1px solid var(--line); color:var(--txt);
  font-family:'IBM Plex Mono',monospace; font-size:12px; padding:3px 6px; border-radius:6px; text-align:right; }
.vt .tgthead input:focus { outline:none; border-color:var(--gold-dim); }
.vt .tgtbar { position:relative; height:9px; background:var(--surface2); border-radius:6px; border:1px solid var(--line); }
.vt .tgtfill { position:absolute; left:0; top:0; bottom:0; border-radius:6px; }
.vt .tick { position:absolute; top:-4px; bottom:-4px; width:2px; background:var(--txt); }
.vt .delta { font-family:'IBM Plex Mono',monospace; font-size:12px; margin-top:7px; }
.vt .delta.add { color:var(--green); }
.vt .delta.trim { color:var(--orange); }
.vt .delta.ok { color:var(--faint); }

/* plan: rsu planner */
.vt .controls { display:grid; grid-template-columns:1fr 1fr; gap:14px 18px; margin-bottom:20px; }
@media (max-width:560px){ .vt .controls{ grid-template-columns:1fr; } }
.vt .ctl label { display:block; font-size:12px; color:var(--muted); margin-bottom:6px; }
.vt .ctl .ig { display:flex; align-items:center; background:var(--surface2); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
.vt .ctl .ig span { color:var(--faint); padding:0 9px; font-family:'IBM Plex Mono',monospace; font-size:13px; }
.vt .ctl input[type=number] { flex:1; background:transparent; border:none; color:var(--txt);
  font-family:'IBM Plex Mono',monospace; font-size:14px; padding:9px 10px 9px 0; }
.vt .ctl input:focus { outline:none; }
.vt .toggle { display:inline-flex; align-items:center; gap:9px; cursor:pointer; font-size:13px; color:var(--txt); margin-top:26px; }
.vt .tg { width:38px; height:21px; border-radius:20px; background:var(--surface2); border:1px solid var(--line); position:relative; transition:.18s; flex:0 0 auto; }
.vt .tg.on { background:var(--gold-dim); }
.vt .tg b { position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:50%; background:var(--txt); transition:.18s; }
.vt .tg.on b { left:20px; background:#1a160a; }
.vt .proj { position:relative; height:130px; display:flex; align-items:flex-end; gap:3px; margin:18px 0 8px; padding-top:6px; }
.vt .projcol { flex:1; height:100%; display:flex; align-items:flex-end; }
.vt .projbar { width:100%; border-radius:3px 3px 0 0; min-height:2px; }
.vt .projceil { position:absolute; left:0; right:0; height:0; border-top:1px dashed var(--gold); }
.vt .projceil span { position:absolute; right:0; top:-16px; font-size:10px; color:var(--gold); }
.vt .projx { display:flex; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--faint); }
.vt .verdict { font-size:14px; line-height:1.6; margin-top:16px; padding-top:14px; border-top:1px solid var(--line); }
.vt .verdict b { color:var(--gold); }
`;

/* ───────────────────────── seed data (real holdings) ───────────────────────── */
const A = {
  tax: "Schwab · Individual (taxable)",
  roth: "Schwab · Roth IRA",
  et: "E*Trade",
  k: "Fidelity · Tesla 401(k)",
  rsu: "Tesla · RSUs",
};
const SEED = [
  // taxable
  { id:"t1", acct:A.tax, sym:"SWPPX", name:"Schwab S&P 500 Index", value:6626.64, cost:3687.92, cls:"us_large" },
  { id:"t2", acct:A.tax, sym:"SWTSX", name:"Schwab Total Stock Market", value:707.01, cost:398.19, cls:"us_total" },
  { id:"t3", acct:A.tax, sym:"NVDA", name:"NVIDIA", value:635.84, cost:556.34, cls:"us_stock" },
  { id:"t4", acct:A.tax, sym:"AAPL", name:"Apple", value:296.34, cost:129.47, cls:"us_stock" },
  { id:"t5", acct:A.tax, sym:"SCHB", name:"Schwab US Broad Market ETF", value:175.09, cost:73.70, cls:"us_large" },
  { id:"t6", acct:A.tax, sym:"SCHD", name:"Schwab US Dividend Equity", value:97.92, cost:69.64, cls:"div_value" },
  { id:"t7", acct:A.tax, sym:"SWISX", name:"Schwab International Index", value:87.95, cost:85.00, cls:"intl_dev" },
  { id:"t8", acct:A.tax, sym:"ARKK", name:"ARK Innovation ETF", value:79.60, cost:56.72, cls:"spec" },
  { id:"t9", acct:A.tax, sym:"DHC", name:"Diversified Healthcare REIT", value:43.35, cost:29.60, cls:"spec" },
  { id:"t10", acct:A.tax, sym:"CASH", name:"Cash & money market", value:212.08, cost:0, cls:"cash" },
  // roth
  { id:"r1", acct:A.roth, sym:"SWPPX", name:"Schwab S&P 500 Index", value:6693.79, cost:3829.23, cls:"us_large" },
  { id:"r2", acct:A.roth, sym:"SWTSX", name:"Schwab Total Stock Market", value:6531.67, cost:3864.57, cls:"us_total" },
  { id:"r3", acct:A.roth, sym:"NVDA", name:"NVIDIA", value:2123.72, cost:324.78, cls:"us_stock" },
  { id:"r4", acct:A.roth, sym:"XAR", name:"SPDR S&P Aerospace & Defense", value:587.35, cost:191.34, cls:"sector" },
  { id:"r5", acct:A.roth, sym:"SFLNX", name:"Schwab Fundamental US Large Co", value:441.96, cost:194.67, cls:"us_large" },
  { id:"r6", acct:A.roth, sym:"CSCO", name:"Cisco Systems", value:286.15, cost:112.18, cls:"us_stock" },
  { id:"r7", acct:A.roth, sym:"SCHD", name:"Schwab US Dividend Equity", value:195.84, cost:139.28, cls:"div_value" },
  { id:"r8", acct:A.roth, sym:"ARKK", name:"ARK Innovation ETF", value:159.20, cost:290.60, cls:"spec" },
  { id:"r9", acct:A.roth, sym:"SWHFX", name:"Schwab Health Care", value:155.11, cost:157.72, cls:"sector" },
  { id:"r10", acct:A.roth, sym:"SCHE", name:"Schwab Emerging Markets Equity", value:109.80, cost:105.05, cls:"intl_em" },
  { id:"r11", acct:A.roth, sym:"CASH", name:"Cash & money market", value:320.38, cost:0, cls:"cash" },
  // etrade
  { id:"e1", acct:A.et, sym:"SPCX", name:"SPAC & New Issue ETF", value:577.50, cost:461.84, cls:"spec" },
  { id:"e2", acct:A.et, sym:"AMZN", name:"Amazon", value:492.19, cost:226.72, cls:"us_stock" },
  { id:"e3", acct:A.et, sym:"CASH", name:"Cash", value:332.91, cost:0, cls:"cash" },
  // 401k
  { id:"k1", acct:A.k, sym:"TRP2060", name:"T. Rowe Price Ret. Blend 2060 (target-date)", value:17742.81, cost:16280.07, cls:"tdf" },
  { id:"k2", acct:A.k, sym:"SP500", name:"S&P 500 Index PL CL C", value:17471.31, cost:13974.02, cls:"us_large" },
  // rsu
  { id:"x1", acct:A.rsu, sym:"TSLA", name:"Tesla RSUs (approx.)", value:30000, cost:30000, cls:"us_stock" },
];

const CLS = {
  us_large:  { label:"US large-cap index", color:"#CDA434", bucket:"US equity" },
  us_total:  { label:"US total market", color:"#B08A3E", bucket:"US equity" },
  us_stock:  { label:"US single stocks", color:"#C75D5D", bucket:"US equity" },
  intl_dev:  { label:"International developed", color:"#6E8BB0", bucket:"International" },
  intl_em:   { label:"Emerging markets", color:"#86A6CC", bucket:"International" },
  div_value: { label:"Dividend / value", color:"#5FA37E", bucket:"US equity" },
  sector:    { label:"Sector bets", color:"#9C7BB0", bucket:"US equity" },
  spec:      { label:"Speculative", color:"#D98C5F", bucket:"US equity" },
  tdf:       { label:"Target-date blend", color:"#7A8FA6", bucket:"Blend" },
  cash:      { label:"Cash", color:"#4A515C", bucket:"Cash" },
};
// approximate internal split of the 2060 target-date fund
const TDF = { us:0.63, intl:0.30, bond:0.07 };
const COMFORT = 15; // single-stock comfort ceiling, % of portfolio

const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
const fmt1 = (n) => "$" + n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
const pct = (n) => n.toFixed(1) + "%";

/* ───────────────────────── analytics engine (deterministic) ───────────────────────── */
function analyze(holdings) {
  const total = holdings.reduce((s,h)=>s+(+h.value||0),0);

  // by display class
  const clsMap = {};
  holdings.forEach(h=>{ clsMap[h.cls]=(clsMap[h.cls]||0)+(+h.value||0); });
  const byClass = Object.entries(clsMap)
    .map(([k,v])=>({ key:k, label:CLS[k].label, color:CLS[k].color, value:v, pct:v/total*100 }))
    .sort((a,b)=>b.value-a.value);

  // high-level buckets (decompose target-date fund)
  let usEq=0, intl=0, bond=0, cash=0;
  holdings.forEach(h=>{
    const v=+h.value||0;
    if(h.cls==="tdf"){ usEq+=v*TDF.us; intl+=v*TDF.intl; bond+=v*TDF.bond; }
    else { const b=CLS[h.cls].bucket;
      if(b==="US equity")usEq+=v; else if(b==="International")intl+=v; else if(b==="Cash")cash+=v; }
  });
  const buckets=[
    {label:"US equity", value:usEq, color:"#CDA434"},
    {label:"International", value:intl, color:"#6E8BB0"},
    {label:"Bonds", value:bond, color:"#7A8FA6"},
    {label:"Cash", value:cash, color:"#4A515C"},
  ].map(b=>({...b, pct:b.value/total*100}));

  // single-stock concentration
  const stockMap={};
  holdings.filter(h=>h.cls==="us_stock").forEach(h=>{ stockMap[h.sym]=(stockMap[h.sym]||0)+(+h.value||0); });
  const singles=Object.entries(stockMap).map(([sym,v])=>({sym,value:v,pct:v/total*100})).sort((a,b)=>b.value-a.value);
  const singleTotal=singles.reduce((s,x)=>s+x.value,0);
  const tsla=singles.find(s=>s.sym==="TSLA");

  // by account
  const acctMap={};
  holdings.forEach(h=>{ acctMap[h.acct]=(acctMap[h.acct]||0)+(+h.value||0); });
  const byAccount=Object.entries(acctMap).map(([acct,v])=>({acct,value:v,pct:v/total*100})).sort((a,b)=>b.value-a.value);

  // performance over non-cash holdings (cash has no basis)
  const nonCash=holdings.filter(h=>h.cls!=="cash");
  const invested=nonCash.reduce((s,h)=>s+(+h.cost||0),0);
  const investedValue=nonCash.reduce((s,h)=>s+(+h.value||0),0);
  const unreal=investedValue-invested;
  const roi=invested>0?unreal/invested*100:0;
  const cashTotal=holdings.filter(h=>h.cls==="cash").reduce((s,h)=>s+(+h.value||0),0);

  // per-symbol aggregates (across accounts) for charts + table
  const symMap={};
  nonCash.forEach(h=>{
    if(!symMap[h.sym]) symMap[h.sym]={sym:h.sym, name:h.name, cls:h.cls, value:0, cost:0};
    symMap[h.sym].value+=(+h.value||0); symMap[h.sym].cost+=(+h.cost||0);
  });
  const syms=Object.values(symMap).map(s=>({...s,
    unreal:s.value-s.cost,
    roi:s.cost>0?(s.value-s.cost)/s.cost*100:0,
    color:CLS[s.cls].color,
  })).sort((x,y)=>y.value-x.value);

  // gains where basis known
  const withBasis=holdings.filter(h=>h.cost>0);
  const basis=withBasis.reduce((s,h)=>s+h.cost,0);
  const val=withBasis.reduce((s,h)=>s+(+h.value||0),0);
  const gain=val-basis;

  const specTotal=holdings.filter(h=>h.cls==="spec").reduce((s,h)=>s+(+h.value||0),0);

  return { total, byClass, buckets, singles, singleTotal, tsla, byAccount, gain, basis, specTotal,
    invested, investedValue, unreal, roi, cashTotal, syms,
    intlPct:intl/total*100, bondPct:bond/total*100 };
}

/* ───────────────────────── AI strategist ───────────────────────── */
function buildContext(a, holdings){
  const lines = holdings.filter(h=>h.cls!=="cash")
    .sort((x,y)=>y.value-x.value)
    .map(h=>`${h.sym} (${h.acct.split(" · ")[0]}) ${fmt(h.value)} — ${CLS[h.cls].label}`).join("\n");
  return [
`PORTFOLIO SNAPSHOT (the owner's real holdings; use only these figures, never invent numbers):`,
`Total invested: ${fmt(a.total)} across ${a.byAccount.length} accounts.`,
`High-level mix: US equity ${pct(a.buckets[0].pct)}, International ${pct(a.intlPct)}, Bonds ${pct(a.bondPct)}, Cash ${pct(a.buckets[3].pct)}.`,
`Tesla single-stock exposure: ${a.tsla?fmt(a.tsla.value):"$0"} = ${a.tsla?pct(a.tsla.pct):"0%"} of the portfolio — and the owner also WORKS at Tesla (salary, benefits, RSUs all Tesla).`,
`All direct single stocks: ${a.singles.map(s=>`${s.sym} ${pct(s.pct)}`).join(", ")}.`,
`Accounts: ${a.byAccount.map(x=>`${x.acct.split(" · ").pop()} ${fmt(x.value)}`).join("; ")}.`,
`Note: the Roth is tax-free to rebalance; the taxable account has SWPPX the owner won't sell.`,
``,
`Holdings:`,
lines,
  ].join("\n");
}

async function callClaude(question, context){
  const sys = "You are a candid personal portfolio strategist embedded in the owner's private dashboard. "
    + "You have their real portfolio. Give concise, direct, honest analysis and trade-offs in plain prose (no markdown headers). "
    + "Lead with the answer. Use ONLY the figures provided — never invent numbers. When the question is about current events, news, or prices, use web search. "
    + "Keep it tight: a few short paragraphs at most. This is educational information, not licensed financial advice.";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      model:"claude-sonnet-4-6",
      max_tokens:1000,
      system: sys,
      tools:[{ type:"web_search_20250305", name:"web_search" }],
      messages:[{ role:"user", content:`${context}\n\nQuestion: ${question}` }],
    }),
  });
  const data = await res.json();
  const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n\n").trim();
  return text || "I couldn't generate a response just now — try again in a moment.";
}

/* ───────────────────────── UI ───────────────────────── */
export default function Vantage(){
  const [tab,setTab]=useState("overview");
  const [holdings,setHoldings]=useState(SEED);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{ let on=true;
    (async()=>{ try{ if(window.storage){ const r=await window.storage.get("vantage_holdings");
      if(on&&r&&r.value){ setHoldings(JSON.parse(r.value)); } } }catch(e){}
      finally{ if(on)setLoaded(true); } })();
    return ()=>{on=false;};
  },[]);
  useEffect(()=>{ if(!loaded)return;
    (async()=>{ try{ if(window.storage) await window.storage.set("vantage_holdings", JSON.stringify(holdings)); }catch(e){} })();
  },[holdings,loaded]);

  const a=useMemo(()=>analyze(holdings),[holdings]);

  return (
    <div className="vt">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <span className="mark">Vant<b>a</b>ge</span>
            <span className="tagline">Personal portfolio desk</span>
          </div>
          <span className="asof mono">as of 6/15/26 · {fmt(a.total)}</span>
        </div>

        <div className="nav">
          {[["overview","Overview"],["holdings","Holdings"],["plan","Plan"],["strategist","AI Strategist"]].map(([t,label])=>(
            <button key={t} className={tab===t?"on":""} onClick={()=>setTab(t)}>{label}</button>
          ))}
        </div>

        {tab==="overview" && <Overview a={a} />}
        {tab==="holdings" && <Holdings holdings={holdings} setHoldings={setHoldings} />}
        {tab==="plan" && <Plan a={a} />}
        {tab==="strategist" && <Strategist a={a} holdings={holdings} />}
      </div>
    </div>
  );
}

const PAL=["#CDA434","#6E8BB0","#5FA37E","#D98C5F","#9C7BB0","#7A8FA6","#C75D5D","#86A6CC","#B08A3E","#4A515C"];

function Donut({title,data}){
  const total=data.reduce((s,d)=>s+(d.value||0),0)||1;
  const ds=data.map((d,i)=>({...d,color:d.color||PAL[i%PAL.length]}));
  return (
    <div className="card">
      <div className="sectit">{title}</div>
      <div className="donutwrap">
        <div className="ring">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={ds} dataKey="value" innerRadius={40} outerRadius={60} paddingAngle={2} stroke="none">
                {ds.map((s,i)=><Cell key={i} fill={s.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="center"><div className="ct">{fmt(total)}</div></div>
        </div>
        <div className="donutleg">
          {ds.map((s,i)=>(
            <div className="dlrow" key={i}>
              <span className="dot" style={{background:s.color}} />
              <span className="nm">{s.label}</span>
              <span className="pc">{pct(s.value/total*100)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Overview({a}){
  const fillPct=Math.min(100,(a.tsla?a.tsla.pct:0));
  const top=a.syms.slice(0,8);
  const acctData=a.byAccount.map(x=>({label:x.acct.includes(" · ")?x.acct.split(" · ").pop():x.acct, value:x.value}));
  const tip={ contentStyle:{background:"#1B2029",border:"1px solid #262C36",borderRadius:8,fontFamily:"'IBM Plex Mono',monospace",fontSize:12},
    itemStyle:{color:"#E7E3DA"}, labelStyle:{color:"#8A8F99"}, cursor:{fill:"rgba(255,255,255,0.04)"} };
  const ax={ tick:{fill:"#8A8F99",fontSize:10}, axisLine:{stroke:"#262C36"}, tickLine:false };
  const yax={ tick:{fill:"#5A616C",fontSize:10}, axisLine:false, tickLine:false, width:42 };

  return (
    <>
      {/* KPI strip */}
      <div className="kpis">
        <div className="kpi"><div className="kl">Portfolio</div><div className="kv">{fmt(a.total)}</div>
          <div className="ks">{a.byAccount.length} accounts · {fmt(a.cashTotal)} cash</div></div>
        <div className="kpi"><div className="kl">Invested</div><div className="kv">{fmt(a.invested)}</div>
          <div className="ks">cost basis, excl. cash</div></div>
        <div className="kpi"><div className="kl">Unrealized profit</div><div className="kv pos">+{fmt(a.unreal)}</div>
          <div className="ks pos">ROI {pct(a.roi)}</div></div>
        <div className="kpi risk"><div className="kl">Tesla concentration</div><div className="kv neg">{a.tsla?pct(a.tsla.pct):"0%"}</div>
          <div className="ks">comfort ~{COMFORT}% · {fmt(a.tsla?a.tsla.value:0)}</div></div>
      </div>

      {/* donut row */}
      <div className="grid3">
        <Donut title="By asset class" data={a.byClass} />
        <Donut title="US · Intl · Bonds · Cash" data={a.buckets} />
        <Donut title="By account" data={acctData} />
      </div>

      {/* bar charts row */}
      <div className="grid3">
        <div className="card">
          <div className="sectit">Invested vs. value</div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={top} margin={{top:6,right:6,left:0,bottom:0}}>
              <XAxis dataKey="sym" {...ax} interval={0} angle={-35} textAnchor="end" height={46} />
              <YAxis {...yax} tickFormatter={v=>"$"+Math.round(v/1000)+"k"} />
              <Tooltip {...tip} formatter={(v,n)=>[fmt(v),n==="cost"?"Invested":"Value"]} />
              <Bar dataKey="cost" name="cost" fill="#7A8FA6" radius={[3,3,0,0]} />
              <Bar dataKey="value" name="value" fill="#CDA434" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="sectit">Unrealized profit by holding</div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={top} margin={{top:6,right:6,left:0,bottom:0}}>
              <XAxis dataKey="sym" {...ax} interval={0} angle={-35} textAnchor="end" height={46} />
              <YAxis {...yax} tickFormatter={v=>"$"+Math.round(v/1000)+"k"} />
              <Tooltip {...tip} formatter={v=>[fmt(v),"Unrealized"]} />
              <Bar dataKey="unreal" radius={[3,3,0,0]}>
                {top.map((s,i)=><Cell key={i} fill={s.unreal>=0?"#5FA37E":"#C75D5D"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="sectit">ROI % by holding</div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={top} margin={{top:6,right:6,left:0,bottom:0}}>
              <XAxis dataKey="sym" {...ax} interval={0} angle={-35} textAnchor="end" height={46} />
              <YAxis {...yax} tickFormatter={v=>v+"%"} />
              <Tooltip {...tip} formatter={v=>[pct(v),"ROI"]} />
              <Bar dataKey="roi" radius={[3,3,0,0]}>
                {top.map((s,i)=><Cell key={i} fill={s.roi>=0?"#CDA434":"#C75D5D"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* concentration + watch items */}
      <div className="cols">
        <div className="card">
          <div className="sectit">Single-name concentration</div>
          <div className="meter" style={{marginTop:0}}>
            <div className="meterhead">
              <span className="big">{a.tsla?pct(a.tsla.pct):"0%"}</span>
              <span className="mono" style={{color:"var(--muted)",fontSize:13}}>TSLA · {fmt(a.tsla?a.tsla.value:0)}</span>
            </div>
            <div className="track">
              <div className="fill" style={{width:fillPct+"%"}} />
              <div className="thresh" style={{left:COMFORT+"%"}}><span>comfort ~{COMFORT}%</span></div>
            </div>
            <div className="meternote">
              A third of your portfolio is one stock — <b>and Tesla also signs your paycheck</b>, funds your benefits, and is the source of these RSUs. The Plan tab projects how selling vests brings this down.
            </div>
          </div>
        </div>

        <div className="card flags">
          <div className="sectit">Watch items</div>
          <div className="flag">
            <TriangleAlert size={17} color="#C75D5D" />
            <div><div className="t">Tesla concentration stacked on Tesla income</div>
            <div className="d">Single-name exposure of {a.tsla?pct(a.tsla.pct):"0%"} sits far above the ~{COMFORT}% comfort line, compounded by salary, benefits, and vesting RSUs all riding on one company.</div></div>
          </div>
          <div className="flag">
            <TriangleAlert size={17} color="#D98C5F" />
            <div><div className="t">International is thin at {pct(a.intlPct)}</div>
            <div className="d">Most of your international comes from the 2060 target-date fund. Growing it — best in the tax-free Roth — is the cleanest fix.</div></div>
          </div>
          <div className="flag">
            <TriangleAlert size={17} color="#7A8FA6" />
            <div><div className="t">{fmt(a.specTotal)} in speculative satellites</div>
            <div className="d">ARKK, SPCX, and DHC add cost and volatility without diversifying — candidates to clear.</div></div>
          </div>
        </div>
      </div>

      {/* positions table */}
      <div className="card" style={{marginTop:18}}>
        <div className="sectit">Positions</div>
        <table className="postable">
          <thead><tr>
            <th>Ticker</th><th>Name</th><th>Class</th>
            <th className="r">Invested</th><th className="r">Value</th><th className="r">Unrealized</th><th className="r">ROI</th>
          </tr></thead>
          <tbody>
            {a.syms.map((s,i)=>(
              <tr key={i}>
                <td className="mono"><b>{s.sym}</b></td>
                <td className="nm2">{s.name}</td>
                <td><span className="tag2"><span className="dot" style={{background:s.color}} />{CLS[s.cls].label}</span></td>
                <td className="r mono">{fmt(s.cost)}</td>
                <td className="r mono">{fmt(s.value)}</td>
                <td className={"r mono "+(s.unreal>=0?"pos":"neg")}>{s.unreal>=0?"+":"−"}{fmt(Math.abs(s.unreal))}</td>
                <td className={"r mono "+(s.roi>=0?"pos":"neg")}>{s.roi>=0?"+":"−"}{Math.abs(s.roi).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Holdings({holdings,setHoldings}){
  const accounts=[...new Set(holdings.map(h=>h.acct))];
  const update=(id,field,v)=>setHoldings(hs=>hs.map(h=>h.id===id?{...h,[field]:field==="value"||field==="cost"?(parseFloat(v)||0):v}:h));
  const del=(id)=>setHoldings(hs=>hs.filter(h=>h.id!==id));
  const add=(acct)=>setHoldings(hs=>[...hs,{id:"n"+Date.now(),acct,sym:"NEW",name:"New position",value:0,cost:0,cls:"us_stock"}]);
  return (
    <div className="card">
      <div className="sectit">Holdings — edit values to keep it current</div>
      {accounts.map(acct=>{
        const rows=holdings.filter(h=>h.acct===acct);
        const sub=rows.reduce((s,h)=>s+(+h.value||0),0);
        return (
          <div key={acct}>
            <div className="acctlbl">{acct} · <span className="mono" style={{color:"var(--muted)"}}>{fmt(sub)}</span></div>
            <table>
              <thead><tr>
                <th>Symbol</th><th>Class</th><th className="r">Value</th><th className="r">Cost basis</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map(h=>(
                  <tr key={h.id}>
                    <td><div className="sym mono">{h.sym}</div><div className="nm">{h.name}</div></td>
                    <td>
                      <select value={h.cls} onChange={e=>update(h.id,"cls",e.target.value)}
                        style={{background:"var(--surface2)",border:"1px solid var(--line)",color:"var(--txt)",fontFamily:"inherit",fontSize:12,padding:"5px 6px",borderRadius:6}}>
                        {Object.entries(CLS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </td>
                    <td className="r"><input className="mono" value={h.value} onChange={e=>update(h.id,"value",e.target.value)} /></td>
                    <td className="r"><input className="mono" value={h.cost} onChange={e=>update(h.id,"cost",e.target.value)} /></td>
                    <td className="r"><button className="iconbtn" onClick={()=>del(h.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="addbtn" onClick={()=>add(acct)}><Plus size={15} /> Add position</button>
          </div>
        );
      })}
    </div>
  );
}

function Strategist({a,holdings}){
  const [msgs,setMsgs]=useState([{role:"ai",text:`I've got your full picture — ${fmt(a.total)} across ${a.byAccount.length} accounts, with Tesla at ${a.tsla?pct(a.tsla.pct):"0%"}. Ask me anything: where new money should go, what's overlapping, your riskiest holdings, or what's moving your positions today.`}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const scrollRef=useRef(null);
  const context=useMemo(()=>buildContext(a,holdings),[a,holdings]);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[msgs,busy]);

  const send=async(q)=>{
    const question=(q||input).trim(); if(!question||busy)return;
    setInput(""); setMsgs(m=>[...m,{role:"user",text:question}]); setBusy(true);
    try{ const reply=await callClaude(question,context); setMsgs(m=>[...m,{role:"ai",text:reply}]); }
    catch(e){ setMsgs(m=>[...m,{role:"ai",text:"Something went wrong reaching the model. Try again in a moment."}]); }
    finally{ setBusy(false); }
  };

  const chips=["How concentrated am I, really?","Where should my next $150 go?","What are my riskiest holdings?","Any news affecting my holdings today?"];

  return (
    <div className="card chat">
      <div className="msgs" ref={scrollRef}>
        {msgs.map((m,i)=>(
          <div className={"msg "+m.role} key={i}>
            <div className="who">{m.role==="ai"?<span style={{display:"inline-flex",alignItems:"center",gap:6}}><Sparkles size={12}/> Strategist</span>:"You"}</div>
            <div className="bubble">{m.text}</div>
          </div>
        ))}
        {busy && <div className="think"><RefreshCw size={14} className="spin" /> Reading your portfolio and the market…</div>}
      </div>
      {msgs.length<=1 && (
        <div className="chips">
          {chips.map((c,i)=><button className="chip" key={i} onClick={()=>send(c)}>{c}</button>)}
        </div>
      )}
      <div className="inbar">
        <input value={input} placeholder="Ask your strategist…" onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter") send(); }} />
        <button className="sendbtn" disabled={busy||!input.trim()} onClick={()=>send()}><Send size={17} /></button>
      </div>
      <div className="disc">Educational analysis using your own data and live web search — not licensed investment, tax, or legal advice. Figures come from your holdings; verify before acting.</div>
    </div>
  );
}

/* ───────────────────────── Plan: targets + RSU planner ───────────────────────── */
function Plan({a}){
  const DEFAULT_TGT={"US equity":60,"International":28,"Bonds":8,"Cash":4};
  const [targets,setTargets]=useState(DEFAULT_TGT);
  const [tloaded,setTloaded]=useState(false);
  useEffect(()=>{ let on=true;
    (async()=>{ try{ if(window.storage){ const r=await window.storage.get("vantage_targets");
      if(on&&r&&r.value) setTargets({...DEFAULT_TGT,...JSON.parse(r.value)}); } }catch(e){}
      finally{ if(on)setTloaded(true); } })();
    return ()=>{on=false;};
  },[]);
  useEffect(()=>{ if(!tloaded)return;
    (async()=>{ try{ if(window.storage) await window.storage.set("vantage_targets",JSON.stringify(targets)); }catch(e){} })();
  },[targets,tloaded]);

  const rows=a.buckets.map(b=>{
    const tgt=targets[b.label]??0;
    const deltaDollar=(tgt-b.pct)/100*a.total;
    return {...b, tgt, deltaDollar};
  });

  // RSU diversification planner
  const [trim,setTrim]=useState(1500);
  const [vest,setVest]=useState(3000);
  const [sellVests,setSellVests]=useState(true);
  const [ceiling,setCeiling]=useState(15);

  const proj=useMemo(()=>{
    let tsla=a.tsla?a.tsla.value:0, total=a.total;
    const pts=[{q:0,pct:total>0?tsla/total*100:0}];
    let reached=null;
    for(let q=1;q<=16;q++){
      total=total+vest;
      tsla=Math.max(0, tsla - trim + (sellVests?0:vest));
      const p=total>0?tsla/total*100:0;
      pts.push({q,pct:p});
      if(reached===null && p<=ceiling) reached=q;
    }
    return { pts, reached, redirect: trim + (sellVests?vest:0) };
  },[a,trim,vest,sellVests,ceiling]);

  const maxPct=Math.max(...proj.pts.map(p=>p.pct), ceiling)*1.12 || 1;

  return (
    <>
      <div className="card">
        <div className="sectit">Target vs. actual — the gap to close</div>
        {rows.map((b,i)=>{
          const near=Math.abs(b.deltaDollar)<a.total*0.01;
          return (
            <div className="tgtrow" key={i}>
              <div className="tgthead">
                <span>{b.label}</span>
                <span className="rt">
                  <span className="mono">{pct(b.pct)} now</span>
                  <span style={{color:"var(--faint)"}}>→</span>
                  <input type="number" value={b.tgt}
                    onChange={e=>setTargets(t=>({...t,[b.label]:parseFloat(e.target.value)||0}))} />
                  <span style={{color:"var(--faint)"}}>%</span>
                </span>
              </div>
              <div className="tgtbar">
                <div className="tgtfill" style={{width:Math.min(100,b.pct)+"%",background:b.color}} />
                <div className="tick" style={{left:Math.min(100,b.tgt)+"%"}} />
              </div>
              <div className={"delta "+(near?"ok":b.deltaDollar>=0?"add":"trim")}>
                {near ? "on target" : b.deltaDollar>=0 ? `add ${fmt(b.deltaDollar)}` : `trim ${fmt(-b.deltaDollar)}`}
              </div>
            </div>
          );
        })}
        <div className="disc">Targets are a starting point you can edit — the defaults reflect an age-appropriate, globally diversified, equity-heavy mix. The 2060 fund's international and bonds are counted in your actuals.</div>
      </div>

      <div className="card" style={{marginTop:18}}>
        <div className="sectit">RSU diversification planner — your highest-leverage move</div>
        <div className="controls">
          <div className="ctl">
            <label>Trim existing TSLA each quarter</label>
            <div className="ig"><span>$</span><input type="number" value={trim} step={250}
              onChange={e=>setTrim(Math.max(0,parseFloat(e.target.value)||0))} /></div>
          </div>
          <div className="ctl">
            <label>Expected RSU vesting each quarter</label>
            <div className="ig"><span>$</span><input type="number" value={vest} step={500}
              onChange={e=>setVest(Math.max(0,parseFloat(e.target.value)||0))} /></div>
          </div>
          <div className="ctl">
            <label>Target ceiling for Tesla</label>
            <div className="ig"><input type="number" value={ceiling} step={1}
              onChange={e=>setCeiling(Math.max(1,parseFloat(e.target.value)||1))} /><span>%</span></div>
          </div>
          <div className="ctl">
            <label>Sell vests as they land?</label>
            <div className="toggle" onClick={()=>setSellVests(s=>!s)}>
              <span className={"tg"+(sellVests?" on":"")}><b/></span>
              {sellVests?"Selling on vest":"Holding vests"}
            </div>
          </div>
        </div>

        <div className="proj">
          <div className="projceil" style={{bottom:(ceiling/maxPct*100)+"%"}}><span>ceiling {ceiling}%</span></div>
          {proj.pts.map((p,i)=>(
            <div className="projcol" key={i}>
              <div className="projbar" style={{
                height:(p.pct/maxPct*100)+"%",
                background:p.pct<=ceiling?"var(--green)":"linear-gradient(180deg,var(--red),var(--orange))"
              }} />
            </div>
          ))}
        </div>
        <div className="projx"><span>now</span><span>2 yrs</span><span>4 yrs</span></div>

        <div className="verdict">
          {proj.reached!==null
            ? <>At these amounts, Tesla falls to your <b>{ceiling}%</b> ceiling in about <b>{proj.reached} quarters</b> (~{(proj.reached/4).toFixed(1)} years). Each quarter you'd redirect <b>{fmt(proj.redirect)}</b> into diversified holdings.</>
            : <>At these amounts you don't reach <b>{ceiling}%</b> within 4 years — raise the quarterly trim or keep selling vests. You'd still be redirecting <b>{fmt(proj.redirect)}</b> per quarter.</>}
        </div>
        <div className="disc">No market prediction here — growth would lift the numerator and denominator together, so the decline shown comes purely from your own trims plus the dilution of selling vests into diversified holdings. Mind Tesla trading windows and the tax on RSUs at vest.</div>
      </div>
    </>
  );
}
