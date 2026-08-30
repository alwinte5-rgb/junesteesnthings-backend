# Accepted gate findings

Rules the radar gate flags that this repository has consciously accepted, each
with the reason on record. An acceptance is not a dismissal — the finding stays
on the gate's report, ranked last, so it is still read on every pull request.

Accept a rule here only when the flag is genuinely wrong for this codebase.
Anything that is merely inconvenient belongs in a fix, not in this file.

- `shell_exec`: The supplier sync spawns the S&S importer as a child process
  from inside an HTTP handler (`server.js`, `runSupplierSync`). Every argument
  is built locally and none of it can carry text that arrived over HTTP: the
  executable is `process.execPath`, the script is `path.join(__dirname, 'tools',
  'ssa-sync.js')`, and the only other argument is the literal `--apply`. The
  request body is never read into the argv, and the child gets its credentials
  through the environment rather than the command line, so there is no string
  for a caller to escape out of. The rule is right in general — it exists
  because an HTTP handler is exactly where untrusted text meets a shell — it
  simply does not describe this call site. Re-examine this acceptance if that
  spawn ever gains an argument derived from a request.
