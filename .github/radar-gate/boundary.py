#!/usr/bin/env python3
"""What an AI agent may and may not change in a repo.

One definition, two consumers. `agentsync.py` writes it into every repo's
AGENTS.md so the agent reads it before starting; `handoff.py` enforces it when
the work comes back as a pull request. If these were separate lists they would
disagree within a month, and the rule in the repo would stop matching the rule
at the gate.

Not ChatGPT-specific. Both agents work on GitHub now — the boundary is about
what crosses a trust boundary, not about which model is holding the keyboard.
The scars behind each entry are in `handoff.py`.
"""

import re

ALLOWED = [
    "Design assets: logo, favicon, OG image, app icon, splash, screenshots",
    "Presentational components and CSS: `components/*.tsx`, `*.css`, design tokens",
    "Static pages: 404, privacy, terms, marketing",
    "Copy: page text, product descriptions, store listing text",
]

BLOCKED = [
    "API routes and server actions (`app/api/**`, anything `\"use server\"`)",
    "Auth, permissions, validation (`lib/auth*`, `lib/permissions*`, `lib/validate*`)",
    "Billing, pricing, checkout, entitlements",
    "Database migrations and schema",
    "New runtime dependencies (`package.json`, `requirements.txt`)",
]

# (regex against the delivery-relative path, what it is). Anchored on path
# structure rather than a bare word so that `components/PricingCard.tsx` — a
# presentational component that merely says "pricing" — is not blocked, while
# `app/api/pricing/route.ts` is.
BLOCKED_PATHS = [
    (r"(^|/)app/api/", "API route"),
    (r"(^|/)pages/api/", "API route"),
    (r"(^|/)route\.(ts|js|tsx|jsx)$", "route handler"),
    (r"(^|/)lib/(auth|permissions|validate|session)", "auth / validation helper"),
    (r"(^|/)(migrations|drizzle)/", "database migration"),
    (r"schema\.prisma$|(^|/)db/schema\.(ts|js|py)$", "database schema"),
    (r"\.sql$", "raw SQL"),
    (r"(^|/)(billing|checkout|stripe|subscription)[^/]*\.(ts|tsx|js|jsx|py)$",
     "billing / checkout logic"),
    (r"(^|/)(webhooks?)/", "webhook handler"),
    (r"middleware\.(ts|js)$", "middleware (runs on every request)"),
]

# ── When the path tells you nothing ──────────────────────────────────────────
#
# `BLOCKED_PATHS` assumes a layout: an `app/api/` directory, a `lib/auth.ts`, a
# schema file. Plenty of real repositories have none of that. June's Tees is a
# single 7,780-line `server.js` — every route, every payment, every query, one
# file — so not one pattern above matches, and billing logic added to it would
# pass the gate silently.
#
# An agent found that itself and respected the written boundary anyway, which is
# the right instinct and not something to rely on. So the boundary is also read
# from the *content of what a change adds*, which no layout can hide.
#
# These match added lines only. Existing code is not the agent's doing, and
# flagging a file merely for containing the word "price" would make the gate
# noise, which is the fastest way to have it ignored.
BLOCKED_CONTENT = [
    (r"\bstripe\.[a-z]+\.(create|update|del|cancel|capture|refund)\b"
     r"|\bcharges?\.create\b|paymentIntents?\.|checkout\.sessions?\.",
     "creates or changes a charge"),
    (r"\b(amount|total|price|subtotal)\s*[-+*/]?=\s*(?!.*\b(cents|_cents)\b)"
     r"[^;\n]*\breq\.(body|query|params)\b",
     "computes a charged amount from a client-supplied value"),
    (r"\b(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?[`\"']?"
     r"(users?|accounts?|subscriptions?|payments?|invoices?|entitlements?)\b",
     "writes to an identity, payment or entitlement table"),
    (r"\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+(TABLE|COLUMN)\b",
     "changes the database schema"),
    (r"\b(bcrypt|argon2|scrypt)\b|\bjwt\.(sign|verify)\b"
     r"|\bsession\.(user|userId)\s*=|\bsetPassword\b",
     "touches authentication"),
    (r"\brequire(Admin|Auth|User|Login)\b\s*[,)]?\s*$"
     r"|\bisAdmin\s*=\s*(true|1)\b",
     "changes who is allowed in"),
    (r"process\.env\.[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD)[A-Z_]*",
     "reads a credential"),
]


