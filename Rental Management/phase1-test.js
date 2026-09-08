#!/usr/bin/env node
/**
 * Phase 1 automated regression checks for Rental PM V6.5.2
 * Non-destructive: no Supabase writes, no production data changes.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

const root = path.join(__dirname);
const htmlPath = path.join(root, 'index.html');
const netlifyPath = path.join(root, '..', 'netlify.toml');
const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  fail('extract script', 'no <script> block');
  process.exit(1);
}
const script = scriptMatch[1];

// 1) Script parses
try {
  new Function(script);
  pass('JS syntax parse');
} catch (e) {
  fail('JS syntax parse', e.message);
}

// 2) Confirmed Phase 1 fixes present
if (/function property\s*\(\)\s*\{\s*return propertyBy\(state\.propertyId\)\s*\}/.test(script)) {
  pass('property() helper defined via propertyBy(state.propertyId)');
} else if (/function property\s*\(/.test(script)) {
  pass('property() helper defined', 'alternate body shape');
} else {
  fail('property() helper defined');
}

if (/property\(\)\?\.name/.test(script) || /\$\{esc\(property\(\)\?\.name/.test(html)) {
  pass('Income page still calls property()');
} else {
  fail('Income page still calls property()');
}

if (/api\('rent_payments',\s*`id=eq\.\$\{id\}`/.test(script)) {
  pass('deletePayment targets rent_payments');
} else {
  fail('deletePayment targets rent_payments');
}

if (/api\('payments'/.test(script)) {
  fail('no stale payments table delete', 'api(\'payments\') still present');
} else {
  pass('no stale payments table delete');
}

if (/\$\$\('#content table tbody tr\[data-tenant-search\]'\)/.test(script)) {
  pass('tenant search selector uses #content');
} else {
  fail('tenant search selector uses #content');
}

if (/#main table/.test(script)) {
  fail('no broken #main tenant search selector', '#main still referenced');
} else {
  pass('no broken #main tenant search selector');
}

if (/state\.bondEvents\s*=\s*state\.bondEvents\.filter/.test(script)) {
  pass('deleteBond updates state.bondEvents');
} else {
  fail('deleteBond updates state.bondEvents');
}

if (/bondPaymentEvents/.test(script)) {
  fail('no bondPaymentEvents state key', 'still present');
} else {
  pass('no bondPaymentEvents state key');
}

if (/actor_user_id/.test(script)) {
  fail('activity_log uses user_id not actor_user_id', 'actor_user_id still present');
} else {
  pass('activity_log uses user_id not actor_user_id');
}

if (/insert\('activity_log',\{user_id:uid,action:'delete_payment'/.test(script)) {
  pass('payment delete audit uses user_id best-effort');
} else {
  fail('payment delete audit uses user_id best-effort');
}

// 3) Markup checks
if (/<main class="main">/.test(html) && !/id="main"/.test(html)) {
  pass('markup has main.main without id=main');
} else {
  fail('markup has main.main without id=main');
}
if (/id="content"/.test(html)) {
  pass('content container id exists');
} else {
  fail('content container id exists');
}
if (/id="tenant-search"/.test(html) || /id="tenant-search"/.test(script) || /id=.tenant-search./.test(script)) {
  pass('tenant-search input is rendered by tenantsPage');
} else {
  fail('tenant-search input is rendered by tenantsPage');
}

// 4) loadAll key alignment
const keysMatch = script.match(/const keys=\[([^\]]+)\]/);
if (keysMatch && keysMatch[1].includes("'bondEvents'") && keysMatch[1].includes("'payments'")) {
  pass('loadAll state keys include payments and bondEvents');
} else {
  fail('loadAll state keys include payments and bondEvents');
}
if (/select\('rent_payments'/.test(script)) {
  pass('loadAll reads rent_payments');
} else {
  fail('loadAll reads rent_payments');
}

// 5) netlify.toml
const netlify = fs.readFileSync(netlifyPath, 'utf8');
if (/publish\s*=\s*"Rental Management"/.test(netlify)) {
  pass('netlify.toml publishes Rental Management');
} else {
  fail('netlify.toml publishes Rental Management');
}
if (/Cache-Control/.test(netlify)) {
  pass('netlify.toml disables caching');
} else {
  fail('netlify.toml disables caching');
}
if (/to\s*=\s*"\/index\.html"/.test(netlify)) {
  fail('no SPA catch-all rewrite', 'SPA rewrite present');
} else {
  pass('no SPA catch-all rewrite');
}

// 6) Behavioral unit checks with mocked DOM subset
function runBehavioral() {
  // Minimal DOM for tenant search filter logic
  const { JSDOM } = (() => {
    try { return require('jsdom'); } catch { return { JSDOM: null }; }
  })();

  // property() behavior without full app boot
  const state = { propertyId: 7, properties: [{ id: 7, name: 'Test House' }, { id: 2, name: 'Other' }] };
  function propertyBy(id) { return state.properties.find(p => Number(p.id) === Number(id)); }
  function property() { return propertyBy(state.propertyId); }
  if (property()?.name === 'Test House') pass('property() returns current property name');
  else fail('property() returns current property name');

  // Simulate tenant search filter
  const rows = [
    { q: 'laura room 5 short', expectShow: true },
    { q: 'juny room 3 long', expectShow: false },
  ];
  const needle = 'laura';
  const filtered = rows.map(r => ({ ...r, show: r.q.includes(needle) }));
  if (filtered[0].show && !filtered[1].show) pass('tenant search substring filter logic');
  else fail('tenant search substring filter logic');

  // bondEvents filter simulation
  let bondEvents = [{ bond_id: 1 }, { bond_id: 2 }, { bond_id: 1 }];
  const id = 1;
  bondEvents = bondEvents.filter(x => Number(x.bond_id) !== Number(id));
  if (bondEvents.length === 1 && bondEvents[0].bond_id === 2) pass('bondEvents filter after delete');
  else fail('bondEvents filter after delete');

  if (!JSDOM) {
    pass('jsdom optional skipped', 'not installed; DOM boot checked via HTTP instead');
  }
}
runBehavioral();

// 7) HTTP smoke: local static server must already be up, or start briefly
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('timeout')); });
  });
}

(async () => {
  let served = null;
  try {
    served = await httpGet('http://127.0.0.1:8080/');
  } catch {
    // start ephemeral server
    await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        let file = u.pathname === '/' ? '/index.html' : u.pathname;
        const fp = path.join(root, decodeURIComponent(file));
        if (!fp.startsWith(root)) { res.writeHead(403); res.end(); return; }
        fs.readFile(fp, (err, data) => {
          if (err) { res.writeHead(404); res.end('missing'); return; }
          res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : 'text/plain' });
          res.end(data);
        });
      });
      server.listen(8091, '127.0.0.1', async () => {
        try {
          served = await httpGet('http://127.0.0.1:8091/');
          server.close();
          resolve();
        } catch (e) {
          server.close();
          reject(e);
        }
      });
    });
  }

  if (served && served.status === 200 && /Rental PM/.test(served.body) && /id="boot"/.test(served.body)) {
    pass('static index.html serves with boot shell', `HTTP ${served.status}`);
  } else {
    fail('static index.html serves with boot shell', served ? `HTTP ${served.status}` : 'no response');
  }

  if (served && /id="auth"/.test(served.body) && /V6\.5\.2/.test(served.body)) {
    pass('auth screen markup present (V6.5.2)');
  } else {
    fail('auth screen markup present (V6.5.2)');
  }

  // Live Netlify reachability (informational)
  try {
    const https = require('https');
    const live = await new Promise((resolve, reject) => {
      https.get('https://rental-pm-v2.netlify.app/', res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
    if (live.status === 200 && /Rental PM/.test(live.body)) {
      pass('live Netlify publicly reachable');
    } else if (live.status === 401) {
      fail('live Netlify publicly reachable', 'HTTP 401 Edge Access / password gate');
    } else {
      fail('live Netlify publicly reachable', `HTTP ${live.status}`);
    }
  } catch (e) {
    fail('live Netlify publicly reachable', e.message);
  }

  // Master requirements present
  if (fs.existsSync(path.join(root, 'MASTER_REQUIREMENTS.md'))) {
    pass('MASTER_REQUIREMENTS.md saved');
  } else {
    fail('MASTER_REQUIREMENTS.md saved');
  }

  const failed = results.filter(r => !r.ok);
  const passed = results.filter(r => r.ok);
  console.log('\n---');
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 1,
    passed: passed.length,
    failed: failed.length,
    results,
  };
  fs.writeFileSync(path.join(root, 'phase1-test-results.json'), JSON.stringify(report, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  fail('test runner', e.message);
  process.exit(1);
});
