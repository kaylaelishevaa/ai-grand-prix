import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonical, requestHash, ResponseCache } from '../lib/server/cache';
import { structuredCall, type StructuredRequest } from '../lib/server/llm';
import { AppError, errorResponse } from '../lib/server/errors';
import { validateVerdict } from '../lib/server/services';
import { getSku, reviewsForSku } from '../lib/catalog';
import type { Verdict } from '../lib/types';

const fakeKey = 'TEST_ONLY_CREDENTIAL_DO_NOT_SEND';
const model = 'gpt-5-mini';
const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', OPENAI_API_KEY: fakeKey, OPENAI_MODEL: model, DEMO_OFFLINE: '0' };
const offlineEnv: NodeJS.ProcessEnv = { NODE_ENV: 'test', OPENAI_MODEL: model, DEMO_OFFLINE: '1' };
const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };
interface Answer { answer: string; }
function validateAnswer(value: unknown): Answer {
  if (!value || typeof value !== 'object' || !('answer' in value) || typeof value.answer !== 'string' || !value.answer) throw new Error('Invalid answer');
  return { answer: value.answer };
}
function request(overrides: Partial<StructuredRequest<Answer>> = {}): StructuredRequest<Answer> {
  return { operation: 'test_answer', instructions: 'Use only supplied facts.', input: { query: 'a warm kettle', traits: { palette: 'sand', votes: 3 } }, schema, validate: validateAnswer, ...overrides };
}
function modelResponse(value: unknown, usage = { input_tokens: 11, output_tokens: 7 }): Response {
  return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }], usage });
}
async function temporaryCache(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'coupi-llm-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new ResponseCache(directory);
}
function expectCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}
function quietLogs(t: TestContext) {
  const logs: unknown[][] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => { logs.push(args); });
  return logs;
}
function forbiddenFetch(counter: { calls: number }): typeof fetch {
  return (async () => { counter.calls++; throw new Error('Network access must not happen'); }) as typeof fetch;
}

// These tests never read .env.local or use a network-connected fetch implementation.
test('request hashes are canonical across key order but preserve meaningful changes', () => {
  const a = { command: 'warm', profile: { traits: { sand: 2, linen: 3 }, ignored: undefined }, ids: ['a', 'b'] };
  const b = { ids: ['a', 'b'], profile: { traits: { linen: 3, sand: 2 } }, command: 'warm' };
  assert.equal(canonical(a), canonical(b));
  assert.equal(requestHash(a), requestHash(b));
  assert.match(requestHash(a), /^[a-f0-9]{64}$/);
  assert.notEqual(requestHash(a), requestHash({ ...a, command: 'minimal' }));
  assert.notEqual(requestHash(a), requestHash({ ...a, ids: ['b', 'a'] }));
  assert.notEqual(requestHash(a), requestHash({ ...a, profile: { traits: {} } }));
});

test('a validated live response is cached, and repeat requests cost zero tokens', async t => {
  const cache = await temporaryCache(t), logs = quietLogs(t);
  let calls = 0;
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + fakeKey);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.type, 'json_schema');
    return modelResponse({ answer: 'The kettle matches your sand palette.' });
  }) as typeof fetch;
  const first = await structuredCall(request(), { cache, env, fetch: fetchMock });
  assert.equal(first.meta.cached, false);
  assert.equal(first.meta.inputTokens, 11);
  assert.equal(first.meta.outputTokens, 7);
  const second = await structuredCall(request({ input: { traits: { votes: 3, palette: 'sand' }, query: 'a warm kettle' } }), { cache, env, fetch: fetchMock });
  assert.deepEqual(second.data, first.data);
  assert.equal(second.meta.cached, true);
  assert.equal(second.meta.inputTokens, 0);
  assert.equal(second.meta.outputTokens, 0);
  assert.equal(second.meta.cacheKey, first.meta.cacheKey);
  assert.equal(calls, 1);
  assert.equal((await readdir(cache.directory)).length, 1);
  assert(!JSON.stringify(logs).includes(fakeKey));
});

