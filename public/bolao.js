const groupNames=['Avestruz','Águia','Burro','Borboleta','Cachorro','Cabra','Carneiro','Camelo','Cobra','Coelho','Cavalo','Elefante','Galo','Gato','Jacaré','Leão','Macaco','Porco','Pavão','Peru','Touro','Tigre','Urso','Veado','Vaca'];
const $=id=>document.getElementById(id), money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let bolao,picks=[];
function renderPicks(){
  $('picks').innerHTML=picks.map((g,i)=>`<button class="bolao-pick" data-i="${i}" title="Remover">${String(g).padStart(2,'0')}</button>`).join('');
  $('count').textContent=`${picks.length} de 10 grupos`;
  $('total').textContent=bolao?money(bolao.price):money(0);
  $('continue').disabled=picks.length!==10||bolao?.closed;
  document.querySelectorAll('.bolao-pick').forEach(b=>b.onclick=()=>{picks.splice(Number(b.dataset.i),1);renderPicks();});
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
  $('info').textContent=`Bilhete ${money(bolao.price)} • fecha ${bolao.date.split('-').reverse().join('/')} às ${bolao.closeTime}`;
  $('groups').innerHTML=groupNames.map((name,i)=>`<button class="ticket bolao-group" data-g="${i+1}">${String(i+1).padStart(2,'0')}<br><small>${name}</small></button>`).join('');
  document.querySelectorAll('.bolao-group').forEach(b=>b.onclick=()=>choose(Number(b.dataset.g)));
  $('random').onclick=()=>{
    const options=Array.from({length:50},(_,i)=>(i%25)+1);
    for(let i=options.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}
    picks=options.slice(0,10);renderPicks();
  };
  if(bolao.closed){$('msg').textContent='Este bolão já está fechado.';$('random').disabled=true;}
  renderPicks();
}
init().catch(()=>{$('title').textContent='Não foi possível carregar agora.';});
