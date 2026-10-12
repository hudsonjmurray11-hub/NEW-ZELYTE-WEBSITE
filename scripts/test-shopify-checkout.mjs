import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const file = new URL('../main.js', import.meta.url);
const source = readFileSync(file, 'utf8');
const start = source.indexOf('    (function () {', source.indexOf('/* 13c.'));
const end = source.indexOf('\n    })();', start);
assert.ok(start > 0 && end > start);
const checkoutSource = source.slice(start, end) + `
  globalThis.fixture = { open, shut, checkout, shopDomain, shopId, ui,
    getState: function () { return state; }, busy: function () { return !!activeCheckout; } };
})();`;

function element() {
  return {
    children: [], dataset: {}, hidden: false, disabled: false, textContent: '',
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { this[key] = value; },
    addEventListener() {}, focus() {}
  };
}
const prices = {
  pro: { tins: 3, name: 'Pro Pack', one: 33, sub: 30 },
  elite: { tins: 5, name: 'Elite Pack', one: 50, sub: 45 }
};
function shop() {
  const variants = {};
  let next = 101;
  for (const [pack, { tins }] of Object.entries(prices)) {
    variants[pack] = {};
    for (let mint = tins; mint >= 0; mint--) variants[pack][`${mint}-${tins - mint}`] = String(next++);
  }
  return { DOMAIN: 'zelyte-test.myshopify.com', VARIANTS: variants, SELLING_PLAN: { pro: '901', elite: '902' } };
}
function success(body) {
  const line = body.variables.input.lines[0];
  return { data: { cartCreate: {
    cart: { checkoutUrl: 'https://shop.example.com/checkouts/abc?key=secret', totalQuantity: 1,
      lines: { nodes: [{ quantity: 1, merchandise: { id: line.merchandiseId },
        sellingPlanAllocation: line.sellingPlanId ? { sellingPlan: { id: line.sellingPlanId } } : null }] } },
    userErrors: [], warnings: []
  } } };
}
function response(body) { return { ok: true, status: 200, json: async () => body }; }
function setup({ config = shop(), fetchImpl } = {}) {
  const calls = [], redirects = [], timers = new Map(), listeners = {}, events = [];
  let timerId = 0;
  const context = {
    CFG: { SHOP: config }, SHOP_PRICES: prices, SHOP_SHIP: { standard: 5, express: 15 },
    bundles: element(), location: { pathname: '/index.html' }, URL, AbortController, Event,
    document: { createElement: element, body: element(), activeElement: element(), addEventListener() {},
      dispatchEvent(event) { events.push(event.type); } },
    window: { addEventListener(name, cb) { listeners[name] = cb; },
      location: { assign(url) { redirects.push(url); } } },
    localStorage: { getItem() { throw new Error('Checkout must not read member data'); } },
    $: () => null, $$: () => [], requestAnimationFrame: cb => cb(),
    setTimeout: cb => { const id = ++timerId; timers.set(id, cb); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, options, body });
      return fetchImpl ? fetchImpl(url, options, body) : response(success(body));
    }
  };
  vm.runInNewContext(checkoutSource, context);
  return { api: context.fixture, calls, redirects, timers, listeners, events };
}

test('all ten flavor variants work for one-time and monthly carts without transferring member data', async () => {
  const env = setup();
  for (const [pack, { tins }] of Object.entries(prices)) {
    for (let mint = tins; mint >= 0; mint--) {
      for (const mode of ['one', 'sub']) {
        env.api.open(pack, mode);
        Object.assign(env.api.getState(), { mint, cherry: tins - mint });
        await env.api.checkout();
        const call = env.calls.at(-1), line = call.body.variables.input.lines[0];
        assert.equal(call.url, 'https://zelyte-test.myshopify.com/api/2026-07/graphql.json');
        assert.equal(call.options.credentials, 'omit');
        assert.equal(call.options.headers['X-Shopify-Storefront-Access-Token'], undefined);
        assert.deepEqual(Object.keys(call.body.variables.input), ['lines']);
        assert.equal(line.quantity, 1);
        assert.match(line.merchandiseId, /^gid:\/\/shopify\/ProductVariant\/\d+$/);
        assert.equal(!!line.sellingPlanId, mode === 'sub');
        assert.equal(env.api.busy(), false);
        assert.equal(env.api.ui.go.disabled, false);
      }
    }
  }
  assert.equal(env.calls.length, 20);
  assert.equal(env.redirects.length, 20);
  assert.equal(env.timers.size, 0);
});

