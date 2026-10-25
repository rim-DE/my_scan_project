// Page HTML autonome (un seul fichier, photo comprise) présentant les résultats d'un scan,
// avec la même mise en page que la page de résultats de l'appli. Utilisée par `npm run scan:report`
// pour tester la détection sans base de données ni déploiement.
import { spineFrame, spineTransform, type Point, type TextDirection } from "./geometry";
import type { BookMetrics } from "./prices/metrics";
import type { PriceStats } from "./prices/stats";

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
  const json = JSON.stringify({ ...data, books }).replace(/</g, "\\u003c");
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
<script type="application/json" id="data">${json}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById("data").textContent);
var books=D.books.map(function(b,i){b.i=i;return b;});
var sel=null,sort="profit30",q="";
var eur=function(c){return c==null?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:c%100===0?0:2}).format(c/100);};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c];});};
function age(iso){var d=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/864e5));if(d<1){var h=Math.floor((Date.now()-new Date(iso).getTime())/36e5);return h+"h";}if(d<30)return d+"j";var m=Math.floor(d/30.44);if(m<12)return m+"m";var y=Math.floor(m/12),r=m%12;return r?y+"a "+r+"m":y+"a";}
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
    if(b.amazon)h+='<p class="small">'+(b.amazon.url?'<a href="'+esc(b.amazon.url)+'" target="_blank" rel="noopener">':'')+'Amazon : actuellement vendu à '+eur(b.amazon.priceCents)+' · '+b.amazon.count+' offre'+(b.amazon.count>1?'s':'')+(b.amazon.url?'</a>':'')+'</p>';
    else if(m.currentPriceCents!=null)h+='<p class="small">Actuellement vendu à '+eur(m.currentPriceCents)+' · '+m.currentOfferCount+' offre(s)</p>';
    if(b.buyback)h+='<p class="small ok">'+esc(b.buyback.platform)+' rachetait à '+eur(b.buyback.priceCents)+' il y a '+age(b.buyback.observedAt)+'</p>';
    h+='<p class="small">'+(m.ratio!=null?'Ratio : '+m.ratio+' &nbsp; ':'')+(bk&&bk.listPriceCents?'Prix éditeur : '+eur(bk.listPriceCents):'')+'</p>';
  }
  if(bk&&(bk.isbn13||bk.isbn10))h+='<p class="small">▮▯▮ '+esc(bk.isbn13||"")+(bk.isbn10?" / "+esc(bk.isbn10):"")+'</p>';
  h+='<p class="small">Lu sur la tranche : « '+esc(b.rawTitle)+' » · confiance '+({high:"élevée",medium:"moyenne",low:"faible"}[b.confidence]||b.confidence)+'</p>';
  h+='</div></div><div class="right">';
  if(b.spine)h+='<canvas width="'+b.spine.w+'" height="'+b.spine.h+'" data-i="'+b.i+'" title="Tranche sur ta photo : clique pour la voir sur la photo"></canvas>';
  if(m&&m.lastSales.length){h+='<table><tr><th>Vendu il y a</th>'+m.lastSales.map(function(x){return '<td>'+age(x.soldAt)+'</td>';}).join("")+'</tr><tr><th>Au prix de</th>'+m.lastSales.map(function(x){return '<td><b>'+eur(x.priceCents)+'</b></td>';}).join("")+'</tr></table>';}
  else if(m)h+='<p class="small">Aucune vente connue</p>';
  return h+'</div></article>';
}
function render(){
  sortsEl.querySelectorAll("button").forEach(function(bt){bt.classList.toggle("on",bt.dataset.k===sort);});
  var n=q.toLowerCase();
  var shown=books.filter(function(b){return [b.rawTitle,b.rawAuthor,b.book&&b.book.title,b.book&&b.book.isbn13].concat(b.book?b.book.authors:[]).some(function(v){return v&&String(v).toLowerCase().indexOf(n)>=0;});});
  if(sort!=="position")shown.sort(function(a,b){return key(b)-key(a);});
  document.getElementById("count").textContent=shown.length+" livre(s)";
  var list=document.getElementById("list");list.innerHTML=shown.map(card).join("");
  list.querySelectorAll("canvas").forEach(function(c){var b=books[+c.dataset.i];var ctx=c.getContext("2d");var go=function(){ctx.setTransform.apply(ctx,b.spine.t);ctx.drawImage(img,0,0,D.photo.width,D.photo.height);};img.complete?go():img.addEventListener("load",go);c.addEventListener("click",function(){select(b.i,false);});});
  paint();
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
