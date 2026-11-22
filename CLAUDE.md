@AGENTS.md

<!-- radar:claude-only -->
When you open a pull request here, add the label `radar:by-claude`
(`gh pr create --label radar:by-claude ...`). The radar gate then reports
the design-agent boundary (API routes, billing, schema, auth) without
blocking on it. Still blocking: a charged amount taken from the request,
hardcoded secrets, credential files, uncalled access checks and new
dependencies. Never add it to a PR another agent wrote.
<!-- /radar:claude-only -->
