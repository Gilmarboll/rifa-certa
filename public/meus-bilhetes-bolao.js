const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>String(n).padStart(2,'0');
async function init(){
  const params=new URLSearchParams(location.search),share=params.get('share');
  let ids=(params.get('ids')||'').split(',').filter(Boolean).slice(0,200);
  if(share){const r=await fetch('/api/bolao-ticket-shares/'+encodeURIComponent(share));if(r.ok)ids=(await r.json()).ids;}
  if(!ids.length){$('ticketList').innerHTML='<p>Nenhum bilhete encontrado.</p>';return;}
  const items=await Promise.all(ids.map(async id=>{const r=await fetch('/api/bolao-ticket/'+encodeURIComponent(id));return r.ok?await r.json():null;}));
  const found=items.filter(Boolean);$('ticketList').innerHTML=`<p><b>Total: ${found.length} cartela(s)</b></p>`+found.map((d,i)=>{const t=d.ticket,b=d.bolao;return `<article class="admin-card"><h2>Cartela ${i+1}</h2><p><b>${esc(b.title)}</b></p><p>Cliente: ${esc(t.name)} • Pontuação: <b>${t.score} de 10</b></p><p>${t.picks.map(fmt).join(', ')}</p><a class="receipt-link" href="/bilhete-bolao.html?id=${encodeURIComponent(t.id)}">Visualizar jogo</a></article>`}).join('');
  const shortUrl=async()=>{if(location.search.startsWith('?share='))return location.href;const r=await fetch('/api/bolao-ticket-shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})}),d=await r.json();return r.ok?location.origin+d.url:location.href;};
  $('copyUrl').onclick=async()=>{await navigator.clipboard.writeText(await shortUrl());alert('URL curta dos jogos copiada!');};
  $('share').onclick=async()=>{const url=await shortUrl();if(navigator.share)await navigator.share({title:'Meus bilhetes do bolão',url});else{await navigator.clipboard.writeText(url);alert('URL curta copiada!');}};
}
init().catch(()=>$('ticketList').innerHTML='<p>Não foi possível carregar agora.</p>');
