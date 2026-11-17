(function(root){
 'use strict';
 // Preview copies only. Saved SVG objects and editable source remain untouched.
 function objects(data){
  function copy(o){if(!o||!o.type)return null;const next=JSON.parse(JSON.stringify(o));if(next.type==='svg'&&typeof next.src==='string'){next.type='image';next.crossOrigin='anonymous';}if(next.objects)next.objects=(Array.isArray(next.objects)?next.objects:Object.values(next.objects)).map(copy).filter(Boolean);return next;}
  return (Array.isArray(data.objects)?data.objects:Object.values(data.objects||{})).map(copy).filter(Boolean);
 }
 function install(fabric){
  const Curve=fabric&&fabric.CurvedText;if(!Curve||Curve._jtArtworkCompat)return;
  const props=Curve.prototype._dimensionAffectingProps||[],mine=[];
  for(const k in props)if(Object.prototype.hasOwnProperty.call(props,k)){if(/^\d+$/.test(k)){if(!mine.includes(props[k]))mine.push(props[k]);}else mine[k]=props[k];}
  for(const k of ['text','fontFamily']){mine[k]=true;if(!mine.includes(k))mine.push(k);}
  Curve.prototype._dimensionAffectingProps=mine;
  // The legacy plugin returns synchronously; Fabric 2's loader needs a callback.
  const from=Curve.fromObject;Curve.fromObject=function(o,callback){const made=from.call(this,o);if(callback)callback(made);return made;};Curve._jtArtworkCompat=true;
 }
 const api={objects,install};if(typeof module==='object'&&module.exports)module.exports=api;else root.jtArtworkCompat=api;
})(typeof window==='object'?window:this);