def content_reason(added_lines):
    """What an agent added that its file path did not admit to.

    `added_lines` is the `+` side of a diff, without the markers. Returns a list
    of (reason, sample) — a sample so the reviewer can see the line rather than
    take the gate's word for it.
    """
    out = []
    seen = set()
    for line in added_lines:
        stripped = line.strip()
        # Comments and strings are where these words live innocently.
        if stripped.startswith(("//", "#", "*", "/*")):
            continue
        for pattern, what in BLOCKED_CONTENT:
            if what in seen:
                continue
            if re.search(pattern, line, re.I):
                seen.add(what)
                out.append((what, stripped[:120]))
    return out


# The templates. These hold variable NAMES and no values, they are meant to be
# committed, and they are the only place an agent can document a variable it
# needs. `.env(\.|$)` matched them along with the real thing, so every task of
# the form "document the missing env var" was structurally impossible to
# deliver: the gate refused the one file the answer belongs in.
ENV_TEMPLATES = re.compile(r"(^|/)\.env\.(example|sample|template|defaults)$", re.I)

# The templates. These carry variable NAMES and no values, they are meant to be
# committed, and they are the only place an agent can document a variable it
# needs. `.env(\.|$)` matched them along with the real thing, so every task of
# the form "document the missing env var" was structurally impossible to
# deliver: the gate refused the one file the answer belongs in, and the refusal
# read as "you tried to commit a secret".
#
# Exact names only. `.env.example.bak` is not a template and stays refused.
ENV_TEMPLATES = re.compile(r"(^|/)\.env\.(example|sample|template|defaults)$", re.I)

# A delivery containing any of these is refused outright, not merely flagged.
FORBIDDEN_FILES = [
    (r"(^|/)\.env(\.|$)", ".env file"),
    (r"(^|/)(credentials|secrets)\.(json|ya?ml|txt)$", "credentials file"),
    (r"\.pem$|\.p12$|\.keystore$|\.jks$", "private key / keystore"),
    (r"(^|/)\.git/", "a .git directory"),
]

# ── A template stops being a template the moment it holds a value ────────────
#
# The filename is a proxy. What actually matters is whether a line carries a
# secret, and a file called `.env.example` with a live key in it is a leak
# wearing a safe name — which is exactly the case the filename rule cannot see.
#
# So the exemption above is conditional on this: names, comments and blank
# values pass; anything that looks like a real value does not.
ENV_PLACEHOLDER = re.compile(
    r"^(|<.*>|\{\{.*\}\}|\$\{?[A-Z_]+\}?|your[-_ ].*|xxx+|\.\.\.|changeme|"
    r"change[-_ ]me|todo|tbd|replace[-_ ]me|placeholder|example|dummy|"
    r"local-dev-only.*|.*\.example\.com.*|postgres(ql)?://user:pass@localhost.*|"
    r"true|false|\d+|operator|development|production|test|localhost.*|"
    r"https?://localhost.*|https?://127\.0\.0\.1.*)$", re.I)


def env_template_values(text):
    """Lines in an env template that carry something other than a placeholder.

    Returns a list of (line_number, key). Empty means the file is safe to
    commit. Only the KEY is ever returned — this runs inside a reviewer that
    prints its findings, and a rule that quotes the secret it caught would
    publish it into a pull request comment.
    """
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.replace("export ", "").strip()
        value = value.strip().strip("'\"")
        if ENV_PLACEHOLDER.match(value):
            continue
        out.append((n, key))
    return out

DEPENDENCY_FILES = ("package.json", "requirements.txt", "pyproject.toml",
                    "Gemfile", "go.mod")


def blocked_reason(relpath):
    """Why this path is out of bounds, or None if it is fine."""
    p = relpath.replace("\\", "/")
    for pattern, what in BLOCKED_PATHS:
        if re.search(pattern, p, re.I):
            return what
    return None


def forbidden_reason(relpath, text=None):
    """Why this file is refused outright, or None if it may be committed.

    `text` is the file's contents when the caller has them. Pass it: the
    filename is only a proxy for what matters, and an `.env.example` carrying a
    live key is a leak wearing a safe name. Without it the template exemption
    is decided on the name alone, which is the weaker answer.
    """
    p = relpath.replace("\\", "/")
    # A template is not a secret — unless it holds one. Checked first so the
    # broad .env pattern below cannot swallow it, and note this exempts only the
    # exact template names: `.env`, `.env.local` and `.env.production` are all
    # still refused on sight.
    if ENV_TEMPLATES.search(p):
        if text is None:
            return None
        leaked = env_template_values(text)
        if not leaked:
            return None
        # Name the keys, never the values. This string is printed into a pull
        # request comment, and a rule that quotes the secret it caught would
        # publish it a second time.
        return "a template with real values in it (%s)" % ", ".join(
            "%s on line %d" % (key, n) for n, key in leaked[:4])
    for pattern, what in FORBIDDEN_FILES:
        if re.search(pattern, p, re.I):
            return what
    return None


