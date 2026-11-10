import {setTimeout as delay} from 'node:timers/promises';

/** Poll an async browser predicate, awaiting its boolean result on every attempt. */
export async function waitForAsyncCondition(page, predicate, arg, {timeout = 30000, polling = 100} = {}) {
  const deadline = performance.now() + timeout;
  do {
    const result = await page.evaluate(predicate, arg);
    if (result) return result;
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await delay(Math.min(polling, remaining));
  } while (performance.now() < deadline);
  throw new Error(`Async browser condition was not met within ${timeout} ms`);
}
