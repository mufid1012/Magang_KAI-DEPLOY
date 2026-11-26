import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getTrustProxyHops } from './env';

const saved = { hops: process.env.TRUST_PROXY_HOPS, env: process.env.NODE_ENV };
afterEach(() => {
  if (saved.hops === undefined) delete process.env.TRUST_PROXY_HOPS; else process.env.TRUST_PROXY_HOPS = saved.hops;
  if (saved.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.env;
});

test('production refuses to start without TRUST_PROXY_HOPS, so users behind nginx are not one IP', () => {
  delete process.env.TRUST_PROXY_HOPS;
  process.env.NODE_ENV = 'production';
  assert.throws(() => getTrustProxyHops(), /TRUST_PROXY_HOPS/);
  process.env.TRUST_PROXY_HOPS = '1';
  assert.equal(getTrustProxyHops(), 1);
  process.env.TRUST_PROXY_HOPS = 'satu';
  assert.throws(() => getTrustProxyHops(), /whole number/);
});

test('development defaults to no trusted proxy', () => {
  delete process.env.TRUST_PROXY_HOPS;
  process.env.NODE_ENV = 'development';
  assert.equal(getTrustProxyHops(), 0);
});