test('DEMO_OFFLINE replays a cached request without an API key or any fetch call', async t => {
  const cache = await temporaryCache(t); quietLogs(t);
  await structuredCall(request(), { cache, env, fetch: (async () => modelResponse({ answer: 'Rehearsed answer' })) as typeof fetch });
  const counter = { calls: 0 };
  const result = await structuredCall(request(), { cache, env: offlineEnv, fetch: forbiddenFetch(counter) });
  assert.equal(result.data.answer, 'Rehearsed answer');
  assert.equal(result.meta.offline, true);
  assert.equal(result.meta.cached, true);
  assert.equal(result.meta.inputTokens + result.meta.outputTokens, 0);
  assert.equal(counter.calls, 0);
});

test('DEMO_OFFLINE cache misses fail loudly and never attempt network access', async t => {
  const cache = await temporaryCache(t); quietLogs(t);
  const counter = { calls: 0 };
  await assert.rejects(structuredCall(request(), { cache, env: offlineEnv, fetch: forbiddenFetch(counter) }), error => {
    assert(error instanceof AppError);
    assert.equal(error.code, 'OFFLINE_CACHE_MISS');
    assert.match(error.message, /No network request was made/);
    return true;
  });
  assert.equal(counter.calls, 0);
  assert.equal((await readdir(cache.directory)).length, 0);
});

test('an invalid cached result is rejected offline without silently calling the model', async t => {
  const cache = await temporaryCache(t); quietLogs(t);
  const first = await structuredCall(request(), { cache, env, fetch: (async () => modelResponse({ answer: 'valid' })) as typeof fetch });
  const stored = await cache.get<Answer>(first.meta.cacheKey);
  assert(stored);
  await cache.set(first.meta.cacheKey, { ...stored, output: { wrong: true } });
  const counter = { calls: 0 };
  await assert.rejects(structuredCall(request(), { cache, env: offlineEnv, fetch: forbiddenFetch(counter) }), expectCode('OFFLINE_CACHE_INVALID'));
  assert.equal(counter.calls, 0);
});

test('invalid JSON retries exactly once and only the final validated response is cached', async t => {
  const cache = await temporaryCache(t); quietLogs(t);
  const bodies: Record<string, unknown>[] = [];
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return modelResponse(bodies.length === 1 ? '{broken json' : { answer: 'Recovered' });
  }) as typeof fetch;
  const result = await structuredCall(request({ maxAttempts: 2 }), { cache, env, fetch: fetchMock });
  assert.equal(bodies.length, 2);
  assert.match(String(bodies[1].instructions), /previous output failed validation/);
  assert.equal(result.data.answer, 'Recovered');
  assert.equal(result.meta.inputTokens, 22);
  assert.equal(result.meta.outputTokens, 14);
  const stored = await cache.get<Answer>(result.meta.cacheKey);
  assert.equal(stored?.output.answer, 'Recovered');
  assert.equal((await readdir(cache.directory)).length, 1);
});

test('valid JSON with invalid domain content also retries, then validates the replacement', async t => {
  const cache = await temporaryCache(t); quietLogs(t);
  let calls = 0;
  const fetchMock = (async () => modelResponse(++calls === 1 ? { answer: 42 } : { answer: 'A grounded replacement' })) as typeof fetch;
  const result = await structuredCall(request({ maxAttempts: 2 }), { cache, env, fetch: fetchMock });
  assert.equal(calls, 2);
  assert.equal(result.data.answer, 'A grounded replacement');
});

test('two invalid outputs stop with the evidence-fallback error and no cache file', async t => {
  const cache = await temporaryCache(t); quietLogs(t);
  let calls = 0;
  const fetchMock = (async () => { calls++; return modelResponse({ answer: false }); }) as typeof fetch;
  await assert.rejects(structuredCall(request({ maxAttempts: 99 }), { cache, env, fetch: fetchMock }), expectCode('INVALID_MODEL_OUTPUT'));
  assert.equal(calls, 2, 'untrusted attempts cannot bypass the one-retry cap');
  assert.equal((await readdir(cache.directory)).length, 0);
});

