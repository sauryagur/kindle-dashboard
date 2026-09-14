#!/usr/bin/env node

/**
 * OpenRouter Kindle Dashboard
 *
 * Required:
 *   OPENROUTER_MANAGEMENT_KEY=... (or OPENROUTER_API_KEY=...)
 *
 * Optional:
 *   DASHBOARD_SVG=out/openrouter-dashboard.svg
 *   OPENROUTER_ANALYTICS_URL=https://openrouter.ai/api/v1/analytics/query
 *   OPENROUTER_CREDITS_URL=https://openrouter.ai/api/v1/credits
 *   DEBUG_ANALYTICS=1
 */

const fs = require("node:fs");
const path = require("node:path");

const apiKey = process.env.OPENROUTER_MANAGEMENT_KEY || process.env.OPENROUTER_API_KEY;
const output = process.env.DASHBOARD_SVG || "out/openrouter-dashboard.svg";
const analyticsUrl = process.env.OPENROUTER_ANALYTICS_URL || "https://openrouter.ai/api/v1/analytics/query";
const creditsUrl = process.env.OPENROUTER_CREDITS_URL || "https://openrouter.ai/api/v1/credits";
const debug = process.env.DEBUG_ANALYTICS === "1";

const WIDTH = 1448;
const HEIGHT = 1072;
const PAD = 48;
const RIGHT = WIDTH - PAD;
const SPLIT_X = 892;
const CONTENT_TOP = 116;
const CONTENT_BOTTOM = 560;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}