BRANCH_PREFIX = "radar/"


def as_markdown():
    """The boundary as it appears in every repo's AGENTS.md."""
    lines = ["You may change:", ""]
    lines += ["- %s" % a for a in ALLOWED]
    lines += ["", "You must never change:", ""]
    lines += ["- %s" % b for b in BLOCKED]
    lines += [
        "",
        "### How to deliver",
        "",
        "Work on a branch and open **one pull request**:",
        "",
        "```",
        "%s<what-this-is>" % BRANCH_PREFIX,
        "```",
        "",
        "Branch from the default branch, commit only the files the task needs,",
        "and open the PR against the default branch. Do not push to the default",
        "branch, do not merge your own PR, and do not force-push a branch",
        "somebody has reviewed.",
        "",
        "**A commit is not delivery. Push the branch and open the pull",
        "request.** If you run in a temporary container, everything you did",
        "is destroyed when the task ends — the commit, the files, the work.",
        "Nobody can see it and no later session can find it. Only what reaches",
        "the remote exists.",
        "",
        "Before you finish, confirm it: `git push -u origin <branch>` and then",
        "open the PR. If the push fails, say so in your final message and say",
        "what it would have contained — a failure you report is recoverable, a",
        "commit that silently died with the container is not.",
        "",
        "**Check what this repo calls its remote** — `git remote` — rather than",
        "assuming `origin`. Not every repo here uses that name, and a push to a",
        "remote that does not exist fails in a way that reads like having no",
        "remote at all. That misreading has already caused a repo to be skipped",
        "as unreachable while it was reachable the whole time.",
        "",
        "If the task produced a file a person needs to look at — an image, an",
        "icon, a document — the PR is where they will look for it. Committing",
        "it and describing it is not the same as delivering it.",
        "",
        "If you are working from a radar issue, put `Closes #<number>` in the",
        "PR description. Do not write it on a PR that only partly does the",
        "task — GitHub closes the issue on merge either way, and the radar will",
        "reopen it on the next scan because the check it mirrors is still",
        "failing. That round trip is noise; leaving the line out is honest.",
        "",
        "A check called **radar-gate** runs on every pull request. It enforces",
        "the boundary above and fails the PR on anything outside it, on a new",
        "runtime dependency, and on an access check that is written but never",
        "called. Read its comment before pushing a fix — it reports what to",
        "look at, and it is faster to obey than to argue with.",
        "",
        "If a task genuinely cannot be done inside the boundary, stop and say",
        "so in the PR description instead of reaching outside it. That is a",
        "real answer and a useful one; a PR that quietly rewrites an API route",
        "is neither.",
        "",
        "### Say what you changed, and why",
        "",
        "The pull request description is the only account of your reasoning",
        "that survives. A reviewer can read the diff; they cannot read why you",
        "chose it. Write:",
        "",
        "- **What changed**, grouped by area, not a file list — the diff",
        "  already lists files.",
        "- **Why this approach**, especially anything you considered and",
        "  rejected. If you followed an existing pattern, name it.",
        "- **What you did NOT do**, and why: anything skipped, unfinished, or",
        "  that you are unsure works.",
        "- **What to check by hand**, if a person needs to verify something you",
        "  could not.",
        "",
        "\"Fixed the issue\" is not a description. Somebody has to decide",
        "whether to merge this, and they are deciding from what you wrote.",
        "",
        "**Match the length to the work.** A logo, an icon, a favicon, a 404",
        "page — a few lines is the right size. Say what it looks like, which",
        "version you would pick, and anything worth checking by hand. Nobody",
        "needs four paragraphs of rationale about an SVG, and a long report on",
        "a small change buries the one sentence that mattered.",
        "",
        "Save the full treatment for changes with consequences: anything",
        "touching data, money, access, or a flow a person depends on.",
        "",
        "### Check nobody else is already on it",
        "",
        "Before starting a radar issue, look at it. If it carries a",
        "`<!-- radar:dispatched -->` comment with no reply yet, or an open",
        "pull request already says `Closes #<number>`, **somebody is working",
        "it. Leave it alone.**",
        "",
        "Two workers on one task is not twice the work — it is a merge",
        "conflict on the same file, and whichever arrives first wins on",
        "timing rather than on quality. The reviewer then compares one",
        "attempt against nothing, instead of against the alternative.",
        "",
        "If you believe the in-flight attempt is wrong, say so on the issue",
        "and stop. Do not open a competing pull request.",
        "",
        "### If it is not your decision, stop and ask",
        "",
        "Some choices are not yours to make. A visual direction, a name, a",
        "tone, the shape of a flow, what happens in a case nobody described —",
        "anything with more than one defensible answer and no instruction",
        "covering it belongs to the person who owns the product.",
        "",
        "**Stop and ask. Do not pick one and keep going.** Post a comment on",
        "the issue containing this marker on its own line:",
        "",
        "    <!-- radar:question -->",
        "",
        "Then, in plain words: what you need decided, the options you can see,",
        "which you would choose and why. Leave the work unfinished and stop.",
        "",
        "You may be running with nobody watching and no way to be asked",
        "anything mid-run. That is exactly why this matters: the question is",
        "the deliverable when the answer is not yours to invent. It is raised",
        "at the top of the board and answered there, and the answer restarts",
        "you.",
        "",
        "An unanswered question is a finished job. A guess that has to be",
        "undone is worse than no work at all, because somebody has to notice",
        "it first.",
        "",
        "This does not mean stopping at every fork. Ordinary judgement inside",
        "the task — which file, which helper, how to name a variable — is",
        "yours. The test is whether a reasonable person could look at the",
        "result and say \"that is not what I wanted\" without you having done",
        "anything wrong.",
        "",
        "### End with where everything is",
        "",
        "Your last message must say, explicitly:",
        "",
        "- the **branch name** you pushed",
        "- the **pull request URL**",
        "- every **file you created**, by full path",
        "- for anything visual — an icon, an image, a rendered page — say what",
        "  it looks like and where in the PR to view it",
        "",
        "Do not answer with a commit SHA and nothing else. A SHA in a container",
        "that no longer exists is not a location, and the person reading your",
        "message cannot open it. Point at something that will still be there",
        "tomorrow.",
        "",
        "If you could not push, say that first, in plain words, before",
        "describing what you built. Work that exists only in your sandbox is",
        "work nobody will ever see.",
        "",
        "**And then write the files into your report**, so the work survives",
        "anyway. One fenced block per file, with the path in the info string:",
        "",
        "    ```file:apps/web/public/logo.svg",
        "    <svg …></svg>",
        "    ```",
        "",
        "That comment is reachable even when your sandbox is not, and there is",
        "a Publish button that turns those blocks into a real branch and pull",
        "**For anything that is not plain text, declare its size** on the",
        "fence line so a truncated payload is refused rather than shipped:",
        "",
        "    ```file:base64:apps/web/public/icon.png bytes=2004",
        "",
        "A base64 favicon was once cut off in transit. It decoded to a valid",
        "file header pointing at image data that was not there, committed",
        "cleanly, and rendered as nothing at all. Silent corruption is worse",
        "than a failed delivery: a failure gets fixed, a blank icon ships.",
        "Prefer a format that stays small — an SVG is usually under 3 KB and",
        "the problem does not arise.",
        "",
        "request. Complete contents only — an excerpt or a description cannot",
        "be published, and the file dies with your container.",
        "",
        "### Match what is already there",
        "",
        "Follow the conventions this project already uses — naming, file",
        "layout, data shapes, component patterns. Read a neighbouring file",
        "before writing a new one.",
        "",
        "A different convention is not an improvement by itself, and it costs",
        "a translation layer forever. A dashboard delivered with `nextAction`",
        "against a scanner that emits `next_action` needed a converter written",
        "for it, which is now a file somebody maintains.",
        "",
        "Do propose a better way when you have one — say so in the PR",
        "description, explain what it improves, and keep it to that one",
        "change. What is not wanted is a new pattern introduced silently",
        "alongside the old one, leaving both in the codebase.",
        "",
        "**Never bind the work to a host we did not choose.** No deploy",
        "manifests, project ids, or platform-injected auth headers for a",
        "platform this project does not already use. If it needs a host",
        "capability, say which and why.",
    ]
    return "\n".join(lines)
