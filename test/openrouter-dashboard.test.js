const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchUsage, renderSvg } = require('../scripts/generate-openrouter-dashboard');

test('fetches key usage with bearer authentication', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { data: { usage_daily: 2, limit_remaining: 8 } };
      },
    };
  };

  try {
    const data = await fetchUsage('test-key', 'https://example.test/key');
    assert.deepEqual(data, { usage_daily: 2, limit_remaining: 8 });
    assert.equal(request.url, 'https://example.test/key');
    assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  } finally {
    global.fetch = originalFetch;
  }
});

test('renders Kindle-sized dashboard with usage values', () => {
  const svg = renderSvg({
    usage_daily: 1.25,
    usage_weekly: 7.5,
    usage_monthly: 31.125,
    limit_remaining: 68.875,
  }, new Date('2026-09-10T12:34:00.000Z'));

  assert.match(svg, /width="1072" height="1448"/);
  assert.match(svg, />\$1\.25</);
  assert.match(svg, />\$7\.50</);
  assert.match(svg, />\$31\.13</);
  assert.match(svg, />\$68\.88</);
  assert.match(svg, /2026-09-10 12:34 UTC/);
});

test('renders missing numeric fields as em dash', () => {
  const svg = renderSvg({}, new Date('2026-09-10T00:00:00.000Z'));
  assert.equal((svg.match(/>—</g) || []).length, 4);
});
