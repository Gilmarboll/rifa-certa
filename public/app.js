let campaign;
let selected=new Set();
let currentReservation=null;

const $=id=>document.getElementById(id);
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

async function load(){
  const cs=await fetch('/api/campaigns').then(r=>r.json());
  if(!cs.length){
    $('title').textContent='Nenhuma campanha ativa';
    $('prize').textContent='Volte em breve.';
    $('grid').innerHTML='';
    return;
  }
  const wanted=new URLSearchParams(location.search).get('campaign');
  campaign=cs.find(c=>c.id===wanted)||cs[0];
  $('title').textContent=campaign.title;
  $('prize').textContent=campaign.prize;
  $('price').textContent=money(campaign.price)+' por número';
  $('progress').textContent=`${campaign.sold.length} vendidos de ${campaign.totalTickets}`;
  draw();
}
const grupos=[['Avestruz','🐦'],['Águia','🦅'],['Burro','🫏'],['Borboleta','🦋'],['Cachorro','🐶'],['Cabra','🐐'],['Carneiro','🐏'],['Camelo','🐪'],['Cobra','🐍'],['Coelho','🐰'],['Cavalo','🐴'],['Elefante','🐘'],['Galo','🐓'],['Gato','🐱'],['Jacaré','🐊'],['Leão','🦁'],['Macaco','🐒'],['Porco','🐷'],['Pavão','🦚'],['Peru','🦃'],['Touro','🐂'],['Tigre','🐯'],['Urso','🐻'],['Veado','🦌'],['Vaca','🐄']];
function draw(){
  const grid=$('grid'); grid.innerHTML='';
grid.style.gridTemplateColumns = campaign.type==='grupo'
 ? 'repeat(3,minmax(0,1fr))'
 : campaign.type==='centena'
 ? 'repeat(5,minmax(0,1fr))'
 : 'repeat(5,minmax(0,1fr))';
grid.style.gap = '10px';
   const limite=campaign.type==='grupo'?25:campaign.type==='dezena'?100:campaign.type==='centena'?1000:campaign.totalTickets;
for(let n=1;n<=limite;n++){
    const b=document.createElement('button');
    b.className='ticket';if(campaign.type==='grupo'){
  b.style.minHeight='120px';
  b.style.padding='8px';
}
if(campaign.type==='grupo'){
const g=grupos[n-1];
const inicio=(n-1)*4+1;
const nums=[inicio,inicio+1,inicio+2,inicio+3]
  .map(x=>String(x%100).padStart(2,'0'));

b.style.minHeight='210px';
b.style.padding='12px';
b.style.fontSize='16px';

b.innerHTML=
  '<strong style="font-size:18px">'+g[0]+'</strong>'+
  '<span style="font-size:70px;display:block;margin:15px 0">'+g[1]+'</span>'+
 '<div style="font-size:14px;font-weight:bold;white-space:nowrap">'+nums.join(' ')+'</div>';
}
 
    if(campaign.type!=='grupo') b.textContent=campaign.type==='centena'?String(n%1000).padStart(3,'0'):campaign.type==='dezena'?String(n%100).padStart(2,'0'):String(n).padStart(campaign.type==='centena'?3:2,'0');
    if(campaign.sold.includes(n)){
  b.classList.add('sold');
  if(campaign.type==='grupo') b.insertAdjacentHTML('beforeend','<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:white;color:#111;padding:4px 8px;border-radius:6px;font-weight:bold;z-index:2;white-space:nowrap">VENDIDO</span>');
}
else if(campaign.reservations.includes(n)){
  b.classList.add('reserved');
if(campaign.type==='grupo') b.insertAdjacentHTML('beforeend','<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:white;color:#111;padding:4px 8px;border-radius:6px;font-weight:bold;z-index:2;white-space:nowrap">RESERVADO</span>');
}
else if(selected.has(n)){
  b.classList.add('selected');
  if(campaign.type==='grupo') b.innerHTML += '<span style="display:block;font-weight:bold;margin-top:8px">SELECIONADO</span>';
}
    b.onclick=()=>{
      if(b.classList.contains('sold')||b.classList.contains('reserved')) return;
      selected.has(n)?selected.delete(n):selected.add(n);
      draw();
    };
    grid.appendChild(b);
  }
  updateCart();
}
function updateCart(){
  $('selectedList').innerHTML=selected.size
    ? [...selected].sort((a,b)=>a-b).map(n=>`<span class="chip">${campaign.type==='centena'?String(n%1000).padStart(3,'0'):campaign.type==='dezena'?String(n%100).padStart(2,'0'):String(n).padStart(2,'0')}</span>`).join('')
    : 'Nenhum número escolhido.';
  $('total').textContent=money(selected.size*campaign.price);
}
$('randomBtn').onclick=()=>{
  const available=[];
 const limiteAleatorio=campaign.type==='grupo'?25:campaign.type==='dezena'?100:campaign.type==='centena'?1000:campaign.totalTickets;
for(let n=1;n<=limiteAleatorio;n++){
    if(!campaign.sold.includes(n)&&!campaign.reservations.includes(n)) available.push(n);
  }
  selected.clear();
  while(selected.size<Math.min(5,available.length)){
    const i=Math.floor(Math.random()*available.length);
    selected.add(available.splice(i,1)[0]);
  }
  draw();
};
$('reserveBtn').onclick=async()=>{
  const msg=$('msg');
  msg.textContent='Reservando...';
  const r=await fetch(`/api/campaign/${campaign.id}/reserve`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({numbers:[...selected]})
  });
  const d=await r.json();
  if(!r.ok){msg.textContent=d.error||'Erro na reserva';await load();return;}
  currentReservation=d;
