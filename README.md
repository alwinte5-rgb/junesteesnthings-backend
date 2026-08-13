# June's Tees — backend

The server behind [jtees.net](https://www.jtees.net): a custom apparel and
print shop in Chicago, IL. One Express app does all of it — it serves the
public marketing site out of `public/`, takes quote and contact submissions,
syncs customers into Brevo, records payments, and renders the admin boards the
shop actually runs the day on.

There is no build step and no frontend framework. Pages are static HTML in
`public/`, and the admin screens are HTML rendered by `server.js`.

## Requirements

- **Node 18 or newer** (`node --version`) — the app uses the built-in `fetch`
- **PostgreSQL** — any reachable instance; tables are created on boot
- A **Brevo** account (email + contact sync). Brevo is a hard requirement:
  the process refuses to start without `BREVO_API_KEY`.

## Run it from a clean clone

```bash
git clone https://github.com/alwinte5-rgb/junesteesnthings-backend.git
cd junesteesnthings-backend
npm install
cp .env.example .env
```

Now open `.env` and fill in, at minimum, the three the server requires:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` |
| `BREVO_API_KEY` | Brevo → Account → SMTP & API → API Keys |
| `NOTIFICATION_EMAIL` | where new quote/contact notifications are sent |

Then:

```bash
npm run dev     # nodemon, restarts on save
# or
npm start       # what production runs
```

The app listens on `PORT`, default **3000** → <http://localhost:3000>.

On first boot `initDB()` creates every table it needs (`quotes`,
`quote_payments`, `submissions`, `reviews`, `expenses` and the rest) and runs
its own `ALTER TABLE ... IF NOT EXISTS` migrations. They are idempotent, so
starting against an existing database is safe. There is no separate migration
command.

### Did it work?

A successful boot prints `Listening on port 3000`. Two things are worth
checking straight after:

- <http://localhost:3000> serves the marketing site.
- <http://localhost:3000/production> asks for a password. That is the
  admin gate working — see below.

If a required variable is missing the process prints
`Missing required environment variables: ...` and **exits non-zero before
binding the port**. That is deliberate: a missing variable should fail the
boot, not the first customer request. A missing `RESEND_API_KEY` or
`ADMIN_PASSWORD` only warns, because the app still runs without them.

## Reaching the admin boards

Every admin route is gated by `requireAdmin` (`server.js`) against
`ADMIN_PASSWORD`. Without that variable set, the boards are unreachable by
design — the server warns about this at boot.

| Route | What it is |
|---|---|
| `/quotes` | the money board — quotes, what is owed |
| `/production` | the work board — kanban, one tap per milestone |
| `/production/:code` | one job: full checklist and milestones |
| `/books` | takings, expenses, tax set aside |
| `/customer` | one customer's history |
| `/admin/reviews` | review moderation |

A job moves across `/production` through five columns, derived from milestone
dates on the quote rather than a separate status field — To start → Artwork &
proof → Blanks → Press → Check & ship. Delivered is a destination, not a
column: a delivered job leaves the board.

The button on a card **finishes the column the card is in**, it does not jump
to the next one — a card in Press offers "✓ Press". The exception is To start,
which owns no milestone of its own, so its button advances. This means Check &
ship takes **two** taps to clear: the first records checked-and-shipped and the
card stays put, the second stamps delivered and drops it off the board. That
second tap is deliberate — shipped is the last state where a problem is still
recoverable, so nothing but an explicit tap may call a job arrived.

## Tests

```bash
node --test tests/*.test.js
```

Built-in `node:test`, no test dependency. The suites lift the real functions
out of `server.js` and run those, rather than restating the logic, so a test
cannot quietly drift from the code it guards.

Pass the files, not the directory: on current Node a positional argument is a
glob rather than a directory to walk, so `node --test tests/` fails with
`Cannot find module`. Bare `node --test` works but recurses into the
gitignored local asset trees, so it is slower and picks up tests that are not
this project's.

## The rest of `.env`

`.env.example` is the full list and says where each value comes from. Nothing
below is needed to get the app running locally.

- **Bot protection** — `REQUIRE_CLOUDFLARE`, `REQUIRE_FORM_TOKEN`,
  `FORM_TOKEN_SECRET`. Set the first two to `true` in production only; leaving
  them off locally is what lets you submit the forms by hand.
- **Cloudinary** — `CLOUDINARY_CLOUD_NAME` *or* `CLOUDINARY_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Uploads are signed
  server-side via `/api/cloudinary-signature`; the secret never reaches the
  browser.

  The cloud name has two accepted spellings and they are **not**
  interchangeable everywhere: `cloudinary.config()` and `/api/config` read
  `CLOUDINARY_CLOUD_NAME || CLOUDINARY_NAME`, but the two inline upload
  widgets read `CLOUDINARY_NAME` only and disable themselves when it is
  empty. Production sets `CLOUDINARY_NAME`, so setting only
  `CLOUDINARY_CLOUD_NAME` would leave the widgets dead while every config
  endpoint still looked correct. Set `CLOUDINARY_NAME`, or set both.

  **The secret is stored on Railway under a misspelt name,
  `CLUDINARY_API_SECRET`, and the server deliberately reads both spellings.**
  Do not tidy that fallback away. PR #7 did, and it took signed uploads down:
  the correctly-spelled variable had never been set, so
  `/api/cloudinary-signature` started answering **503 `Cloudinary not
  configured`** and every photo upload silently stopped attaching, while the
  quote and review forms carried on submitting and reporting success.
  `tests/cloudinary-secret.test.js` now fails if the fallback is removed.

  To retire the typo safely: add `CLOUDINARY_API_SECRET` on Railway with the
  same value, redeploy, confirm the check below returns `200`, then delete
  `CLUDINARY_API_SECRET` and the fallback together.

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    https://jtees.net/api/cloudinary-signature \
    -H 'Content-Type: application/json' -d '{"folder":"quote_requests"}'
  ```

  `200` is healthy, `503` means neither spelling is set. Note the cloud name
  and API key come from a separate public endpoint (`/api/config`) and can
  look perfectly correct while the secret is absent — which is why this failure
  is easy to look straight at and call fine.
- **Resend** — `RESEND_API_KEY`, the fallback when Brevo sending fails.
- **Clover** — `CLOVER_*`, card payments and the payment webhook.
- **HubSpot** — `HUBSPOT_*`, legacy contact sync.

`.env` is gitignored and must stay that way. No credential belongs in a
client-visible variable or in `public/`.

## Layout

```
server.js        the entire app — routes, admin UI, email, payments, DB init
public/          the marketing site, served statically (also robots/sitemap)
tools/           one-off operational scripts, run by hand with node
docs/            operational notes (Brevo workflows, local SEO, Tawk macros)
AGENTS.md        the rules an AI agent must follow in this repo — read first
```

`server.js` is deliberately one file. It is large; use your editor's symbol
search rather than scrolling.

## Deployment

Railway, from `main`. `npm start` purges the Cloudflare cache via
`tools/cf.js` and then boots the server. Railway injects `DATABASE_URL`; every
other variable is set in the Railway dashboard.

## Before you change anything

Read **`AGENTS.md`**. It carries the boundary for automated contributors, the
security and QA standard every change is held to, and how work is delivered
(branch `radar/<what-this-is>`, one pull request, never straight to `main`).
A check called `radar-gate` enforces part of it on every pull request.
