'use strict';
const {mysql,mysqlUrlFrom}=require('./db');
const {atSanMar}=require('./ssa-costs');

/** A missing inventory field is unknown, never a zero. Prices play no part. */
function stockTotal(rows){
 if(!Array.isArray(rows)||!rows.length)return null;
 let total=0;
 for(const row of rows){
  if(!row||typeof row.colorName!=='string'||typeof row.sizeName!=='string'||!Array.isArray(row.warehouses)||!row.warehouses.length)return null;
  for(const w of row.warehouses){if(!w||!['number','string'].includes(typeof w.qty)||String(w.qty).trim()===''||!Number.isSafeInteger(Number(w.qty))||Number(w.qty)<0)return null;total+=Number(w.qty);}
 }
 return total;
}
async function refreshStock({read,fetchStyle,hide,onProgress=()=>{},maxHide=10}){
 const products=await read(),report={checked:0,available:0,hidden:[],sold_out:[],unknown:[],other_supplier:[],held:false};
 const byStyle=new Map();
 for(const p of products){if(atSanMar(p.name)){report.other_supplier.push({id:p.id,name:p.name,reason:'Check SanMar availability'});continue;}
  if(!Number.isSafeInteger(Number(p.sid))||Number(p.sid)<1){report.unknown.push({id:p.id,name:p.name,reason:'Supplier style is not linked'});continue;}
  const style=Number(p.sid);if(!byStyle.has(style))byStyle.set(style,[]);byStyle.get(style).push(p);
 }
 for(const [style,products]of byStyle){let qty=null;try{qty=stockTotal(await fetchStyle(style));}catch{/* No confirmed answer: retain visibility. */}
  for(const p of products){report.checked++;if(qty===null)report.unknown.push({id:p.id,name:p.name,reason:'Supplier stock could not be confirmed'});else if(qty===0)report.sold_out.push({id:p.id,name:p.name});else report.available++;}onProgress({...report});
 }
 // Match the existing supplier sync's protection against a mass-zero feed.
 report.held=report.sold_out.length>maxHide;
 if(!report.held)for(const p of report.sold_out){await hide(p.id);report.hidden.push(p);}
 return report;
}
function stockController({invalidate=()=>{},env=process.env,db=mysql,fetcher=fetch}={}){
 let state={status:'idle',report:null,started_at:null,finished_at:null},running=null;
 async function start(){
  if(running)return running;
  if(!env.SSA_ACCOUNT||!env.SSA_API_KEY||!mysqlUrlFrom(env)){state={...state,status:'unavailable',error:'Supplier stock connection is not configured.'};return state;}
  const url=mysqlUrlFrom(env);state={status:'running',report:null,started_at:new Date().toISOString(),finished_at:null};
  running=(async()=>{try{
   let lastCall=0;
   const report=await refreshStock({
    read:async()=>db(url,"SELECT id,name,supplier_style_id sid FROM lumise_products WHERE active=1 AND supplier='ssa' ORDER BY id;",{rows:true}).map(p=>({...p,id:Number(p.id)})),
    fetchStyle:async id=>{const wait=350-(Date.now()-lastCall);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastCall=Date.now();
     const r=await fetcher('https://api.ssactivewear.com/v2/products/?styleid='+id,{headers:{Authorization:'Basic '+Buffer.from(env.SSA_ACCOUNT+':'+env.SSA_API_KEY).toString('base64'),Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Supplier unavailable');return r.json();},
    hide:async id=>{if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid product');db(url,'UPDATE lumise_products SET active=0,ssa_auto_off=NOW() WHERE id='+id+" AND active=1 AND supplier='ssa';");const rows=db(url,'SELECT active FROM lumise_products WHERE id='+id+';',{rows:true});if(rows.length!==1||Number(rows[0].active)!==0)throw Error('Stock change could not be verified');},
    onProgress:report=>{state.report=report;}
   });invalidate();state={...state,status:report.held?'review':'complete',report,finished_at:new Date().toISOString()};console.info('supplier stock refresh: '+JSON.stringify({status:state.status,checked:report.checked,available:report.available,hidden:report.hidden,sold_out:report.sold_out,unknown:report.unknown.length,other_supplier:report.other_supplier.length}));
  }catch{console.error('supplier stock refresh: failed');state={...state,status:'failed',error:'The stock refresh could not finish. Retry or check the supplier connection.',finished_at:new Date().toISOString()};}
  finally{running=null;}return state;})();return running;
 }
 return {get:()=>state,start};
}
module.exports={stockTotal,refreshStock,stockController};
