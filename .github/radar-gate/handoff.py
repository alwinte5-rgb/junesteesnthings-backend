#!/usr/bin/env python3
"""The gate every AI delivery passes through before it is merged.

    radar review --pr <n>              review a pull request (needs `gh`)
    radar review --diff <base>..<head> review a range in the current repo
    radar review <folder>              review a folder against the radar itself
    radar review <folder> --into <id>  review a folder against a project

Both agents work on GitHub now, so the usual entry point is a pull request and
the usual caller is the `radar-gate` workflow, not a person. The rules below do
not care which: each one takes `(path, relative-path, text)` and a diff produces
those as readily as a folder walk does.

ChatGPT is good at design and cannot run what it writes. That combination
produces a specific and repeatable class of defect: code that looks complete,
reads well, and is not connected to anything. Every rule below was earned:

  1. AUTH WRITTEN, NEVER CALLED    a full ChatGPT-SSO module with zero call
                                   sites; the app was protected only by the
                                   hosting platform's edge
  2. WEB-COMPOSED COMMANDS         a localhost bridge that ran prompt text sent
                                   by a web page, inside live repos
  3. SILENT REVERT                 the delivery was built from a pushed commit
                                   and would have reverted newer local work
  4. SECOND SOURCE OF TRUTH        progress written to a cloud database while
                                   the local progress log kept its own copy
  5. OUT OF BOUNDS                 a design delivery that also rewrote API
                                   routes, auth and schema
  6. SILENT DEPENDENCIES           20 npm packages added by a delivery that was
                                   asked for a dashboard design

This is a static reviewer. It reports what to look at; it never merges.
"""

import fnmatch
import json
import os
import re
import subprocess
import sys

import boundary

HERE = os.path.dirname(os.path.abspath(__file__))

CRITICAL, MAJOR, MODERATE = "CRITICAL", "MAJOR", "MODERATE"
# Accepted findings stay on the page, ranked last. A risk that disappears
# once accepted is an unrecorded risk.
ACCEPTED = "ACCEPTED"
RANK = {CRITICAL: 0, MAJOR: 1, MODERATE: 2, ACCEPTED: 3}

SKIP_DIRS = {
    "node_modules", ".git", "build", "dist", ".next", ".expo", "venv", ".venv",
    "__pycache__", "vendor", "Pods", ".turbo", "coverage", ".wrangler",
    "drizzle", "generated",
}
TEXT_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".html", ".css",
             ".json", ".yaml", ".yml", ".md", ".sh", ".toml"}

# Files that are data, not code: a match inside them is usually the payload
# rather than a defect.
DATA_GLOBS = ["*.json", "package-lock.json", "*.lock", "*.md"]

# The reviewer must not review itself.
#
# Every rule here is a regex describing the thing it forbids, so the engine's
# own source matches nearly all of them: the line defining `child_process|
# execSync|eval\(` reads as an eval, and `subprocess.run` inside `git_out` reads
# as a shell call in an HTTP handler. Reviewing a PR that touched the engine
# produced seven CRITICALs, none real.
#
# This matters more once the engine is vendored into every repo as
# `.github/radar-gate/`, because then *any* repo updating its copy trips the
# same wall. A pattern inside the pattern engine is a definition, not a defect.
SELF = {"handoff.py", "boundary.py"}
SELF_DIRS = {".github/radar-gate"}


def is_self(rel):
    """True for the gate's own source, wherever it has been vendored."""
    p = rel.replace("\\", "/")
    return (os.path.basename(p) in SELF
            or any(p.startswith(d + "/") or "/" + d + "/" in p
                   for d in SELF_DIRS))

# Regenerated on every scan. They always differ and always will, so reporting
# them as conflicts is pure noise — the scan is the authority, not the delivery.
GENERATED = {"state.json", "radar.html", "board.html", "TODAY.md", "history.jsonl",
             "SUBMISSIONS.md", "ACCOUNTS.md"}


def walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            ext = os.path.splitext(name)[1]
            if ext and ext not in TEXT_EXTS:
                continue
            yield os.path.join(dirpath, name)


# ──────────────────────────── the diff as a delivery ─────────────────────────

def git_out(args, repo):
    out = subprocess.run(["git", "-C", repo] + args,
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError((out.stderr or out.stdout).strip() or
                           "git %s failed" % " ".join(args))
    return out.stdout


def changed_files(base, head, repo):
    """Paths this branch adds or changes, as git sees them.

    `base...head` — three dots — is the diff against the merge base, which is
    what a pull request actually proposes. Two dots would also report every
    commit the base gained meanwhile and blame the branch for all of it.
    """
    names = git_out(["diff", "--name-only", "--diff-filter=d",
                     "%s...%s" % (base, head)], repo).splitlines()
    return [n.strip() for n in names if n.strip()]


def files_from_diff(base, head, repo):
    """The delivery, read at `head`, in the shape every rule already expects.

    Read from the git object store rather than the working tree so the review
    describes the commits under review, not whatever happens to be checked out
    or left dirty beside them.
    """
    files = []
    for rel in changed_files(base, head, repo):
        ext = os.path.splitext(rel)[1]
        if ext and ext not in TEXT_EXTS:
            continue
        if any(part in SKIP_DIRS for part in rel.split("/")):
            continue
        try:
            text = git_out(["show", "%s:%s" % (head, rel)], repo)
        except RuntimeError:
            continue                      # deleted, or unreadable at head
        files.append((os.path.join(repo, rel), rel, text))
    return files


def forbidden_in_diff(base, head, repo):
    """Refusal sweep over the raw path list.

    Separate from `files_from_diff` because that filters by extension, and a
    `.env` has none of the extensions we read. The first delivery to arrive
    with a credential in it would have sailed straight through an
    extension-filtered list.
    """
    out = []
    for rel in changed_files(base, head, repo):
        what = boundary.forbidden_reason(rel)
        if what:
            out.append((rel, what))
    return out


def read(path):
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            return fh.read()
    except OSError:
        return ""


def is_data(rel):
    return any(fnmatch.fnmatch(os.path.basename(rel), g) for g in DATA_GLOBS)


def hits(text, pattern):
    return [(i + 1, line.strip())
            for i, line in enumerate(text.splitlines())
            if re.search(pattern, line)]


# ─────────────────────────────────── rules ───────────────────────────────────

def rule_unwired_exports(files):
    """Rule 1. A function defined and exported but called nowhere.

    Restricted to names that gate access — a dead formatter is untidy, a dead
    `requireUser` is an open door.
    """
    found = []
    gatekeeper = re.compile(
        r"export\s+(?:async\s+)?function\s+(\w*(?:[Aa]uth|[Ss]ession|[Pp]ermission"
        r"|[Rr]equire|[Vv]erify|[Gg]uard|[Cc]an|[Aa]ssert)\w*)")
    defined = {}
    for path, rel, text in files:
        for m in gatekeeper.finditer(text):
            defined.setdefault(m.group(1), rel)
    if not defined:
        return found
    for name, where in defined.items():
        uses = 0
        for path, rel, text in files:
            # Prose is not a call site. Counting markdown as a use meant that
            # naming the function in a README -- or, absurdly, in the ACCEPTED.md
            # explaining why it is uncalled -- silently switched this rule off.
            # The rule that exists because an auth module shipped with zero call
            # sites could be disabled by writing about it.
            if is_data(rel):
                continue
            if rel == where:
                # A definition is not a use; count only calls elsewhere in it.
                uses += len(re.findall(r"\b%s\s*\(" % re.escape(name), text)) - 1
            else:
                uses += len(re.findall(r"\b%s\b" % re.escape(name), text))
        if uses <= 0:
            found.append((CRITICAL, where, 0,
                          "`%s` is exported but never called" % name,
                          "An access check that nothing invokes protects nothing. "
                          "This is exactly how the dashboard shipped with a "
                          "complete auth module and open API routes."))
    return found


def rule_web_to_shell(files):
    """Rule 2. Request data reaching a shell, a subprocess, or an eval."""
    found = []
    danger = re.compile(
        r"subprocess\.(?:Popen|run|call)|os\.system|os\.popen|"
        r"child_process|execSync|spawnSync|\beval\s*\(|new\s+Function\s*\(")
    # Severity turns on whether the file also *serves HTTP*. Every script in
    # this repo calls subprocess; only one of them does so while listening on a
    # socket, and that is the whole difference.
    serves = re.compile(
        r"BaseHTTPRequestHandler|HTTPServer|def do_(?:POST|GET)|createServer|"
        r"app\.(?:post|get|listen)|export async function (?:POST|GET)")
    for path, rel, text in files:
        if is_data(rel):
            continue
        exposed = bool(serves.search(text))
        for lineno, line in hits(text, danger.pattern):
            if not exposed:
                continue
            found.append((CRITICAL, rel, lineno,
                          "runs a subprocess or eval inside an HTTP handler: %s"
                          % line[:80],
                          "Confirm every argument is built locally. Text that "
                          "arrived over HTTP must never become a command."))
    return found


def rule_localhost_server(files):
    """Rule 2b. A local server that a browser can reach."""
    found = []
    for path, rel, text in files:
        if is_data(rel):
            continue
        if not re.search(r"HTTPServer|createServer|app\.listen|serve_forever", text):
            continue
        notes = []
        if re.search(r"Access-Control-Allow-Private-Network", text):
            notes.append("opts into public-to-private access")
        if re.search(r'Access-Control-Allow-Origin["\']?\s*[,:]\s*["\']\*', text):
            notes.append("wildcard CORS origin")
        if not re.search(r"Host|host_header|X-Radar-Token|token|secret", text):
            notes.append("no Host validation and no shared token")
        if re.search(r"if not origin\b.*\n\s*return True|origin\s*is\s*None", text):
            notes.append("treats a missing Origin as allowed")
        if notes:
            found.append((CRITICAL, rel, 0,
                          "local HTTP server: " + "; ".join(notes),
                          "Anything on this machine, and any page on any "
                          "localhost port, can drive it."))
    return found


# Reading a secret from the environment is the CORRECT way to hold one. A rule
# that cannot tell `api_secret: process.env.CLOUDINARY_API_SECRET` from
# `api_secret: "abc123"` reports every properly-written config as a leak — and
# it did, twice, on the first real repo it ran against.
FROM_ENV = re.compile(
    r"process\.env|os\.environ|os\.getenv|import\.meta\.env|"
    r"ENV\[|Deno\.env|config\(\)|settings\.|getenv\(")


def rule_secrets(files):
    found = []
    pats = [
        (r"NEXT_PUBLIC_\w*(?:SECRET|KEY|TOKEN|PASSWORD|PRIVATE)",
         "secret-shaped value in a NEXT_PUBLIC_ variable", False),
        # Must look like a *use*, not the rule telling you not to use it —
        # "never expose api_secret" in a playbook is guidance, not a leak.
        (r"(?:api_secret|apiSecret)\s*[:=]\s*[^\s,)}]",
         "api_secret assigned a literal value", True),
        (r"(?:sk_live|sk_test|rk_live|ghp_|xox[baprs]-)[A-Za-z0-9_]{8,}",
         "hardcoded credential", False),
    ]
    for path, rel, text in files:
        for pat, msg, env_exempt in pats:
            for lineno, line in hits(text, pat):
                if env_exempt and FROM_ENV.search(line):
                    continue
                found.append((CRITICAL, rel, lineno, msg, line[:90]))
    return found


def rule_caching(files):
    found = []
    for path, rel, text in files:
        if is_data(rel):
            continue
        for lineno, line in hits(text, r"\brevalidate\b"):
            found.append((MAJOR, rel, lineno,
                          "revalidate on a route: %s" % line[:70],
                          "User-specific data must not be statically cached. "
                          "Use cache: \"no-store\"."))
        for lineno, line in hits(text, r"dangerouslySetInnerHTML"):
            found.append((MAJOR, rel, lineno, "dangerouslySetInnerHTML",
                          "Confirm the value is sanitised."))
    return found


def rule_second_source(files):
    """Rule 4. A delivery that writes state the radar already owns.

    Only meaningful inside the radar itself. Vendored into a product repo it
    fired on `server.js` for writing to that product's own database and
    announced that "the radar already owns progress.jsonl" -- advice that is
    both wrong and baffling in a t-shirt storefront. A rule about one repo's
    state has to know which repo it is in.
    """
    found = []
    owned = ["progress.jsonl", "projects.yaml", "state.json"]
    if not os.path.isfile(os.path.join(HERE, "scan.py")):
        return found
    for path, rel, text in files:
        if is_data(rel):
            continue
        # A real second datastore, not any function that happens to be called
        # `.values(` — newproj.py writes projects.yaml, which IS the store.
        writes_db = re.search(
            r"onConflictDoUpdate|INSERT INTO|drizzle|prisma\.|sqliteTable|"
            r"createClient\(.*supabase", text)
        mentions = re.search(r"progress|blocker|focus|next_?[Aa]ction|stage", text)
        if writes_db and mentions:
            found.append((MAJOR, rel, 0,
                          "writes project state to its own database",
                          "The radar already owns %s. Two stores of the same "
                          "fact drift apart -- decide which one is "
                          "authoritative before merging." % ", ".join(owned)))
    return found


def rule_reverts(delivery, target):
    """Rule 3. Files the delivery would overwrite with an older version."""
    found = []
    for path, rel, text in delivery:
        if os.path.basename(rel) in GENERATED:
            continue
        counterpart = os.path.join(target, rel)
        if not os.path.isfile(counterpart):
            continue
        if read(counterpart) == text:
            continue
        try:
            if os.path.getmtime(counterpart) > os.path.getmtime(path):
                found.append((MAJOR, rel, 0,
                              "local copy is NEWER than the delivered copy",
                              "Merging this file wholesale reverts local work. "
                              "Diff it before taking either side."))
        except OSError:
            pass
    return found


def rule_uncommitted(target):
    """Uncommitted local work is what a careless merge destroys."""
    found = []
    try:
        out = subprocess.run(["git", "-C", target, "status", "--short"],
                             capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return found
    dirty = [l for l in out.splitlines() if l and not l.startswith("??")]
    if dirty:
        found.append((MAJOR, "(git)", 0,
                      "%d uncommitted file(s) in the target" % len(dirty),
                      "Commit or stash first so the merge is one "
                      "`git checkout` from undone: "
                      + ", ".join(l[3:] for l in dirty[:6])))
    return found


def rule_boundary(files):
    """Rule 5. A delivery that reached outside what ChatGPT may write.

    The boundary lives in boundary.py and is written verbatim into every repo's
    AGENTS.md by agentsync.py, so the rule ChatGPT reads and the rule enforced
    here cannot drift apart.
    """
    found = []
    for path, rel, text in files:
        what = boundary.blocked_reason(rel)
        if what:
            article = "an" if what[0].lower() in "aeiou" else "a"
            found.append((CRITICAL, rel, 0,
                          "out of bounds -- this is %s %s" % (article, what),
                          "The agent brief covers design, copy and "
                          "presentational components; this crosses a trust "
                          "boundary. Drop the file from the branch and "
                          "re-request, or reassign it to a task that may "
                          "touch it."))
    return found


def rule_new_dependencies(files, target):
    """Rule 6. New runtime dependencies arriving inside a design delivery."""
    found = []
    for path, rel, text in files:
        if os.path.basename(rel) not in boundary.DEPENDENCY_FILES:
            continue
        counterpart = os.path.join(target, rel)
        before = set()
        if os.path.isfile(counterpart):
            before = _deps(read(counterpart), rel)
        after = _deps(text, rel)
        added = sorted(after - before)
        if added:
            found.append((MAJOR, rel, 0,
                          "%d new dependenc%s: %s"
                          % (len(added), "y" if len(added) == 1 else "ies",
                             ", ".join(added[:8])
                             + (" ..." if len(added) > 8 else "")),
                          "A design delivery needing a new runtime dependency "
                          "is a decision, not a detail. Confirm each one is "
                          "wanted, maintained, and licence-compatible."))
    return found


def _deps(text, rel):
    """Dependency names from package.json or a requirements file."""
    if rel.endswith(".json"):
        try:
            data = json.loads(text)
        except ValueError:
            return set()
        names = set()
        for key in ("dependencies", "devDependencies", "peerDependencies"):
            names |= set((data.get(key) or {}).keys())
        return names
    return {re.split(r"[=<>~!\[; ]", l.strip())[0]
            for l in text.splitlines()
            if l.strip() and not l.strip().startswith("#")}


def forbidden(delivery_root):
    """Files whose presence stops the review outright."""
    out = []
    for path in walk(delivery_root):
        rel = os.path.relpath(path, delivery_root)
        what = boundary.forbidden_reason(rel)
        if what:
            out.append((rel, what))
    # walk() filters by extension, so .env and .pem never reach it -- sweep
    # the tree separately for exactly the names that must never be handed over.
    for dirpath, dirnames, filenames in os.walk(delivery_root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            rel = os.path.relpath(os.path.join(dirpath, name), delivery_root)
            what = boundary.forbidden_reason(rel)
            if what and (rel, what) not in out:
                out.append((rel, what))
    return out


RULES = [rule_unwired_exports, rule_web_to_shell, rule_localhost_server,
         rule_secrets, rule_caching, rule_second_source, rule_boundary]


# ─────────────────────────────────── report ──────────────────────────────────

def load_accepted(delivery_root):
    """Rules consciously accepted for this delivery, with a written reason.

    The boundary rule assumes a delivery lands *into* an existing project, so a
    delivery that IS an application trips it on its own API routes. Rather than
    weaken the rule for everyone, accept it here, in writing, per delivery --
    the same trade the gate ladder already makes with `radar accept`.
    """
    path = os.path.join(delivery_root, "ACCEPTED.md")
    if not os.path.isfile(path):
        return {}
    out, current = {}, None
    for line in read(path).splitlines():
        m = re.match(r"^\s*-\s*`?(\w+)`?\s*[:-]\s*(.+)$", line)
        if m:
            current = m.group(1)
            out[current] = m.group(2).strip()
        elif current and line.strip() and line.startswith((" ", "\t")):
            # A wrapped bullet is still one reason. Reading only its first line
            # truncated every acceptance mid-sentence, destroying the one thing
            # an acceptance exists to preserve -- the reason, on record.
            out[current] = "%s %s" % (out[current], line.strip())
        elif not line.strip():
            current = None
    return out


# Which rule each finding came from, so an acceptance can name it.
RULE_OF = {
    "out of bounds": "boundary",
    "new dependenc": "dependencies",
    "writes project state": "second_source",
    "runs a subprocess": "shell_exec",
    "local HTTP server": "local_server",
    "is exported but never called": "unwired",
}


def rule_name(what):
    for prefix, name in RULE_OF.items():
        if what.startswith(prefix) or prefix in what:
            return name
    return None


def review(delivery_root, target_root, files=None, accepted_from=None):
    """Review the delta, not the tree.

    The first version scanned every delivered file and reported our own
    `subprocess.run` in daily.py, and the sentence "never expose api_secret"
    inside a playbook, as CRITICAL. A reviewer that cries wolf gets ignored.
    A delivery is only responsible for what it adds or changes, so files
    byte-identical to the target are dropped before any rule runs.

    `files` may be supplied directly — a git diff is already the delta, so it
    needs none of the folder-mode winnowing below.
    """
    diff_mode = files is not None
    unchanged = 0
    if not diff_mode:
        everything = [(p, os.path.relpath(p, delivery_root), read(p))
                      for p in walk(delivery_root)]
        files = []
        for path, rel, text in everything:
            counterpart = os.path.join(target_root, rel)
            if os.path.isfile(counterpart) and read(counterpart) == text:
                unchanged += 1
                continue
            files.append((path, rel, text))

    # The engine's own source is set aside before any rule runs, and the count
    # is reported rather than swallowed -- a reviewer that silently skips files
    # is worse than one that cries wolf.
    skipped_self = [rel for _, rel, _ in files if is_self(rel)]
    files = [f for f in files if not is_self(f[1])]

    findings = []
    for rule in RULES:
        try:
            findings.extend(rule(files))
        except Exception as exc:               # a broken rule must not stop the
            findings.append((MODERATE, "(reviewer)", 0,   # rest of the review
                             "rule %s failed: %s" % (rule.__name__, exc), ""))
    findings.extend(rule_new_dependencies(files, target_root))

    # Two rules exist only because a folder has no history. Git does both
    # better: `rule_reverts` compares file mtimes to guess whether a delivery
    # would overwrite newer work, which a three-way merge decides correctly and
    # without guessing; `rule_uncommitted` warns that a copy is about to land on
    # a dirty tree, and a pull request never lands on a tree at all.
    if not diff_mode:
        findings.extend(rule_reverts(files, target_root))
        findings.extend(rule_uncommitted(target_root))

    # Downgrade anything consciously accepted, and say so in the report. It
    # stays visible -- an accepted risk that disappears from the page is an
    # unrecorded one.
    accepted = load_accepted(delivery_root)
    if accepted:
        rescored = []
        for sev, rel, lineno, what, why in findings:
            name = rule_name(what)
            if name and name in accepted:
                rescored.append((ACCEPTED, rel, lineno, what,
                                 "accepted: %s" % accepted[name]))
            else:
                rescored.append((sev, rel, lineno, what, why))
        findings = rescored

    # Deduplicate: the same defect found by two rules is still one defect.
    seen, unique = set(), []
    for f in sorted(findings, key=lambda f: (RANK.get(f[0], 9), f[1], f[2])):
        key = (f[1], f[2], f[3][:40])
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return files, unique, unchanged, skipped_self


def report(findings, header, counted, extra=""):
    """One report format, whether a person or a workflow is reading it."""
    print("\n%s" % header)
    if extra:
        print(extra)
    print("  reviewing %s" % counted)
    print()

    if not findings:
        print("  Nothing flagged. Still read the diff before merging --")
        print("  this reviewer catches known patterns, not intent.\n")
    else:
        counts = {}
        for f in findings:
            counts[f[0]] = counts.get(f[0], 0) + 1
        print("  " + "  ".join("%s: %d" % (k, counts[k])
                               for k in (CRITICAL, MAJOR, MODERATE, ACCEPTED)
                               if k in counts))
        print()
        for sev, rel, lineno, what, why in findings:
            loc = "%s:%d" % (rel, lineno) if lineno else rel
            print("  [%s] %s" % (sev, loc))
            print("      %s" % what)
            if why:
                for line in _fold(why, 70):
                    print("      %s" % line)
            print()

    print("  Merge only after every CRITICAL is resolved or consciously")
    print("  accepted. Nothing here has been merged.\n")


def review_diff(base, head, repo):
    """The gate as a pull-request check. Exit code is the verdict."""
    try:
        blocked = forbidden_in_diff(base, head, repo)
    except RuntimeError as exc:
        print("\nCOULD NOT READ THE DIFF -- %s\n" % exc)
        print("  The workflow needs full history: actions/checkout with")
        print("  `fetch-depth: 0`, or the base commit is simply not present.\n")
        return 3

    if blocked:
        print("\nREFUSED -- this branch contains files that must never be "
              "committed:\n")
        for rel, what in blocked:
            print("  %-48s %s" % (rel, what))
        print("\n  Remove them, rotate anything that was exposed, and force-push")
        print("  a history without them. Deleting the file in a later commit")
        print("  leaves it in the history, where it is still a live secret.\n")
        return 2

    files = files_from_diff(base, head, repo)
    _, findings, _, skipped = review(repo, repo, files=files)

    counted = "%d changed file(s) in %s...%s" % (
        len(files), base[:12], head[:12])
    if skipped:
        counted += "\n  not reviewed (this is the gate's own source): %s" % (
            ", ".join(sorted(skipped)))
    report(findings, "RADAR GATE", counted)

    blocking = [f for f in findings if f[0] == CRITICAL]
    if blocking:
        print("  %d CRITICAL finding(s) block this pull request. Fix them, or"
              % len(blocking))
        print("  accept one in writing by adding a line to ACCEPTED.md at the")
        print("  repo root naming the rule and the reason.\n")
        return 1
    return 0


def main(argv):
    if not argv:
        print(__doc__)
        return 1

    # ── pull-request mode ────────────────────────────────────────────────
    repo = os.environ.get("RADAR_REPO") or os.getcwd()
    if "--diff" in argv:
        rng = argv[argv.index("--diff") + 1]
        if "..." in rng:
            base, head = rng.split("...", 1)
        elif ".." in rng:
            base, head = rng.split("..", 1)
        else:
            print("usage: radar review --diff <base>..<head>")
            return 1
        return review_diff(base, head or "HEAD", repo)

    if "--pr" in argv:
        number = argv[argv.index("--pr") + 1]
        try:
            out = subprocess.run(
                ["gh", "pr", "view", number, "--json",
                 "baseRefName,headRefOid,headRefName"],
                capture_output=True, text=True, cwd=repo, timeout=60)
        except (OSError, subprocess.SubprocessError) as exc:
            print("could not run `gh`: %s" % exc)
            return 1
        if out.returncode != 0:
            print((out.stderr or out.stdout).strip())
            return 1
        meta = json.loads(out.stdout)
        base = "origin/%s" % meta["baseRefName"]
        subprocess.run(["git", "-C", repo, "fetch", "--quiet", "origin",
                        meta["baseRefName"]], capture_output=True)
        return review_diff(base, meta["headRefOid"], repo)

    # ── folder mode ──────────────────────────────────────────────────────
    delivery = os.path.abspath(os.path.expanduser(argv[0]))
    target = HERE
    if "--into" in argv:
        pid = argv[argv.index("--into") + 1]
        import json
        with open(os.path.join(HERE, "state.json")) as fh:
            state = json.load(fh)
        p = next((x for x in state["projects"] if x["id"] == pid), None)
        if not p or not p.get("path"):
            print("no directory on record for '%s'" % pid)
            return 1
        target = os.path.expanduser(p["path"])
    if not os.path.isdir(delivery):
        print("no such folder: %s" % delivery)
        return 1

    # Refuse before reviewing. A delivery carrying a .env or a private key is
    # not a delivery with a problem in it -- it is a credential leak, and the
    # right response is to stop, not to rank it against other findings.
    blocked = forbidden(delivery)
    if blocked:
        print("\nREFUSED -- this delivery contains files that must never be "
              "handed between machines:\n")
        for rel, what in blocked:
            print("  %-48s %s" % (rel, what))
        print("\n  Remove them, rotate anything that was exposed, and re-run.\n")
        return 2

    files, findings, unchanged, skipped = review(delivery, target)

    counted = ("%d new or changed file(s); %d identical to target, skipped"
               % (len(files), unchanged))
    if skipped:
        counted += "\n  not reviewed (this is the gate's own source): %s" % (
            ", ".join(sorted(skipped)))
    report(findings, "HANDOFF REVIEW", counted,
           extra="  delivery: %s\n  target:   %s" % (delivery, target))
    return 0


def _fold(text, width):
    words, line, out = text.split(), "", []
    for w in words:
        if len(line) + len(w) + 1 > width and line:
            out.append(line)
            line = w
        else:
            line = (line + " " + w) if line else w
    if line:
        out.append(line)
    return out


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
