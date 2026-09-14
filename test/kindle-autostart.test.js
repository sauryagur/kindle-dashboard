const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  imageUrl,
  environmentContents,
  parseStatus,
  positiveInt,
} = require("../scripts/kindle-autostart");

test("imageUrl accepts stable HTTPS object URLs and rejects unsafe protocols", () => {
  assert.equal(
    imageUrl("https://r2.example.com/openrouter-dashboard.png"),
    "https://r2.example.com/openrouter-dashboard.png",
  );
  assert.throws(
    () => imageUrl("http://r2.example.com/openrouter-dashboard.png"),
    /https/,
  );
  assert.throws(() => imageUrl("file:///mnt/us/dash.png"), /https/);
  assert.throws(() => imageUrl(""), /required/);
});

test("positiveInt falls back for invalid Kindle intervals", () => {
  assert.equal(positiveInt("30", 21600), 30);
  assert.equal(positiveInt("0", 21600), 21600);
  assert.equal(positiveInt("invalid", 21600), 21600);
});

test("environmentContents safely quotes the generated Kindle configuration", () => {
  const contents = environmentContents({
    IMAGE_URL: "https://r2.example.com/openrouter-dashboard.png",
  });

  assert.match(
    contents,
    /^IMAGE_URL='https:\/\/r2\.example\.com\/openrouter-dashboard\.png'$/m,
  );
  assert.match(contents, /^INTERVAL='21600'$/m);
  assert.match(contents, /^FULL_EVERY='1'$/m);
  assert.match(contents, /^WIFI_RETRY_EVERY='3'$/m);
});

test("parseStatus returns public state from Kindle status output", () => {
  const output = [
    "Autostart : installed",
    "Enabled   : yes",
    "Upstart   : kindle-dashboard stop/waiting",
    "Loop      : running (pid 123)",
    "Image     : reachable",
  ].join("\n");

  assert.deepEqual(parseStatus(output), {
    imageReachable: true,
    enabled: true,
    installed: true,
    output,
    running: true,
  });
});

test("parseStatus reports stopped and unavailable scripts", () => {
  const output = [
    "Autostart : not installed",
    "Enabled   : n/a",
    "Loop      : stopped",
    "Image     : unavailable",
  ].join("\n");

  const status = parseStatus(output);
  assert.equal(status.installed, false);
  assert.equal(status.enabled, false);
  assert.equal(status.running, false);
  assert.equal(status.imageReachable, false);
});