test('a fresh cart is created each click and optional public token uses only the public header', async () => {
  const config = shop(); config.STOREFRONT_TOKEN = '0123456789abcdef0123456789abcdef';
  const env = setup({ config }); env.api.open('pro', 'one');
  await env.api.checkout(); await env.api.checkout();
  assert.equal(env.calls.length, 2);
  for (const call of env.calls) {
    assert.match(call.body.query, /cartCreate/);
    assert.equal(call.body.variables.input.cartId, undefined);
    assert.equal(call.options.headers['X-Shopify-Storefront-Access-Token'], config.STOREFRONT_TOKEN);
    assert.equal(call.options.headers['X-Shopify-Access-Token'], undefined);
  }
});

test('missing subscription defaults to one-time with clear UI and blocks forced subscription', async () => {
  const config = shop(); config.SELLING_PLAN.pro = 0;
  const env = setup({ config }); env.api.open('pro', 'sub');
  assert.equal(env.api.getState().mode, 'one');
  assert.match(env.api.ui.status.textContent, /Subscriptions are not available/);
  assert.equal(env.api.ui.modeBtns[0].disabled, true);
  env.api.getState().mode = 'sub';
  await env.api.checkout();
  assert.equal(env.calls.length, 0);
  assert.match(env.api.ui.status.textContent, /Choose One time/);
});

test('invalid configuration cannot send a request, including known private token prefixes', async () => {
  for (const edit of [
    c => { c.DOMAIN = ''; }, c => { c.DOMAIN = 'shop.example.com/path'; },
    c => { c.DOMAIN = 'http://shop.example.com'; }, c => { c.DOMAIN = 'user:pass@shop.example.com'; },
    c => { c.VARIANTS.pro['2-1'] = 0; }, c => { c.VARIANTS.pro['2-1'] = Number.MAX_SAFE_INTEGER + 1; },
    c => { c.STOREFRONT_TOKEN = 'shpat_do_not_send'; }
  ]) {
    const config = shop(); edit(config);
    const env = setup({ config }); env.api.open('pro', 'one'); await env.api.checkout();
    assert.equal(env.calls.length, 0);
    assert.equal(env.api.busy(), false);
    assert.equal(env.api.ui.go.disabled, false);
    assert.equal(env.timers.size, 0);
  }
});

test('double submits are ignored; closing prevents a late response from redirecting', async () => {
  let resolveFetch;
  const env = setup({ fetchImpl: (_url, _options, body) => new Promise(resolve => { resolveFetch = () => resolve(response(success(body))); }) });
  env.api.open('pro', 'one');
  const first = env.api.checkout(); await env.api.checkout();
  assert.equal(env.calls.length, 1); assert.equal(env.api.ui.go.disabled, true);
  assert.equal(env.api.ui.mint.plus.disabled, true);
  env.api.shut(); resolveFetch(); await first;
  assert.equal(env.calls[0].options.signal.aborted, true);
  assert.equal(env.redirects.length, 0); assert.equal(env.api.busy(), false);
});

test('timeout releases UI, explains retry, and clears its timer', async () => {
  const env = setup({ fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) });
  env.api.open('pro', 'one'); const pending = env.api.checkout();
  assert.equal(env.timers.size, 1);
  [...env.timers.values()][0](); await pending;
  assert.match(env.api.ui.status.textContent, /took too long/);
  assert.equal(env.api.busy(), false); assert.equal(env.api.ui.go.disabled, false);
  assert.equal(env.timers.size, 0); assert.equal(env.redirects.length, 0);
});

test('pageshow resets busy state and prevents stale navigation after browser back', async () => {
  let resolveFetch;
  const env = setup({ fetchImpl: (_url, _options, body) => new Promise(resolve => { resolveFetch = () => resolve(response(success(body))); }) });
  env.api.open('pro', 'sub'); const pending = env.api.checkout();
  env.listeners.pageshow(); resolveFetch(); await pending;
  assert.equal(env.api.busy(), false); assert.equal(env.api.ui.go.disabled, false);
  assert.equal(env.redirects.length, 0); assert.equal(env.api.ui.status.textContent, env.api.ui.micro);
});

