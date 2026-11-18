'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),seasonal=require('../public/assets/js/seasonal-designs');
const now=new Date('2026-11-18T05:00:00Z');
const item=(id,name,collection='')=>({id,kind:'template',name,collection,image:'https://design.jtees.net/data/'+id+'.png',link:'https://design.jtees.net/editor.php?product_base=12&library=template-'+id,mockups:[],featured:false});
test('upcoming holidays mix rather than one collection taking every first slot',()=>{const r=seasonal.mixed([item(1,'Thanksgiving Turkey'),item(2,'Thankful Family'),item(3,'Family Christmas'),item(4,'Santa’s Favorite'),item(5,'Happy New Year')],now);assert.deepEqual(r.slice(0,3).map(r=>/thank|turkey/i.test(r.name)?'thanksgiving':/christmas|santa/i.test(r.name)?'christmas':'new-year'),['thanksgiving','christmas','new-year']);assert.equal(new Set(r.map(r=>r.id)).size,5);assert.deepEqual(r,seasonal.mixed(r,now));});
test('Chicago date, expired holidays and year rollover are respected',()=>{assert.equal(seasonal.day(now),'2026-11-17');assert.equal(seasonal.mixed([item(1,'Halloween Pumpkin')],now).length,0);assert.equal(seasonal.groups([item(1,'Happy New Year')],new Date('2026-12-30T18:00:00Z'))[0].holiday.id,'new-year');});
test('month-long occasions remain featured during the month and ambiguous asset names stay out',()=>{assert.equal(seasonal.mixed([item(1,'Black History Month')],new Date('2027-02-20T18:00:00Z')).length,1);assert.equal(seasonal.mixed([item(2,'Asset 99','Christmas')],now).length,0);});
test('evergreen owner features remain available when no seasonal artwork matches',()=>{const a=item(1,'Business Logo'),b={...item(2,'Wedding Design'),featured:true};assert.deepEqual(seasonal.order([a,b],now).map(r=>r.id),[2,1]);});
module.exports={item,now};
