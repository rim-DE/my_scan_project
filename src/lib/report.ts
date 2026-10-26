// Page HTML autonome (un seul fichier, photo comprise) présentant les résultats d'un scan,
// avec la même mise en page que la page de résultats de l'appli. Utilisée par `npm run scan:report`
// pour tester la détection sans base de données ni déploiement.
import { spineFrame, spineTransform, type Point, type TextDirection } from "./geometry";
import type { BookMetrics } from "./prices/metrics";
import type { PriceStats } from "./prices/stats";
import { PLATFORMS, type SiteLink } from "./prices/platforms";

export interface ReportBook {
  rawTitle: string;
  rawAuthor: string | null;
  confidence: string;
  polygon: Point[] | null;
  textDirection: TextDirection | null;
  book: {
    title: string;
    authors: string[];
    publisher: string | null;
    isbn13: string | null;
    isbn10: string | null;
    coverUrl: string | null;
    listPriceCents: number | null;
  } | null;
  stats: PriceStats | null;
  metrics: BookMetrics | null;
  buyback: { platform: string; priceCents: number; observedAt: string } | null;
  amazon: { priceCents: number; count: number; url: string | null } | null;
  /** Meilleure offre Amazon connue, pour la carte façon « Buy Box » de la fenêtre « … ». */
  amazonBest: { offerType: string; priceCents: number; observedAt: string; url: string | null } | null;
  /** Liens vers les annonces du livre sur chaque site (fenêtre « … »), avec le meilleur prix connu. */
  sites: SiteLink[];
  /** Prix inventés (mode démo) : à ne jamais prendre pour des vrais prix. */
  demo: boolean;
}

export interface ReportData {
  name: string;
  createdAt: string;
  photo: { dataUrl: string; width: number; height: number };
  books: ReportBook[];
  notes: string[];
}

/** Hauteur des vignettes de tranche dans la page (en pixels écran, x2 pour les écrans haute densité). */
const SPINE_HEIGHT = 44;

