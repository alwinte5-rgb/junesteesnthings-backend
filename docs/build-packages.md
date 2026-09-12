# Why this service installs a mysql client

`railpack.json` adds `default-mysql-client` to the deployed image. Nothing in
the web server needs it; the nightly supplier sync does.

The catalogue is MySQL (Lumise, its own Railway service) while the app's own
`pool` is Postgres, so there is no MySQL driver in `package.json`. The sync is
`tools/ssa-sync.js`, run as a child process by `runSupplierSync()` in
`server.js`, and it shells out to a `mysql` client — deliberately, so the
scheduled path and the by-hand path cannot drift into behaving differently.

## The failure this fixes

`tools/lib/db.js` pinned `/usr/local/opt/mysql-client/bin/mysql`, a Homebrew
path that exists on the shop's laptop and nowhere else. In the deployed image
the spawn failed with ENOENT, `spawnSync` returned a null status, and the throw
read `mysql exited null`. Every nightly run from 2026-08-29 to 2026-09-11
claimed its day in `jt_supplier_sync_log` and wrote nothing — fourteen rows that
looked like fourteen clean runs. No product cost was refreshed for a fortnight.

## Do not put this back in nixpacks.toml

The first attempt at this fix was a `nixpacks.toml`. **Railway builds this
service with Railpack, not Nixpacks**, so the file was ignored in full: the
deploy went green, the build installed only `libatomic1`, and the sync stayed
broken. A successful deploy is not evidence that build config was read.

Checking it, rather than trusting it:

    railway logs --build --service junesteesnthings-backend | grep -i apt

That line must name `default-mysql-client`. If the packages ever need to move
out of the repo, the equivalent service variable is
`RAILPACK_DEPLOY_APT_PACKAGES`.
