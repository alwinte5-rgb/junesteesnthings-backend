/* Upload pilot art to Cloudinary. Signature computed here (the secret never
   reaches a command line); curl does the multipart, which Node's fetch was
   resetting on. */
const crypto=require('crypto'), fs=require('fs'), {spawnSync}=require('child_process');
let b='';process.stdin.on('data',d=>b+=d);
process.stdin.on('end',()=>{
  const e=JSON.parse(b);
  const cloud=e.CLOUDINARY_NAME, key=e.CLOUDINARY_API_KEY, secret=e.CLUDINARY_API_SECRET;
  if(!cloud||!key||!secret){console.error('cloudinary vars missing');process.exit(2);}
  const SP=process.env.SP, man=JSON.parse(fs.readFileSync(SP+'/pilot/manifest.json','utf8'));
  const folder='jtees/product-art/richardson-112re';
  let n=0;
  for(const r of man){
    for(const side of ['front','back']){
      const f=r[side+'_web']; if(!f) continue;
      const public_id=r.slug+'-'+side, ts=String(Math.floor(Date.now()/1000));
      const p={folder,overwrite:'true',public_id,timestamp:ts};
      const sig=crypto.createHash('sha1')
        .update(Object.keys(p).sort().map(k=>k+'='+p[k]).join('&')+secret).digest('hex');
      const args=['-sS','-X','POST','https://api.cloudinary.com/v1_1/'+cloud+'/image/upload',
        '-F','file=@'+f,'-F','api_key='+key,'-F','signature='+sig];
      for(const k of Object.keys(p)) args.push('-F',k+'='+p[k]);
      const out=spawnSync('curl',args,{encoding:'utf8',maxBuffer:1<<24});
      let d; try{d=JSON.parse(out.stdout);}catch{d=null;}
      if(!d||!d.secure_url){console.error('FAILED',public_id,(out.stdout||out.stderr||'').slice(0,200));process.exit(1);}
      r[side+'_url']=d.secure_url; n++;
      console.log('  '+public_id.padEnd(26)+String(d.bytes/1024|0).padStart(4)+'KB  '+d.width+'x'+d.height);
    }
  }
  fs.writeFileSync(SP+'/pilot/manifest.json',JSON.stringify(man,null,1));
  console.log('\nuploaded '+n+' images to '+folder);
});
