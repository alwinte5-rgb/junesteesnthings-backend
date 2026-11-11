'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const T = require('../tools/lib/training');
const C = require('../tools/lib/courses');
const G = require('../tools/lib/training-guidance');
const S = require('../tools/lib/staff');
const CH = require('../tools/lib/team-channels');
const {audiencesFor} = require('../tools/lib/tracks');

test('every module on every path has a concrete practice task and no duplicate work keys', () => {
 for(const track of Object.keys(T.TRACKS)) {
  const steps=T.visibleSteps(undefined,track);
  const keys=steps.filter(s=>s.type!=='buffer').map(s=>s.key);
  assert.equal(new Set(keys).size,keys.length, track);
  for(const s of steps.filter(s=>s.moduleGoal)) assert.ok(G.moduleCopy(s.module),s.module);
  for(const s of steps.filter(s=>s.type==='lesson')) assert.ok(s.article && s.pages.length, s.key);
 }
});
test('dual roles preserve original learning records and the existing commission-ready key', () => {
 for(const [dual,primary] of [['sales-software','software'],['design-marketing','sales']]) {
  const original=T.visibleSteps(undefined,primary).filter(s=>s.type!=='buffer');
  const combined=T.visibleSteps(undefined,dual);
  for(const s of original) assert.ok(combined.some(n=>n.key===s.key), `${dual}: lost ${s.key}`);
  assert.equal(T.readyKeyFor(dual),T.readyKeyFor(primary));
  const ticks=new Map([['signoff:ready',{done_at:'2026-10-28T15:32:00Z'}]]);
  const p=T.progress(ticks,{},undefined,dual);
  assert.equal(p.steps.find(s=>s.key==='signoff:ready').done,true);
  assert.equal(p.complete,false,'an old signoff does not complete newly added learning');
  assert.equal(T.progress(new Map(),{},undefined,dual).steps.find(s=>s.key==='signoff:ready').locked,true);
 }
});
test('both duty areas are taught without repeating shared team lessons', () => {
 const sales=T.visibleSteps(undefined,'sales-software');
 assert.ok(sales.findIndex(s=>s.key==='lesson:s5-quotes') < sales.findIndex(s=>s.key==='lesson:w2-apps'));
 const design=T.visibleSteps(undefined,'design-marketing');
 assert.ok(design.findIndex(s=>s.key==='lesson:d2-flow') < design.findIndex(s=>s.key==='lesson:s5-quotes'));
 for(const track of ['sales-software','design-marketing']) {
  const s=T.visibleSteps(undefined,track);
  assert.equal(s.filter(x=>x.key==='lesson:team-chat').length,1);
 }
});
test('dual roles see relevant audiences, never finance-only audiences', () => {
 for(const [track,yes,no] of [['sales-software',['sales','software'],['design','bookkeeper','developer']],['design-marketing',['sales','design','content'],['software','bookkeeper','developer']]]) {
  const h={id:6,active:true,training_track:track};
  for(const a of yes)assert.equal(CH.isMember({audience:a},h,T.trackOf),true);
  for(const a of no)assert.equal(CH.isMember({audience:a},h,T.trackOf),false);
  assert.equal(CH.isMember({audience:'all',archived_at:'2026-11-01'},h,T.trackOf),false);
  assert.equal(CH.isMember({audience:'all'},{...h,active:false},T.trackOf),false);
  assert.deepEqual(audiencesFor(track).slice(1).sort(),[...yes].sort());
 }
 for(const preset of ['dual-sales','design-marketing']) {
  const p=S.presetPerms(preset);
  assert.equal(p['customers.message'].level,'approval');
  assert.equal(p['quotes.send'].level,'approval');
  assert.equal(p['finances.view'].level,'off');
 }
});
test('entry guide matches the real form and distinguishes exam checking from sending', () => {
 const src=fs.readFileSync(require('node:path').join(__dirname,'..','server.js'),'utf8');
 for(const label of ['Details, photos &amp; sizes','Check my quote','What are we making'])assert.ok(src.includes(label),label);
 for(const text of ['Check my quote','Worked example','size counts','does not retain','Front and back','Needed by'])assert.ok(G.EXAM.includes(text),text);
 assert.match(src,/exam \? 'Practice only: enter this scenario/);
 assert.match(src,/TRAINING_GUIDE\.EXAM/);
 assert.match(src,/audience = ANY\(\$1::text\[\]\)/);
});
test('new software instruction is staged and stock-body migration preserves previous wording', () => {
 const a=T.lessonArticles().find(a=>a.title==='Software sales course 2a: Our apps and their top plans');
 assert.ok(a.body.includes('Your first month: learn, practise, then sell'));
 assert.ok(a.was.some(b=>b.includes('Your job is to sell the top plans')));
 assert.ok(a.body.includes('not a guaranteed sales quota'));
 const w=T.lessonArticles().find(a=>a.title==='Software sales course 8a: How you are paid');
 assert.ok(w.body.includes('does not add, remove or change hourly pay'));
 for(const l of C.COURSES['software-core'].modules.flatMap(m=>m.lessons)) {
  if(l.existing)continue;
  const pages=T.lessonPages(l.body,l.pages);
  for(const p of pages)assert.ok(p.split(/\s+/).length<=300,l.id);
 }
});

test('the quote exam checks the requested date even when both dates have no rush', () => {
 const Q=require('../tools/lib/quote-exam');
 const sc=Q.byId('cutouts-seniors');
 const catalog={products:[],methods:[{id:31,title:'Big Head Cutout — 24in, 8-pack (full sheet)'}]};
 const line={qty:1,method_id:31};
 const right=Q.grade(sc,[line],0,catalog,{chosen:'2026-12-01',expected:'2026-12-01'});
 assert.equal(right.passed,true);
 for(const chosen of ['', '2026-12-02']) {
  const result=Q.grade(sc,[line],0,catalog,{chosen,expected:'2026-12-01'});
  assert.equal(result.passed,false);
  assert.deepEqual(result.checks.filter(c=>!c.ok).map(c=>c.what),['Needed-by date']);
 }
});
