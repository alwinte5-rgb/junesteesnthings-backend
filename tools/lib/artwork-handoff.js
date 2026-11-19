'use strict';
/* One manual assignment explicitly requested by the owner. No recurring tasks,
 * no email, no new credentials, and no change to staff permissions. */
const REF='owner-artwork-handoff-2026-11-18';
const COPIES='https://drive.google.com/drive/folders/1d3gRHMYyAHk6-Uxpmc3lvHkR9a0DwFS8';
const REVISED = 'https://drive.google.com/drive/folders/1G0gHGFCFYgnSFPcJiTNgSxC-7KVPmfd6';
const BRIEF_VERSION = 2;
const DESCRIPTION = 'Work on copies. Finish Thanksgiving first, then review the flagged previews and yard signs. Use the working folder for production files and the Artwork workspace to organize and submit web drafts.';
const STEPS = [
 'THANKSGIVING PRINT FILES. Four revised PNGs are already in Revised Versions. Verify Sweet Potato, Grouchy Potato, Happy Thanksgiving Pumpkins and Thanksgiving Geese against the original editable artwork. The earlier potato files were 432×432, Pumpkins was 1080×1080, and Geese was 1774×887. Export from Affinity or a genuine high-resolution source at the size we will print. At 300 DPI, 12 × 12 inches is 3600 × 3600 pixels, and 12 × 6 inches is 3600 × 1800 pixels. Keep the artwork’s proportions and use a transparent background around the design. If the only source is a small PNG, note that you need the original or that the artwork needs rebuilding. A larger PNG export cannot restore detail. For S1–S10, check the existing files and re-export only those that cannot print at the intended size.',
 'SIX WEBSITE PREVIEWS. Open templates 139, 140, 141, 206, 207 and 234 and compare the saved artwork to the mockup. Restore any missing graphic, image or font from the working source. Make an artwork-only preview with the full design visible. A shirt or sign screenshot can be kept separately as a mockup. If the source or font is missing, record the template ID and what is needed.',
 'YARD SIGNS. Open Designer edits in the Artwork workspace and download a working copy. Keep the existing sign dimensions, check the bleed and safe margins for that sign, and test replacing the photo and editing the bracketed text such as [Name], [Year] and [School]. Use a separate replaceable mascot placeholder where the sign calls for one. Keep the background, borders and fixed art locked. The 12 × 12 regular apparel limit does not set the sign size.',
 'TITLES AND COLLECTIONS. Use a name customers can recognize, such as Happy Thanksgiving Pumpkins, and a gallery collection such as Thanksgiving or Graduation. Flag duplicates and Disney items for June instead of copying them into new drafts. Note any price or product differences for June.',
 'WHAT TO TURN IN. For a production repair, put the transparent print PNG and the editable Affinity master in Revised Versions or link to the existing master. Include an editable PDF for artwork with editable layers when Affinity handoff is needed. Open the PDF in Affinity to check it. For a website repair, include the new draft and its artwork-only preview. You do not need to reinvent the artwork or export every format for a title-only fix.',
 'HOW TO SUBMIT. In the designer, save the revised design as a copy. In Saved Designs, choose Make a template for that copy, enter its title, and choose its category. Open Artwork workspace, find the new draft, prepare the artwork preview, then click Submit draft for approval. In this task, leave the original template ID, the draft name or link, and the Drive link. June reviews and publishes.',
].join('\n\n');
const BRIEF = {
 request_ref: REF,
 artwork_brief_version: BRIEF_VERSION,
 done: ['Print repairs have verified PNGs or a note identifying the missing master.', 'Website repairs have a draft for June or a note naming the missing asset.'],
 proof: 'Add the draft links, Revised Versions links, and any blocked template IDs when you complete this task.',
 resources: [
  { label: 'Artwork workspace — flagged designs', url: '/admin/artwork?designer=1' },
  { label: 'Drive working copies', url: COPIES },
  { label: 'Drive Revised Versions', url: REVISED },
 ],
};
async function deliverArtworkHandoff(pool){
 let stage='connect';const db=await pool.connect();try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock($1)',[18112026]);
  stage='recipient';const staff=await db.query("SELECT id,name,active FROM staff WHERE active AND archived_at IS NULL AND lower(split_part(trim(name),' ',1))=$1",['eleazr']);
  const person=staff.rows[0];if(staff.rows.length!==1||!person.active||!/^eleazr(?:\s|$)/i.test(person.name.trim()))throw Error('Designer identity could not be verified');
  stage='task-lookup';
  let task=(await db.query("SELECT id, brief->>'artwork_brief_version' AS brief_version FROM staff_tasks WHERE assigned_to=$1 AND brief->>'request_ref'=$2 ORDER BY id LIMIT 1",[person.id,REF])).rows[0];
  if(!task){
   stage='task-create';
   task=(await db.query("INSERT INTO staff_tasks (title,assigned_to,business,description,how_to,created_by,brief) VALUES ($1,$2,'jtees',$3,$4,NULL,$5::jsonb) RETURNING id",['Prepare artwork copies, yard signs and seasonal designs',person.id,DESCRIPTION,STEPS,JSON.stringify(BRIEF)])).rows[0];
  }else if(Number(task.brief_version || 0)<BRIEF_VERSION){
   stage='task-update';
   await db.query('UPDATE staff_tasks SET description=$2, how_to=$3, brief=brief || $4::jsonb WHERE id=$1',[task.id,DESCRIPTION,STEPS,JSON.stringify(BRIEF)]);
  }
  stage='notification';const notification=(await db.query('INSERT INTO notifications (recipient,kind,title,link,ref,emailed_at) VALUES ($1,\'task\',$2,\'/admin/my-day\',$3,NOW()) ON CONFLICT (recipient,kind,ref) DO UPDATE SET emailed_at=COALESCE(notifications.emailed_at,NOW()) RETURNING id',['staff:'+person.id,'New artwork work: yard signs, working copies and seasonal designs',String(task.id)])).rows[0];
  if(!task?.id||!notification?.id)throw Error('Artwork handoff could not be verified');await db.query('COMMIT');return{task_id:task.id,staff_id:person.id,notification_id:notification.id};
 }catch(e){await db.query('ROLLBACK');e.handoffStage=stage;throw e;}finally{db.release();}
}
function queueArtworkHandoff(pool){if(typeof pool?.connect!=='function')return;let attempts=0;async function run(){try{const result=await deliverArtworkHandoff(pool);console.info('owner artwork handoff: '+JSON.stringify(result));}catch(e){attempts++;const stage=['connect','recipient','task-lookup','task-create','task-update','notification'].includes(e.handoffStage)?e.handoffStage:'connect';const code=/^[0-9A-Z]{5}$/.test(e.code||'')?e.code:'validation';console.error('owner artwork handoff: attempt '+attempts+' failed at '+stage+' ('+code+')');if(attempts<3)setTimeout(run,6000);}}run();}
module.exports={deliverArtworkHandoff,queueArtworkHandoff,COPIES,DESCRIPTION,STEPS};
