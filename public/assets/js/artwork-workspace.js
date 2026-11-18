(function(){
 'use strict';
 const root=document.getElementById('aw-content'),status=document.getElementById('aw-status'),owner=root.dataset.owner==='1',query=new URLSearchParams(location.search);
 root.replaceChildren();
 let items=[],limit=24,batching=false,stopped=false;
 function el(tag,text,parent){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(parent)parent.appendChild(n);return n;}
 function link(parent,text,url){const a=el('a',text,parent);a.href=url;return a;}
 function message(text){status.textContent=text;}
 async function api(path,item,body,type){const r=await fetch('/admin/artwork/'+path+(item?'?'+new URLSearchParams({kind:item.kind,id:item.id}):''),body?{method:'POST',headers:{'Content-Type':type||'application/json'},body:type?body:JSON.stringify(body)}:{});let b;try{b=await r.json();}catch(e){throw Error('The server returned an unreadable response.');}if(!r.ok||!b.ok)throw Error(b.error||'The change could not be verified.');return b;}
 const key=r=>r.kind+'-'+r.id;
 const editable=r=>owner||r.status!=='live';
 function filtered(){const q=search.value.toLowerCase().trim();return items.filter(r=>(!query.get('kind')||r.kind===query.get('kind'))&&(!query.get('review')||r.needs_review)&&(!query.get('preview')||r.needs_art_preview)&&(!query.get('missing')||r.needs_source)&&(!q||(r.name+' '+r.collection).toLowerCase().includes(q)));}
 function replace(r){items=items.map(old=>key(old)===key(r)?r:old);}
 async function timed(promise,ms,label){let t;try{return await Promise.race([promise,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(t);}}
 function objectList(d){return (Array.isArray(d.objects)?d.objects:Object.values(d.objects||{})).filter(o=>o&&o.type);}
 async function loadFont(o,base){
  if(!o.fontFamily||!o.font)return;
  let urls=[],family=decodeURIComponent(o.fontFamily);
  if(Array.isArray(o.font)){const css=await timed(fetch('https://fonts.googleapis.com/css?family='+encodeURIComponent(family)+':'+encodeURIComponent(String(o.font[1]||'400'))+':'+encodeURIComponent(String(o.font[0]||'latin'))).then(r=>{if(!r.ok)throw Error('Font unavailable');return r.text();}),12000,'A font could not be loaded.');urls=[...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(m=>m[1]);}
  else if(typeof o.font==='string'){let url=o.font.trim();if(url.startsWith('data:text/plain;'))url=url.replace('data:text/plain;','data:font/truetype;charset=utf-8;');if(!/^(https:|data:font\/)/.test(url))url=new URL(url,base).href;urls=[url];}
  if(!urls.length)throw Error('This font needs the original designer.');
  for(const url of urls){if(!/^(https:|data:font\/)/.test(url))throw Error('Unsupported font address.');const face=new FontFace(family,'url('+JSON.stringify(url)+')',{weight:String(o.fontWeight||'normal'),style:o.fontStyle||'normal'});await timed(face.load(),12000,'A font could not be loaded.');document.fonts.add(face);}
 }
 async function renderArt(data,base){
  if(!window.fabric)throw Error('The designer renderer did not load. Reload and retry.');
  window.jtArtworkCompat.install(fabric);
  const objects=window.jtArtworkCompat.objects(data),z=data.limit_zone||{};
  if(!objects.length||!(Number(z.width)>0)||!(Number(z.height)>0))throw Error('No artwork in this saved print area.');
  if(objects.some(o=>!fabric.util.getKlass(o.type)))throw Error('This design uses an object that needs the original designer.');
  // Match the existing editor renderer; never substitute a font silently.
  for(const o of objects){if(o.type==='image')o.crossOrigin='anonymous';await loadFont(o,base);}
  if([z.width,z.height,z.left||0,z.top||0].some(v=>!Number.isFinite(Number(v)))||Math.max(Number(z.width),Number(z.height))>6000)throw Error('This print area needs the original designer.');
  const canvas=new fabric.StaticCanvas(null,{width:Math.min(12000,Math.ceil(Number(z.left||0)+Number(z.width))),height:Math.min(12000,Math.ceil(Number(z.top||0)+Number(z.height))),enableRetinaScaling:false});
  try{await timed(new Promise(resolve=>canvas.loadFromJSON({objects},resolve)),20000,'An image could not be loaded.');if(canvas.getObjects().length!==objects.length||canvas.getObjects().some(o=>o.type==='image'&&(!o.width||!o.height)))throw Error('An artwork image is missing.');canvas.renderAll();const url=canvas.toDataURL({format:'png',left:Number(z.left)||0,top:Number(z.top)||0,width:Number(z.width),height:Number(z.height),multiplier:Math.min(4,1400/Math.max(Number(z.width),Number(z.height)))}),im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const pixels=x.getImageData(0,0,c.width,c.height).data;if(!pixels.some((v,i)=>i%4===3&&v>8))throw Error('This saved print area is blank.');return await new Promise(resolve=>c.toBlob(resolve,'image/png'));}finally{canvas.dispose();}
 }
 async function prepare(r){const source=await api('source',r);if(!source.stages.length)throw Error('No artwork objects in this saved template.');const art=await renderArt(source.stages[0].data,source.upload_url);if(!art)throw Error('The artwork could not be rendered.');const b=await api('preview',r,art,'image/png');replace(b.item);return b.item;}
 const search=el('input',null,root);search.type='search';search.placeholder='Search artwork';search.setAttribute('aria-label','Search artwork');search.oninput=()=>{limit=24;draw();};
 const batch=el('button','Prepare missing previews',root);batch.type='button';
 const stop=el('button','Stop after current design',root);stop.type='button';stop.hidden=true;stop.onclick=()=>{stopped=true;stop.disabled=true;};
 const report=el('div',null,root),count=el('p','',root),grid=el('div',null,root);grid.className='sc-list';
 const more=el('button','Show more',root);more.type='button';more.onclick=()=>{limit+=24;draw();};
 batch.onclick=async()=>{if(batching)return;batching=true;stopped=false;batch.disabled=true;stop.disabled=false;stop.hidden=false;report.replaceChildren();let saved=0,failed=0;const queue=filtered().filter(r=>r.kind!=='clipart'&&r.needs_art_preview&&editable(r));try{for(const r of queue){if(stopped)break;message('Preparing '+r.name+' ('+(saved+failed+1)+' of '+queue.length+')');try{await prepare(r);saved++;}catch(e){failed++;const p=el('p',r.name+': '+e.message,report);link(p,' Open artwork',r.link||'/admin/design-library?item='+key(r));}draw();}message(saved+' previews saved · '+failed+' need attention'+(stopped?' · stopped':'')+'. Existing screenshots and prices are retained.');}finally{batching=false;batch.disabled=false;stop.hidden=true;}};
 function draw(){grid.replaceChildren();const found=filtered();count.textContent=found.length+' matching artwork items';more.hidden=limit>=found.length;batch.hidden=!found.some(r=>r.kind!=='clipart'&&r.needs_art_preview&&editable(r));for(const r of found.slice(0,limit)){const card=el('article',null,grid);card.className='sc-item';if(r.image){const img=el('img',null,card);img.src=r.image;img.alt=r.name;img.loading='lazy';}else el('p','Artwork preview needed',card);el('h2',r.name,card);el('p',r.kind+' · '+r.status+' · '+(r.collection||'Collection needed'),card);if(r.needs_source)el('p','The original source file is missing. Replace or restore the artwork before publishing.',card);else if(r.needs_review)el('p','Name and collection need review',card);if(r.link){const a=link(card,'Open in designer / submit for approval',r.link);a.target='_blank';a.rel='noopener';}if(owner)link(card,'Prices, mockups & publication','/admin/design-library?item='+key(r));
   if(editable(r)){const form=el('form',null,card),nl=el('label','Artwork title',form),name=el('input',null,nl),cl=el('label','Collection',form),collection=el('input',null,cl);name.value=r.name;name.required=true;name.maxLength=120;collection.value=r.collection||'';collection.maxLength=60;const save=el('button','Save title & collection',form);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const b=await api('save',r,{name:name.value,collection:collection.value,revision:r.revision});replace(b.item);message('Title and collection saved.');draw();}catch(e){message(e.message);}finally{save.disabled=false;}};
    if(r.kind!=='clipart'&&r.needs_art_preview){const prep=el('button','Prepare artwork preview',card);prep.type='button';prep.onclick=async()=>{prep.disabled=true;message('Preparing '+r.name+'…');try{await prepare(r);message('Artwork-only preview saved.');draw();}catch(e){message(e.message);}finally{prep.disabled=false;}};}}
  }if(!found.length)el('p','No artwork matches these filters.',grid);}
 api('data').then(b=>{items=b.items.sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));root.setAttribute('aria-busy','false');draw();}).catch(e=>{message(e.message);root.setAttribute('aria-busy','false');});
})();