export function renderReport(data: ReportData): string {
  const books = data.books.map((b) => {
    if (!b.polygon) return { ...b, spine: null };
    const f = spineFrame(b.polygon, data.photo.width, data.photo.height, b.textDirection);
    const scale = Math.min(3, (SPINE_HEIGHT * 2) / Math.max(1, f.thickness));
    return {
      ...b,
      spine: { w: Math.round(f.length * scale), h: Math.round(f.thickness * scale), t: spineTransform(f, scale) },
    };
  });
  const names = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name]));
  const json = JSON.stringify({ ...data, books, names }).replace(/</g, "\\u003c");
  const title = escapeHtml(data.name);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{--bg:#f2f8f6;--card:#fff;--line:#d9e7e2;--ink:#12302b;--muted:#5d726d;--brand:#0b4a57;--green:#22c55e;--red:#dc2626;--sel:#c026d3;--warn:#fff4d6;--warnink:#7a5200}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1716;--card:#18221f;--line:#2b3a36;--ink:#e6f0ed;--muted:#9fb3ad;--brand:#5cc4d6;--warn:#3a2f12;--warnink:#f5d68a}}
:root[data-theme="dark"]{--bg:#0f1716;--card:#18221f;--line:#2b3a36;--ink:#e6f0ed;--muted:#9fb3ad;--brand:#5cc4d6;--warn:#3a2f12;--warnink:#f5d68a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px;display:grid;gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
.head{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.head h1{font-size:22px;margin:0;flex:1 1 200px}
.meta{color:var(--muted);font-size:14px}
.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;background:#dcfce7;color:#166534}
.notes{background:var(--warn);color:var(--warnink);border-radius:16px;padding:10px 14px;font-size:13px}
.notes p{margin:4px 0}
.photo{position:relative;width:fit-content;max-width:100%;margin:0 auto}
.photo img{display:block;max-width:100%;max-height:80vh;border-radius:16px}
.photo svg{position:absolute;inset:0;width:100%;height:100%}
.photo polygon{cursor:pointer;stroke-linejoin:round}
.legend{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;font-size:13px;color:var(--muted);margin-top:8px}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:4px}
.tools{display:flex;gap:10px;flex-wrap:wrap}
.tools input{flex:1 1 200px;min-width:0;border:1px solid var(--line);border-radius:999px;padding:10px 16px;background:var(--card);color:var(--ink);font:inherit}
.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:8px 16px;font:inherit;font-size:14px;cursor:pointer}
.btn.on,.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.sorttitle{text-align:center;font-weight:700;font-size:20px;margin:14px 0 8px}
.sorts{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.count{color:var(--muted);font-size:14px;margin:10px 0 0}
#list{max-height:85vh;overflow-y:auto;padding:4px;display:grid;gap:0}
.book{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;padding:18px 8px;border-bottom:1px solid var(--line);scroll-margin:8px}
.book.sel{outline:3px solid var(--sel);border-radius:16px}
.left{display:flex;gap:14px;min-width:0}
.cover{width:118px;height:168px;flex:none;border-radius:8px;object-fit:cover;background:var(--bg);display:grid;place-items:center;font-size:40px}
.stats{min-width:0;font-size:14px}
.stats p{margin:3px 0}
.stats h3{font-size:15px;margin:0 0 4px}
.small{font-size:12px;color:var(--muted)}
.ok{color:#15803d}
.demo{display:inline-block;background:var(--warn);color:var(--warnink);border-radius:6px;padding:1px 6px;font-size:11px;font-weight:600}
.right{min-width:0;display:grid;gap:10px;align-content:start}
.right canvas{display:block;max-width:100%;height:auto;max-height:${SPINE_HEIGHT}px;border-radius:6px;border:1px solid var(--line);cursor:pointer;background:var(--bg)}
table{border-collapse:collapse;font-size:13px}
th{text-align:left;padding:4px 10px 4px 0;color:var(--muted);white-space:nowrap}
td{padding:4px 8px;text-align:center;border-left:1px solid var(--line)}
tr:first-child td,tr:first-child th{border-bottom:1px solid var(--line)}
.unid{color:var(--red);font-size:12px;font-weight:700;text-transform:uppercase}
.rightwrap{display:flex;gap:8px;align-items:flex-start;min-width:0}
.rightwrap .right{flex:1}
.icons{display:flex;flex-direction:column;gap:4px;flex:none}
.ib{width:40px;height:40px;border-radius:999px;border:0;background:none;color:var(--brand);display:grid;place-items:center;cursor:pointer}
.ib:hover{background:var(--bg)}
.logo{display:inline-grid;place-items:center;border-radius:6px;color:#fff;font-weight:700;flex:none;vertical-align:middle}
.lline{display:flex;align-items:center;gap:6px}
.lline a{color:inherit}
.lline.ok a{color:#15803d}
dialog{border:0;padding:0;background:transparent;max-width:none;max-height:none;width:100%;height:100%}
dialog::backdrop{background:rgba(0,0,0,.5)}
.sheet{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(680px,100%);max-height:92vh;overflow-y:auto;background:var(--card);color:var(--ink);border-radius:24px 24px 0 0;padding:16px;box-shadow:0 -4px 30px rgba(0,0,0,.25)}
@media (min-width:640px){.sheet{bottom:auto;top:50%;transform:translate(-50%,-50%);border-radius:24px}}
.sheethead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
.sheethead h2{font-size:18px;margin:0}
.locphoto{position:relative;width:fit-content;max-width:100%;margin:0 auto}
.locphoto img{display:block;max-width:100%;max-height:58vh;border-radius:16px}
.locphoto svg{position:absolute;inset:0;width:100%;height:100%}
.locphoto polygon{animation:blink 1s ease-in-out infinite}
.ring{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border:4px solid #d946ef;border-radius:50%;pointer-events:none}
.ring.ping{animation:ping 1.1s cubic-bezier(0,0,.2,1) infinite}
@keyframes ping{75%,100%{transform:scale(2);opacity:0}}
@keyframes blink{50%{opacity:.35}}
.pager{position:absolute;right:12px;bottom:12px;background:rgba(0,0,0,.6);color:#fff;border-radius:999px;padding:2px 12px;font-size:13px}
.locmeta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:14px;margin:10px 0;color:var(--muted)}
.bigspine{display:block;max-width:100%;height:auto;max-height:64px;margin:0 auto;border-radius:6px;border:1px solid var(--line)}
.isbns{text-align:center;font-weight:600;margin:8px 0 0}
.sites{display:flex;gap:4px;overflow-x:auto;padding-bottom:8px}
.site{display:flex;flex-direction:column;align-items:center;gap:4px;width:80px;flex:none;padding:8px 4px;border-radius:16px;text-align:center;font-size:11px;line-height:1.2;color:var(--ink);text-decoration:none;background:none;border:0;cursor:pointer;font-family:inherit}
.site:hover{background:var(--bg)}
.site b{font-size:12px}
.site .act{width:40px;height:40px;border-radius:50%;background:var(--bg);display:grid;place-items:center;font-size:19px}
.buybox{border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:8px}
.buybox h3{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:16px}
.buybox .big{font-size:26px;font-weight:800;margin:2px 0}
.buybox a.tag{color:var(--brand)}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 10px;font-size:12px;margin-right:6px}
.chart{width:100%;height:auto}
.hist{width:100%}
.hist td,.hist th{border:0;text-align:left;padding:4px 6px;border-top:1px solid var(--line)}
.hist td:last-child{text-align:right;font-weight:600}
@media (max-width:720px){.book{grid-template-columns:1fr}.cover{width:84px;height:120px}}
</style>
</head>
<body>
<main>
<section class="card head">
  <h1>${title}</h1>
  <span class="meta" id="meta"></span>
  <span class="pill">Terminé</span>
</section>
<section class="notes" id="notes"></section>
<section class="card">
  <div class="photo" id="photo"><img id="img" alt="Photo du scan"><svg id="svg" viewBox="0 0 1 1" preserveAspectRatio="none"></svg></div>
  <div class="legend"><span><span class="sw" style="background:rgba(34,197,94,.6);border:1px solid var(--red)"></span>identifié</span><span><span class="sw" style="background:rgba(245,158,11,.4);border:1px solid #d97706"></span>lu sur la photo, pas encore identifié</span><span><span class="sw" style="background:rgba(217,70,239,.5);border:1px solid var(--sel)"></span>sélectionné</span></div>
</section>
<section class="card">
  <div class="tools"><button class="btn primary" id="export">Exporter</button><input id="q" placeholder="Rechercher (titre, auteur, ISBN)"></div>
  <p class="sorttitle">Trier par</p>
  <div class="sorts" id="sorts"></div>
  <p class="count" id="count"></p>
</section>
<section class="card" id="list" aria-label="Livres détectés"></section>
</main>
<dialog id="dlg" aria-labelledby="dlgtitle"><div class="sheet" id="sheet"><div class="sheethead"><h2 id="dlgtitle"></h2><button class="btn" id="dlgclose" aria-label="Fermer">✕</button></div><div id="dlgbody"></div></div></dialog>
<script type="application/json" id="data">${json}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById("data").textContent);
var books=D.books.map(function(b,i){b.i=i;return b;});
var sel=null,sort="profit30",q="";
var eur=function(c){return c==null?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:c%100===0?0:2}).format(c/100);};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c];});};
function age(iso){var d=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/864e5));if(d<1){var h=Math.floor((Date.now()-new Date(iso).getTime())/36e5);return h+"h";}if(d<30)return d+"j";var m=Math.floor(d/30.44);if(m<12)return m+"m";var y=Math.floor(m/12),r=m%12;return r?y+"a "+r+"m":y+"a";}
var SV='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
var IC={loc:SV+'<path d="M12 2v6M9.5 4.5 12 2l2.5 2.5M12 22v-6M9.5 19.5 12 22l2.5-2.5M2 12h6M4.5 9.5 2 12l2.5 2.5M22 12h-6M19.5 9.5 22 12l-2.5 2.5"/></svg>',hist:SV+'<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="8.5" y="6" width="4" height="14" rx="1"/><path d="m14.5 7.2 3.8-1.1 3.4 12.8-3.8 1.1z"/></svg>',more:SV+'<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/></svg>'};
var INI={chasseauxlivres:"CL",ebay:"eb",fnac:"F",rakuten:"R",vinted:"V",leboncoin:"lbc",momox:"m",recyclivre:"Rc",abebooks:"A",keepa:"K"};
var COLORS={amazon:"#ff9900",momox:"#56b146"};
function logo(id,color,size){if(id==="amazon")return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><rect width="24" height="24" rx="6" fill="#232f3e"/><text x="12" y="14.5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial,sans-serif">a</text><path d="M6.5 16.5q5.5 3 11 0" stroke="#ff9900" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="m16 15.4 1.8 1-1.2 1.6" stroke="#ff9900" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';var t=INI[id]||String(id).charAt(0).toUpperCase();return '<span class="logo" aria-hidden="true" style="background:'+(color||COLORS[id]||"#64748b")+';width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*(t.length>2?.36:.5))+'px">'+esc(t)+'</span>';}
function siteUrl(b,id){var s=(b.sites||[]).filter(function(x){return x.id===id;})[0];return s?s.url:null;}
document.getElementById("meta").textContent=new Date(D.createdAt).toLocaleString("fr-FR")+" · 1 photo · "+books.length+" livres";
document.getElementById("notes").innerHTML=D.notes.map(function(n){return "<p>"+esc(n)+"</p>";}).join("");
var img=document.getElementById("img");img.src=D.photo.dataUrl;
var svg=document.getElementById("svg"),NS="http://www.w3.org/2000/svg";
books.forEach(function(b){if(!b.polygon)return;var p=document.createElementNS(NS,"polygon");p.setAttribute("points",b.polygon.map(function(pt){return pt.x+","+pt.y;}).join(" "));p.setAttribute("vector-effect","non-scaling-stroke");var t=document.createElementNS(NS,"title");t.textContent=b.book?b.book.title:b.rawTitle;p.appendChild(t);p.addEventListener("click",function(){select(b.i,true);});b.poly=p;svg.appendChild(p);});
function paint(){books.forEach(function(b){if(!b.poly)return;var s=b.i===sel;b.poly.setAttribute("fill",s?"rgba(217,70,239,.5)":b.book?"rgba(34,197,94,.5)":"rgba(245,158,11,.35)");b.poly.setAttribute("stroke",s?"#c026d3":b.book?"#dc2626":"#d97706");b.poly.setAttribute("stroke-width",s?"3":"1.5");});document.querySelectorAll(".book").forEach(function(el){el.classList.toggle("sel",+el.dataset.i===sel);});}
function select(i,scrollList){sel=i;paint();if(scrollList){var el=document.querySelector('.book[data-i="'+i+'"]');if(el){var list=document.getElementById("list");list.scrollTop=el.offsetTop-list.offsetTop-8;el.scrollIntoView({block:"nearest",behavior:"smooth"});}}else{document.getElementById("photo").scrollIntoView({behavior:"smooth",block:"start"});}}
var SORTS=[["profit30","Profit 30j"],["buyback","Prix de rachat"],["profit","Profit net"],["median","Prix médian"],["current","Prix de vente actuel"],["sales","Ventes"],["lastSale","Prix dernière vente"],["position","Ordre de la photo"]];
function key(b){var s=b.stats,m=b.metrics;if(!s||!m)return -2;switch(sort){case"profit30":return m.weightedProfit30dCents==null?-1:m.weightedProfit30dCents;case"buyback":return s.buybackMaxCents==null?-1:s.buybackMaxCents;case"profit":return s.netAfterFeesCents==null?-1:s.netAfterFeesCents;case"median":return s.medianCents==null?-1:s.medianCents;case"current":return m.currentPriceCents==null?-1:m.currentPriceCents;case"sales":return m.sales12m==null?-1:m.sales12m;case"lastSale":return m.lastSales[0]?m.lastSales[0].priceCents:-1;default:return 0;}}
var sortsEl=document.getElementById("sorts");
SORTS.forEach(function(s){var bt=document.createElement("button");bt.className="btn";bt.textContent=s[1];bt.dataset.k=s[0];bt.addEventListener("click",function(){sort=s[0];render();});sortsEl.appendChild(bt);});
function card(b){
  var bk=b.book,s=b.stats,m=b.metrics;
  var h='<article class="book" data-i="'+b.i+'"><div class="left">';
  h+=bk&&bk.coverUrl?'<img class="cover" src="'+esc(bk.coverUrl)+'" alt="">':'<div class="cover">📕</div>';
  h+='<div class="stats">';
  if(bk)h+='<h3>'+esc(bk.title)+'</h3><p class="small">'+esc(bk.authors.join(", "))+(bk.publisher?" · "+esc(bk.publisher):"")+'</p>';
  else h+='<h3>'+esc(b.rawTitle)+'</h3><p class="small">'+esc(b.rawAuthor||"")+'</p>'+(b.demo?'':'<p class="unid">Non identifié dans les catalogues</p>');
  if(b.demo)h+='<p><span class="demo">PRIX DE DÉMO (FAUX)</span></p>';
  if(s&&m){
    h+='<p title="Ce que tu touches en vendant au prix médian, après commission et frais fixes">Profit net estimé : <b>'+eur(s.netAfterFeesCents)+'</b></p>';
    h+='<p title="Profit net × chance de vendre dans le mois">Profit pondéré sur 30j : <b>'+eur(m.weightedProfit30dCents)+'</b></p>';
    h+='<p>Prix médian de ventes : <b>'+eur(s.medianCents)+'</b></p>';
    h+='<p>Prix maximum d\\'achat conseillé : <b>'+eur(s.maxBuyCents)+'</b></p>';
    h+='<p><b>'+(m.sales12m==null?'Ventes inconnues':m.sales12m+' vente'+(m.sales12m>1?'s':'')+' sur 12 mois')+'</b></p>';
    var au=(b.amazon&&b.amazon.url)||siteUrl(b,"amazon");
    var atxt=b.amazon?'Actuellement vendu à '+eur(b.amazon.priceCents)+' · '+b.amazon.count+' offre'+(b.amazon.count>1?'s':''):m.currentPriceCents!=null?'Actuellement vendu à '+eur(m.currentPriceCents)+' · '+m.currentOfferCount+' offre(s)':null;
    if(!atxt)atxt='Voir les prix sur Amazon';
    if(au||b.amazon||m.currentPriceCents!=null)h+='<p class="small lline">'+logo("amazon",null,18)+(au?'<a href="'+esc(au)+'" target="_blank" rel="noopener">'+atxt+'</a>':atxt)+'</p>';
    if(b.buyback){var bu=siteUrl(b,b.buyback.platform);var btxt=esc(String(b.buyback.platform).toLowerCase())+' rachetait à '+eur(b.buyback.priceCents)+' il y a '+age(b.buyback.observedAt);h+='<p class="small lline ok">'+logo(b.buyback.platform,null,18)+(bu?'<a href="'+esc(bu)+'" target="_blank" rel="noopener">'+btxt+'</a>':btxt)+'</p>';}
    h+='<p class="small">'+(m.ratio!=null?'Ratio : '+m.ratio+' &nbsp; ':'')+(bk&&bk.listPriceCents?'Prix éditeur : '+eur(bk.listPriceCents):'')+'</p>';
  }
  else{var au0=siteUrl(b,"amazon");if(au0)h+='<p class="small lline">'+logo("amazon",null,18)+'<a href="'+esc(au0)+'" target="_blank" rel="noopener">Voir les prix sur Amazon</a></p>';}
  if(bk&&(bk.isbn13||bk.isbn10))h+='<p class="small">▮▯▮ '+esc(bk.isbn13||"")+(bk.isbn10?" / "+esc(bk.isbn10):"")+'</p>';
  h+='<p class="small">Lu sur la tranche : « '+esc(b.rawTitle)+' » · confiance '+({high:"élevée",medium:"moyenne",low:"faible"}[b.confidence]||b.confidence)+'</p>';
  h+='</div></div><div class="rightwrap"><div class="right">';
  if(b.spine)h+='<canvas width="'+b.spine.w+'" height="'+b.spine.h+'" data-i="'+b.i+'" title="Tranche sur ta photo : clique pour la voir sur la photo"></canvas>';
  if(m&&m.lastSales.length){h+='<table><tr><th>Vendu il y a</th>'+m.lastSales.map(function(x){return '<td>'+age(x.soldAt)+'</td>';}).join("")+'</tr><tr><th>Au prix de</th>'+m.lastSales.map(function(x){return '<td><b>'+eur(x.priceCents)+'</b></td>';}).join("")+'</tr></table>';}
  else if(m)h+='<p class="small">Aucune vente connue</p>';
  h+='</div><div class="icons">';
  if(b.polygon)h+='<button class="ib" data-act="loc" data-i="'+b.i+'" title="Emplacement sur la photo" aria-label="Emplacement sur la photo">'+IC.loc+'</button>';
  if(m)h+='<button class="ib" data-act="hist" data-i="'+b.i+'" title="Historique des ventes" aria-label="Historique des ventes">'+IC.hist+'</button>';
  if(bk||m)h+='<button class="ib" data-act="more" data-i="'+b.i+'" title="Sites de vente et actions" aria-label="Sites de vente et actions">'+IC.more+'</button>';
  return h+'</div></div></article>';
}
function render(){
  sortsEl.querySelectorAll("button").forEach(function(bt){bt.classList.toggle("on",bt.dataset.k===sort);});
  var n=q.toLowerCase();
  var shown=books.filter(function(b){return [b.rawTitle,b.rawAuthor,b.book&&b.book.title,b.book&&b.book.isbn13].concat(b.book?b.book.authors:[]).some(function(v){return v&&String(v).toLowerCase().indexOf(n)>=0;});});
  if(sort!=="position")shown.sort(function(a,b){return key(b)-key(a);});
  document.getElementById("count").textContent=shown.length+" livre(s)";
  var list=document.getElementById("list");list.innerHTML=shown.map(card).join("");
  list.querySelectorAll("canvas").forEach(function(c){var b=books[+c.dataset.i];var ctx=c.getContext("2d");var go=function(){ctx.setTransform.apply(ctx,b.spine.t);ctx.drawImage(img,0,0,D.photo.width,D.photo.height);};img.complete?go():img.addEventListener("load",go);c.addEventListener("click",function(){select(b.i,false);});});
  list.querySelectorAll(".ib").forEach(function(bt){bt.addEventListener("click",function(){open(bt.dataset.act,books[+bt.dataset.i]);});});
  paint();
}
var dlg=document.getElementById("dlg"),dbody=document.getElementById("dlgbody");
document.getElementById("dlgclose").addEventListener("click",function(){dlg.close();});
dlg.addEventListener("click",function(e){if(!document.getElementById("sheet").contains(e.target))dlg.close();});
function drawSpine(c,b){var ctx=c.getContext("2d");var go=function(){ctx.setTransform.apply(ctx,b.spine.t);ctx.drawImage(img,0,0,D.photo.width,D.photo.height);};img.complete?go():img.addEventListener("load",go);}
function open(act,b){
  var bk=b.book,m=b.metrics,h="",title=bk?bk.title:b.rawTitle;
  if(act==="loc"){
    title="Emplacement sur la photo";
    var cx=0,cy=0;b.polygon.forEach(function(p){cx+=p.x/b.polygon.length;cy+=p.y/b.polygon.length;});
    h+='<div class="locphoto"><img src="'+D.photo.dataUrl+'" alt=""><svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><polygon points="'+b.polygon.map(function(p){return p.x+","+p.y;}).join(" ")+'" fill="rgba(217,70,239,.55)" stroke="#c026d3" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
    h+='<span class="ring ping" style="left:'+cx*100+'%;top:'+cy*100+'%"></span><span class="ring" style="left:'+cx*100+'%;top:'+cy*100+'%"></span><span class="pager">1 / 1</span></div>';
    h+='<div class="locmeta"><span>1 / 1</span><label><input type="checkbox" disabled> Charger toutes les images</label></div>';
    if(b.spine)h+='<canvas class="bigspine" width="'+b.spine.w+'" height="'+b.spine.h+'"></canvas>';
    if(bk&&(bk.isbn13||bk.isbn10))h+='<p class="isbns">'+[bk.isbn13,bk.isbn10].filter(Boolean).map(esc).join(" | ")+'</p>';
  }else if(act==="hist"){
    title="Historique des ventes";
    var sales=m.sales||[];
    h+='<p><b>'+(m.sales12m==null?'Ventes inconnues':m.sales12m+' vente(s) sur 12 mois')+'</b>'+(m.sales30d!=null?' · '+m.sales30d+' vente(s) sur 30 jours':'')+'</p>';
    if(b.demo)h+='<p><span class="demo">VENTES DE DÉMO (FAUSSES)</span></p>';
    if(sales.length){
      var now=new Date(),months=[];for(var k=0;k<12;k++){var d=new Date(now.getFullYear(),now.getMonth()-11+k,1);months.push({l:d.toLocaleDateString("fr-FR",{month:"short"}),n:sales.filter(function(s){var x=new Date(s.soldAt);return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth();}).length});}
      var mx=Math.max.apply(null,[1].concat(months.map(function(x){return x.n;}))),H=90;
      h+='<p class="small">Ventes par mois (12 derniers mois)</p><svg class="chart" viewBox="0 0 360 108" role="img" aria-label="Ventes par mois"><line x1="0" x2="360" y1="'+H+'" y2="'+H+'" stroke="var(--line)"/>';
      months.forEach(function(x,i){var hh=x.n/mx*(H-14);h+='<g><rect x="'+(i*30+6)+'" y="0" width="18" height="'+H+'" fill="transparent"><title>'+esc(x.l)+' : '+x.n+'</title></rect>';if(x.n)h+='<path pointer-events="none" fill="var(--brand)" d="M'+(i*30+6)+','+H+' v'+(-(hh-4))+' q0,-4 4,-4 h10 q4,0 4,4 v'+(hh-4)+' z"/><text x="'+(i*30+15)+'" y="'+(H-hh-3)+'" text-anchor="middle" font-size="10" fill="var(--ink)">'+x.n+'</text>';h+='<text x="'+(i*30+15)+'" y="'+(H+13)+'" text-anchor="middle" font-size="9" fill="var(--muted)">'+esc(x.l)+'</text></g>';});
      h+='</svg><table class="hist"><tr><th>Date</th><th>Plateforme</th><th style="text-align:right">Prix</th></tr>'+sales.map(function(s){return '<tr><td>'+new Date(s.soldAt).toLocaleDateString("fr-FR")+'</td><td>'+esc(s.platform?D.names[s.platform]||s.platform:"—")+'</td><td>'+eur(s.priceCents)+'</td></tr>';}).join("")+'</table>';
    }else h+='<p class="small">Aucune vente connue</p>';
  }else{
    h+='<div class="sites">';
    (b.sites||[]).forEach(function(s){h+='<a class="site" href="'+esc(s.url)+'" target="_blank" rel="noopener" title="'+esc(s.name)+' : voir les annonces de ce livre">'+logo(s.id,s.color,40)+'<span>'+esc(s.name)+'</span><b'+(s.priceKind==="buyback"?' class="ok"':'')+'>'+(s.priceCents==null?'—':(s.priceKind==="buyback"?'↩ ':'')+eur(s.priceCents))+'</b></a>';});
    if(bk&&bk.isbn13)h+='<a class="site" href="https://books.google.com/books?vid=ISBN'+esc(bk.isbn13)+'" target="_blank" rel="noopener"><span class="act">ℹ️</span><span>Info</span></a>';
    if(m)h+='<button class="site" data-go="hist"><span class="act">📈</span><span>Graphique</span></button>';
    h+='<button class="site" data-go="share"><span class="act">📤</span><span>Partager</span></button></div>';
    if(!bk||!bk.isbn13)h+='<p class="small">Pas d\\'ISBN : les liens cherchent par titre et auteur.</p>';
    h+='<section class="buybox"><h3>'+logo("amazon",null,24)+'Meilleure offre Amazon</h3>';
    var a=b.amazonBest;
    if(a){h+='<p class="small">Relevé le '+new Date(a.observedAt).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+'</p><p class="small"><b>'+(a.offerType==="NEW"?"NEUF":"OCCASION")+'</b></p><p class="big">'+eur(a.priceCents)+'</p><p><span class="tag">'+(b.demo?'Démo (faux)':'API')+'</span>'+(a.url?'<a class="tag" href="'+esc(a.url)+'" target="_blank" rel="noopener">Voir l\\'offre</a>':'')+'</p><p class="small">Vendeur, frais de port et part de la Buy Box ne sont pas fournis par nos sources de prix pour l\\'instant.</p>';}
    else h+='<p class="small">Aucune offre Amazon relevée pour l\\'instant (il faut une clé Keepa, ou un prix saisi à la main).</p>';
    h+='<p class="small">Pour actualiser les prix de cette page, relance <code>npm run scan:report</code> (dans l\\'appli, un bouton « Actualiser les prix » est ici).</p></section>';
  }
  document.getElementById("dlgtitle").textContent=title;
  dbody.innerHTML=h;
  var c=dbody.querySelector(".bigspine");if(c)drawSpine(c,b);
  dbody.querySelectorAll("[data-go]").forEach(function(x){x.addEventListener("click",function(){if(x.dataset.go==="hist")open("hist",b);else{var t=(bk?bk.title:b.rawTitle)+(bk&&bk.isbn13?" — ISBN "+bk.isbn13:"");if(navigator.share)navigator.share({title:t,text:t}).catch(function(){});else if(navigator.clipboard)navigator.clipboard.writeText(t);}});});
  if(!dlg.open)dlg.showModal();
}
document.getElementById("q").addEventListener("input",function(e){q=e.target.value;render();});
document.getElementById("export").addEventListener("click",function(){
  var c=function(v){return v==null?"":(v/100).toFixed(2).replace(".",",");};var e=function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';};
  var rows=[["Titre lu","Titre","Auteurs","ISBN13","Profit net","Profit pondéré 30j","Prix médian","Prix max d'achat","Ventes 12 mois","Démo"].join(";")].concat(books.map(function(b){var s=b.stats||{},m=b.metrics||{};return [e(b.rawTitle),e(b.book&&b.book.title),e(b.book&&b.book.authors.join(", ")),b.book&&b.book.isbn13||"",c(s.netAfterFeesCents),c(m.weightedProfit30dCents),c(s.medianCents),c(s.maxBuyCents),m.sales12m==null?"":m.sales12m,b.demo?"oui":""].join(";");}));
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\\uFEFF"+rows.join("\\n")],{type:"text/csv;charset=utf-8"}));a.download="scan.csv";a.click();
});
render();
})();
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
