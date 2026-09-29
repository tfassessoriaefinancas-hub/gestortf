import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { startActiveRefresh } from '../lib/active-refresh.ts';

function browser(t: TestContext) {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const navigator = { onLine: true };
  for (const [key, value] of Object.entries({ window, document, navigator })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 });
  return { window, document, navigator };
}

test('background, offline and unused screens stop polling and refresh on return', async t => {
  const { window, document, navigator } = browser(t);
  let requests = 0;
  const stop = startActiveRefresh(() => { requests++; });
  t.after(stop);
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  assert.equal(requests, 0, 'mounting and focus must not duplicate the initial screen load');
  t.mock.timers.tick(60_000); await Promise.resolve();
  assert.equal(requests, 1);
  t.mock.timers.tick(10 * 60_000); await Promise.resolve();
  assert.equal(requests, 1, 'leaving a screen open must not poll forever');
  window.dispatchEvent(new Event('pointerdown')); await Promise.resolve();
  assert.equal(requests, 2, 'using the screen again refreshes its stale data');

  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  t.mock.timers.tick(60_000); await Promise.resolve();
  assert.equal(requests, 2);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve();
  assert.equal(requests, 3);

  navigator.onLine = false;
  t.mock.timers.tick(60_000); await Promise.resolve();
  assert.equal(requests, 3);
  navigator.onLine = true;
  window.dispatchEvent(new Event('online')); await Promise.resolve();
  assert.equal(requests, 4);
  stop();
  window.dispatchEvent(new Event('focus'));
  t.mock.timers.tick(60_000); await Promise.resolve();
  assert.equal(requests, 4, 'unmounted screens must remove timers and listeners');
});

test('focus and polling do not overlap a slow refresh and failures allow later refreshes', async t => {
  const { window } = browser(t);
  let requests = 0;
  let reject!: (error: Error) => void;
  const stop = startActiveRefresh(() => {
    requests++;
    return new Promise<void>((_resolve, fail) => { reject = fail; });
  });
  t.after(stop);
  window.dispatchEvent(new Event('focus'));
  t.mock.timers.tick(60_000);
  window.dispatchEvent(new Event('focus'));
  assert.equal(requests, 1);
  reject(new Error('Connection unavailable')); await Promise.resolve();
  window.dispatchEvent(new Event('focus'));
  assert.equal(requests, 1, 'repeated focus must not immediately retry a failure');
  t.mock.timers.tick(30_000);
  window.dispatchEvent(new Event('focus'));
  assert.equal(requests, 2);
  stop();
  reject(new Error('Screen closed')); await Promise.resolve();
  window.dispatchEvent(new Event('focus'));
  assert.equal(requests, 2);
});
