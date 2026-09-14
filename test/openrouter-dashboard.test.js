const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fetchUsage,
  renderSvg,
} = require("../scripts/generate-openrouter-dashboard");

test("fetches account spend and remaining credits with bearer authentication", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    const body = options.body && JSON.parse(options.body);
    const usageByStart = {
      "2026-09-10T00:00:00.000Z": 2,
      "2026-09-07T00:00:00.000Z": 5,
      "2026-09-01T00:00:00.000Z": 9,
    };
    const payload = url.endsWith("/credits")
      ? { data: { total_credits: 20, total_usage: 12 } }
      : {
          data: {
            data: [{ total_usage: usageByStart[body.time_range.start] }],
            metadata: { truncated: false },
          },
        };

    return {
      ok: true,
      async json() {
        return payload;
      },
    };
  };

  try {
    const data = await fetchUsage(
      "test-key",
      new Date("2026-09-10T12:34:00.000Z"),
      {
        analytics: "https://example.test/analytics/query",
        credits: "https://example.test/credits",
      },
    );
    assert.deepEqual(data, {
      usage_daily: 2,
      usage_weekly: 5,
      usage_monthly: 9,
      limit_remaining: 8,
    });
    assert.equal(requests.length, 4);
    for (const request of requests) {
      assert.equal(request.options.headers.Authorization, "Bearer test-key");
    }
    const analyticsRequests = requests.filter((request) =>
      request.url.endsWith("/analytics/query"),
    );
    assert.equal(analyticsRequests.length, 3);
    assert.deepEqual(
      analyticsRequests
        .map((request) => JSON.parse(request.options.body).time_range.start)
        .sort(),
      [
        "2026-09-01T00:00:00.000Z",
        "2026-09-07T00:00:00.000Z",
        "2026-09-10T00:00:00.000Z",
      ],
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("renders Kindle-sized dashboard with usage values", () => {
  const svg = renderSvg(
    {
      usage_daily: 1.25,
      usage_weekly: 7.5,
      usage_monthly: 31.125,
      limit_remaining: 68.875,
    },
    new Date("2026-09-10T12:34:00.000Z"),
  );

  assert.match(svg, /width="1072" height="1448"/);
  assert.match(svg, />\$1\.25</);
  assert.match(svg, />\$7\.50</);
  assert.match(svg, />\$31\.13</);
  assert.match(svg, />\$68\.88</);
  assert.match(svg, /2026-09-10 12:34 UTC/);
});

test("renders missing numeric fields as em dash", () => {
  const svg = renderSvg({}, new Date("2026-09-10T00:00:00.000Z"));
  assert.equal((svg.match(/>—</g) || []).length, 4);
});
