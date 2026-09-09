const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>String(n).padStart(2,'0'),money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
async function init(){
  const id=new URLSearchParams(location.search).get('id'),r=await fetch('/api/bolao-ticket/'+encodeURIComponent(id||'')),d=await r.json();
  if(!r.ok){$('ticket').innerHTML='<h2>Bilhete não encontrado</h2>';return;}
  const {ticket:t,bolao:b,draws}=d,hitByIndex=new Map((t.hits||[]).map(h=>[h.index,h]));
  $('ticket').innerHTML=`<span class="badge">MODO DE TESTE</span><h1>${esc(b.title)}</h1>
  <div class="ticket-meta"><p><b>Cliente:</b> ${esc(t.name)}</p><p><b>WhatsApp:</b> ${esc(t.phone)}</p><p><b>Vendedor:</b> ${esc(t.seller)}</p><p><b>Rei da Selva:</b> ${fmt(t.king)}</p><p><b>Valor fictício:</b> ${money(t.amount)}</p><p><b>Pontuação:</b> ${t.score} de 10</p></div>
  <h2>Meus bichos</h2><div class="bolao-picks ticket-results">${t.picks.map((g,i)=>{const h=hitByIndex.get(i);return `<span class="bolao-pick ${h?'hit':''}">${fmt(g)}${h?`<small>${esc(h.time)}</small>`:''}</span>`}).join('')}</div>
  <h2>Resultados</h2>${draws.length?draws.map(draw=>`<p><b>${esc(draw.time)}:</b> ${draw.groups.map(fmt).join(', ')}</p>`).join(''):'<p>Aguardando os resultados.</p>'}
  <p class="test-warning">Este bilhete usa dinheiro fictício e não vale prêmio real.</p><div class="ticket-actions"><button class="secondary" onclick="location.reload()">Atualizar pontuação</button><button class="secondary" id="copyGame">Copiar URL do jogo</button><button class="secondary" id="shareGame">Compartilhar</button><button class="secondary" onclick="window.print()">Imprimir / PDF</button></div>`;
  $('copyGame').onclick=async()=>{await navigator.clipboard.writeText(location.href);alert('URL do jogo copiada!');};
  $('shareGame').onclick=async()=>{if(navigator.share)await navigator.share({title:'Meu bilhete do bolão',url:location.href});else{await navigator.clipboard.writeText(location.href);alert('URL copiada!');}};
}
init().catch(()=>$('ticket').innerHTML='<h2>Não foi possível carregar agora.</h2>');
