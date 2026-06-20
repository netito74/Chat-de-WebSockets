'use strict';
/**
 * Prueba de carga/estres — Agora Socket.IO (v3)
 * Pre-registra usuarios secuencialmente, luego conecta VUs en etapas
 * crecientes. El rastreador de latencias es un objeto compartido y
 * mutable para que los VUs creados en etapas anteriores sigan
 * contribuyendo a la medicion de la etapa actual.
 */
const { io }    = require('socket.io-client');
const { execSync } = require('child_process');
const fs        = require('fs');
const path      = require('path');

const BACKENDS   = (process.env.BACKENDS || 'http://localhost:3000,http://localhost:3001').split(',');
const STAGES     = (process.env.STAGES   || '20,50,100,150,200').split(',').map(Number);
const STAGE_MS   = +( process.env.STAGE_MS   || 18000);
const MSG_INTVL  = +( process.env.MSG_INTVL  || 3500 );
const MAX_USERS  = Math.max(...STAGES);

// Objeto mutable compartido; las etapas lo resetean al inicio.
const tracker = { latencies: [], errors: { connect:0, send:0 } };

function pids() {
  try { return [...new Set([...execSync("ss -ltnp 2>/dev/null|grep -E ':300[01]'").toString().matchAll(/pid=(\d+)/g)].map(m=>m[1]))]; }
  catch { return []; }
}
function sample(ps) {
  if (!ps.length) return [];
  try { return execSync(`ps -o pid,%cpu,rss -p ${ps.join(',')} --no-headers`).toString().trim().split('\n').filter(Boolean).map(l=>{const[p,c,r]=l.trim().split(/\s+/);return{pid:p,cpu:+c,rss:+r};}); }
  catch { return []; }
}

async function preRegister(n) {
  process.stdout.write(`\nPre-registrando ${n} usuarios... `);
  const tokens=[], base=`u${Date.now().toString(36)}`;
  for (let i=0;i<n;i++) {
    const be = BACKENDS[i % BACKENDS.length];
    try {
      const r = await fetch(`${be}/api/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:`${base}${i}`,password:'pass1234',preferredLang:i%2?'en':'es'})});
      if (r.ok) { const {token}=await r.json(); tokens.push({token,be}); }
    } catch {}
  }
  console.log(`${tokens.length}/${n} OK`);
  return tokens;
}

function makeVU({token,be}) {
  const pending=new Map();
  let interval=null, alive=true;
  const s = io(be,{auth:{token},reconnection:false,timeout:8000});
  s.on('connect_error',()=>tracker.errors.connect++);
  s.on('message:new',msg=>{
    const t=pending.get(msg.clientMsgId);
    if(t){tracker.latencies.push(Date.now()-t);pending.delete(msg.clientMsgId);}
  });
  s.on('connect',()=>{
    const jitter=Math.random()*1000;
    interval=setInterval(()=>{
      if(!alive||!s.connected)return;
      const id=`${s.id}_${Date.now()}`;
      pending.set(id,Date.now());
      s.emit('message:send',{conversationId:'public',content:'lt-ping',clientMsgId:id},
        r=>{ if(!r?.ok) tracker.errors.send++; });
    }, MSG_INTVL+jitter);
  });
  return {stop(){alive=false;clearInterval(interval);s.removeAllListeners();s.disconnect();}};
}

async function runStage(tokens, n, vus, results) {
  // Resetear tracker para esta etapa
  tracker.latencies=[];
  tracker.errors={connect:0,send:0};

  // Activar VUs nuevos hasta objetivo
  while(vus.length < n && vus.length < tokens.length) vus.push(makeVU(tokens[vus.length]));
  console.log(`\n═══ Etapa ${n} usuarios ═══  activos=${vus.length}  nodos=${pids().join(',')}`);

  // Medir STAGE_MS ms
  const snapshots=[], t0=Date.now();
  while(Date.now()-t0 < STAGE_MS){ snapshots.push(sample(pids())); await new Promise(r=>setTimeout(r,2000)); }

  const L=tracker.latencies.sort((a,b)=>a-b);
  const p=pct=>L[Math.min(L.length-1,Math.floor(pct/100*L.length))]??null;
  const cpus=snapshots.flat().map(s=>s.cpu), rss=snapshots.flat().map(s=>s.rss);
  const res={
    targetUsers:n, activeVUs:vus.length,
    msgsAcked:L.length, totalSent:L.length+tracker.errors.send,
    sendErrRate:`${tracker.errors.send?((tracker.errors.send/(L.length+tracker.errors.send))*100).toFixed(1):0}%`,
    connectErrors:tracker.errors.connect,
    latencyMs:{p50:p(50),p90:p(90),p95:p(95),p99:p(99),max:L.at(-1)??null,samples:L.length},
    node:{
      cpuMax:cpus.length?Math.max(...cpus):null, cpuAvg:cpus.length?+(cpus.reduce((a,b)=>a+b,0)/cpus.length).toFixed(1):null,
      memMbMax:rss.length?Math.round(Math.max(...rss)/1024):null,
    },
  };
  console.log(JSON.stringify(res,null,2));
  results.push(res);
}

async function main() {
  const tokens = await preRegister(MAX_USERS);
  if (!tokens.length) { console.error('Sin tokens'); process.exit(1); }
  const vus=[], results=[];
  for (const n of STAGES) await runStage(tokens, n, vus, results);
  vus.forEach(v=>v.stop());
  const out=path.join(__dirname,'results.json');
  fs.writeFileSync(out,JSON.stringify(results,null,2));
  console.log(`\nResultados → ${out}`);
  process.exit(0);
}
main().catch(e=>{ console.error(e); process.exit(1); });
