'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cleanDesignCard,registerDesignLibrary}=require('../tools/lib/design-library');
const good={id:7,kind:'template',name:'Family [name]',image:'https://design.jtees.net/data/art.png',link:'https://design.jtees.net/editor.php?product_base=12&library=template-7',mockups:['https://design.jtees.net/data/shot.jpg'],settings:{note:'private'}};
test('public cards omit private review settings and require the exact selected design/product',()=>{
  const c=cleanDesignCard(good);assert.equal(c.settings,undefined);assert.equal(c.link,good.link);
  for(const link of ['https://evil.test/editor.php?product_base=12&library=template-7',good.link.replace('template-7','template-8'),good.link+'&cart=123','https://design.jtees.net/ready-made.php?id=7'])assert.equal(cleanDesignCard({...good,link}),null);
  assert.equal(cleanDesignCard({...good,image:'javascript:alert(1)'}),null);
  assert.deepEqual(cleanDesignCard({...good,mockups:['javascript:bad',...good.mockups]}).mockups,good.mockups);
});
function setup(owner=true){
  const routes=new Map(),app={get(p,...h){routes.set('GET '+p,h);},post(p,...h){routes.set('POST '+p,h);}};
  let calls=0;const admin=()=>{},key=()=>{};
  registerDesignLibrary(app,{requireAdmin:admin,requireInternalKey:key,rawBody:()=>()=>{},isOwner:()=>owner,studioFetch:async()=>{calls++;throw Error('offline');},adminPage:(_,body)=>body,pageHeader:()=>'',esc:String,getCatalog:async()=>({products:[]}),pool:{query:async()=>({rows:[]})},notifyAdd:async()=>{},sendEmail:async()=>{},NOTIFY_EMAIL:'owner@example.test',invalidate:()=>{}});
  return{routes,admin,key,calls:()=>calls};
}
function res(){return{code:200,body:null,status(c){this.code=c;return this;},send(b){this.body=b;return this;},json(b){this.body=b;return this;},set(){return this;}};}
test('management routes require authentication and reject non-owner writes before contacting studio',async()=>{
  const s=setup(false),h=s.routes.get('POST /admin/design-library');assert.equal(h[0],s.admin);const r=res();await h[1]({body:{kind:'readymade',id:'7',action:'save'}},r);assert.equal(r.code,403);assert.equal(s.calls(),0);
});
test('invalid prices and unexpected fields fail before any write',async()=>{
  const s=setup(),h=s.routes.get('POST /admin/design-library')[1];
  for(const body of [{kind:'readymade',id:'7',action:'save',price_12:'NaN'},{kind:'template',id:'7',action:'publish',owner:true},{kind:'bad',id:'7',action:'save'}]){const r=res();await h({body},r);assert.equal(r.code,400);}assert.equal(s.calls(),0);
});
test('approval webhook is internal-only and validates identities',async()=>{
  const s=setup(),h=s.routes.get('POST /api/library-submission');assert.equal(h[0],s.key);const r=res();await h[1]({body:{kind:'template',id:7,revision:-1,name:'bad'}},r);assert.equal(r.code,400);
});
test('a failed public fetch is reported as unavailable rather than an empty gallery',async()=>{
  const s=setup(),r=res();await s.routes.get('GET /api/design-library')[0]({},r);assert.equal(r.code,503);assert.match(r.body.error,/could not be loaded/);
});
test('Affinity master routes accept valid files and reject bad names before forwarding',async()=>{
  const s=setup(),h=s.routes.get('POST /admin/design-library/master');assert.equal(h[0],s.admin);
  const bad=res();await h[2]({query:{kind:'template',id:'7',name:'program.php'},body:Buffer.from('bytes')},bad);assert.equal(bad.code,400);assert.equal(s.calls(),0);
  const valid=res();await h[2]({query:{kind:'template',id:'7',name:'Family.afdesign'},body:Buffer.from('bytes')},valid);
  assert.equal(s.calls(),1,'valid file reaches the authenticated studio proxy');assert.equal(valid.code,503,'an upstream failure cannot report a successful upload');
});
