// Runs the actual worker in a deterministic CacheStorage/FetchEvent harness.
// OPS-T01/02: same-origin isolation, bounded freshness keys, failure/upgrade paths.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const india = fs.existsSync(path.join(base, 'sw.js'));
const file = path.join(base, india ? 'sw.js' : 'docs/sw.js');
const scope = 'https://example.test/' + (india ? 'India_1400/' : 'japan-stock-check-web/');
const jsonPath = india ? 'market.json' : 'data/app_snapshot.json';
const origin = 'https://example.test/';
const NONCE = india ? 'v' : 't';
const source = fs.readFileSync(file, 'utf8');
function harness() {
  const buckets = new Map(), handlers = {}, deleted = [], calls = [];
  let failWrite = false, failOpen = false, reply = async () => new Response('fresh');
  const keyOf = req => new URL(typeof req === 'string' ? req : req.url, scope).href;
  const storage = {
    keys: async () => [...buckets.keys()],
    delete: async name => { deleted.push(name); return buckets.delete(name); },
    match: async () => { throw new Error('Origin-wide caches.match is forbidden'); },
    open: async name => {
      if (failOpen) throw new Error('storage unavailable');
      if (!buckets.has(name)) buckets.set(name, new Map());
      const entries = buckets.get(name);
      return {
        keys: async () => [...entries.keys()].map(url => new Request(url)),
        match: async req => entries.get(keyOf(req))?.clone(),
        put: async (req, res) => {
          if (failWrite) throw new Error('quota');
          entries.set(keyOf(req), res.clone());
        },
        addAll: async urls => {
          for (const url of urls) entries.set(keyOf(url), new Response('shell'));
        }
      };
    }
  };
  const context = vm.createContext({URL, Request, Response, caches: storage,
    fetch: async (...args) => { calls.push(args); return reply(...args); },
    self: {registration: {scope}, addEventListener: (type, fn) => {handlers[type] = fn;},
      skipWaiting: async () => {}, clients: {claim: async () => {}}}});
  vm.runInContext(source, context, {filename: file});
  const name = vm.runInContext('CACHE', context);
  const prefix = vm.runInContext('CACHE_PREFIX', context);
  async function lifecycle(type) {
    const pending = [];
    handlers[type]({waitUntil: p => pending.push(p)});
    await Promise.all(pending);
  }
  async function get(relative, method = 'GET') {
    let response;
    handlers.fetch({request: new Request(new URL(relative, scope), {method}),
      respondWith: p => {response = p;}});
    return response === undefined ? undefined : await response;
  }
  return {storage,buckets,deleted,calls,name,prefix,get,lifecycle,
    reply: fn => {reply = fn;}, failWrite: () => {failWrite = true;}, failOpen: () => {failOpen = true;}};
}

