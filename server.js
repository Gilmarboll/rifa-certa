const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { Pool } = require('pg');
const app = express();
app.use(express.json({limit:'8mb'}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api', (req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });

const DB = path.join(__dirname,'data.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const ADMIN_TOKEN = crypto.createHash('sha256').update(ADMIN_USER+':'+ADMIN_PASSWORD).digest('hex');
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';
const SUPPORT_WHATSAPP = String(process.env.SUPPORT_WHATSAPP || '5548984409772').replace(/\D/g,'');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sessions = new Map();

const upload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:5*1024*1024},
  fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))
});

function initial(){
  return {campaigns:[{
    id:'demo-1',
    title:'Honda CG 160 Start 0km',
    prize:'Honda CG 160 Start 0km',
    type:'numeros',
    price:10,
    totalTickets:100,
    status:'ativa',
    imageUrl:'',
    sold:[13,17,33,64],
    reservations:{},
    createdAt:new Date().toISOString()
  }], payments:[]};
}
let state = initial();
function load(){ return state; }

  

// Serialize immutable snapshots: older writes must never overwrite newer sales.
let saving=Promise.resolve();
function save(db){
  state=db;
  const snapshot=JSON.stringify(db);
  const write=saving.then(()=>pool.query(
    'INSERT INTO app_state (id,data) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data',
    [snapshot]
  ));
  saving=write.catch(err=>console.error('DB save error',err.message));
  return write;
}
const terminalStatuses=new Set(['canceled','expired','failed','refunded']);
function pendingPayment(reservationId){
  return (state.payments||[]).find(p=>p.reservationId===reservationId &&
    p.provider==='mercadopago' && !terminalStatuses.has(p.status) && !p.fulfilledAt);
}
function clean(c){
  for(const [n,r] of Object.entries(c.reservations||{})){
    // A payable Pix must be canceled/checked before its numbers become available.
    if(r.expiresAt<=Date.now() && !pendingPayment(r.reservationId)) delete c.reservations[n];
  }
}
function asyncRoute(fn){
  return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
}
function tokenFrom(req){ return (req.headers.authorization||'').replace(/^Bearer\s+/,''); }
function requireAdmin(req,res,next){
  const t=tokenFrom(req);
  if(t!==ADMIN_TOKEN) return res.status(401).json({error:'Faça login no painel.'});
  next();
}
function findReservation(db,reservationId){
  for(const c of db.campaigns){
    clean(c);
    const numbers = Object.entries(c.reservations||{})
      .filter(([n,r])=>r.reservationId===reservationId)
      .map(([n])=>Number(n));
    if(numbers.length) return {campaign:c,numbers};
  }
  return null;
}
function finalizeReservation(db,reservationId){
  const found=findReservation(db,reservationId);
  if(!found) return null;
  const {campaign,numbers}=found;
  numbers.forEach(n=>{
    delete campaign.reservations[n];
    if(!campaign.sold.includes(n)) campaign.sold.push(n);
  });
  return {campaign,numbers};
}
function parseSignature(header=''){
  const parts={};
  header.split(',').forEach(p=>{
    const [k,v]=p.split('=');
    if(k&&v) parts[k.trim()]=v.trim();
  });
  return parts;
}
function validMPWebhook(req){
  if(!MP_WEBHOOK_SECRET) return false;
  const sig=parseSignature(req.headers['x-signature']||'');
  if(!sig.ts || !sig.v1) return false;
  const requestId=req.headers['x-request-id'];
  const rawDataId=(req.query['data.id'] || req.body?.data?.[0]?.id || req.body?.data?.id || '').toString();
  const dataId=(rawDataId || '').toLowerCase();

  let manifest='';
  if(dataId) manifest += `id:${dataId};`;
  if(requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${sig.ts};`;
  const digest=crypto.createHmac('sha256',MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  try{
    return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(sig.v1));
  }catch{return false;}
}
async function mpRequest(url,options={}){
  if(!MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado');
  const headers={
    'Content-Type':'application/json',
    'Authorization':`Bearer ${MP_ACCESS_TOKEN}`,
    ...(options.headers||{})
  };
  const r=await fetch(url,{signal:AbortSignal.timeout(15000),...options,headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=new Error(data.message || data.error || `Mercado Pago HTTP ${r.status}`);
    err.status=r.status; err.details=data;console.error('Mercado Pago:', JSON.stringify(data,null,2)); throw err;
  }
  return data;
}

app.post('/api/admin/login',(req,res)=>{
  const {user,password}=req.body||{};
  if(user!==ADMIN_USER || password!==ADMIN_PASSWORD)
    return res.status(401).json({error:'Usuário ou senha inválidos.'});
  const token=ADMIN_TOKEN;
  sessions.set(token,{createdAt:Date.now()});
  res.json({token,user});
});
app.post('/api/admin/logout',requireAdmin,(req,res)=>{
  sessions.delete(tokenFrom(req)); res.json({ok:true});
});
app.get('/api/admin/me',requireAdmin,(req,res)=>res.json({user:ADMIN_USER}));

app.get('/api/campaigns',(req,res)=>{
  const db=load();
  db.campaigns.forEach(clean);
  save(db);
  res.json(db.campaigns.filter(c=>c.status==='ativa').map(c=>({...c,reservations:Object.keys(c.reservations||{}).map(Number)})));
});
app.get('/api/public-config',(req,res)=>res.json({supportWhatsApp:SUPPORT_WHATSAPP}));
app.get('/api/campaign/:id',(req,res)=>{
  const db=load();
  const c=db.campaigns.find(x=>x.id===req.params.id);
  if(!c || c.status!=='ativa') return res.sendStatus(404);
  clean(c); save(db);
  res.json({...c,reservations:Object.keys(c.reservations||{}).map(Number)});
});

app.get('/api/ticket/:id',(req,res)=>{
  const db=load();
  const p=(db.payments||[]).find(x=>x.id===req.params.id);

  if(!p) return res.status(404).json({error:'Comprovante não encontrado.'});

  const c=(db.campaigns||[]).find(x=>x.id===p.campaignId);

  res.json({
    id:p.id,
    campaign:c ? {
      title:c.title,
      type:c.type,
      date:c.date,
      time:c.time
    } : null,
    name:p.name||'',
    phone:p.phone||'',
    fulfillmentStatus:p.fulfillmentStatus||'',
    provider:p.provider||'',
    numbers:p.numbers||[],
    amount:Number(p.amount||0),
    status:p.status||'',
    createdAt:p.createdAt||''
  });
});
app.post('/api/admin/upload',requireAdmin,upload.single('image'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Envie JPG, PNG ou WEBP de até 5 MB.'});
  res.json({url:`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`});
});
app.patch('/api/admin/campaign/:id/image',requireAdmin,asyncRoute(async(req,res)=>{
  const imageUrl=String(req.body.imageUrl||'');
  if(!/^data:image\/(jpeg|png|webp);base64,/.test(imageUrl))
    return res.status(400).json({error:'Imagem inválida.'});
  const db=load();
  const c=db.campaigns.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({error:'Campanha não encontrada.'});
  c.imageUrl=imageUrl;
  await save(db);
  res.json({ok:true});
}));
app.get('/api/admin/campaigns',requireAdmin,(req,res)=>{
  const db=load(); db.campaigns.forEach(clean); save(db);
  res.json(db.campaigns.map(c=>({...c,reservations:Object.keys(c.reservations||{}).map(Number)})));
});
app.get('/api/admin/payments',requireAdmin,(req,res)=>{ const db=load(); res.json([...(db.payments||[])].reverse()); });
app.get('/api/admin/results',requireAdmin,(req,res)=>{
  const db=load(); res.json([...(db.results||[])].reverse());
});
app.get('/api/winner/:id',(req,res)=>{
  const db=load();
  for(const result of db.results||[]){
    const winner=(result.winners||[]).find(w=>w.id===req.params.id);
    if(winner) return res.json({...winner,date:result.date,time:result.time,prizePaid:Boolean(winner.prizePaid)});
  }
  res.status(404).json({error:'Comprovante de ganhador não encontrado.'});
});
app.patch('/api/admin/winner/:id/paid',requireAdmin,asyncRoute(async(req,res)=>{
  const db=load();
  for(const result of db.results||[]){
    const winner=(result.winners||[]).find(w=>w.id===req.params.id);
    if(winner){
      winner.prizePaid=Boolean(req.body.paid);
      winner.prizePaidAt=winner.prizePaid?new Date().toISOString():null;
      await save(db);
      return res.json({ok:true,winner});
    }
  }
  res.status(404).json({error:'Ganhador não encontrado.'});
}));
app.post('/api/admin/manual-sale',requireAdmin,(req,res)=>{
  const {campaignId,name,phone,number,paymentMethod}=req.body;
  let n=Number(number);
  const db=load();
  const c=db.campaigns.find(x=>x.id===campaignId);

  if(!c) return res.status(404).json({error:'Rifa não encontrada.'});
  if(n===0 && ['dezena','centena','milhar'].includes(c.type)) n={dezena:100,centena:1000,milhar:10000}[c.type];
  if(!Number.isInteger(n) || n<1 || n>c.totalTickets) return res.status(400).json({error:'Número inválido.'});
  clean(c);
  if(c.sold.includes(n)||c.reservations[n]) return res.status(409).json({error:'Já vendido ou reservado.'});

  c.sold.push(n);
  db.payments=db.payments||[];
  db.payments.push({
    id:crypto.randomUUID(),
    campaignId,
    numbers:[n],
    name:name||'',
    phone:phone||'',
    amount:c.price,
    status:'processed',
    paymentMethod:paymentMethod||'dinheiro',
    createdAt:new Date().toISOString()
  });

  save(db);
  res.json({ok:true,type:c.type,date:c.date,time:c.time,number:n});
});
app.post('/api/admin/campaigns',requireAdmin,(req,res)=>{
 const {title,prize,type='numeros',price,totalTickets,imageUrl='',date,time,maxPrizePosition='1',prize1='0',prize2='0',prize3='0',prize4='0',prize5='0'}=req.body;
  if(!title||!prize||!Number(price)||!Number(totalTickets))
    return res.status(400).json({error:'Preencha os campos obrigatórios.'});
  const db=load();
  const c={
    id:crypto.randomUUID(),title,prize,type,price:Number(price),
    totalTickets:Number(totalTickets),status:'ativa',sold:[],
   reservations:{},imageUrl,date,time,
maxPrizePosition:Number(maxPrizePosition),
prizes:[Number(prize1||0),Number(prize2||0),Number(prize3||0),Number(prize4||0),Number(prize5||0)],
createdAt:new Date().toISOString()
  };
  db.campaigns.push(c); save(db); res.json(c);
});
app.post('/api/admin/results',requireAdmin,(req,res)=>{
  const {date,time,results=[]}=req.body;

  if(!date || !time || !results.length){
    return res.status(400).json({error:'Informe o horário e pelo menos 1 resultado.'});
  }

  const db=load();

  const cleanResults=results
    .map(x=>String(x).replace(/\D/g,'').padStart(4,'0').slice(-4));

  const campaigns=(db.campaigns||[]).filter(c=>c.date===date && c.time===time);
  const payments=(db.payments||[]).filter(p=>p.status==='processed' && p.fulfillmentStatus!=='review_required');

  const winners=[];

  campaigns.forEach(c=>{
    cleanResults.forEach((result,pos)=>{
if(pos+1 > Number(c.maxPrizePosition||1)) return;

const prizeAmount=Number((c.prizes||[])[pos]||0);
if(prizeAmount<=0) return;
      const dezena=Number(result.slice(-2));
      const centena=Number(result.slice(-3));
      const grupo=dezena===0 ? 25 : Math.ceil(dezena/4);

      let winningNumber=null;

      if(c.type==='grupo') winningNumber=grupo;
      if(c.type==='dezena') winningNumber=dezena===0 ? 100 : dezena;
      if(c.type==='centena') winningNumber=centena===0 ? 1000 : centena;

      if(winningNumber===null) return;

      payments
        .filter(p=>p.campaignId===c.id && (p.numbers||[]).map(Number).includes(winningNumber))
        .forEach(p=>{
          winners.push({
            id:crypto.randomUUID(),
            position:pos+1,
            result,
            campaignId:c.id,
            campaign:c.title,
            type:c.type,
            winningNumber,
           prizeAmount,
            name:p.name||'',
            phone:p.phone||'',
            prizePaid:false
          });
        });
    });
  });

  db.results=db.results||[];
  db.results.push({
    id:crypto.randomUUID(),
    date,
    time,
    results:cleanResults,
    winners,
    createdAt:new Date().toISOString()
  });

  save(db);

  res.json({
    ok:true,
    date,
    time,
    results:cleanResults,
    campaignsChecked:campaigns.length,
    winners
  });
});
app.patch('/api/admin/campaign/:id/status',requireAdmin,(req,res)=>{
  const db=load(); const c=db.campaigns.find(x=>x.id===req.params.id);
  if(!c) return res.sendStatus(404);
  if(!['ativa','pausada','encerrada'].includes(req.body.status))
    return res.status(400).json({error:'Status inválido.'});
  c.status=req.body.status; save(db); res.json({ok:true,status:c.status});
});

app.post('/api/campaign/:id/reserve',asyncRoute(async(req,res)=>{
  const db=load();
  const c=db.campaigns.find(x=>x.id===req.params.id);
  if(!c||c.status!=='ativa') return res.sendStatus(404);
  clean(c);
  const nums=[...new Set((req.body.numbers||[]).map(Number))];
  if(!nums.length) return res.status(400).json({error:'Escolha ao menos um número.'});
  if(nums.some(n=>!Number.isInteger(n)||n<1||n>c.totalTickets))
    return res.status(400).json({error:'Número inválido.'});
  if(nums.some(n=>c.sold.includes(n)||c.reservations[n]))
    return res.status(409).json({error:'Um número já foi vendido ou reservado.'});
  const reservationId=crypto.randomUUID();
  const expiresAt=Date.now()+15*60*1000;
  nums.forEach(n=>c.reservations[n]={reservationId,expiresAt});
  await save(db);
  res.json({reservationId,campaignId:c.id,numbers:nums,expiresAt,total:nums.length*c.price});
}));

function paymentView(p){
  return {
    mode:p.provider, paymentId:p.id, receiptUrl:'/comprovante.html?id='+p.id,
    status:p.status, statusDetail:p.statusDetail, amount:p.amount,
    fulfillmentStatus:p.fulfillmentStatus||'',
    qrCode:p.qrCode||'', qrCodeBase64:p.qrCodeBase64||'', ticketUrl:p.ticketUrl||''
  };
}
function applyOrder(p,order){
  if(String(order.id)!==String(p.providerOrderId) || order.external_reference!==p.reservationId ||
    Math.round(Number(order.total_amount)*100)!==Math.round(p.amount*100)){
    throw new Error('Os dados do pagamento não correspondem à reserva.');
  }
  // A delayed pending response must not undo an already confirmed sale.
  if(p.fulfilledAt && order.status!=='processed' && !['refunded','charged_back'].includes(order.status)) return;
  p.status=order.status;
  p.statusDetail=order.status_detail;
  p.updatedAt=new Date().toISOString();
  const pm=order.transactions?.payments?.[0]?.payment_method||{};
  p.qrCode=pm.qr_code||p.qrCode||'';
  p.qrCodeBase64=pm.qr_code_base64||p.qrCodeBase64||'';
  p.ticketUrl=pm.ticket_url||p.ticketUrl||'';
  const c=state.campaigns.find(c=>c.id===p.campaignId);
  if(order.status==='processed' && order.status_detail==='accredited' && !p.fulfilledAt){
    p.paidAt=p.paidAt||new Date().toISOString();
    const conflict=!c || !p.numbers?.length || p.numbers.some(n=>
      c.sold.includes(n) || (c.reservations[n] && c.reservations[n].reservationId!==p.reservationId));
    if(conflict){
      p.fulfillmentStatus='review_required';
      return; // Never issue a valid sold ticket over another buyer's allocation.
    }
    p.numbers.forEach(n=>{ c.sold.push(n); delete c.reservations[n]; });
    p.fulfilledAt=new Date().toISOString();
    p.fulfillmentStatus='sold';
  }
  if(c && terminalStatuses.has(order.status) && !p.fulfilledAt){
    for(const n of p.numbers||[]){
      if(c.reservations[n]?.reservationId===p.reservationId) delete c.reservations[n];
    }
  }
}
const paymentJobs=new Map();
async function withPaymentLock(id,fn){
  const previous=paymentJobs.get(id)||Promise.resolve();
  const job=previous.catch(()=>{}).then(fn);
  paymentJobs.set(id,job);
  try{return await job;}finally{if(paymentJobs.get(id)===job) paymentJobs.delete(id);}
}
async function syncPayment(p){
  return withPaymentLock(p.reservationId,async()=>{
    if(!p.providerOrderId){
      if(!p.requestBody) return p;
      let recovered;
      try{
        recovered=await mpRequest('https://api.mercadopago.com/v1/orders',{
          method:'POST',headers:{'X-Idempotency-Key':p.reservationId},body:JSON.stringify(p.requestBody)
        });
      }catch(err){
        if(err.status>=400 && err.status<500 && ![408,409,429].includes(err.status)){
          p.status='failed';await save(state);return p;
        }
        throw err;
      }
      p.providerOrderId=recovered.id;
      applyOrder(p,recovered);
      await save(state);
    }
    const url='https://api.mercadopago.com/v1/orders/'+encodeURIComponent(p.providerOrderId);
    let order=await mpRequest(url);
    applyOrder(p,order);
    if(!p.fulfilledAt && !terminalStatuses.has(p.status) && p.expiresAt<=Date.now() &&
      ['action_required','created'].includes(order.status)){
      try{
        order=await mpRequest(url+'/cancel',{method:'POST',headers:{'X-Idempotency-Key':'cancel-'+p.reservationId}});
      }catch(err){
        // Payment can win the race with cancellation: query the authoritative result.
        order=await mpRequest(url);
      }
      applyOrder(p,order);
    }
    await save(state);
    return p;
  });
}
app.get('/api/reservations/:id',asyncRoute(async(req,res)=>{
  const p=(state.payments||[]).find(p=>p.reservationId===req.params.id);
  if(p?.provider==='mercadopago' && !p.fulfilledAt && !terminalStatuses.has(p.status)) await syncPayment(p);
  const found=findReservation(state,req.params.id);
  if(!found && !p) return res.status(404).json({error:'Reserva inexistente ou expirada.'});
  if(!found && p?.provider==='demo' && !p.fulfilledAt) return res.status(410).json({error:'Reserva expirada.'});
  const c=found?.campaign||state.campaigns.find(c=>c.id===p.campaignId);
  const numbers=found?.numbers||p.numbers;
  const expiresAt=p?.expiresAt||c.reservations[numbers[0]].expiresAt;
  res.json({reservationId:req.params.id,campaignId:c.id,numbers,expiresAt,
    total:p?.amount||numbers.length*c.price,payment:p?paymentView(p):null});
}));

app.post('/api/payments/pix',asyncRoute(async(req,res)=>{
  const {reservationId,payer={}}=req.body||{};
  if(typeof reservationId!=='string') return res.status(400).json({error:'Reserva obrigatória.'});
  const name=String(payer.first_name||'').trim();
  const phone=String(payer.phone||'').replace(/\D/g,'');
  if(!name || !/^(?:55)?\d{10,11}$/.test(phone))
    return res.status(400).json({error:'Informe seu nome e WhatsApp com DDD.'});
  const result=await withPaymentLock(reservationId,async()=>{
    const db=load();
    let p=db.payments.find(p=>p.reservationId===reservationId);
    if(p?.providerOrderId || p?.provider==='demo') return paymentView(p);
    const found=findReservation(db,reservationId);
    if(!found) throw Object.assign(new Error('Reserva inexistente ou expirada.'),{status:410});
    const {campaign,numbers}=found;
    const expiresAt=campaign.reservations[numbers[0]].expiresAt;
    if(expiresAt<=Date.now() && !p) throw Object.assign(new Error('Reserva expirada.'),{status:410});
    if(!p){
      p={id:crypto.randomUUID(),reservationId,campaignId:campaign.id,numbers:[...numbers],
        name,phone,amount:Number((numbers.length*campaign.price).toFixed(2)),expiresAt,
        provider:MP_ACCESS_TOKEN?'mercadopago':'demo',status:'creating',createdAt:new Date().toISOString()};
      if(MP_ACCESS_TOKEN){
        const email=String(payer.email||process.env.MP_PAYER_EMAIL||'').trim();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw Object.assign(new Error('Não foi possível gerar o Pix. O responsável precisa configurar o e-mail de pagamento.'),{status:400});
        p.requestBody={type:'online',external_reference:reservationId,processing_mode:'automatic',
          total_amount:p.amount.toFixed(2),description:`Rifa Certa - ${campaign.title}`,
          payer:{email,first_name:name},transactions:{payments:[{amount:p.amount.toFixed(2),
            expiration_time:'PT30M',payment_method:{id:'pix',type:'bank_transfer'}}]}};
      }
      db.payments.push(p);
    }
    // Persist the stable idempotency key and exact body BEFORE contacting the provider.
    await save(db);
    if(p.provider==='demo') return paymentView(p);
    try{
      const order=await mpRequest('https://api.mercadopago.com/v1/orders',{
        method:'POST',headers:{'X-Idempotency-Key':reservationId},body:JSON.stringify(p.requestBody)
      });
      p.providerOrderId=order.id;
      applyOrder(p,order);
      await save(db);
      return paymentView(p);
    }catch(err){
      // Keep the same request for a safe retry after a timeout or lost response.
      if(err.status>=400 && err.status<500 && ![408,409,429].includes(err.status)) p.status='failed';
      p.lastErrorAt=new Date().toISOString();
      await save(db);
      throw err;
    }
  });
  res.json(result);
}));
app.get('/api/payments/order/:id',asyncRoute(async(req,res)=>{
  const p=state.payments.find(p=>p.providerOrderId===req.params.id);
  if(!p) return res.status(404).json({error:'Pagamento não encontrado.'});
  await syncPayment(p);
  res.json({id:p.providerOrderId,...paymentView(p)});
}));
app.post('/api/webhooks/mercadopago',asyncRoute(async(req,res)=>{
  if(!validMPWebhook(req)) return res.sendStatus(401);
  const orderId=String(req.query['data.id']||req.body?.data?.[0]?.id||req.body?.data?.id||'');
  if(!orderId) return res.sendStatus(200);
  const p=state.payments.find(p=>String(p.providerOrderId)===orderId);
  // Creation may still be in flight; ask the provider to deliver again.
  if(!p) return res.sendStatus(503);
  await syncPayment(p);
  res.sendStatus(200);
}));
app.post('/api/campaign/:id/demo-confirm',asyncRoute(async(req,res)=>{
  if(MP_ACCESS_TOKEN) return res.status(403).json({error:'Simulação desativada para pagamentos reais.'});
  const p=state.payments.find(p=>p.reservationId===req.body.reservationId && p.provider==='demo' && p.campaignId===req.params.id);
  if(!p) return res.status(404).json({error:'Reserva não encontrada.'});
  if(!p.fulfilledAt){
    const found=findReservation(state,p.reservationId);
    if(!found) return res.status(410).json({error:'Reserva expirada.'});
    finalizeReservation(state,p.reservationId);
    p.status='processed'; p.statusDetail='demo_confirmed';
    p.fulfilledAt=new Date().toISOString(); p.fulfillmentStatus='sold';
    await save(state);
  }
  res.json({...paymentView(p),numbers:p.numbers});
}));
app.use((err,req,res,next)=>{
  console.error('Request error:',err.message);
  res.status(err.status>=400 && err.status<600?err.status:500)
    .json({error:'Não foi possível concluir agora. '+(err.status && err.status<500?err.message:'Tente novamente em instantes.')});
});
async function initDatabase(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
const result = await pool.query('SELECT data FROM app_state WHERE id=1');
if(result.rows.length){
  state = result.rows[0].data;
  state.payments=state.payments||[];
  for(const p of state.payments){
    const c=state.campaigns.find(c=>c.id===p.campaignId);
    p.expiresAt=p.expiresAt||c?.reservations?.[p.numbers?.[0]]?.expiresAt||Date.parse(p.createdAt)+15*60*1000;
    if(p.status==='processed' && !p.fulfillmentStatus && p.numbers?.length && p.numbers.every(n=>c?.sold.includes(n))){
      p.fulfilledAt=p.paidAt||p.createdAt;p.fulfillmentStatus='sold';
    }
  }
  state.results=state.results||[];
  for(const result of state.results){
    for(const winner of result.winners||[]){
      winner.id=winner.id||crypto.randomUUID();
      winner.prizePaid=Boolean(winner.prizePaid);
    }
  }
  await save(state);
}else{
  await pool.query('INSERT INTO app_state (id,data) VALUES (1,$1)', [state]);
}
}
async function reconcilePayments(){
  for(const p of state.payments||[]){
    if(p.provider==='mercadopago' && (p.providerOrderId||p.requestBody) && !p.fulfilledAt && !terminalStatuses.has(p.status)){
      try{await syncPayment(p);}catch(err){console.error('Payment sync:',err.message);}
    }
  }
}
if(require.main===module){
  initDatabase().then(()=>{
    app.listen(process.env.PORT||3000,()=>console.log('Rifa Certa iniciada'));
    let reconciling=false;
    setInterval(async()=>{
      if(reconciling) return;
      reconciling=true;
      try{await reconcilePayments();}finally{reconciling=false;}
    },15000).unref();
  }).catch(err=>{console.error('Database startup:',err.message);process.exitCode=1;});
}
module.exports={app,initDatabase};
