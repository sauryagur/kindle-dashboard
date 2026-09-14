const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateMetrics,
  fetchDashboardData,
  normaliseAnalyticsResponse,
  renderDailyBars,
  renderSvg,
  usageRanges,
} = require("../scripts/generate-openrouter-dashboard");

const now = new Date("2026-09-10T12:34:00.000Z");

function stats(usage, tokens = 100_000, requests = 10) {
  return { usage, tokens, requests };
}

function dashboardFixture(overrides = {}) {
  const history7 = [
    1.2, 0, 0.45, 0.8, 0.6, 0.9, 1,
  ].map((usage, index) => ({
    date: new Date(Date.UTC(2026, 8, 4 + index)),
    ...stats(usage),
  }));

  return {
    today: stats(0),
    last7: stats(4.95, 990_000, 99),
    last30: stats(8.75, 1_700_000, 200),
    previous7: stats(1),
    history7,
    history30: history7,
    models7: [
      { model: "deepseek/deepseek-v4-flash-0731-with-an-intentionally-long-name", ...stats(2.09) },
      { model: "deepseek/deepseek-v4.1-flash", ...stats(0.86) },
      { model: "openai/gpt-4.1-mini", ...stats(0.04) },
    ],
    remaining: 5.02,
    ...overrides,
  };
}

test("uses exact rolling UTC day boundaries", () => {
  const ranges = usageRanges(now);

  assert.equal(ranges.today.start.toISOString(), "2026-09-10T00:00:00.000Z");
  assert.equal(ranges.last7.start.toISOString(), "2026-09-04T00:00:00.000Z");
  assert.equal(ranges.last30.start.toISOString(), "2026-08-12T00:00:00.000Z");
  assert.equal(ranges.previous7.start.toISOString(), "2026-08-28T00:00:00.000Z");
  assert.equal(ranges.previous7.end.toISOString(), ranges.last7.start.toISOString());
});

test("fetches all dashboard sections on their named rolling periods", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  const usageByStart = {
    "2026-09-10T00:00:00.000Z": 0,
    "2026-09-04T00:00:00.000Z": 4.95,
    "2026-08-12T00:00:00.000Z": 8.75,
    "2026-08-28T00:00:00.000Z": 1,
  };
  const historyRows = Array.from({ length: 30 }, (_, index) => ({
    date__day: new Date(Date.UTC(2026, 7, 12 + index)).toISOString(),
    total_usage: index === 23 ? 0 : 0.1,
    tokens_total: 100_000,
    request_count: 10,
  }));

  global.fetch = async (url, options) => {
    requests.push({ url, options });
    const body = options.body && JSON.parse(options.body);
    let payload;

    if (url.endsWith("/credits")) {
      payload = { data: { total_credits: 20, total_usage: 14.98 } };
    } else if (body.granularity === "day") {
      payload = { data: { data: historyRows, metadata: { truncated: false } } };
    } else if (body.dimensions) {
      payload = {
        data: {
          data: [
            { model: "deepseek/deepseek-v4", total_usage: 2.09, tokens_total: 400_000, request_count: 40 },
            { model: "openai/gpt-4.1-mini", total_usage: 0.86, tokens_total: 200_000, request_count: 20 },
          ],
          metadata: { truncated: false },
        },
      };
    } else {
      payload = {
        data: [{ total_usage: usageByStart[body.time_range.start], tokens_total: 990_000, request_count: 99 }],
        metadata: { truncated: false },
      };
    }

    return { ok: true, async text() { return JSON.stringify(payload); } };
  };

  try {
    const data = await fetchDashboardData("test-key", now, {
      analytics: "https://example.test/analytics/query",
      credits: "https://example.test/credits",
    });

    assert.equal(data.today.usage, 0);
    assert.equal(data.last7.usage, 4.95);
    assert.equal(data.last30.usage, 8.75);
    assert.equal(data.previous7.usage, 1);
    assert.equal(data.remaining, 5.02);
    assert.equal(data.models7[0].usage, 2.09);
    assert.equal(data.history7[0].usage, 0);
    assert.equal(requests.length, 7);
    assert.ok(requests.every((request) => request.options.headers.Authorization === "Bearer test-key"));

    const starts = requests
      .filter((request) => request.options.body)
      .map((request) => JSON.parse(request.options.body))
      .filter((body) => !body.granularity && !body.dimensions)
      .map((body) => body.time_range.start)
      .sort();
    assert.deepEqual(starts, [
      "2026-08-12T00:00:00.000Z",
      "2026-08-28T00:00:00.000Z",
      "2026-09-04T00:00:00.000Z",
      "2026-09-10T00:00:00.000Z",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("normalises both documented analytics response shapes", () => {
  assert.deepEqual(
    normaliseAnalyticsResponse({ data: [{ total_usage: 1 }], metadata: { truncated: false } }),
    { rows: [{ total_usage: 1 }], metadata: { truncated: false } },
  );
  assert.deepEqual(
    normaliseAnalyticsResponse({ data: { data: [{ total_usage: 1 }], metadata: { truncated: false } } }),
    { rows: [{ total_usage: 1 }], metadata: { truncated: false } },
  );
});

test("calculates seven-day burn, projection, and finite comparison", () => {
  const metrics = calculateMetrics(dashboardFixture());

  assert.equal(metrics.average7, 4.95 / 7);
  assert.equal(metrics.projected30, (4.95 / 7) * 30);
  assert.equal(metrics.costPerMillion7, 5);
  assert.equal(metrics.averageTokensPerRequest7, 10_000);
  assert.equal(metrics.comparison.label, "▲ +395.0%");
  assert.equal(metrics.runwayDays.toFixed(1), "7.1");
});

test("does not leak Infinity or missing data into ordinary metric text", () => {
  const newSpend = calculateMetrics(dashboardFixture({ previous7: stats(0) }));
  assert.equal(newSpend.comparison.label, "NEW SPEND");

  const noBurn = calculateMetrics(dashboardFixture({ last7: stats(0) }));
  assert.equal(noBurn.runwayDays, Infinity);

  const svg = renderSvg(dashboardFixture({
    last7: { usage: null, tokens: null, requests: null },
  }), now);
  assert.match(svg, />—</);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test("renders seven daily bars with an explicit zero-height zero-spend bar", () => {
  const bars = renderDailyBars(dashboardFixture().history7, 0, 0, 700, 160);
  assert.match(bars, /height="0" fill="black"/);
  assert.equal((bars.match(/>SEP /g) || []).length, 7);
});

test("renders a landscape Kindle dashboard with consistent seven-day labels", () => {
  const svg = renderSvg(dashboardFixture(), now);

  assert.match(svg, /width="1448" height="1072" viewBox="0 0 1448 1072"/);
  assert.match(svg, /LAST 7 DAYS/);
  assert.match(svg, /TOP MODELS · LAST 7 DAYS/);
  assert.match(svg, /LAST 30D/);
  assert.doesNotMatch(svg, /THIS WEEK|THIS MONTH|MONTH TO DATE|polyline/);
  assert.match(svg, /deepseek\/deepseek-v4-flash-0731…/);
  assert.match(svg, /height="0" fill="black"/);
});
