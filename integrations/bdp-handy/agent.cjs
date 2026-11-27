'use strict'
// Dedicated BDP Handy executor. Default mode is read-only probe.
// The live mode is deliberately NOT installed as a service until a supervised order is verified.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const {spawnSync} = require('node:child_process')
const ROOT = path.join('C:', 'Users','Pos','Desktop','AgenteBDP')
const ADB = path.join(ROOT,'android-remote-tools','platform-tools','adb.exe')
const SNAPSHOT = path.join(ROOT,'android-remote-tools','snapshot-mesa-readonly.cjs')
const SERIAL = '0359b0140404'
const PACKAGE = 'ibernyx.bdp.androidhandy'
const REMOTE_XML = '/sdcard/marbella-handy-agent.xml'
const BASE = 'https://marbella-app.vercel.app'
const API = '/api/staff/bdp/agent'
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms))
function run(file,args,timeout=15000){
  const p=spawnSync(file,args,{encoding:'utf8',timeout,windowsHide:true,maxBuffer:4*1024*1024})
  if(p.error||p.status!==0)throw Error('Local command failed: '+path.basename(file))
  return p.stdout
}
const adb=(...args)=>run(ADB,['-s',SERIAL,...args])
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,x=>{
  const map={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}
  if(map[x])return map[x]
  const n=x.startsWith('&#x')?parseInt(x.slice(3,-1),16):parseInt(x.slice(2,-1),10)
  return Number.isFinite(n)?String.fromCodePoint(n):x
})
function nodes(xml){
  if(!xml.includes('<hierarchy')||!xml.includes('</hierarchy>'))throw Error('UI dump incomplete')
  const result=[],stack=[]
  for(const m of xml.matchAll(/<node\b[^>]*>|<\/node>/g)){
    if(m[0]==='</node>'){stack.pop();continue}
    const a={}
    for(const v of m[0].matchAll(/([\w-]+)="([^"]*)"/g))a[v[1]]=decode(v[2])
    const n={...a,ancestors:stack.map(v=>v['resource-id'])}
    result.push(n)
    if(!m[0].endsWith('/>'))stack.push(n)
  }
  return result
}
function screen(){
  adb('shell','rm','-f',REMOTE_XML)
  const out=adb('shell','uiautomator','dump',REMOTE_XML)
  if(!out.includes('dumped to:'))throw Error('UI dump failed')
  return nodes(adb('shell','cat',REMOTE_XML))
}
function find(ui,id){
  const full=PACKAGE+':id/'+id
  const matches=ui.filter(n=>n['resource-id']===full&&n.enabled==='true'&&n.bounds!=='[0,0][0,0]')
  if(matches.length!==1)throw Error('Expected unique visible control: '+id)
  return matches[0]
}
function click(ui,id){
  const n=find(ui,id), b=n.bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)
  if(!b||+b[3]<=+b[1]||+b[4]<=+b[2])throw Error('Invalid button bounds')
  adb('shell','input','tap',String(Math.floor((+b[1]+ +b[3])/2)),String(Math.floor((+b[2]+ +b[4])/2)))
}
function cents(raw){
  const s=String(raw).trim().replace(/\s|€/g,'')
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(s))throw Error('Unexpected monetary format')
  return Math.round(Number(s.replace(',','.'))*100)
}
function focus(activity){
  const out=adb('shell','dumpsys','window')
  return out.split(/\r?\n/).some(l=>l.includes('mCurrentFocus=')&&l.includes(PACKAGE+'/'+PACKAGE+'.'+activity+'}'))
}
function readiness(){
  try{
    if(adb('get-state').trim()!=='device'||!focus('PpalActivity'))return {ready:false,detail:'Handy fuera del menú principal'}
    const ui=screen()
    find(ui,'btn_AbrirMesa')
    if(find(ui,'textViewSalon').text!=='Terrassa')return {ready:false,detail:'Salón interno Handy inesperado'}
    const tcp=run('netstat.exe',['-ano','-p','tcp'])
    if(!tcp.split(/\r?\n/).some(l=>l.includes('192.168.1.100:50000')&&l.includes('LISTENING')))return {ready:false,detail:'BDP no escucha en el puerto 50000'}
    return {ready:true,detail:'Handy USB y menú BDP verificados'}
  }catch{return {ready:false,detail:'No se ha podido verificar Handy'}}
}
function snapshot(mesa){
  // Independent SELECT-only reconciliation. Never uses telemetry or writes to BDP SQL.
  const out=run(process.execPath,[SNAPSHOT,'--mesa='+mesa,'--salon=1'],30000)
  const s=JSON.parse(out.slice(out.indexOf('{'),out.lastIndexOf('}')+1))
  if(s.status!=='SNAPSHOT_OK'||s.mesa!==mesa||s.headers>1||!Array.isArray(s.lineSummary)||!Array.isArray(s.totals))throw Error('BDP snapshot ambiguous')
  return s
}
function totals(s){
  const map=new Map()
  for(const l of s.lineSummary){
    const id=Number(l.plu),q=Number(l.qty)
    if(!Number.isSafeInteger(id)||!Number.isFinite(q))throw Error('Invalid BDP lines')
    map.set(id,(map.get(id)||0)+q)
  }
  return map
}
function verifyDelta(before,after,items){
  const a=totals(before),b=totals(after),expected=new Map(items.map(x=>[x.plu,x.quantity]))
  if(after.headers!==1)return false
  for(const k of new Set([...a.keys(),...b.keys(),...expected.keys()])){
    if(Math.abs((b.get(k)||0)-(a.get(k)||0)-(expected.get(k)||0))>0.00001)return false
  }
  const expectedAmount=Math.round(items.reduce((s,x)=>s+x.price*x.quantity,0)*100)
  return Math.round(((Number(after.totals[0]?.total)||0)-(Number(before.totals[0]?.total)||0))*100)===expectedAmount
}
function checkedJob(j){
  if(!j||typeof j.id!=='string'||!Number.isSafeInteger(j.table_number)||j.table_number<1||j.table_number>9999||!Array.isArray(j.items)||!j.items.length||j.items.length>20)throw Error('Invalid job')
  const seen=new Set()
  for(const x of j.items){
    if(!Number.isSafeInteger(x.plu)||x.plu<1||x.plu>999999||seen.has(x.plu)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>20||typeof x.name!=='string'||!x.name.trim()||!Number.isFinite(x.price)||x.price<=0)throw Error('Invalid item')
    seen.add(x.plu)
  }
  if(j.items.reduce((s,x)=>s+x.quantity,0)>20)throw Error('Too many units')
}
function digits(ui,n){
  if(find(ui,'textViewCalculadora').text.trim()!=='')throw Error('Keypad not empty')
  for(const d of String(n))click(ui,'Button0'+d)
  const fresh=screen()
  if(find(fresh,'textViewCalculadora').text.trim()!==String(n))throw Error('Entered value does not match')
  return fresh
}
function tableUi(ui,mesa){
  if(!focus('ComandaActivity')||Number(find(ui,'tv_num_mesa').text)!==mesa)throw Error('Wrong table on Handy')
  return cents(find(ui,'tv_total_mesa').text)
}
function normalize(s){return String(s).normalize('NFKC').toLocaleUpperCase('es-ES').replace(/\s+/g,' ').trim()}
async function execute(job){
  let opened=false
  let changed=false
  try{
    checkedJob(job)
    if(!readiness().ready)return {status:'rejected',detail:'Handy no disponible antes de iniciar'}
    const mesa=job.table_number,before=snapshot(mesa)
    let ui=screen()
    click(ui,'btn_AbrirMesa')
    ui=screen()
    if(!ui.some(n=>n.text==='Apertura de Mesa'))throw Error('Unexpected table keypad')
    ui=digits(ui,mesa)
    opened=true // selection itself may change the session; fail closed from here.
    click(ui,'btn_dialog_ok')
    await sleep(400)
    ui=screen()
    let amount=tableUi(ui,mesa)
    if(amount!==Math.round((Number(before.totals[0]?.total)||0)*100))throw Error('BDP total differs from baseline')
    click(ui,'btn_comanda_plu')
    for(const item of job.items)for(let i=0;i<item.quantity;i++){
      ui=screen()
      tableUi(ui,mesa)
      find(ui,'LinearLayoutEntradaPLU')
      if(find(ui,'textViewCalculadora').text.trim()!=='')click(ui,'ButtonBorrar')
      ui=digits(screen(),item.plu)
      changed=true
      click(ui,'btn_dialog_ok')
      await sleep(350)
      ui=screen()
      amount+=Math.round(item.price*100)
      if(tableUi(ui,mesa)!==amount)throw Error('Price or quantity mismatch in Handy')
      const productText=ui.filter(n=>n.ancestors.includes(PACKAGE+':id/listViewComanda')).map(n=>normalize(n.text||'')).join(' ')
      if(!productText.includes(normalize(item.name)))throw Error('Product not visible in BDP order')
    }
    ui=screen()
    if(ui.some(n=>n['resource-id']===PACKAGE+':id/LinearLayoutEntradaPLU'))click(ui,'btn_comanda_plu')
    ui=screen()
    if(tableUi(ui,mesa)!==amount||ui.some(n=>n['resource-id']===PACKAGE+':id/LinearLayoutEntradaPLU'))throw Error('Final preview mismatch')
    // Official acceptance path. Never repeat it, even if its response is lost.
    adb('shell','input','keyevent','KEYCODE_BACK')
    await sleep(600)
    if(!focus('PpalActivity'))throw Error('Acceptance not acknowledged by Handy')
    const after=snapshot(mesa)
    if(!verifyDelta(before,after,job.items))throw Error('Independent BDP reconciliation mismatch')
    return {status:'confirmed',detail:'Comanda aceptada por Handy y conciliada con BDP'}
  }catch(e){
    // A possible write or opened session must never be automatically retried or cancelled.
    return {status:opened||changed?'uncertain':'rejected',detail:opened||changed?'Revisar físicamente Handy y BDP antes de otra comanda.':'No se inició la operación en BDP.'}
  }
}
async function signed(body){
  const raw=JSON.stringify(body),time=String(Date.now())
  const key=fs.readFileSync(path.join(__dirname,'agent-private.pem'))
  const sig=crypto.sign(null,Buffer.from(['POST',API,time,raw].join('\n')),key).toString('base64')
  const res=await fetch(BASE+API,{method:'POST',headers:{'Content-Type':'application/json','x-handy-timestamp':time,'x-handy-signature':sig},body:raw,signal:AbortSignal.timeout(10000)})
  if(!res.ok)throw Error('BDP queue HTTP '+res.status)
  return res.json()
}
// Retry transport and result acknowledgements only, never a Handy operation.
async function retryTransport(body){
  let delay=2000
  for(;;){
    try{return await signed(body)}
    catch(e){
      console.error(new Date().toISOString(),'Transport:',e instanceof Error?e.message:'Unknown error')
      await sleep(delay)
      delay=Math.min(delay*2,30000)
    }
  }
}
async function loop(){
  const lock=path.join(__dirname,'handy-agent.lock')
  const fd=fs.openSync(lock,'wx')
  const journal=path.join(__dirname,'unacknowledged-result.json')
  try{
    for(;;){
      if(fs.existsSync(journal)){
        const body=JSON.parse(fs.readFileSync(journal,'utf8'))
        await retryTransport(body)
        fs.unlinkSync(journal)
        if(body.status==='uncertain')return
      }
      const status=readiness()
      let response
      try{response=await signed({action:'poll',...status})}
      catch(e){
        console.error(new Date().toISOString(),'Poll:',e instanceof Error?e.message:'Unknown error')
        await sleep(5000)
        continue // A lost claim remains executing on the server; never reclaim it.
      }
      const {job}=response
      if(job){
        const result=await execute(job)
        const body={action:'result',id:job.id,...result}
        fs.writeFileSync(journal,JSON.stringify(body),{flag:'wx'})
        await retryTransport(body)
        fs.unlinkSync(journal)
        if(result.status==='uncertain')return
      }
      await sleep(2500)
    }
  }finally{fs.closeSync(fd);fs.unlinkSync(lock)}
}
if(require.main===module){
  if(process.argv.includes('--live')) {
    // No unattended live startup until supervised end-to-end verification.
    if(process.env.BDP_HANDY_SUPERVISED_PILOT!=='1'){console.error('Live mode requires supervised pilot authorization');process.exitCode=2}
    else loop().catch(e=>{console.error(new Date().toISOString(),'Handy agent stopped; inspect queue and local journal:',e instanceof Error?e.message:'Unknown error');process.exitCode=1})
  }else console.log(JSON.stringify({mode:'probe',...readiness(),writes:false}))
}
module.exports={nodes,cents,verifyDelta,checkedJob,readiness}
