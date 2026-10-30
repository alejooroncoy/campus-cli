import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {gunzipSync} from 'node:zlib';

// Real SDK and production app code; every HTTP request is intercepted locally.
const key='phc_'+'A'.repeat(43),owner='campus:google:123456789012345678901';
const main='01a18cc9-dfcf-0000-9228-5fe27651e15d',qa='01a18d1a-1619-0000-4e77-51afff9780a6';
const q='26648b73-1f1b-4259-8012-57229dfd1505';
const browser=await chromium.launch({headless:true});
try {
  for(const [audience,query,expected] of [['test','',null],['test','?survey_qa=1',qa],
    ['customer','?survey_qa=1',main],['internal','?survey_qa=1',null],['unknown','?survey_qa=1',null]]) {
    const {outputFiles}=await build({stdin:{contents:`
      import {analyticsSession,getPlusSurvey,track} from './src/scripts/analytics.ts';
      analyticsSession({authenticated:true,analyticsAudience:'${audience}',analyticsId:'${owner}',plan:'free'});
      const survey=await getPlusSurvey();
      for(const id of ['${main}','${qa}']) track('survey sent',{$survey_id:id,$survey_iteration:null,
        $survey_submission_id:'11111111-1111-4111-8111-111111111111',$survey_completed:true,
        $survey_questions:[{id:'${q}',question:'QA'}],'$survey_response_${q}':'Synthetic',is_test:false});
      document.body.textContent=survey?.id??'none';
    `,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false,
      define:{'import.meta.env':JSON.stringify({DEV:false,PUBLIC_POSTHOG_KEY:key})}});
    const context=await browser.newContext({serviceWorkers:'block',userAgent:'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'});
    await context.addInitScript(()=>{
      Object.defineProperty(navigator,'webdriver',{get:()=>false});
      Object.defineProperty(navigator,'userAgentData',{get:()=>({brands:[{brand:'Chromium',version:'140'}]})});
    });
    const events=[],requests=[],errors=[];
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!url.pathname.startsWith('/c-events/')) return route.fulfill({contentType:url.pathname==='/test.js'?'text/javascript':'text/html',
        body:url.pathname==='/test.js'?outputFiles[0].text:'<!doctype html><body>loading<script type="module" src="/test.js"></script>'});
      requests.push(url.pathname);
      if(url.pathname==='/c-events/api/surveys/') return route.fulfill({json:{surveys:[main,qa].map(id=>({
        id,type:'api',schedule:'once',start_date:'2026-01-01T00:00:00Z',targeting_flag_key:'audience-'+id,internal_targeting_flag_key:'unanswered-'+id,
        questions:[{id:q,type:'single_choice',question:'QA',choices:['Synthetic','Other']}],
      }))}});
      if(url.pathname==='/c-events/flags/') {
        const body=req.postDataJSON();
        assert.deepEqual([...body.flag_keys_to_evaluate].sort(),['audience-'+expected,'unanswered-'+expected].sort());
        assert.equal(body.person_properties.analytics_audience,audience);
        assert.equal(body.person_properties.is_test,String(audience==='test'));
        if(expected===qa)assert.equal(body.person_properties.qa_account,owner);
        return route.fulfill({json:{featureFlags:{['audience-'+expected]:true,['unanswered-'+expected]:true}}});
      }
      if(url.pathname==='/c-events/batch/') {
        const bytes=req.postDataBuffer(),payload=JSON.parse((bytes[0]===0x1f?gunzipSync(bytes):bytes).toString());
        events.push(...payload.batch);return route.fulfill({json:{status:'Ok'}});
      }
      throw Error('Unexpected request '+url.pathname);
    });
    await page.goto('https://campus.analytics.test/app/plus/'+query);
    await page.getByText(expected??'none',{exact:true}).waitFor();
    await page.waitForTimeout(150);
    assert.deepEqual(errors,[]);
    const sent=events.filter(e=>e.event==='survey sent');
    assert.equal(sent.length,expected?1:0);
    if(expected){
      assert.equal(sent[0].properties.$survey_id,expected);
      assert.equal(sent[0].properties.is_test,audience==='test','Caller cannot erase QA classification');
      assert.equal(sent[0].properties.analytics_audience,audience);
      assert.equal(sent[0].properties.environment,'production');
      assert.equal(sent[0].properties.$set[`$survey_responded/${expected}`],true);
    }else assert.equal(requests.some(p=>p.includes('surveys')||p.includes('flags')),false);
    await context.close();
  }
  console.log('Production QA: explicit opt-in, separate survey lookup, server audience gating, capture isolation and retained test tagging passed locally.');
}finally{await browser.close();}
