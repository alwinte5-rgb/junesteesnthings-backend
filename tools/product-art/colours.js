/* Dump colourName + front/back image paths for a style as JSON. argv: styleID */
let b='';process.stdin.on('data',d=>b+=d);
process.stdin.on('end',async()=>{
  const e=JSON.parse(b);
  const auth='Basic '+Buffer.from(e.SSA_ACCOUNT+':'+e.SSA_API_KEY).toString('base64');
  const r=await fetch('https://api.ssactivewear.com/v2/products/?styleid='+process.argv[2],
    {headers:{Authorization:auth},signal:AbortSignal.timeout(60000)});
  const rows=await r.json(); const seen=new Map();
  for(const x of rows){
    if(!x.colorName||seen.has(x.colorName))continue;
    seen.set(x.colorName,{name:x.colorName,front:x.colorFrontImage||'',back:x.colorBackImage||'',c1:x.color1,c2:x.color2});
  }
  console.log(JSON.stringify([...seen.values()],null,1));
});
