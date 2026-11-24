import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.env.URL ?? 'http://127.0.0.1:4177/';
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const messages = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') messages.push(msg.text());
});
page.on('pageerror', (err) => messages.push(err.stack ?? err.message));

await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));

const report = await page.evaluate(async () => {
  const g = window.game;
  const out = { errors: [] };
  if (!g) throw new Error('window.game was not mounted');

  const day0 = g.state.day;
  await g.advanceDay();
  out.dayAdvanced = g.state.day === day0 + 1;
  out.lastWorkerMs = g.state.lastWorkerMs;

  // Brew, assign, advance, package and verify score before filling all slots.
  g.selectBrewhouseRecipe('recipe-pale');
  const queue0 = g.state.queuedWorts.length;
  g.brewCurrent();
  out.brewQueued = g.state.queuedWorts.length === queue0 + 1;
  let targetTank = g.state.fermenters.find((t) => !t.batch && t.status === 'empty');
  if (!targetTank || !g.state.queuedWorts[0]) throw new Error('No empty tank or queued wort');
  g.assignWort(targetTank.id, g.state.queuedWorts[0].id);
  out.assigned = Boolean(targetTank.batch);
  for (let i = 0; i < 11; i++) {
    const result = await g.worker.advanceDay(g.state.fermenters);
    g.state.fermenters = result.fermenters;
    targetTank = g.state.fermenters.find((t) => t.id === targetTank.id);
  }
  const beerCount0 = g.state.beerList.length;
  const packaged = g.packageTank(targetTank.id);
  out.packaged = typeof packaged !== 'string';
  if (typeof packaged !== 'string') {
    out.beerScore = packaged.scores.total;
    out.scoreParts = [packaged.scores.abv, packaged.scores.ibu, packaged.scores.color, packaged.scores.flavor];
  }
  out.beerAdded = g.state.beerList.length === beerCount0 + 1;

  // Fill all 20 tanks with active batches for the explicit performance path.
  g.state.cash = 10_000_000;
  while (g.state.fermenters.length < 20) g.buyTank();
  const template = structuredClone(g.state.beerList[0] ? g.state.fermenters.find((t) => t.batch)?.batch ?? null : null);
  const fallback = g.state.fermenters.find((t) => t.batch)?.batch ?? null;
  const perfTemplate = template ?? fallback;
  if (!perfTemplate) throw new Error('No template batch');
  g.state.fermenters.forEach((tank, i) => {
    if (!tank.batch) {
      tank.batch = structuredClone(perfTemplate);
      tank.batch.batchId = `perf-browser-${i}`;
      tank.batch.sugarKg = tank.batch.fermentableKgInitial * (0.2 + (i % 5) * 0.12);
      tank.setpointC = 19 + (i % 5);
      tank.status = 'fermenting';
    }
  });
  out.tankCount = g.state.fermenters.length;
  const perf = await g.worker.advanceDay(g.state.fermenters);
  out.twentyTankComputeMs = perf.computeMs;
  out.perfPass = perf.computeMs <= 30;
  out.consoleErrors = [];
  return out;
});

console.log(JSON.stringify(report, null, 2));
console.log(messages.join('\n'));
await browser.close();
if (messages.some((m) => m.includes('[pageerror]') || m.includes('Uncaught'))) process.exit(1);
if (!report.perfPass || !report.dayAdvanced || !report.brewQueued || !report.assigned || !report.packaged) process.exit(1);
