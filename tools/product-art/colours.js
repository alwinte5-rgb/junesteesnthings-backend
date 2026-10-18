/* Dump colourName + front/back image paths for a style as JSON. argv: styleID
 *
 * Through the shared S&S client (tools/lib/ssa-client.js): S&S throttles a
 * busy account with 429/503, and the bare fetch this used to make read the
 * throttle's error body as a colour list and crashed on it — 55 of the first
 * 178-product streetwear batch (2026-10-18, six workers in parallel). */
const { makeClient } = require('../lib/ssa-client');

let b = ''; process.stdin.on('data', (d) => (b += d));
process.stdin.on('end', async () => {
  const e = JSON.parse(b);
  const ssa = makeClient(e.SSA_ACCOUNT, e.SSA_API_KEY);
  let rows;
  try { rows = await ssa('products/?styleid=' + Number(process.argv[2])); }
  catch (err) { console.error(err.message); process.exit(1); }
  if (!Array.isArray(rows)) { console.error('S&S returned no colour rows for style ' + process.argv[2]); process.exit(1); }
  const seen = new Map();
  for (const x of rows) {
    if (!x.colorName || seen.has(x.colorName)) continue;
    seen.set(x.colorName, { name: x.colorName, front: x.colorFrontImage || '', back: x.colorBackImage || '', c1: x.color1, c2: x.color2 });
  }
  console.log(JSON.stringify([...seen.values()], null, 1));
});
