// Public HTML only. Input is a reviewed manifest exported from confirmed UPC matches.
// No network work happens during page rendering or the site build.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {parseComments,sourceURL} from './profematch-excerpts.mjs';
const [manifest,output]=process.argv.slice(2);
if(!manifest||!output||!process.argv.includes('--authorized'))throw new Error('Usage: node scripts/collect-profematch-excerpts.mjs matches.json output.json --authorized');
const matches=JSON.parse(await readFile(manifest,'utf8'));
if(!Array.isArray(matches)||!matches.length||new Set(matches.map(m=>m.source_id)).size!==matches.length)throw new Error('Invalid match manifest');
for(const m of matches)sourceURL(m.source_url);
async function page(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Campus-source-research/1.0 (+https://campuscli.com)'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text();}
const robots=await page('https://profematchperu.com/robots.txt');
if(robots.trim()!=='User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/\n\nSitemap: https://profematchperu.com/sitemap.xml')throw new Error('Review changed robots.txt before collecting');
const profiles=[];const errors=[];
for(const match of matches){
 await setTimeout(800);
 try{profiles.push(parseComments(await page(match.source_url),match));}
 catch(error){errors.push({sourceId:match.source_id,message:error.message});if(/HTTP (403|429)/.test(error.message))break;}
 if((profiles.length+errors.length)%25===0)console.log(JSON.stringify({collected:profiles.length,errors:errors.length,total:matches.length}));
}
const report={schemaVersion:2,contentMode:'full',generatedAt:new Date().toISOString(),expectedSources:matches.length,complete:profiles.length===matches.length,profiles,errors};
await writeFile(`${output}.tmp`,JSON.stringify(report,null,2)+'\n');await rename(`${output}.tmp`,output);
console.log(JSON.stringify({sources:profiles.length,comments:profiles.reduce((n,p)=>n+p.comments.length,0),errors:errors.length,complete:report.complete}));
if(!report.complete)process.exitCode=1;
