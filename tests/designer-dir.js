'use strict';
/* Where the designer's (studio's) source lives, for the parity tests that read
 * its PHP and JS beside server.js. The designer is its own repo
 * (lumise-designer). These tests used to read a gitignored, hand-copied
 * Lumise/ folder that only the main checkout had and that went stale (Sep 2)
 * while the designer moved on, so that copy is never used.
 *
 * Order: JT_DESIGNER_DIR (and if it is set but wrong, that is an error, not a
 * reason to quietly test something else), then lumise-designer next to this
 * repo, then next to the main checkout (for a worktree kept elsewhere).
 *
 * Resolved on first use, so a missing designer fails only the tests that read
 * it, loudly, and every server.js-only test in the same file still runs.
 * The tests read whatever that checkout holds: to test a designer branch or
 * a pinned revision, point JT_DESIGNER_DIR at a worktree of it. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
/* A designer root has all of these; one file alone also matches other Lumise forks. */
const MARKERS = ['jt-auth.php', 'php_connector.php', 'core/cart.php', 'core/assets/js/app.js'];
const isDesigner = (d) => MARKERS.every((m) => fs.existsSync(path.join(d, m)));

function mainCheckout() {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return path.dirname(path.resolve(ROOT, common));
  } catch { return ''; }
}

let cached = null;
/** The designer repo's root, absolute. Throws, naming what to fix, when there is none. */
function designerDir() {
  if (cached) return cached;
  const env = process.env.JT_DESIGNER_DIR;
  if (env) {
    if (!isDesigner(path.resolve(env))) {
      throw new Error(`JT_DESIGNER_DIR=${env} is not a designer checkout (needs ${MARKERS.join(', ')}).`);
    }
    return (cached = path.resolve(env));
  }
  const tried = [path.join(ROOT, '..', 'lumise-designer')];
  const main = mainCheckout();
  if (main && path.resolve(main) !== path.resolve(ROOT)) tried.push(path.join(main, '..', 'lumise-designer'));
  const found = tried.find(isDesigner);
  if (!found) {
    throw new Error(`Designer source not found. Clone lumise-designer next to this repo, or set JT_DESIGNER_DIR. Looked in: ${tried.join(', ')}`);
  }
  return (cached = path.resolve(found));
}

/** A file in the designer repo, by its path from the designer root. */
const designerPath = (...parts) => path.join(designerDir(), ...parts);
/** That file's contents. */
const readDesigner = (...parts) => fs.readFileSync(designerPath(...parts), 'utf8');

module.exports = { designerDir, designerPath, readDesigner };
