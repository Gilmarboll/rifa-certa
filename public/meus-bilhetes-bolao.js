const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>String(n).padStart(2,'0');
async function init(){
  const ids=(new URLSearchParams(location.search).get('ids')||'').split(',').filter(Boolean).slice(0,20);
  if(!ids.length){$('ticketList').innerHTML='<p>Nenhum bilhete encontrado.</p>';return;}
  const items=await Promise.all(ids.map(async id=>{const r=await fetch('/api/bolao-ticket/'+encodeURIComponent(id));return r.ok?await r.json():null;}));
  $('ticketList').innerHTML=items.filter(Boolean).map((d,i)=>{const t=d.ticket,b=d.bolao;return `<article class="admin-card"><h2>Cartela ${i+1}</h2><p><b>${esc(b.title)}</b></p><p>Cliente: ${esc(t.name)} • Pontuação: <b>${t.score} de 10</b></p><p>${t.picks.map(fmt).join(', ')}</p><a class="receipt-link" href="/bilhete-bolao.html?id=${encodeURIComponent(t.id)}">Visualizar jogo</a></article>`}).join('')||'<p>Nenhum bilhete encontrado.</p>';
  $('copyUrl').onclick=async()=>{await navigator.clipboard.writeText(location.href);alert('URL dos jogos copiada!');};
  $('share').onclick=async()=>{if(navigator.share)await navigator.share({title:'Meus bilhetes do bolão',url:location.href});else{await navigator.clipboard.writeText(location.href);alert('URL copiada!');}};
}
init().catch(()=>$('ticketList').innerHTML='<p>Não foi possível carregar agora.</p>');