for (const [status, apiCode, expectedText] of [
  [401, 'invalid_api_key', /rejected the API key/],
  [429, 'insufficient_quota', /quota or credits/],
  [429, 'rate_limit_exceeded', /rate-limiting/],
] as const) {
  test(`API ${status}/${apiCode} errors and logs never expose the credential`, async t => {
    const cache = await temporaryCache(t), logs = quietLogs(t);
    let calls = 0;
    const fetchMock = (async () => { calls++; return Response.json({ error: { code: apiCode, message: 'Upstream diagnostic containing ' + fakeKey } }, { status }); }) as typeof fetch;
    let thrown: unknown;
    try { await structuredCall(request({ maxAttempts: 2 }), { cache, env, fetch: fetchMock }); } catch (error) { thrown = error; }
    assert(thrown instanceof AppError);
    assert.equal(thrown.code, 'OPENAI_' + status);
    assert.match(thrown.message, expectedText);
    assert(!thrown.message.includes(fakeKey));
    const publicError = await errorResponse(thrown).text();
    assert(!publicError.includes(fakeKey));
    assert(!JSON.stringify(logs).includes(fakeKey));
    assert.equal(calls, 1, 'credential/quota failures are not semantic-validation retries');
    assert.equal((await readdir(cache.directory)).length, 0);
  });
}

test('image requests cache only a content-hash key and validated output, never image bytes or keys', async t => {
  const cache = await temporaryCache(t), logs = quietLogs(t);
  const dataUrl = 'data:image/png;base64,VEVTVF9PTkxZX0lNQUdFX0JZVEVT';
  const sha256 = createHash('sha256').update('TEST_ONLY_IMAGE_BYTES').digest('hex');
  const imageRequest = request({ operation: 'test_photo', image: { dataUrl, sha256 }, input: { expectedStaples: ['milk'] } });
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.input[0].content[1], { type: 'input_image', image_url: dataUrl, detail: 'auto' });
    return modelResponse({ answer: 'Milk is visible.' });
  }) as typeof fetch;
  const result = await structuredCall(imageRequest, { cache, env, fetch: fetchMock });
  const text = await readFile(path.join(cache.directory, result.meta.cacheKey + '.json'), 'utf8');
  assert(!text.includes(dataUrl));
  assert(!text.includes('VEVTVF9PTkxZX0lNQUdFX0JZVEVT'));
  assert(!text.includes(fakeKey));
  assert(!JSON.stringify(logs).includes(dataUrl));
  const counter = { calls: 0 };
  const replay = await structuredCall(imageRequest, { cache, env: offlineEnv, fetch: forbiddenFetch(counter) });
  assert.equal(replay.meta.cached, true);
  await assert.rejects(structuredCall({ ...imageRequest, image: { dataUrl, sha256: 'different-image-hash' } }, { cache, env: offlineEnv, fetch: forbiddenFetch(counter) }), expectCode('OFFLINE_CACHE_MISS'));
  assert.equal(counter.calls, 0);
});

const kettle = getSku('kettle')!;
const kettleAlt = getSku('kettleAlt')!;
const kettleCitationIds = reviewsForSku('kettle').filter(review => review.tags.includes('loose-lid')).map(review => review.id);
function kettleVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return { pickSkuId: kettle.id, reason: 'A warm, compact pour-over kettle.', dissent: '13% of its reviews report a loose lid.', citations: kettleCitationIds, runnerUpSkuId: kettleAlt.id, whyRunnerUpLost: 'The other finish is less aligned with the requested palette.', clarifyingQuestion: null, ...overrides };
}

