import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.env.URL ?? 'http://127.0.0.1:4177/';
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,1000'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const messages = [];
page.on('console', (msg) => messages.push(`[console.${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => messages.push(`[pageerror] ${err.stack ?? err.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((resolve) => setTimeout(resolve, 1200));

const scale = Math.min(1600 / 1366, 1000 / 860);
const ox = (1600 - 1366 * scale) / 2;
const oy = (1000 - 860 * scale) / 2;
async function clickDesign(x, y) {
  await page.mouse.click(ox + x * scale, oy + y * scale);
  await new Promise((resolve) => setTimeout(resolve, 450));
}
async function shot(name) {
  await page.screenshot({ path: `.tmp/${name}.png` });
}

await shot('01-brewhouse');
await clickDesign(492, 32); // fermenters
await shot('02-fermenters');
await clickDesign(828, 98); // benchmark
await new Promise((r) => setTimeout(r, 900));
await shot('03-benchmark');
await clickDesign(632, 32); // lab
await shot('04-lab');
await clickDesign(772, 32); // tavern
await shot('05-tavern');
await clickDesign(1305, 32); // shop
await shot('06-shop');
await clickDesign(189, 70); // backdrop close maybe modal x173+16? close button center 1145? Wait use close.
await clickDesign(1145, 70);
await clickDesign(1204, 32); // advance day
await new Promise((r) => setTimeout(r, 900));
await shot('07-after-advance');

// Exercise brewing flow.
await clickDesign(32 + 127, 116 + 0 * 76 + 34);
await clickDesign(903, 750); // brew button center 778+125=903 y750
await new Promise((r) => setTimeout(r, 300));
await clickDesign(492, 32);
await shot('08-after-brew');

console.log(messages.join('\n'));
await browser.close();
if (messages.some((m) => m.includes('[pageerror]'))) process.exit(1);