test('OPS-T01 activation removes own old caches only; repeated activation is safe', async () => {
  const h = harness();
  const foreign = ['india1400-v5-18','jpstock-v1-6-4','usstock-v1','unrelated-cache']
    .filter(n => !n.startsWith(h.prefix));
  for (const n of [...foreign, h.name, h.prefix+'older']) await h.storage.open(n);
  await h.lifecycle('activate'); await h.lifecycle('activate');
  assert.deepEqual(h.deleted, [h.prefix+'older']);
  assert.deepEqual((await h.storage.keys()).sort(), [...foreign,h.name].sort());
});
test('OPS-T01 never reads another cache even when it contains the identical URL', async () => {
  const h=harness(), u=new URL(jsonPath,scope).href;
  await (await h.storage.open('unrelated-cache')).put(u,new Response('foreign'));
  h.reply(async () => {throw new Error('offline');});
  assert.equal((await h.get(jsonPath)).type, 'error');
  await (await h.storage.open(h.name)).put(u,new Response('own'));
  assert.equal(await (await h.get(jsonPath+'?'+NONCE+'=88')).text(),'own');
});
test('OPS-T02 repeated timestamp requests occupy one canonical JSON entry', async () => {
  const h=harness();
  for(let i=0;i<60;i++) await h.get(jsonPath+'?'+NONCE+'='+i);
  const keys=await (await h.storage.open(h.name)).keys();
  assert.equal(keys.length,1); assert.equal(keys[0].url,new URL(jsonPath,scope).href);
  assert.equal(h.calls.length,60);
  assert.ok(h.calls.every(([,options]) => options.cache==='no-store'));
});
test('OPS-T02 ticker, period, revision and unknown parameters are not dropped', async () => {
  const h=harness();
  for(const q of ['ticker=A&period=1&revision=1','ticker=B&period=1&revision=1',
    'ticker=A&period=2&revision=1','ticker=A&period=1&revision=2',
    'ticker=A&period=1&revision=1&custom=x']) await h.get(jsonPath+'?'+q+'&'+NONCE+'=1');
  assert.equal((await (await h.storage.open(h.name)).keys()).length,5);
});
test('OPS-T02 other app paths, prefix lookalikes, origins and non-GET bypass worker', async () => {
  const h=harness();
  for(const u of [origin+'other/market.json',scope.slice(0,-1)+'-other/market.json',
    'https://external.test/market.json']) assert.equal(await h.get(u),undefined);
  assert.equal(await h.get(jsonPath,'POST'),undefined);
  assert.equal(h.calls.length,0); assert.equal(h.buckets.size,0);
});
test('network-first returns changed JSON and offline reuses exact own bytes', async () => {
  const h=harness();
  await h.get(jsonPath+'?'+NONCE+'=1');
  h.reply(async () => new Response('{"market_as_of":"old-date","value":42}'));
  const r=await h.get(jsonPath+'?'+NONCE+'=2'); const text=await r.text();
  h.reply(async () => {throw new Error('offline');});
  assert.equal(await (await h.get(jsonPath+'?'+NONCE+'=3')).text(),text);
});
test('HTTP failure is returned explicitly and does not replace last valid cache', async () => {
  const h=harness(); await h.get(jsonPath);
  h.reply(async () => new Response('upstream failed',{status:503}));
  assert.equal((await h.get(jsonPath+'?'+NONCE+'=2')).status,503);
  h.reply(async () => {throw new Error('offline');});
  assert.equal(await (await h.get(jsonPath+'?'+NONCE+'=3')).text(),'fresh');
});
test('quota failure cannot turn successful network data into stale data', async () => {
  const h=harness(); await h.get(jsonPath); h.failWrite();
  h.reply(async () => new Response('new even without disk'));
  assert.equal(await (await h.get(jsonPath+'?'+NONCE+'=2')).text(),'new even without disk');
});
test('storage access failure still returns network; offline without cache fails', async () => {
  const h=harness(); h.failOpen();
  assert.equal(await (await h.get(jsonPath)).text(),'fresh');
  h.reply(async () => {throw new Error('offline');});
  assert.equal((await h.get(jsonPath)).type,'error');
});
test('redirected responses are not persisted', async () => {
  const h=harness();
  h.reply(async () => {const r=new Response('redirect target');Object.defineProperty(r,'redirected',{value:true});return r;});
  assert.equal(await (await h.get(jsonPath)).text(),'redirect target');
  assert.equal(h.buckets.size,0);
});
test('install seeds shell; offline shell uses only its named cache', async () => {
  const h=harness(); await h.lifecycle('install');
  h.reply(async () => {throw new Error('offline');});
  assert.equal(await (await h.get('index.html')).text(),'shell');
  assert.equal((await h.get('not-cached.js')).type,'error');
});
test('old-version recovery fixture keeps app namespaces and fresh data independent', async () => {
  const h=harness();
  await (await h.storage.open(h.prefix+'previous')).put(new URL(jsonPath,scope),new Response('old'));
  await h.storage.open('other-app-current');
  await h.lifecycle('install'); await h.lifecycle('activate');
  await h.get(jsonPath+'?'+NONCE+'=first-online');
  h.reply(async () => {throw new Error('offline');});
  assert.equal(await (await h.get(jsonPath+'?'+NONCE+'=later')).text(),'fresh');
  assert.ok(h.buckets.has('other-app-current'));
  assert.ok(!h.buckets.has(h.prefix+'previous'));
});
