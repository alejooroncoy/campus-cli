import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: [new URL('../src/scripts/question-retry.ts', import.meta.url).pathname], bundle: true, format: 'esm', write: false });
const { questionFailure, canRetryQuestion } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
assert.equal(canRetryQuestion(questionFailure('Falló la respuesta sin consumo.', 'AI_FAILED')), true);
for (const code of [undefined, 'APP_UNAVAILABLE', 'CAMPUS_QUOTA', 'CAMPUS_BLOCKED', 'LOGIN_REQUIRED_GUEST_LIMIT']) {
  assert.equal(canRetryQuestion(questionFailure('Error controlado', code)), false);
}
assert.equal(canRetryQuestion(new TypeError('Failed to fetch')), false, 'An uncertain network outcome must not invite a duplicate quota charge');
assert.equal(canRetryQuestion(new Error('AI_FAILED')), false, 'The error text is not confirmation of a refund');
assert.equal(canRetryQuestion(null), false);
console.log('Question retry: only a confirmed AI_FAILED response enables replay; network, quota, auth and unknown failures do not.');
