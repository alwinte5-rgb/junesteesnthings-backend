(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JteesSeasonal=factory();})(typeof window==='object'?window:this,function(){
 'use strict';
 function day(now){var p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now||new Date()),v={};p.forEach(function(x){v[x.type]=x.value;});return v.year+'-'+v.month+'-'+v.day;}
 function date(y,m,d){return new Date(Date.UTC(y,m-1,d));}
 function nth(y,m,w,n){var first=date(y,m,1);return 1+(w-first.getUTCDay()+7)%7+(n-1)*7;}
 function holidays(now){var today=day(now),y=Number(today.slice(0,4)),base=new Date(today+'T00:00:00Z').getTime(),out=[];
  function add(year,m,d,id,label,re,end){var start=date(year,m,d),finish=end?date(year,end[0],end[1]):start,days=Math.round((start.getTime()-base)/86400000);if(finish.getTime()>=base&&days<=60)out.push({id:id,label:label,days:Math.max(0,days),match:re});}
  for(var year=y;year<=y+1;year++){
   add(year,1,1,'new-year','New Year',/new[\s_-]*year|\bnye\b/i);
   add(year,2,1,'black-history','Black History Month',/black history|black hostory|black culture|melanin|black pride/i,[2,new Date(Date.UTC(year,2,0)).getUTCDate()]);
   add(year,2,14,'valentines','Valentine’s Day',/valentine|love and romance/i);
   add(year,5,nth(year,5,0,2),'mothers-day','Mother’s Day',/mother.?s? day|mom life|momlife|mama|\bmom\b/i);
   add(year,4,15,'graduation','Graduation Season',/graduat|class of|senior 20/i,[6,30]);
   add(year,6,nth(year,6,0,3),'fathers-day','Father’s Day',/father.?s? day|dad life|dadlife|\bdad\b/i);
   add(year,6,19,'juneteenth','Juneteenth',/juneteenth|freedom day/i);
   add(year,7,4,'independence','Independence Day',/independence day|4th of july|fourth of july|red white.*blue/i);
   add(year,10,31,'halloween','Halloween',/halloween|spooky|trick or treat|witch|pumpkin/i);
   add(year,11,nth(year,11,4,4),'thanksgiving','Thanksgiving',/thanksgiving|thankful|\bturkey\b/i);
   add(year,11,nth(year,11,4,4)+1,'black-friday','Black Friday',/black friday|cyber monday/i);
   add(year,12,25,'christmas','Christmas',/christmas|santa|xmas|merry|holly jolly|gingerbread|reindeer|snowman/i);
  }return out.sort(function(a,b){return a.days-b.days||a.id.localeCompare(b.id);});
 }
 function hash(s){var n=2166136261;for(var i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619);}return n>>>0;}
 function groups(items,now){var events=holidays(now),stamp=day(now),buckets=events.map(function(e){return{holiday:e,items:[]};});
  var seen=new Set();items.forEach(function(r){var key=r.kind+'|'+String(r.name||'').toLowerCase();if(seen.has(key))return;seen.add(key);if(/^(?:artwork|asset)\s*\d|^\d[\d\s—-]*$/i.test(r.name||''))return;var text=(r.name||'')+' '+(r.collection||'');for(var i=0;i<buckets.length;i++){if(buckets[i].holiday.match.test(text)){buckets[i].items.push(r);break;}}});
  return buckets.filter(function(b){return b.items.length;}).map(function(b){b.items.sort(function(a,c){return hash(stamp+a.kind+a.id)-hash(stamp+c.kind+c.id)||a.id-c.id;});return b;});
 }
 function mixed(items,now){var b=groups(items,now),out=[],at=0,more=true;while(more){more=false;b.forEach(function(g){if(g.items[at]){out.push(g.items[at]);more=true;}});at++;}return out;}
 function order(items,now){var first=mixed(items,now),used=new Set(first.map(function(r){return r.kind+'-'+r.id;}));return first.concat(items.filter(function(r){return !used.has(r.kind+'-'+r.id);}).sort(function(a,b){return Number(b.featured)-Number(a.featured)||a.name.localeCompare(b.name,'en',{numeric:true})||a.id-b.id;}));}
 return{day:day,holidays:holidays,groups:groups,mixed:mixed,order:order};
});
