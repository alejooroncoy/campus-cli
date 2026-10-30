import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['src/scripts/plus-survey-contract.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { PLUS_SURVEY_ID: id, PLUS_QA_SURVEY_ID: qaId, plusSurveyIdForAudience: audienceSurvey, plusSurveyQaRequested: requested,
  safeSurveyProperties: safe, surveyPersonProperties: person, supportedPlusSurvey: supported } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const q1 = 'e8c41d6d-d964-46c6-8174-7296eb8e01d2', q2 = '0a54ecba-e810-4378-a936-0f1a679e5666';
const survey = { id, type: 'api', schedule: 'once', start_date: '2026-01-01T00:00:00Z', current_iteration: null, questions: [
  { id: q1, type: 'single_choice', question: '¿Qué te frena?', choices: ['El precio', 'No sé conectar mi IA'] },
  { id: q2, type: 'open', question: '¿Nos cuentas más?', optional: true },
] };
assert.equal(supported(survey), true);
assert.equal(supported({...survey,id:qaId}),false,'QA cannot replace the customer definition.');
assert.equal(supported({...survey,id:qaId},qaId),true);
assert.equal(supported(survey,qaId),false);
for(const qa of [false,true]) {
  assert.equal(audienceSurvey('customer',false,qa),id);
  assert.equal(audienceSurvey('customer',true,qa),undefined);
  for(const audience of ['internal','unknown',undefined]) assert.equal(audienceSurvey(audience,true,qa),undefined);
}
assert.equal(audienceSurvey('test',true,false),undefined);
assert.equal(audienceSurvey('test',false,true),undefined);
assert.equal(audienceSurvey('test',true,true),qaId);
assert.equal(requested('/app/plus/','?survey_qa=1'),true);
assert.equal(requested('/app/asistente/','?survey_qa=1'),false);
assert.equal(requested('/app/plus/','?survey_qa=0'),false);
for (const patch of [{type:'popover'},{schedule:'always'},{start_date:undefined},{start_date:'bad'},
  {start_date:'2999-01-01'},{end_date:'2020-01-01'},{current_iteration:-1},{conditions:{events:{values:[{name:'changed'}]}}},
  {questions:[{...survey.questions[0],choices:undefined}]},{questions:[survey.questions[0],{...survey.questions[1],optional:false}]}]) {
  assert.equal(supported({...survey,...patch}), false, JSON.stringify(patch));
}
const base = {$survey_id:id,$survey_iteration:null};
const partial = {...base,$survey_submission_id:'11111111-1111-4111-8111-111111111111',$survey_completed:false,
  $survey_questions:survey.questions.map(({id,question})=>({id,question})),[`$survey_response_${q1}`]:'El precio'};
const completed = {...partial,$survey_completed:true,[`$survey_response_${q2}`]:'Quisiera entender mejor el valor.'};
assert.deepEqual(safe('survey sent',partial), partial);
assert.deepEqual(safe('survey sent',completed), completed);
assert.equal(safe('survey sent',completed).$survey_submission_id, safe('survey sent',partial).$survey_submission_id);
assert.deepEqual(safe('campus_cta_clicked',completed), {});
assert.deepEqual(safe('survey sent',{...completed,$survey_id:'another-survey'}), {});
assert.deepEqual(safe('survey sent',{...completed,$survey_submission_id:undefined}), {});
const stripped = safe('survey sent',{...completed,email:'private@example.test',prompt:'private question',
  [`$survey_response_22222222-2222-4222-8222-222222222222`]:'unrelated form field',
  $set:{is_internal:false}});
assert.deepEqual(stripped, completed, 'Only answers tied to this survey question list pass the analytics boundary.');
assert.equal(Object.hasOwn(safe('survey sent',{...completed,[`$survey_response_${q2}`]:'x'.repeat(1001)}),`$survey_response_${q2}`),false);
assert.deepEqual(person('survey sent',partial),{[`$survey_responded/${id}`]:true});
assert.deepEqual(person('survey dismissed',base),{[`$survey_dismissed/${id}`]:true});
assert.deepEqual(person('survey sent',{...completed,$survey_iteration:2}),{[`$survey_responded/${id}/2`]:true});
assert.ok(person('survey shown',base).$survey_last_seen_date);
assert.deepEqual(person('survey sent',{$survey_id:id}),{});
assert.deepEqual(person('survey sent',{...completed,$survey_id:qaId}),{[`$survey_responded/${qaId}`]:true});
console.log('Survey draft gating, supported question types, exact response IDs, partial/final deduplication and analytics isolation passed.');
