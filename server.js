const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Pool } = require('pg');
const app = express();
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));

const DB = path.join(__dirname,'data.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sessions = new Map();

const uploadDir = path.join(__dirname,'uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadDir),
  filename:(req,file,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(5).toString('hex')+path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
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
    sold:[13,17,33,64,63],
    reservations:{},
    createdAt:new Date().toISOString()
  }], payments:[]};
}
let state = initial();
function load(){ return state; }

  

function save(db){
  state=db;
  pool.query(
    'INSERT INTO app_state (id,data) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data',
    [db]
  ).catch(err=>console.error('DB save error',err));
}
function clean(c){
  const now=Date.now();
  for(const [n,r] of Object.entries(c.reservations||{})){
    if(r.expiresAt<=now) delete c.reservations[n];
  }
}
function tokenFrom(req){ return (req.headers.authorization||'').replace(/^Bearer\s+/,''); }
function requireAdmin(req,res,next){
  const t=tokenFrom(req);
  if(!sessions.has(t)) return res.status(401).json({error:'Faça login no painel.'});
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
  const dataId=rawDataId || '';
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
  const r=await fetch(url,{...options,headers});
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
  const token=crypto.randomBytes(32).toString('hex');
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
app.get('/api/campaign/:id',(req,res)=>{
  const db=load();
  const c=db.campaigns.find(x=>x.id===req.params.id);
  if(!c || c.status!=='ativa') return res.sendStatus(404);
  clean(c); save(db);
  res.json({...c,reservations:Object.keys(c.reservations||{}).map(Number)});
});

app.post('/api/admin/upload',requireAdmin,upload.single('image'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Envie JPG, PNG ou WEBP de até 5 MB.'});
  res.json({url:'/uploads/'+req.file.filename});
});
app.get('/api/admin/campaigns',requireAdmin,(req,res)=>{
  const db=load(); db.campaigns.forEach(clean); save(db);
  res.json(db.campaigns.map(c=>({...c,reservations:Object.keys(c.reservations||{}).map(Number)})));
});
app.post('/api/admin/campaigns',requireAdmin,(req,res)=>{
  const {title,prize,type='numeros',price,totalTickets,imageUrl=''}=req.body;
  if(!title||!prize||!Number(price)||!Number(totalTickets))
    return res.status(400).json({error:'Preencha os campos obrigatórios.'});
  const db=load();
  const c={
    id:crypto.randomUUID(),title,prize,type,price:Number(price),
    totalTickets:Number(totalTickets),status:'ativa',sold:[],
    reservations:{},imageUrl,createdAt:new Date().toISOString()
  };
  db.campaigns.push(c); save(db); res.json(c);
});
app.patch('/api/admin/campaign/:id/status',requireAdmin,(req,res)=>{
  const db=load(); const c=db.campaigns.find(x=>x.id===req.params.id);
  if(!c) return res.sendStatus(404);
  if(!['ativa','pausada','encerrada'].includes(req.body.status))
    return res.status(400).json({error:'Status inválido.'});
  c.status=req.body.status; save(db); res.json({ok:true,status:c.status});
});

app.post('/api/campaign/:id/reserve',(req,res)=>{
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
  save(db);
  res.json({reservationId,numbers:nums,expiresAt,total:nums.length*c.price});
});

app.post('/api/payments/pix',(req,res)=>{
  (async()=>{
    const {reservationId,payer={}}=req.body||{};
    if(!reservationId) return res.status(400).json({error:'Reserva obrigatória.'});
    const db=load();
    const found=findReservation(db,reservationId);
    if(!found) return res.status(404).json({error:'Reserva inexistente ou expirada.'});
    const {campaign,numbers}=found;
    const amount=(numbers.length*campaign.price).toFixed(2);

    if(!MP_ACCESS_TOKEN){
      return res.json({
        mode:'demo',
        reservationId,
        amount:Number(amount),
        message:'Mercado Pago ainda não configurado. Cadastre MP_ACCESS_TOKEN para gerar Pix real.'
      });
    }

    if(!payer.phone || !payer.first_name)
      return res.status(400).json({error:'Nome e WhatsApp são obrigatórios para gerar o Pix.'});

    const idem=crypto.randomUUID();
    const body={
      type:'online',
      external_reference:reservationId,
      processing_mode:'automatic',
      total_amount:amount,
      description:`Rifa Certa - ${campaign.title}`,
      payer:{
        email:process.env.MP_PAYER_EMAIL,
        first_name:payer.first_name,
        ...(payer.last_name?{last_name:payer.last_name}:{})
      },
      transactions:{
        payments:[{
          amount,
          payment_method:{id:'pix',type:'bank_transfer'}
        }]
      }
    };

    const order=await mpRequest('https://api.mercadopago.com/v1/orders',{
      method:'POST',
      headers:{'X-Idempotency-Key':idem},
      body:JSON.stringify(body)
    });
    const payment=order.transactions?.payments?.[0]||{};
    const pm=payment.payment_method||{};

    db.payments.push({
      id:crypto.randomUUID(),
      reservationId,
      campaignId:campaign.id,
      provider:'mercadopago',
      providerOrderId:order.id,
      amount:Number(amount),
      status:order.status,
      statusDetail:order.status_detail,
      createdAt:new Date().toISOString()
    });
    save(db);

    res.json({
      mode:'mercadopago',
      orderId:order.id,
      status:order.status,
      statusDetail:order.status_detail,
      amount:Number(amount),
      qrCode:pm.qr_code||'',
      qrCodeBase64:pm.qr_code_base64||'',
      ticketUrl:pm.ticket_url||''
    });
  })().catch(err=>{
    console.error(err);
    res.status(err.status||500).json({error:err.message,details:err.details||undefined});
  });
});

app.get('/api/payments/order/:id',(req,res)=>{
  (async()=>{
    const order=await mpRequest(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(req.params.id)}`);
    res.json({id:order.id,status:order.status,statusDetail:order.status_detail});
  })().catch(err=>res.status(err.status||500).json({error:err.message}));
});

app.post('/api/webhooks/mercadopago',(req,res)=>{
  (async()=>{
    if(!validMPWebhook(req)) return res.sendStatus(401);

    const orderId=(req.query['data.id'] || req.body?.data?.[0]?.id || req.body?.data?.id || '').toString();
    if(!orderId) return res.sendStatus(200);

    const order=await mpRequest('https://api.mercadopago.com/v1/orders/'+encodeURIComponent(orderId));
    const db=load();

    const paymentRow=db.payments.find(p=>p.providerOrderId===order.id);
    if(paymentRow){
      paymentRow.status=order.status;
      paymentRow.statusDetail=order.status_detail;
      paymentRow.updatedAt=new Date().toISOString();
    }

    if(order.status==='processed' && order.status_detail==='accredited'){
      const reservationId=order.external_reference;
      const finalized=finalizeReservation(db,reservationId);
      if(paymentRow) paymentRow.paidAt=new Date().toISOString();
      if(finalized) paymentRow && (paymentRow.numbers=finalized.numbers);
    }
    save(db);
    res.sendStatus(200);
  })().catch(err=>{
    console.error('Webhook error',err);
    res.sendStatus(500);
  });
});

app.post('/api/campaign/:id/demo-confirm',(req,res)=>{
  const db=load();
  const finalized=finalizeReservation(db,req.body.reservationId);
  if(!finalized) return res.status(404).json({error:'Reserva expirada ou inexistente.'});
  save(db);
  res.json({ok:true,numbers:finalized.numbers});
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
}else{
  await pool.query('INSERT INTO app_state (id,data) VALUES (1,$1)', [state]);
}
}
initDatabase().then(()=>{
  app.listen(3000,()=>console.log('Rifa Certa v0.5 em http://localhost:3000'));
});
