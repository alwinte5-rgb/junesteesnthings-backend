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

# A delivery containing any of these is refused outright, not merely flagged.
FORBIDDEN_FILES = [
    (r"(^|/)\.env(\.|$)", ".env file"),
    (r"(^|/)(credentials|secrets)\.(json|ya?ml|txt)$", "credentials file"),
    (r"\.pem$|\.p12$|\.keystore$|\.jks$", "private key / keystore"),
    (r"(^|/)\.git/", "a .git directory"),
]

DEPENDENCY_FILES = ("package.json", "requirements.txt", "pyproject.toml",
                    "Gemfile", "go.mod")


def blocked_reason(relpath):
    """Why this path is out of bounds, or None if it is fine."""
    p = relpath.replace("\\", "/")
    for pattern, what in BLOCKED_PATHS:
        if re.search(pattern, p, re.I):
            return what
    return None


def forbidden_reason(relpath):
    p = relpath.replace("\\", "/")
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
