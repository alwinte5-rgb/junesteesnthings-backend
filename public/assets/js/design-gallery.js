(function(){
  'use strict';
  var grid=document.getElementById('dg-grid'),status=document.getElementById('dg-status'),search=document.getElementById('dg-search'),collection=document.getElementById('dg-collection');
  var kind='design',items=[],stops=[];
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function card(r){
    var box=el('article','dg-card'),a=el('a','dg-art'),im=el('img');a.href=r.link;im.src=r.image;im.alt=r.name;im.loading='lazy';a.appendChild(im);box.appendChild(a);
    var images=[r.image].concat(r.mockups||[]).filter(function(v,i,arr){return arr.indexOf(v)===i;}),at=0,timer=0;
    var controls=el('div','dg-image-controls');
    function show(i){at=(i+images.length)%images.length;im.src=images[at];im.alt=r.name+(at?' — product mockup':' — artwork');Array.prototype.forEach.call(controls.children,function(b,j){b.setAttribute('aria-pressed',String(j===at));});}
    if(images.length>1){images.forEach(function(_,i){var b=el('button',null,i===0?'Artwork':'View '+i);b.type='button';b.setAttribute('aria-pressed',String(i===0));b.onclick=function(){stop();show(i);};controls.appendChild(b);});box.appendChild(controls);}
    function stop(){clearInterval(timer);timer=0;}
    stops.push(stop);
    box.addEventListener('mouseenter',function(){if(images.length>1&&window.matchMedia('(hover:hover) and (prefers-reduced-motion:no-preference)').matches){stop();show(1);timer=setInterval(function(){show(at+1);},1400);}});
    box.addEventListener('mouseleave',function(){stop();show(0);});
    var x=null,swiped=false;a.addEventListener('touchstart',function(e){x=e.changedTouches[0].clientX;swiped=false;},{passive:true});
    a.addEventListener('touchend',function(e){if(x!==null&&Math.abs(e.changedTouches[0].clientX-x)>35){swiped=true;show(at+(e.changedTouches[0].clientX<x?1:-1));}x=null;},{passive:true});
    a.addEventListener('click',function(e){if(swiped){e.preventDefault();swiped=false;}});
    var bd=el('div','dg-card-body'),h=el('h2'),title=el('a',null,r.name);title.href=r.link;h.appendChild(title);bd.appendChild(h);
    if(r.collection)bd.appendChild(el('p',null,r.collection));
    if(r.from_price!=null)bd.appendChild(el('p',null,'From $'+r.from_price.toFixed(2)+' · front printing included'));
    var go=el('a','dg-cta',r.kind==='clipart'?'Use this artwork →':'Customize this design →');go.href=r.link;bd.appendChild(go);box.appendChild(bd);return box;
  }
  function draw(){stops.forEach(function(s){s();});stops=[];grid.replaceChildren();var q=search.value.toLowerCase().trim(),c=collection.value;
    var list=items.filter(function(r){return(kind==='clipart'?r.kind==='clipart':r.kind!=='clipart')&&(!c||r.collection===c)&&(!q||(r.name+' '+r.collection).toLowerCase().indexOf(q)>-1);});
    list.sort(function(a,b){return Number(b.featured)-Number(a.featured);});list.forEach(function(r){grid.appendChild(card(r));});
    status.textContent=list.length?list.length+' '+(kind==='clipart'?'graphics':'designs'):'No matching designs yet. Try another search or ask us to create yours.';
  }
  document.querySelectorAll('[data-kind]').forEach(function(b){b.onclick=function(){kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(function(t){t.setAttribute('aria-pressed',String(t===b));});draw();};});search.oninput=draw;collection.onchange=draw;
  fetch('/api/design-library').then(function(r){if(!r.ok)throw Error();return r.json();}).then(function(d){if(!d.ok||!Array.isArray(d.items))throw Error();items=d.items;
    Array.from(new Set(items.map(function(r){return r.collection;}).filter(Boolean))).sort().forEach(function(c){var o=el('option',null,c);o.value=c;collection.appendChild(o);});draw();
  }).catch(function(){status.textContent='We couldn’t load the designs. Please refresh to try again, or contact us for help.';});
  document.addEventListener('visibilitychange',function(){if(document.hidden)stops.forEach(function(s){s();});});
})();
