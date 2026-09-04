let campaign;
let selected=new Set();
let currentReservation=null;

const $=id=>document.getElementById(id);
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

const formatNumber=(n,type=campaign?.type)=>{
  const widths={grupo:2,dezena:2,centena:3,milhar:4};
  const mod={dezena:100,centena:1000,milhar:10000}[type];
  return String(mod?Number(n)%mod:n).padStart(widths[type]||2,'0');
};
const storage={
  get(key){try{return localStorage.getItem(key);}catch{return null;}},
  set(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}},
  remove(key){try{localStorage.removeItem(key);}catch{}}
};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,options){
  const r=await fetch(url,{cache:'no-store',...options});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(data.error||'Não foi possível carregar. Tente novamente.'),{status:r.status});
  return data;
}
let busy=false, checking=false, payerDraft={}, payment=null, renderedPayment='';
function reservationKey(){return 'rifaCerta:reserva:'+campaign.id;}
function rememberReservation(){
  if(currentReservation) storage.set(reservationKey(),JSON.stringify({reservationId:currentReservation.reservationId,payer:payerDraft}));
}
async function load(){
  const cs=await api('/api/campaigns');
  const wanted=new URLSearchParams(location.search).get('campaign');
  if(wanted && !cs.some(c=>c.id===wanted)) throw new Error('Esta campanha não está disponível.');
  if(!cs.length) throw new Error('Nenhuma campanha ativa. Volte em breve.');
  campaign=cs.find(c=>c.id===wanted)||cs[0];
  $('title').textContent=campaign.title;
  $('prize').textContent=campaign.prize;
  $('price').textContent=money(campaign.price)+' por número';
  $('progress').textContent=`${campaign.sold.length} vendidos de ${campaign.totalTickets}`;
  const prizeCard=$('prizeCard');
  const prizeImage=$('prizeImage');
  if(campaign.imageUrl){
    prizeImage.src=campaign.imageUrl;
    prizeImage.alt='Foto do prêmio: '+campaign.prize;
    prizeCard.hidden=false;
  }else{
    prizeImage.removeAttribute('src');
    prizeCard.hidden=true;
  }
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
 
    if(campaign.type!=='grupo') b.textContent=formatNumber(n);
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
      if(currentReservation||busy||b.classList.contains('sold')||b.classList.contains('reserved')) return;
      selected.has(n)?selected.delete(n):selected.add(n);
      draw();
    };
    grid.appendChild(b);
  }
  updateCart();
}
function updateCart(){
  const numbers=currentReservation?.numbers||[...selected];
  $('selectedList').innerHTML=numbers.length
    ? [...numbers].sort((a,b)=>a-b).map(n=>`<span class="chip">${formatNumber(n)}</span>`).join('')
    : 'Nenhum número escolhido.';
  $('total').textContent=money(currentReservation?.total??numbers.length*campaign.price);
  $('reserveBtn').disabled=busy||!!currentReservation||!selected.size;
  $('randomBtn').disabled=busy||!!currentReservation;
}
$('randomBtn').onclick=()=>{
  if(!campaign||currentReservation||busy) return;
  const available=[];
  const limit={grupo:25,dezena:100,centena:1000}[campaign.type]||campaign.totalTickets;
  for(let n=1;n<=limit;n++){
    if(!campaign.sold.includes(n)&&!campaign.reservations.includes(n)) available.push(n);
  }
  selected.clear();
  while(selected.size<5 && available.length){
    selected.add(available.splice(Math.floor(Math.random()*available.length),1)[0]);
  }
  draw();
};
function renderCheckout(){
  // Mount once per reservation; polling never replaces a focused name/phone input.
  if($('checkoutForm')) return;
  $('msg').innerHTML=`<p><strong id="reservationClock"></strong></p>
    <form id="checkoutForm">
      <label for="payerName">Nome *</label>
      <input id="payerName" name="name" autocomplete="given-name" required maxlength="100">
      <label for="payerPhone">WhatsApp com DDD *</label>
      <input id="payerPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="25" placeholder="(48) 99999-9999">
      <label for="payerEmail">E-mail (opcional)</label>
      <input id="payerEmail" name="email" type="email" autocomplete="email" maxlength="200">
      <button id="pixBtn" type="submit" class="primary">Gerar Pix</button>
    </form><p id="checkoutError" role="status"></p><div id="pixArea"></div>`;
  for(const [field,key] of [['payerName','first_name'],['payerPhone','phone'],['payerEmail','email']]){
    $(field).value=payerDraft[key]||'';
    $(field).addEventListener('input',()=>{payerDraft[key]=$(field).value;rememberReservation();});
  }
  $('checkoutForm').onsubmit=e=>{e.preventDefault();createPix();};
  tick();
}
function keepReceipt(p){
  if(!p?.paymentId) return;
  const url='/comprovante.html?id='+encodeURIComponent(p.paymentId);
  storage.set('ultimoComprovante',p.paymentId);
  storage.set('ultimoComprovanteUrl',url);
  const btn=$('lastReceiptBtn');
  btn.style.display='block';btn.onclick=()=>window.open(url,'_blank','noopener');
}
function renderPayment(p){
  payment=p;
  if(!p) return;
  keepReceipt(p);
  const signature=JSON.stringify(p);
  if(signature===renderedPayment) return;
  renderedPayment=signature;
  const area=$('pixArea');
  const paid=p.status==='processed' && p.fulfillmentStatus==='sold';
  const terminal=['expired','canceled','failed','refunded'].includes(p.status);
  $('checkoutForm').hidden=paid||terminal||p.fulfillmentStatus==='review_required';
  $('pixBtn').hidden=p.status!=='creating';
  if(p.fulfillmentStatus==='review_required'){
    area.textContent='Pagamento recebido, mas seus números precisam de conferência pelo responsável. Não pague novamente.';
    return;
  }
  if(paid){
    area.innerHTML=`<p><strong>${p.mode==='demo'?'✅ Simulação confirmada (sem cobrança)':'✅ Pagamento confirmado'}</strong></p>
      <p>Números: ${currentReservation.numbers.map(n=>formatNumber(n)).join(', ')}</p>
      <a class="secondary receipt-link" href="/comprovante.html?id=${encodeURIComponent(p.paymentId)}" target="_blank" rel="noopener">Ver e compartilhar comprovante</a>`;
    storage.remove(reservationKey());
    return;
  }
  if(terminal){
    area.innerHTML='<p>Este Pix foi encerrado. Escolha seus números novamente.</p><button id="restartBtn" class="secondary">Escolher números</button>';
    $('restartBtn').onclick=async()=>{clearReservation();await load().catch(showError);};
    storage.remove(reservationKey());
    return;
  }
  if(p.mode==='demo'){
    area.innerHTML='<p>Modo de teste: nenhum Pix real será cobrado.</p><button id="demoConfirm" class="secondary">Simular confirmação</button>';
    $('demoConfirm').onclick=async()=>{
      $('demoConfirm').disabled=true;
      try{
        const d=await api(`/api/campaign/${campaign.id}/demo-confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:currentReservation.reservationId})});
        renderPayment(d);await load();
      }catch(err){$('checkoutError').textContent=err.message;if($('demoConfirm')) $('demoConfirm').disabled=false;}
    };
    return;
  }
  if(p.status==='creating'){
    area.textContent='A geração do Pix ainda não terminou. Você pode tentar novamente sem criar outra cobrança.';
    return;
  }
  area.innerHTML='<h3>Pix gerado</h3><p>Aguardando pagamento. A confirmação aparecerá aqui.</p>';
  if(p.qrCodeBase64){
    const img=document.createElement('img');img.alt='QR Code Pix';img.className='pix-qr';
    img.src='data:image/png;base64,'+p.qrCodeBase64;area.appendChild(img);
  }
  if(p.qrCode){
    const code=document.createElement('textarea');code.readOnly=true;code.value=p.qrCode;code.setAttribute('aria-label','Código Pix copia e cola');
    const copy=document.createElement('button');copy.className='secondary';copy.textContent='Copiar Pix';
    copy.onclick=async()=>{
      try{await navigator.clipboard.writeText(p.qrCode);copy.textContent='Pix copiado!';}
      catch{code.focus();code.select();$('checkoutError').textContent='Segure no código selecionado e toque em Copiar.';}
    };
    area.append(code,copy);
  }
  if(p.ticketUrl){
    try{
      const url=new URL(p.ticketUrl);
      if(url.protocol==='https:'){
        const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener';link.className='receipt-link';link.textContent='Abrir página do Pix';area.append(link);
      }
    }catch{}
  }
}
function clearReservation(){
  storage.remove(reservationKey());currentReservation=null;payment=null;renderedPayment='';selected.clear();
  $('msg').textContent='Reserva encerrada. Escolha seus números novamente.';updateCart();
}
function tick(){
  if(!currentReservation||!$('reservationClock')) return;
  const left=Math.max(0,Math.ceil((currentReservation.expiresAt-Date.now())/1000));
  $('reservationClock').textContent=payment?.fulfillmentStatus==='sold'?'Pedido concluído.':
    left?`Reserva: ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')} restantes`:
    payment?.mode==='mercadopago'?'Prazo encerrado. Conferindo pagamento antes de liberar os números.':'Reserva expirada.';
  if($('pixBtn')) $('pixBtn').disabled=busy||!left;
}
async function checkReservation(){
  if(checking||busy||!currentReservation||payment?.fulfillmentStatus==='sold') return;
  checking=true;
  try{
    const d=await api('/api/reservations/'+encodeURIComponent(currentReservation.reservationId));
    if(d.campaignId!==campaign.id) throw new Error('A reserva pertence a outra campanha.');
    currentReservation=d;renderCheckout();renderPayment(d.payment);updateCart();tick();
    if(d.payment?.fulfillmentStatus==='sold') await load();
    if(d.expiresAt<=Date.now() && (!d.payment||d.payment.mode==='demo') && d.payment?.status!=='processed'){
      clearReservation();await load();
    }
    if($('checkoutError')) $('checkoutError').textContent='';
  }catch(err){
    if(err.status===404||err.status===410){clearReservation();await load().catch(showError);}
    else ($('checkoutError')||$('msg')).textContent='Não foi possível conferir agora. Sua reserva continua salva; vamos tentar novamente.';
  }finally{checking=false;}
}
$('reserveBtn').onclick=async()=>{
  if(busy||currentReservation||!selected.size) return;
  busy=true;updateCart();$('msg').textContent='Reservando...';
  try{
    const d=await api(`/api/campaign/${campaign.id}/reserve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numbers:[...selected]})});
    currentReservation=d;rememberReservation();renderCheckout();
    await load();
  }catch(err){showError(err);}
  finally{busy=false;updateCart();tick();}
};
async function createPix(){
  if(busy||!currentReservation) return;
  const name=$('payerName').value.trim(),phone=$('payerPhone').value.replace(/\D/g,'');
  if(!name||!/^(?:55)?\d{10,11}$/.test(phone)){
    $('checkoutError').textContent='Informe seu nome e WhatsApp com DDD.';return;
  }
  payerDraft={first_name:name,phone:$('payerPhone').value,email:$('payerEmail').value.trim()};rememberReservation();
  busy=true;tick();$('checkoutError').textContent='Gerando Pix...';
  try{
    const d=await api('/api/payments/pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:currentReservation.reservationId,payer:payerDraft})});
    renderPayment(d);$('checkoutError').textContent='';
  }catch(err){$('checkoutError').textContent=err.message;}
  finally{busy=false;tick();}
}
function showError(err){
  const target=$('checkoutError')||$('msg');target.textContent=err.message||'Não foi possível carregar. Atualize a página.';
}
function showNoCampaign(message){
  const prizeCard=$('prizeCard');
  const prizeImage=$('prizeImage');
  prizeCard.hidden=true;
  prizeImage.removeAttribute('src');
  $('title').textContent='Nenhuma campanha ativa';
  $('prize').textContent=message||'Volte em breve para participar.';
  $('price').textContent='';$('progress').textContent='';
  $('grid').innerHTML='<p class="empty-state" style="grid-column:1/-1">No momento não há campanha disponível.</p>';
  $('randomBtn').style.display='none';$('reserveBtn').style.display='none';
  $('selectedList').textContent='Aguarde a próxima campanha.';
  $('msg').textContent='';
}
async function start(){
  $('reserveBtn').disabled=true;$('randomBtn').disabled=true;
  try{
    await load();
    let saved;try{saved=JSON.parse(storage.get(reservationKey())||'null');}catch{}
    if(saved?.reservationId){
      currentReservation={reservationId:saved.reservationId,numbers:[],total:0};payerDraft=saved.payer||{};
      updateCart();await checkReservation();
    }
    const last=storage.get('ultimoComprovante');if(last) keepReceipt({paymentId:last});
  }catch(err){
    if(err.message==='Nenhuma campanha ativa. Volte em breve.'||err.message==='Esta campanha não está disponível.') showNoCampaign(err.message);
    else showError(err);
  }
}
setInterval(tick,1000);
setInterval(checkReservation,5000);
window.addEventListener('pageshow',()=>{if(campaign) checkReservation();});
start();
