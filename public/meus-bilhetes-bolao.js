const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>String(n).padStart(2,'0');
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>String(v||'').split('-').reverse().join('/');
let ids=[],shareId='';

function prizeCard(label,detail,value){
  return `<article class="customer-prize"><small>${esc(label)}</small><span>${esc(detail)}</span><strong>${money(value)}</strong></article>`;
}
function winnerRows(title,items,pool,scoreKey='score',showPrize=true){
  if(!items?.length)return '';
  const each=Number(pool||0)/items.length;
  return `<section class="customer-section"><h2>${esc(title)}</h2><div class="customer-table">${items.map(t=>`<article><div><b>${esc(t.name)}</b><small>Vendedor: ${esc(t.seller)}</small></div><strong>${t[scoreKey]||0} acerto(s)</strong><span>${showPrize?money(each):'Posição atual'}</span><small>${t.picks.map(fmt).join(' - ')}</small></article>`).join('')}</div></section>`;
}
function ticketCard(d,index){
  const {ticket:t}=d,hitByIndex=new Map((t.hits||[]).map(h=>[h.index,h]));
  return `<article class="customer-game"><div class="game-title"><div><small>Cartela ${index+1}</small><h3>${esc(t.name)}</h3><span>Vendedor: ${esc(t.seller)}</span></div><span class="payment-ok">✓ Pagamento confirmado</span></div><div class="customer-numbers">${t.picks.map((g,i)=>{const h=hitByIndex.get(i);return `<span class="${h?'hit':''}">${fmt(g)}${h?`<small>${esc(h.time)}</small>`:''}</span>`}).join('')}</div><p class="score-line"><b>${t.score} de 10 acertos</b></p><a class="receipt-link" href="/bilhete-bolao.html?id=${encodeURIComponent(t.id)}">Abrir somente esta cartela</a></article>`;
}
async function init(){
  const params=new URLSearchParams(location.search);shareId=params.get('share')||'';
  ids=(params.get('ids')||'').split(',').filter(Boolean).slice(0,200);
  if(shareId){const r=await fetch('/api/bolao-ticket-shares/'+encodeURIComponent(shareId));if(r.ok)ids=(await r.json()).ids;}
  if(!ids.length){$('customerPanel').innerHTML='<h1>Bilhetes não encontrados</h1>';return;}
  const items=(await Promise.all(ids.map(async id=>{const r=await fetch('/api/bolao-ticket/'+encodeURIComponent(id));return r.ok?await r.json():null;}))).filter(Boolean);
  if(!items.length){$('customerPanel').innerHTML='<h1>Bilhetes não encontrados</h1>';return;}
  const bolao=items[0].bolao,dr=await fetch('/api/bolao/'+encodeURIComponent(bolao.id)+'/public-dashboard'),dash=dr.ok?await dr.json():null;
  const draws=dash?.draws||items[0].draws||[],p=dash?.pools||{};
  $('customerPanel').innerHTML=`<div class="customer-hero"><span class="badge">${esc(bolao.status==='encerrado'?'ENCERRADO':'EM ANDAMENTO')}</span><h1>${esc(bolao.title)}</h1><p>${date(bolao.date)} • ${items.length} cartela(s) • ${money(items.reduce((s,d)=>s+Number(d.ticket.amount||0),0))}</p></div>
  <h2 class="center-title">🏆 Prêmios do bolão</h2><div class="customer-prizes">${prizeCard('Primeiro sorteio','Líder',p.first)}${prizeCard('Rei da Selva','Primeiro sorteio',p.king)}${prizeCard('Mais pontos','Último sorteio',p.main)}${prizeCard('Zero pontos','Último sorteio',p.zero)}</div>
  <section class="customer-section"><h2>Resultados</h2>${draws.length?`<div class="draw-table">${draws.map(d=>`<article><b>${esc(d.time)}</b><span>${d.groups.map(fmt).join(' - ')}</span></article>`).join('')}</div>`:'<p>Aguardando o primeiro resultado.</p>'}</section>
  ${winnerRows('Líderes atuais',dash?.leaders?.slice(0,10),0,'score',false)}
  ${winnerRows('Ganhadores do primeiro sorteio',dash?.winners?.first,p.first,'firstScore')}
  ${winnerRows('Rei da Selva',dash?.winners?.king,p.king)}
  <section class="customer-section"><h2>Meus jogos</h2><p><b>Total: ${items.length} cartela(s)</b></p>${items.map(ticketCard).join('')}</section>`;
  $('refresh').onclick=()=>location.reload();
  const shortUrl=async()=>{if(shareId)return location.href;const r=await fetch('/api/bolao-ticket-shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})}),d=await r.json();return r.ok?location.origin+d.url:location.href;};
  $('copyUrl').onclick=async()=>{await navigator.clipboard.writeText(await shortUrl());alert('Link dos bilhetes copiado!');};
  $('share').onclick=async()=>{const url=await shortUrl();if(navigator.share)await navigator.share({title:'Meus bilhetes do bolão',url});else{await navigator.clipboard.writeText(url);alert('Link copiado!');}};
}
init().catch(()=>$('customerPanel').innerHTML='<h2>Não foi possível carregar agora.</h2>');
