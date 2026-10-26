#!/usr/bin/env node
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { captureLocalLogin } = require('../dist/relay/local-login.js');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const original = browser.newContext.bind(browser);
  const requests = [];
  browser.newContext = async () => {
    const context = await original();
    await context.addCookies([
      { name: 'XSRF-TOKEN', value: 'path-fixture', domain: 'aulavirtual.upc.edu.pe', path: '/learn', secure: true },
      { name: 'ESTSAUTH', value: 'identity-fixture', domain: 'login.microsoftonline.com', path: '/', secure: true },
      { name: 'google-fixture', value: 'identity-fixture', domain: 'accounts.google.com', path: '/', secure: true },
    ]);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      requests.push(url.origin + url.pathname);
      assert.equal(url.origin, 'https://aulavirtual.upc.edu.pe');
      if (url.pathname === '/auth-saml/saml/login') {
        assert.equal(url.searchParams.get('apId'), '_4893_1');
        await route.fulfill({ status: 200, headers: {
          'content-type': 'text/html',
          'set-cookie': 'BbRouter=browser-fixture; Path=/; Secure; HttpOnly; SameSite=Lax',
        }, body: '<script>location.replace("/ultra")</script>' });
      } else {
        assert.equal(url.pathname, '/ultra');
        await route.fulfill({ contentType: 'text/html', body: '<title>Fixture campus</title>' });
      }
    });
    return context;
  };
  try {
    const result = await captureLocalLogin('upc-pe', new AbortController().signal, async () => browser);
    assert.deepEqual(result.cookies.map(cookie => cookie.name).sort(), ['BbRouter', 'XSRF-TOKEN']);
    assert.ok(result.cookies.every(cookie => cookie.domain === 'aulavirtual.upc.edu.pe'));
    assert.equal(result.cookies.find(cookie => cookie.name === 'XSRF-TOKEN').path, '/learn');
    assert.equal(browser.isConnected(), false);
    assert.equal(requests.length, 2);
    console.log('Local Playwright capture passed: real Chromium, temporary context, university-only cookies, no academic queries.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