$('reserveBtn').disabled=true;
  
  await load();
  msg.innerHTML=`
    <div><strong>Reserva feita por 15 minutos.</strong><br>Total: ${money(d.total)}</div>
    <div style="margin-top:12px">
      <input id="payerName" placeholder="Seu primeiro nome" style="margin-bottom:8px">
      <input id="payerPhone" type="tel" placeholder="Seu WhatsApp" style="margin-bottom:8px">
      <button id="pixBtn" class="primary">Gerar PIX</button>
    </div>
    <div id="pixArea"></div>`;
  $('pixBtn').onclick=createPix;
};
async function createPix(){
  const area=$('pixArea');
  area.textContent='Gerando Pix...';
  const r=await fetch('/api/payments/pix',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      reservationId:currentReservation.reservationId,
      payer:{first_name:$('payerName').value.trim(),phone:$('payerPhone').value.trim()}
    })
  });
  const d=await r.json();
  if(d.paymentId) localStorage.setItem('ultimoComprovante',d.paymentId);
  if(!r.ok){area.textContent=d.error||'Erro ao gerar Pix';return;}

  if(d.mode==='demo'){
    area.innerHTML=`<p>${d.message}</p><button id="demoConfirm" class="secondary">Simular confirmação</button>`;
    $('demoConfirm').onclick=async()=>{
      const rr=await fetch(`/api/campaign/${campaign.id}/demo-confirm`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
  reservationId:currentReservation.reservationId,
  payer:{
    first_name:$('payerName').value.trim(),
    phone:$('payerPhone').value.trim()
  }
})
              });
      const dd=await rr.json();
      if(rr.ok){
  area.innerHTML=`<p><strong>✅ Pagamento confirmado</strong></p>
  <p>Números: ${dd.numbers.join(', ')}</p>
  <button class="primary" onclick="window.open('/comprovante.html?id=${dd.paymentId}','_blank')">Ver comprovante</button>`;
}else{
  area.textContent=dd.error||'Falha';
}
      await load();
    };
    return;
  }

  const img=d.qrCodeBase64 ? `<img alt="QR Code Pix" style="max-width:220px;background:white;padding:8px;border-radius:10px" src="data:image/jpeg;base64,${d.qrCodeBase64}">` : '';
  const code=d.qrCode ? `<textarea readonly style="width:100%;min-height:90px">${d.qrCode}</textarea><button id="copyPix" class="secondary">Copiar Pix</button>` : '';
  const link=d.ticketUrl ? `<p><a target="_blank" rel="noopener" href="${d.ticketUrl}" style="color:#b6f43e">Abrir página do Pix</a></p>` : '';
  area.innerHTML=`<h3>PIX gerado</h3>${img}${code}${link}<p>Status: ${d.statusDetail||d.status}</p>`;
  if(d.qrCode) $('copyPix').onclick=()=>navigator.clipboard.writeText(d.qrCode);
}
const lastReceiptBtn=$('lastReceiptBtn');
const ultimoComprovante=localStorage.getItem('ultimoComprovante');

if(lastReceiptBtn && ultimoComprovante){
  lastReceiptBtn.style.display='block';
  lastReceiptBtn.onclick=()=>window.open(
    '/comprovante.html?id='+encodeURIComponent(ultimoComprovante),
    '_blank'
  );
}
load();
