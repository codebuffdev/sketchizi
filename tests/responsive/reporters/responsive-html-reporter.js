import fs from "node:fs";
import path from "node:path";
import { buildReport } from "./aggregate.js";
import { readRecord } from "./responsive-json-reporter.js";
import { failThreshold } from "../helpers/findings.js";

/** Safe embedding of JSON inside a <script> element. */
function embedJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * Renders a fully self-contained dashboard (no network, no external assets).
 * Screenshots are embedded as JPEG data URIs when available, otherwise they
 * link to the PNG next to the report (artifacts/screenshots/...).
 */
export function renderHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sketchizi Responsive QA Dashboard</title>
<style>
:root{--bg:#f6f7fb;--card:#fff;--text:#161a23;--muted:#667085;--line:#e4e7ec;--p0:#b42318;--p1:#e5484d;--p2:#d9920b;--p3:#667085;--ok:#12805c;--accent:#4f46e5}
@media (prefers-color-scheme:dark){:root{--bg:#0f1218;--card:#171b24;--text:#e8ebf2;--muted:#98a2b3;--line:#2a3140;--p0:#ff6b6b;--p1:#ff7a7f;--p2:#f5b942;--p3:#98a2b3;--ok:#3ecf9b;--accent:#8b87ff}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--card)}h1{margin:0 0 4px;font-size:20px}.sub{color:var(--muted);font-size:12px}
main{padding:20px 24px;max-width:1500px;margin:0 auto}section{margin-bottom:28px}h2{font-size:15px;margin:0 0 10px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.card b{display:block;font-size:22px}.card span{color:var(--muted);font-size:12px}
.sev{display:inline-block;min-width:26px;text-align:center;padding:1px 6px;border-radius:999px;font-size:11px;font-weight:700;color:#fff}.sev.P0{background:var(--p0)}.sev.P1{background:var(--p1)}.sev.P2{background:var(--p2)}.sev.P3{background:var(--p3)}
.scroll{overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}table{border-collapse:collapse;width:100%}th,td{padding:6px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:12.5px}th{position:sticky;top:0;background:var(--card);z-index:1;white-space:nowrap}
.heat td{text-align:center;min-width:74px;cursor:pointer}.heat td.ok{background:color-mix(in srgb,var(--ok) 18%,transparent)}.heat td.P0{background:color-mix(in srgb,var(--p0) 35%,transparent)}.heat td.P1{background:color-mix(in srgb,var(--p1) 28%,transparent)}.heat td.P2{background:color-mix(in srgb,var(--p2) 28%,transparent)}.heat td.P3,.heat td.na{color:var(--muted)}.heat td.failed{outline:2px solid var(--p1);outline-offset:-2px}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}select,input{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text)}input[type=search]{min-width:220px}
code{font:12px ui-monospace,Menlo,Consolas,monospace;word-break:break-all}.muted{color:var(--muted)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.shot{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}.shot img{display:block;width:100%;height:auto;background:#ddd;cursor:zoom-in}.shot div{padding:6px 8px;font-size:12px}
dialog{max-width:96vw;max-height:96vh;padding:0;border:0;border-radius:10px;background:var(--card);color:var(--text)}dialog img{max-width:94vw;max-height:88vh;display:block}dialog::backdrop{background:#000a}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid var(--line);font-size:11px;color:var(--muted)}
.fail{color:var(--p1);font-weight:600}.pass{color:var(--ok);font-weight:600}
</style>
</head>
<body>
<header><h1>Sketchizi Responsive QA Dashboard</h1><div class="sub" id="meta"></div></header>
<main>
<section><div class="cards" id="cards"></div></section>
<section><h2>Coverage heat-map <span class="muted">(suite × viewport, worst severity — click a cell to filter)</span></h2><div class="scroll"><table class="heat" id="heat"></table></div></section>
<section><h2>Findings</h2>
<div class="filters">
<select id="fSev"><option value="">All severities</option></select>
<select id="fCat"><option value="">All categories</option></select>
<select id="fSuite"><option value="">All suites</option></select>
<select id="fVp"><option value="">All viewports</option></select>
<label class="muted"><input type="checkbox" id="fGaps"> include coverage gaps</label>
<input id="fText" type="search" placeholder="Filter text / selector">
<span class="muted" id="fCount"></span></div>
<div class="scroll" style="max-height:620px"><table id="findings"></table></div></section>
<section><h2>Screenshots <span class="muted" id="shotNote"></span></h2><div class="gallery" id="gallery"></div></section>
<section><h2>Test results</h2><div class="scroll" style="max-height:480px"><table id="tests"></table></div></section>
</main>
<dialog id="dlg"><img id="dlgImg" alt=""></dialog>
<script id="data" type="application/json">${embedJson(report)}</script>
<script>
(function(){
var R=JSON.parse(document.getElementById('data').textContent);
var SEV=['P0','P1','P2','P3'];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function $(id){return document.getElementById(id)}
$('meta').textContent='Profile: '+R.profile+' · Generated '+R.generatedAt+' · Fail threshold: '+(R.failOn||'none (report-only)')+' · Schema v'+R.schemaVersion;
var S=R.summary;
var cards=[['Tests',S.tests],['Passed',S.passed],['Failed',S.failed],['Skipped',S.skipped],['Checkpoints',S.checkpoints],['Findings',S.findings],['P0',S.bySeverity.P0],['P1',S.bySeverity.P1],['P2',S.bySeverity.P2],['P3',S.bySeverity.P3],['Coverage gaps',S.coverageGaps]];
$('cards').innerHTML=cards.map(function(c){return '<div class="card"><b>'+c[1]+'</b><span>'+c[0]+'</span></div>'}).join('');
var all=[];R.results.forEach(function(r){r.findings.forEach(function(f){all.push(Object.assign({status:r.status},f))})});
function fill(sel,vals){vals.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v;$(sel).appendChild(o)})}
fill('fSev',SEV);fill('fCat',Object.keys(S.byCategory).sort());fill('fSuite',R.suites);fill('fVp',R.viewports.map(function(v){return v.id}));
// heat-map
var h='<thead><tr><th>Suite</th>'+R.viewports.map(function(v){return '<th title="'+esc(v.name)+'">'+esc(v.id)+(v.hasTouch?' ✋':'')+'</th>'}).join('')+'</tr></thead><tbody>';
R.suites.forEach(function(s){h+='<tr><th>'+esc(s)+'</th>';R.viewports.forEach(function(v){var c=(R.matrix[s]||{})[v.id];
if(!c){h+='<td class="na">–</td>';return}
var cls=c.worst||'ok';if(c.status==='failed')cls+=' failed';
h+='<td class="'+cls+'" data-s="'+esc(s)+'" data-v="'+esc(v.id)+'">'+(c.count?c.count+' '+(c.worst||''):'✓')+'</td>'})
h+='</tr>'});$('heat').innerHTML=h+'</tbody>';
$('heat').addEventListener('click',function(e){var t=e.target.closest('td[data-s]');if(!t)return;$('fSuite').value=t.dataset.s;$('fVp').value=t.dataset.v;renderFindings();$('findings').scrollIntoView({behavior:'smooth'})});
function renderFindings(){
var sev=$('fSev').value,cat=$('fCat').value,su=$('fSuite').value,vp=$('fVp').value,tx=$('fText').value.toLowerCase(),gaps=$('fGaps').checked;
var rows=all.filter(function(f){
if(!gaps&&f.category==='coverage-gap'&&!cat)return false;
if(sev&&f.severity!==sev)return false;if(cat&&f.category!==cat)return false;if(su&&f.suite!==su)return false;if(vp&&f.viewport!==vp)return false;
if(tx&&(f.message+' '+(f.selector||'')+' '+f.checkpoint).toLowerCase().indexOf(tx)<0)return false;return true});
rows.sort(function(a,b){return SEV.indexOf(a.severity)-SEV.indexOf(b.severity)});
$('fCount').textContent=rows.length+' shown';
var shown=rows.slice(0,1500);
$('findings').innerHTML='<thead><tr><th>Sev</th><th>Category</th><th>Suite</th><th>Viewport</th><th>Checkpoint</th><th>Message</th><th>Selector</th></tr></thead><tbody>'+
shown.map(function(f){return '<tr><td><span class="sev '+f.severity+'">'+f.severity+'</span></td><td>'+esc(f.category)+'</td><td>'+esc(f.suite)+'</td><td>'+esc(f.viewport)+'</td><td>'+esc(f.checkpoint)+'</td><td>'+esc(f.message)+'</td><td><code>'+esc(f.selector||'')+'</code></td></tr>'}).join('')+
(rows.length>shown.length?'<tr><td colspan="7" class="muted">… '+(rows.length-shown.length)+' more — narrow the filters or read responsive-results.json</td></tr>':'')+'</tbody>';
renderGallery(su,vp)}
function renderGallery(su,vp){
var shots=[];R.results.forEach(function(r){if(su&&r.suite!==su)return;if(vp&&r.viewport!==vp)return;r.checkpoints.forEach(function(c){shots.push({r:r,c:c})})});
var withThumb=shots.filter(function(s){return s.c.thumb});
var list=(withThumb.length?withThumb:shots).slice(0,60);
$('shotNote').textContent=withThumb.length?('('+withThumb.length+' embedded, showing '+list.length+')'):('(PNG files on disk: artifacts/screenshots/…; showing '+list.length+' of '+shots.length+')');
$('gallery').innerHTML=list.map(function(s){var src=s.c.thumb||('./'+s.c.screenshot);return '<figure class="shot" style="margin:0"><img loading="lazy" src="'+esc(src)+'" alt="'+esc(s.c.name)+'"><div><b>'+esc(s.r.suite)+'</b> · '+esc(s.r.viewport)+'<br>'+esc(s.c.name)+(s.c.findingCount?' <span class="pill">'+s.c.findingCount+' finding(s)</span>':'')+'</div></figure>'}).join('')||'<div class="muted">No screenshots captured for this selection.</div>'}
$('gallery').addEventListener('click',function(e){var img=e.target.closest('img');if(!img)return;$('dlgImg').src=img.src;$('dlg').showModal()});
$('dlg').addEventListener('click',function(){$('dlg').close()});
['fSev','fCat','fSuite','fVp','fGaps'].forEach(function(id){$(id).addEventListener('change',renderFindings)});$('fText').addEventListener('input',renderFindings);
// tests table
$('tests').innerHTML='<thead><tr><th>Status</th><th>Suite</th><th>Viewport</th><th>Test</th><th>Findings</th><th>Duration</th><th>Failure</th></tr></thead><tbody>'+
R.results.map(function(r){var cls=(r.status==='passed'||r.status==='skipped')?'pass':'fail';return '<tr><td class="'+cls+'">'+esc(r.status)+'</td><td>'+esc(r.suite)+'</td><td>'+esc(r.viewport)+'</td><td>'+esc(r.title)+'</td><td>'+r.findings.length+'</td><td>'+Math.round(r.durationMs/100)/10+'s</td><td><code>'+esc((r.error||'').slice(0,400))+'</code></td></tr>'}).join('')+'</tbody>';
renderFindings();
})();
</script>
</body>
</html>`;
}

export default class ResponsiveHtmlReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.resolve("tests/responsive/artifacts");
    this.profile = options.profile || process.env.RESPONSIVE_PROFILE || "full";
    this.records = new Map();
  }
  printsToStdio() { return false; }
  onTestEnd(test, result) { this.records.set(test.id, readRecord(test, result)); }
  onEnd() {
    const report = buildReport([...this.records.values()], { profile: this.profile, failOn: failThreshold() });
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(path.join(this.outputDir, "responsive-report.html"), renderHtml(report));
  }
}
