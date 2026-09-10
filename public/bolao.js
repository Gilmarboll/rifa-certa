const groupNames=['Avestruz','Águia','Burro','Borboleta','Cachorro','Cabra','Carneiro','Camelo','Cobra','Coelho','Cavalo','Elefante','Galo','Gato','Jacaré','Leão','Macaco','Porco','Pavão','Peru','Touro','Tigre','Urso','Veado','Vaca'];
const $=id=>document.getElementById(id), money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let bolao,picks=[],games=[];
function renderPicks(){
  $('picks').innerHTML=picks.map((g,i)=>`<button class="bolao-pick" data-i="${i}" title="Remover">${String(g).padStart(2,'0')}</button>`).join('');
  $('count').textContent=`${picks.length} de 10 grupos`;
  $('addGame').disabled=picks.length!==10||bolao?.closed;
  $('continue').disabled=!games.length||bolao?.closed;
  document.querySelectorAll('.bolao-pick').forEach(b=>b.onclick=()=>{picks.splice(Number(b.dataset.i),1);renderPicks();});
}
function renderGames(){
  $('games').innerHTML=games.length?games.map((game,i)=>`<div class="saved-game"><b>Cartela ${i+1}</b><span>${game.map(g=>String(g).padStart(2,'0')).join(', ')}</span><button class="secondary" data-remove="${i}">Remover</button></div>`).join(''):'<p>Nenhuma cartela adicionada.</p>';
  $('gamesCount').textContent=games.length;
  $('total').textContent=bolao?money(bolao.price*games.length):money(0);
  $('continue').disabled=!games.length||bolao?.closed;
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{games.splice(Number(b.dataset.remove),1);renderGames();});
}
function choose(group){
  if(picks.length>=10||bolao.closed)return;
  if(picks.filter(item=>item===group).length>=2){
    $('msg').textContent='Esse bicho já foi escolhido 2 vezes. Escolha outro.';
    return;
  }
  picks.push(group);renderPicks();
}
async function init(){
  const id=new URLSearchParams(location.search).get('id');
  const r=await fetch('/api/bolao/'+encodeURIComponent(id||''));
  if(!r.ok){$('title').textContent='Bolão não disponível';return;}
  bolao=await r.json();$('title').textContent=bolao.title;
  const storageKey='bolaoTickets:'+bolao.id;
  const savedIds=JSON.parse(localStorage.getItem(storageKey)||'[]');
  $('myTickets').onclick=()=>{
    if(!savedIds.length){$('msg').textContent='Nenhuma cartela foi guardada neste aparelho ainda.';return;}
    location.href='/meus-bilhetes-bolao.html?ids='+encodeURIComponent(savedIds.join(','));
  };
  $('info').textContent=`Bilhete ${money(bolao.price)} • fecha ${bolao.date.split('-').reverse().join('/')} às ${bolao.closeTime}`;
  $('groups').innerHTML=groupNames.map((name,i)=>`<button class="ticket bolao-group" data-g="${i+1}">${String(i+1).padStart(2,'0')}<br><small>${name}</small></button>`).join('');
  document.querySelectorAll('.bolao-group').forEach(b=>b.onclick=()=>choose(Number(b.dataset.g)));
  $('random').onclick=()=>{
    const options=Array.from({length:50},(_,i)=>(i%25)+1);
    for(let i=options.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}
    picks=options.slice(0,10);renderPicks();
  };
  $('addGame').onclick=()=>{
    if(picks.length!==10)return;
    games.push([...picks]);picks=[];renderPicks();renderGames();
    $('msg').textContent='Cartela adicionada. Você pode montar outra ou finalizar.';
  };
  $('continue').onclick=async()=>{
    $('msg').textContent='Gerando seus bilhetes de teste...';
    const response=await fetch('/api/bolao/'+encodeURIComponent(bolao.id)+'/test-tickets',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        games,name:$('customerName').value,phone:$('customerPhone').value,seller:$('seller').value
      })
    });
    const data=await response.json();
    if(!response.ok){$('msg').textContent=data.error||'Não foi possível gerar o bilhete.';return;}
    const newIds=data.tickets.map(t=>t.id),allIds=[...new Set([...savedIds,...newIds])];
    localStorage.setItem(storageKey,JSON.stringify(allIds));
    location.href='/meus-bilhetes-bolao.html?ids='+encodeURIComponent(allIds.join(','));
  };
  if(bolao.closed){$('msg').textContent='Este bolão já está fechado.';$('random').disabled=true;}
  renderPicks();renderGames();
}
init().catch(()=>{$('title').textContent='Não foi possível carregar agora.';});
