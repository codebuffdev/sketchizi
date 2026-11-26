/**
 * Invokes an in-page detector after publishing the Playwright-configured
 * viewport size to the page (see inpage-utils.js#viewport for why).
 */
export async function runDetector(page, name, opts) {
  const size = page.viewportSize();
  return page.evaluate(
    ({ name, opts, size }) => {
      if (size) window.__qa.expected = size;
      return window.__qa[name](opts);
    },
    { name, opts, size },
  );
}
