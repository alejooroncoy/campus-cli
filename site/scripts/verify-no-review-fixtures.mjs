import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const site=fileURLToPath(new URL('../',import.meta.url));
const fixture=JSON.parse(await readFile(new URL('./fixtures/professor-conversations.json',import.meta.url),'utf8'));
// Check content as well as the sentinel: copying only an external comment is a leak too.
const markers=new Set([fixture.fixtureSentinel,fixture.profile.professor.slug]);
function collect(value){
 if(Array.isArray(value))value.forEach(collect);
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
  if(key==='text'&&typeof item==='string')markers.add(item);
  else collect(item);
 }
}
collect(fixture);

export async function verifyNoReviewFixtures(directories=[join(site,'dist'),join(site,'.generated')]){
 let files=0;
 async function scan(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const path=join(directory,entry.name);
   if(entry.isDirectory()){await scan(path);continue;}
   const content=await readFile(path);
   assert.ok(!path.endsWith('professor-conversations.json'),`Test fixture copied into build: ${path}`);
   for(const marker of markers)assert.ok(!content.includes(Buffer.from(marker)),`Synthetic review data in build: ${path}`);
   files++;
  }
 }
 for(const directory of directories)await scan(directory);
 assert.ok(files>0,'Build the site before checking fixture isolation');
 return {files,markers:markers.size};
}
