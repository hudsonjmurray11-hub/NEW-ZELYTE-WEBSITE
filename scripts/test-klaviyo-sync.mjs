import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/klaviyo-sync.js';

// Every fetch is replaced. Synthetic values are assigned before any handler
// call; these tests never load .env files or contact Supabase/Klaviyo.
const originalFetch = globalThis.fetch;
const originalError = console.error;
let requests, errors, profile, lookupStatus, providerStatus, networkFailure;
beforeEach(() => {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://database.example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    KLAVIYO_PRIVATE_KEY: 'test-marketing-key',
    KLAVIYO_LIST_ID: 'test-list', SYNC_WEBHOOK_SECRET: 'test-webhook-secret'
  });
  requests = []; errors = []; profile = { marketing_opt_in: false };
  lookupStatus = 200; providerStatus = {}; networkFailure = false;
  console.error = (...args) => errors.push(args.join(' '));
  globalThis.fetch = async (url, options) => {
    const target = new URL(url);
    requests.push({ host: target.hostname, path: target.pathname, body: options.body && JSON.parse(options.body) });
    if (networkFailure) throw new Error('provider body includes test-service-key and qa@example.invalid');
    if (target.hostname === 'database.example.invalid') {
      return new Response(JSON.stringify(lookupStatus === 200 ? (profile ? [profile] : []) : { message: 'private provider error qa@example.invalid' }), { status: lookupStatus });
    }
    assert.equal(target.hostname, 'a.klaviyo.com', 'unexpected request: all network is mocked');
    return new Response('private provider error qa@example.invalid', { status: providerStatus[target.pathname] || 202 });
  };
});
afterEach(() => { globalThis.fetch = originalFetch; console.error = originalError; });
function request(source = 'account', overrides = {}) {
  return new Request('https://website.example.invalid/api/klaviyo-sync', {
    method: 'POST', headers: { authorization: 'Bearer test-webhook-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'INSERT', record: { email: 'qa@example.invalid', source }, ...overrides })
  });
}
const marketing = () => requests.filter(r => r.host === 'a.klaviyo.com');
const subscriptions = () => requests.filter(r => r.path === '/api/profile-subscription-bulk-create-jobs/');

test('rejects unauthenticated webhook before any request', async () => {
  const req = request(); req.headers.set('authorization', 'Bearer wrong');
  assert.equal((await POST(req)).status, 403); assert.equal(requests.length, 0);
});
test('invalid JSON is rejected and irrelevant/null events are ignored without writes', async () => {
  const req = new Request('https://website.example.invalid', {method:'POST',headers:{authorization:'Bearer test-webhook-secret'},body:'not JSON'});
  assert.equal((await POST(req)).status,400);
  assert.equal((await POST(request('account',{type:'UPDATE'}))).status,200);
  const empty = new Request('https://website.example.invalid',{method:'POST',headers:{authorization:'Bearer test-webhook-secret'},body:'null'});
  assert.equal((await POST(empty)).status,200); assert.equal(requests.length,0);
});
test('launch-list insertion upserts then subscribes with explicit email marketing consent', async () => {
  assert.equal((await POST(request('marketing-site'))).status,200);
  assert.equal(marketing().length,2);assert.equal(subscriptions().length,1);
  assert.equal(subscriptions()[0].body.data.attributes.profiles.data[0].attributes.subscriptions.email.marketing.consent,'SUBSCRIBED');
});
test('confirmed account opt-in subscribes and carries account launch properties', async () => {
  profile={marketing_opt_in:true,launch_code:'ZLT10-TEST00',signup_no:42,flavor:'crispy-mint'};
  assert.equal((await POST(request())).status,200);assert.equal(subscriptions().length,1);
  assert.equal(marketing()[0].body.data.attributes.properties.launch_code,'ZLT10-TEST00');
});
test('opted-out account updates profile but never subscribes', async () => {
  assert.equal((await POST(request())).status,200);assert.equal(marketing().length,1);assert.equal(subscriptions().length,0);
});
test('missing account profile fails closed and causes no Klaviyo calls', async () => {
  profile=null;
  assert.equal((await POST(request())).status,503);assert.equal(marketing().length,0);
});
test('failed profile lookup fails closed and causes no Klaviyo calls', async () => {
  lookupStatus=503;
  assert.equal((await POST(request())).status,503);assert.equal(marketing().length,0);
});
test('only an explicit true account preference authorizes marketing subscription', async () => {
  for (const value of [undefined,null,0,'false']) {
    profile={marketing_opt_in:value};
    assert.equal((await POST(request())).status,200);
  }
  assert.equal(subscriptions().length,0);
});
test('rejected profile upsert returns503 and does not proceed to subscription', async () => {
  providerStatus['/api/profile-import/']=503;
  assert.equal((await POST(request('marketing-site'))).status,503);assert.equal(subscriptions().length,0);
});
test('rejected subscription request returns503 rather than acknowledging success', async () => {
  providerStatus['/api/profile-subscription-bulk-create-jobs/']=429;
  assert.equal((await POST(request('marketing-site'))).status,503);assert.equal(subscriptions().length,1);
});
test('network errors are surfaced and logs omit recipient/provider/credential details', async () => {
  networkFailure=true;
  assert.equal((await POST(request('marketing-site'))).status,503);
  assert.equal(errors.length,1);
  assert.doesNotMatch(errors.join('\n'), /qa@example|test-service-key|provider body/);
});
test('missing provider key and list fail visibly instead of returning success', async () => {
  delete process.env.KLAVIYO_PRIVATE_KEY;
  assert.equal((await POST(request('marketing-site'))).status,503);assert.equal(requests.length,0);
  process.env.KLAVIYO_PRIVATE_KEY='test-marketing-key';delete process.env.KLAVIYO_LIST_ID;
  assert.equal((await POST(request('marketing-site'))).status,503);assert.equal(subscriptions().length,0);
});