test('network, Shopify API, sold-out, and locked store failures leave a usable retry UI', async () => {
  const scenarios = [
    { impl: () => { throw new Error('offline'); }, message: /connect to Shopify/ },
    { impl: () => ({ ok: false, status: 429 }), message: /Shopify is busy/ },
    { impl: () => ({ ok: false, status: 503, json: async () => { throw new Error('HTML response'); } }), message: /temporarily unavailable/ },
    { impl: () => ({ ...response({ errors: [{ message: 'Online Store channel is locked.' }] }), ok: false, status: 400 }), message: /Checkout is not open yet/ },
    { impl: () => ({ ...response({ errors: [{ message: 'Online Store channel is locked.' }] }), ok: false, status: 430 }), message: /Shopify is busy/ },
    { impl: () => response({ errors: [{ message: 'Online Store channel is locked.' }] }), message: /Checkout is not open yet/ },
    { impl: () => response({ errors: [{ message: 'unknown' }] }), message: /temporarily unavailable/ },
    { impl: () => response({ data: { cartCreate: { userErrors: [{ code: 'INVALID_MERCHANDISE_LINE', field: ['input','lines'] }] } } }), message: /choose another mix/ },
    { impl: () => response({ data: { cartCreate: { userErrors: [{ code: 'INVALID', field: ['input','lines','0','sellingPlanId'] }] } } }), message: /subscription is not available/ },
    { impl: () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } }), message: /could not prepare your checkout/ }
  ];
  for (const scenario of scenarios) {
    const env = setup({ fetchImpl: scenario.impl }); env.api.open('pro', 'sub'); await env.api.checkout();
    assert.match(env.api.ui.status.textContent, scenario.message);
    assert.equal(env.api.busy(), false); assert.equal(env.api.ui.go.disabled, false);
    assert.equal(env.redirects.length, 0); assert.equal(env.timers.size, 0);
  }
});

test('cart line validation prevents redirects after silently changed quantity, variant, plan or warning', async () => {
  for (const mutate of [
    c => { c.cart.totalQuantity = 2; }, c => { c.cart.lines.nodes[0].quantity = 0; },
    c => { c.cart.lines.nodes[0].merchandise.id = 'gid://shopify/ProductVariant/999'; },
    c => { c.cart.lines.nodes[0].sellingPlanAllocation = null; },
    c => { c.warnings.push({ code: 'MERCHANDISE_NOT_ENOUGH_STOCK' }); },
    c => { c.cart.checkoutUrl = 'javascript:alert(1)'; },
    c => { c.cart.checkoutUrl = 'https://user:secret@shop.example.com/checkout'; }
  ]) {
    const env = setup({ fetchImpl: (_url, _options, body) => { const data = success(body); mutate(data.data.cartCreate); return response(data); } });
    env.api.open('pro', 'sub'); await env.api.checkout();
    assert.equal(env.redirects.length, 0); assert.equal(env.api.ui.go.disabled, false);
    assert.match(env.api.ui.status.textContent, /Please try again/);
  }
});

test('domain parser accepts HTTPS shops and custom hosts; IDs preserve precision', () => {
  const { api } = setup();
  assert.equal(api.shopDomain('https://Zelyte.myshopify.com/'), 'zelyte.myshopify.com');
  assert.equal(api.shopDomain('shop.takezelyte.com'), 'shop.takezelyte.com');
  for (const domain of ['localhost', '127.0.0.1', 'shop.example.com?key=x', 'shop.example.com#x', 'shop.example.com:8443', 'shop..com', '-shop.example.com']) assert.equal(api.shopDomain(domain), null);
  assert.equal(api.shopId('gid://shopify/ProductVariant/67686179602799', 'ProductVariant'), 'gid://shopify/ProductVariant/67686179602799');
  assert.equal(api.shopId('99999999999999999999999', 'ProductVariant'), 'gid://shopify/ProductVariant/99999999999999999999999');
  assert.equal(api.shopId('gid://shopify/SellingPlan/1', 'ProductVariant'), null);
});


test('opening a pack closes the waitlist through its event before claiming focus', () => {
  const env = setup();
  env.api.open('pro', 'one');
  assert.deepEqual(env.events, ['zelyte:open-pack']);
  const listener = source.match(/document\.addEventListener\('zelyte:open-pack', function \(\) \{ closePopup\(false\); \}\);/);
  assert.ok(listener, 'waitlist must close without marking the ask answered');
  let answered;
  const handlers = {};
  vm.runInNewContext(listener[0], {
    document: { addEventListener(name, cb) { handlers[name] = cb; } },
    closePopup(value) { answered = value; }
  });
  handlers['zelyte:open-pack']();
  assert.equal(answered, false);
});