function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(value) {
  if (value == null) return "—";
  if (value === Infinity) return "∞";
  if (value !== 0 && Math.abs(value) < 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function compactNumber(value) {
  if (value == null) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

function truncate(value, maximum) {
  const string = String(value ?? "");
  return string.length <= maximum ? string : `${string.slice(0, maximum - 1)}…`;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysAgo(now, days) {
  const date = startOfUtcDay(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shortDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).toUpperCase();
}

function usageRanges(now) {
  const today = startOfUtcDay(now);
  const last7 = daysAgo(now, 6);
  const last30 = daysAgo(now, 29);
  const previous7 = daysAgo(now, 13);

  return {
    today: { start: today, end: now },
    last7: { start: last7, end: now },
    last30: { start: last30, end: now },
    previous7: { start: previous7, end: last7 },
  };
}

async function fetchJson(url, key, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      ...options.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let payload = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // Error below preserves endpoint context without leaking credentials.
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || raw.slice(0, 500) || "unknown error";
    throw new Error(`OpenRouter HTTP ${response.status}: ${message}`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`OpenRouter returned invalid JSON from ${url}`);
  }

  return payload;
}

function normaliseAnalyticsResponse(payload) {
  const rows = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.data?.data)
      ? payload.data.data
      : null;
  const metadata = payload.metadata ?? payload.data?.metadata ?? {};

  if (!rows) {
    throw new Error(`Unexpected OpenRouter analytics response: ${JSON.stringify({
      keys: Object.keys(payload),
      metadata,
    })}`);
  }

  return { rows, metadata };
}

async function analyticsQuery(key, body, urls = { analytics: analyticsUrl, credits: creditsUrl }) {
  const payload = await fetchJson(urls.analytics, key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = normaliseAnalyticsResponse(payload);

  if (debug) {
    console.error("[analytics]", JSON.stringify({
      query: body,
      metadata: result.metadata,
      rows: result.rows.slice(0, 3),
    }, null, 2));
  }

  return result;
}

function extractBucketDate(row) {
  const direct = [
    row.granularity_start,
    row.timestamp,
    row.time,
    row.date,
    row.bucket,
    row.period,
    row.time_bucket,
    row.start_time,
    row.start,
  ];
  const generated = Object.entries(row)
    .filter(([key]) => /(?:date|created_at)__/.test(key))
    .map(([, value]) => value);

  for (const candidate of [...direct, ...generated]) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function extractModel(row) {
  if (typeof row.model === "string") return row.model;
  if (typeof row.model_name === "string") return row.model_name;
  if (typeof row.dimension === "string") return row.dimension;
  return "Unknown model";
}

function normaliseStats(row) {
  return {
    usage: number(row?.total_usage),
    tokens: number(row?.tokens_total),
    requests: number(row?.request_count),
  };
}

function requireAggregateRow(rows, metadata, label) {
  if (metadata.truncated) {
    throw new Error(`OpenRouter ${label} aggregate was truncated`);
  }
  if (!rows.length) {
    throw new Error(`OpenRouter returned no aggregate row for ${label}; refusing to display it as zero`);
  }
  return normaliseStats(rows[0]);
}

async function fetchPeriodStats(key, range, label, urls) {
  const { rows, metadata } = await analyticsQuery(key, {
    metrics: ["total_usage", "tokens_total", "request_count"],
    time_range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    limit: 10,
  }, urls);
  return requireAggregateRow(rows, metadata, label);
}

async function fetchDailyHistory(key, range, now, urls) {
  const { rows, metadata } = await analyticsQuery(key, {
    metrics: ["total_usage", "tokens_total", "request_count"],
    granularity: "day",
    time_range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    limit: 40,
  }, urls);

  if (metadata.truncated) {
    throw new Error("OpenRouter daily history was truncated");
  }

  const daily = new Map();
  for (const row of rows) {
    const date = extractBucketDate(row);
    if (!date) {
      if (debug) console.error("[analytics] skipped row without daily bucket", row);
      continue;
    }
    daily.set(dateKey(date), normaliseStats(row));
  }

  return Array.from({ length: 30 }, (_, index) => {
    const date = daysAgo(now, 29 - index);
    const stats = daily.get(dateKey(date));
    return {
      date,
      usage: stats?.usage ?? null,
      tokens: stats?.tokens ?? null,
      requests: stats?.requests ?? null,
    };
  });
}

async function fetchTopModels(key, range, urls) {
  const { rows, metadata } = await analyticsQuery(key, {
    metrics: ["total_usage", "tokens_total", "request_count"],
    dimensions: ["model"],
    order_by: { field: "total_usage", direction: "desc" },
    time_range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    limit: 5,
  }, urls);

  if (metadata.truncated && debug) {
    console.error("[analytics] top-model query truncated at requested top five rows");
  }

  return rows
    .map((row) => ({ model: extractModel(row), ...normaliseStats(row) }))
    .filter((row) => row.usage != null && row.usage > 0)
    .sort((left, right) => right.usage - left.usage)
    .slice(0, 5);
}

async function fetchRemainingCredits(key, urls) {
  const payload = await fetchJson(urls.credits, key);
  const data = payload.data ?? payload;
  const credits = number(data.total_credits);
  const usage = number(data.total_usage);

  if (credits == null || usage == null) {
    throw new Error("Invalid OpenRouter credits response");
  }

  return credits - usage;
}

function periodComparison(current, previous) {
  if (current == null || previous == null) {
    return { direction: "neutral", percentage: null, label: "—" };
  }
  if (previous === 0) {
    if (current === 0) return { direction: "neutral", percentage: 0, label: "NO CHANGE" };
    return { direction: "up", percentage: null, label: "NEW SPEND" };
  }

  const percentage = ((current - previous) / previous) * 100;
  if (percentage > 0) return { direction: "up", percentage, label: `▲ +${percentage.toFixed(1)}%` };
  if (percentage < 0) return { direction: "down", percentage, label: `▼ ${percentage.toFixed(1)}%` };
  return { direction: "neutral", percentage: 0, label: "NO CHANGE" };
}

function calculateMetrics(data) {
  const last7Usage = data.last7?.usage ?? null;
  const previous7Usage = data.previous7?.usage ?? null;
  const last7Tokens = data.last7?.tokens ?? null;
  const last7Requests = data.last7?.requests ?? null;
  const average7 = last7Usage == null ? null : last7Usage / 7;
  const comparison = periodComparison(last7Usage, previous7Usage);
  const projected30 = average7 == null ? null : average7 * 30;
  const runwayDays = data.remaining == null || average7 == null
    ? null
    : average7 > 0
      ? data.remaining / average7
      : Infinity;
  const costPerMillion7 = last7Usage != null && last7Tokens != null && last7Tokens > 0
    ? (last7Usage / last7Tokens) * 1_000_000
    : null;
  const averageTokensPerRequest7 = last7Tokens != null && last7Requests != null && last7Requests > 0
    ? last7Tokens / last7Requests
    : null;
  const state = comparison.direction === "up" && (comparison.percentage == null || comparison.percentage >= 50)
    ? "HIGHER BURN"
    : comparison.direction === "down" && comparison.percentage <= -20
      ? "COOLING"
      : comparison.direction === "neutral" && comparison.label === "—"
        ? "NO COMPARISON"
        : "STEADY";

  return {
    average7,
    comparison,
    projected30,
    runwayDays,
    costPerMillion7,
    averageTokensPerRequest7,
    state,
  };
}

function text(x, y, value, className, attrs = "") {
  return `<text x="${x}" y="${y}" class="${className}" ${attrs}>${esc(value)}</text>`;
}

function rule(x1, y1, x2, y2, width = 2, color = "black") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" />`;
}

function renderHeader(data, now) {
  const timestamp = now.toISOString().slice(0, 16).replace("T", " ");
  return `
    ${text(PAD, 61, "OPENROUTER", "brand")}
    ${text(1080, 39, "BALANCE", "meta strong", 'text-anchor="end"')}
    ${text(1080, 72, money(data.remaining), "header-value", 'text-anchor="end"')}
    ${text(RIGHT, 39, "UPDATED", "meta strong", 'text-anchor="end"')}
    ${text(RIGHT, 68, `${timestamp} UTC`, "meta", 'text-anchor="end"')}
    ${rule(PAD, 89, RIGHT, 89, 4)}
  `;
}

function niceMaximum(value) {
  if (!isNumber(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function renderDailyBars(history, x, y, width, height) {
  const knownValues = history.map((day) => day.usage).filter(isNumber);
  const maximum = niceMaximum(Math.max(...knownValues, 0));
  const axisWidth = 60;
  const chartX = x + axisWidth;
  const chartWidth = width - axisWidth;
  const baseline = y + height;
  const slotWidth = chartWidth / history.length;
  const barWidth = Math.min(54, slotWidth * 0.56);
  let svg = "";

  for (let index = 0; index <= 3; index += 1) {
    const ratio = index / 3;
    const lineY = y + height * ratio;
    const value = maximum * (1 - ratio);
    svg += rule(chartX, lineY, chartX + chartWidth, lineY, index === 3 ? 2 : 1, index === 3 ? "black" : "#777");
    svg += text(chartX - 12, lineY + 6, money(value), "axis", 'text-anchor="end"');
  }

  history.forEach((day, index) => {
    const center = chartX + slotWidth * index + slotWidth / 2;
    const usage = day.usage;
    const labelY = baseline + 30;

    if (usage == null) {
      svg += `<rect x="${(center - barWidth / 2).toFixed(1)}" y="${(y + height * 0.34).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(height * 0.66).toFixed(1)}" fill="white" stroke="black" stroke-width="2" stroke-dasharray="5 4" />`;
      svg += text(center, y + height * 0.29, "—", "axis", 'text-anchor="middle"');
    } else if (usage > 0) {
      const visualHeight = Math.max(4, (usage / maximum) * height);
      svg += `<rect x="${(center - barWidth / 2).toFixed(1)}" y="${(baseline - visualHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${visualHeight.toFixed(1)}" fill="black" />`;
    } else {
      svg += `<rect x="${(center - barWidth / 2).toFixed(1)}" y="${baseline.toFixed(1)}" width="${barWidth.toFixed(1)}" height="0" fill="black" />`;
    }

    svg += text(center, labelY, shortDate(day.date), "axis", 'text-anchor="middle"');
  });

  return svg;
}

function renderUsagePanel(data, metrics) {
  const comparisonNote = metrics.comparison.label === "NEW SPEND"
    ? "NEW SPEND VS PREVIOUS 7 DAYS"
    : metrics.comparison.label === "—"
      ? "COMPARISON UNAVAILABLE"
      : "VS PREVIOUS 7 DAYS";
  const comparisonValue = metrics.comparison.label === "NEW SPEND"
    ? "▲ NEW"
    : metrics.comparison.label;

  return `
    ${text(PAD, CONTENT_TOP + 28, "LAST 7 DAYS", "section")}
    ${text(PAD, CONTENT_TOP + 114, money(data.last7?.usage), "headline")}
    ${text(PAD, CONTENT_TOP + 146, comparisonValue, "comparison")}
    ${text(PAD + 176, CONTENT_TOP + 146, comparisonNote, "meta")}
    ${text(PAD, CONTENT_TOP + 205, "DAILY SPEND", "section-small")}
    ${renderDailyBars(data.history7, PAD, CONTENT_TOP + 230, SPLIT_X - PAD - 34, 154)}
  `;
}

function renderTopModels(models) {
  const x = SPLIT_X + 34;
  const width = RIGHT - x;
  const maximum = Math.max(...models.map((model) => model.usage), 0.01);
  let rows = "";

  if (!models.length) {
    rows = text(x, CONTENT_TOP + 92, "No 7D model spend available", "body");
  } else {
    rows = models.map((model, index) => {
      const rowY = CONTENT_TOP + 71 + index * 71;
      const fill = Math.max(4, (model.usage / maximum) * width);
      return `
        ${text(x, rowY, truncate(model.model, 32), "model strong")}
        ${text(RIGHT, rowY, money(model.usage), "model strong", 'text-anchor="end"')}
        <rect x="${x}" y="${rowY + 14}" width="${width}" height="16" fill="white" stroke="black" stroke-width="1.5" />
        <rect x="${x}" y="${rowY + 14}" width="${fill.toFixed(1)}" height="16" fill="black" />
      `;
    }).join("");
  }

  return `
    ${rule(SPLIT_X, CONTENT_TOP - 12, SPLIT_X, CONTENT_BOTTOM - 2, 2)}
    ${text(x, CONTENT_TOP + 28, "TOP MODELS · LAST 7 DAYS", "section-small")}
    ${rows}
  `;
}

function renderMetricStrip(data, metrics) {
  const metricsToRender = [
    ["TODAY", money(data.today?.usage), "UTC DAY"],
    ["LAST 7D", money(data.last7?.usage), "ROLLING"],
    ["LAST 30D", money(data.last30?.usage), "ROLLING"],
    ["TOKENS · 7D", compactNumber(data.last7?.tokens), "TOTAL"],
    ["REQUESTS · 7D", compactNumber(data.last7?.requests), "TOTAL"],
    ["COST / 1M · 7D", money(metrics.costPerMillion7), "TOKENS"],
  ];
  const top = 585;
  const bottom = 718;
  const column = (RIGHT - PAD) / metricsToRender.length;
  let svg = rule(PAD, 560, RIGHT, 560, 3);

  metricsToRender.forEach(([label, value, note], index) => {
    const x = PAD + column * index + 18;
    if (index > 0) svg += rule(PAD + column * index, top, PAD + column * index, bottom, 1, "#777");
    svg += text(x, 617, label, "metric-label");
    svg += text(x, 659, value, "strip-value");
    svg += text(x, 688, note, "meta");
  });

  return `${svg}${rule(PAD, bottom, RIGHT, bottom, 3)}`;
}

function formatRunway(days) {
  if (days == null) return "—";
  if (days === Infinity) return "∞ DAYS";
  return days >= 100 ? `${Math.round(days)} DAYS` : `${days.toFixed(1)} DAYS`;
}

function renderBurnStrip(metrics) {
  const fields = [
    ["AVG / DAY · 7D", money(metrics.average7)],
    ["30D PROJECTION", money(metrics.projected30)],
    ["RUNWAY", formatRunway(metrics.runwayDays)],
    ["BURN VS PREV 7D", metrics.comparison.label === "NEW SPEND" ? "▲ NEW" : metrics.comparison.label],
    ["STATUS", metrics.state],
  ];
  const top = 754;
  const column = (RIGHT - PAD) / fields.length;
  let svg = "";

  fields.forEach(([label, value], index) => {
    const x = PAD + column * index + 18;
    if (index > 0) svg += rule(PAD + column * index, top, PAD + column * index, 886, 1, "#777");
    svg += text(x, 786, label, "metric-label");
    svg += text(x, 835, value, index === 4 ? "status-value" : "burn-value");
  });

  return svg;
}

function renderSvg(data, now = new Date()) {
  const metrics = calculateMetrics(data);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="100%" height="100%" fill="white" />
  <style>
    text { fill: black; font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif; }
    .brand { font-size: 38px; font-weight: 900; letter-spacing: 1.5px; }
    .header-value { font-size: 32px; font-weight: 900; }
    .headline { font-size: 82px; font-weight: 900; letter-spacing: -2px; }
    .section { font-size: 24px; font-weight: 900; letter-spacing: 1.4px; }
    .section-small { font-size: 20px; font-weight: 900; letter-spacing: 1px; }
    .comparison { font-size: 25px; font-weight: 900; }
    .metric-label { font-size: 16px; font-weight: 900; letter-spacing: 0.8px; }
    .strip-value { font-size: 31px; font-weight: 900; }
    .burn-value { font-size: 30px; font-weight: 900; }
    .status-value { font-size: 24px; font-weight: 900; letter-spacing: 0.5px; }
    .model { font-size: 19px; }
    .body { font-size: 21px; }
    .axis { font-size: 14px; font-weight: 700; }
    .meta { font-size: 16px; letter-spacing: 0.4px; }
    .strong { font-weight: 900; }
  </style>
  ${renderHeader(data, now)}
  ${renderUsagePanel(data, metrics)}
  ${renderTopModels(data.models7 ?? [])}
  ${renderMetricStrip(data, metrics)}
  ${renderBurnStrip(metrics)}
  ${rule(PAD, 930, RIGHT, 930, 3)}
  ${text(PAD, 973, "OPENROUTER USAGE · ROLLING UTC WINDOWS", "meta strong")}
  ${text(PAD, 1007, "LAST 7D: TODAY + PREVIOUS 6 CALENDAR DAYS", "meta")}
  ${text(RIGHT, 973, '"like and subscribe"', "meta strong", 'text-anchor="end"')}
  ${text(RIGHT, 1007, "- gur", "meta", 'text-anchor="end"')}
</svg>`;
}

async function fetchDashboardData(key, now = new Date(), urls = { analytics: analyticsUrl, credits: creditsUrl }) {
  const ranges = usageRanges(now);
  const [today, last7, last30, previous7, history30, models7, remaining] = await Promise.all([
    fetchPeriodStats(key, ranges.today, "today", urls),
    fetchPeriodStats(key, ranges.last7, "last 7 days", urls),
    fetchPeriodStats(key, ranges.last30, "last 30 days", urls),
    fetchPeriodStats(key, ranges.previous7, "previous 7 days", urls),
    fetchDailyHistory(key, ranges.last30, now, urls),
    fetchTopModels(key, ranges.last7, urls),
    fetchRemainingCredits(key, urls),
  ]);

  return {
    today,
    last7,
    last30,
    previous7,
    history7: history30.slice(-7),
    history30,
    models7,
    remaining,
  };
}

async function main() {
  if (!apiKey) {
    console.error("OPENROUTER_MANAGEMENT_KEY or OPENROUTER_API_KEY is required");
    process.exit(2);
  }

  const now = new Date();
  const data = await fetchDashboardData(apiKey, now);
  if (debug) console.error("[dashboard data]", JSON.stringify(data, null, 2));

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, renderSvg(data, now), "utf8");
  console.log(`dashboard written to ${output}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  analyticsQuery,
  calculateMetrics,
  daysAgo,
  fetchDashboardData,
  normaliseAnalyticsResponse,
  renderDailyBars,
  renderSvg,
  usageRanges,
};
