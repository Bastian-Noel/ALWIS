/** Browser lifecycle only; neither this helper nor its unit tests validate WASM engines. */
export async function runBrowserSamples({ launch, measure, onSample = async () => {}, sampleCount = 3, isolation = 'cold' }) {
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1) throw new Error('sampleCount must be a positive integer');
  if (!['cold', 'warm'].includes(isolation)) throw new Error('isolation must be cold or warm');
  let browser;
  try {
    for (let sample = 0; sample < sampleCount; sample++) {
      browser ??= await launch();
      try {
        await onSample(await measure(browser, sample));
      } finally {
        if (isolation === 'cold') {
          const current = browser;
          browser = undefined;
          await current.close();
        }
      }
    }
  } finally {
    await browser?.close();
  }
}