test('verdict validation accepts real SKU/citation IDs and the computed 2-of-16 kettle percentage', () => {
  assert.equal(kettleCitationIds.length, 2);
  const verdict = validateVerdict(kettleVerdict(), [kettle, kettleAlt]);
  assert.equal(verdict.pickSkuId, 'kettle');
  assert.deepEqual(verdict.citations, kettleCitationIds);
});

test('verdict validation rejects invented picks, unknown reviews, duplicates and disallowed review families', () => {
  const allowed = [kettle, kettleAlt];
  assert.throws(() => validateVerdict(kettleVerdict({ pickSkuId: 'made-up-product' }), allowed), /disallowed pick/);
  assert.throws(() => validateVerdict(kettleVerdict({ citations: ['review-does-not-exist'] }), allowed), /citation/);
  assert.throws(() => validateVerdict(kettleVerdict({ citations: [kettleCitationIds[0], kettleCitationIds[0]] }), allowed), /Duplicate/);
  const sockReviewId = reviewsForSku('socks')[0].id;
  assert.throws(() => validateVerdict(kettleVerdict({ citations: [...kettleCitationIds, sockReviewId] }), allowed), /disallowed citation/);
  assert.throws(() => validateVerdict(kettleVerdict({ runnerUpSkuId: 'kettle' }), allowed), /runner-up/);
});

test('verdict validation rejects the old unsupported 6% claim and citations that omit the chosen product', () => {
  assert.throws(() => validateVerdict(kettleVerdict({ dissent: '6% of reviews report a loose lid.' }), [kettle, kettleAlt]), /Unsupported review percentage/);
  assert.throws(() => validateVerdict(kettleVerdict({ dissent: '99% are delighted.' }), [kettle, kettleAlt]), /Unsupported review percentage/);
  const altReview = reviewsForSku('kettleAlt')[0];
  assert.throws(() => validateVerdict(kettleVerdict({ citations: [altReview.id], dissent: 'Some customers report a hot handle.' }), [kettle, kettleAlt]), /own evidence/);
});

test('a clarifying question cannot smuggle in a recommendation or citation', () => {
  const clarification: Verdict = { pickSkuId: null, reason: '', dissent: '', citations: [], runnerUpSkuId: null, whyRunnerUpLost: '', clarifyingQuestion: 'Which size do you need?' };
  assert.equal(validateVerdict(clarification, [kettle]).clarifyingQuestion, 'Which size do you need?');
  assert.throws(() => validateVerdict({ ...clarification, pickSkuId: 'kettle' }, [kettle]), /Clarification/);
  assert.throws(() => validateVerdict({ ...clarification, citations: kettleCitationIds }, [kettle]), /Clarification/);
});

test('owned-detergent questions are refused before credentials or model networking are consulted', async () => {
  // An isolated child gets an explicit, credential-free environment. Never inspect
  // or overwrite the developer's existing API environment in the test process.
  const source = `
    import assert from 'node:assert/strict';
    import services from './lib/server/services.ts';
    import profiles from './lib/profile.ts';
    const { answerQuestion } = services;
    const { createProfile } = profiles;
    assert.equal('OPENAI_API_KEY' in process.env, false);
    assert.equal('OPENAI_MODEL' in process.env, false);
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; throw new Error('Must not call OpenAI for an owned item'); };
    const profile = createProfile('test-owned-profile');
    const result = await answerQuestion(profile, { question: 'Please buy the everyday laundry detergent', requestId: 'owned-question-1' });
    assert.equal(result.status, 'blocked');
    assert.equal(result.skuId, 'detergent');
    assert.match(result.message, /3 weeks ago/);
    assert.equal(fetchCalls, 0);
    assert.equal(result.profile.xp, profile.xp);
    assert.equal(result.profile.decisions.length, 0);
    process.stdout.write('owned-refusal-ok');
  `;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: 'test' }, timeout: 10_000,
  });
  assert.equal(stdout, 'owned-refusal-ok');
  assert.equal(stderr, '');
});
