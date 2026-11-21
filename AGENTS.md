# Notes for the builder — csv-reader-speed-01-run-20261121

Entry for make.fun's "Read broken CSV files faster, 21 November 2026"
bounty. Ryan is @godana on make.fun and godanaaa on GitHub. Payout
wallet DwP3TCxxSWTTqia3HiEMGNQAq3iMaUR4NWLELyMREhMR.

## What to build
- `solve.js` — an ES module whose `run(input)` returns exactly
  csv-reader 1.0.0's answer `{columns, rows, errors}` for every input
  `{text, header}`. It must be a faster drop-in: the reference walks
  the text one character at a time and builds fields by appending one
  character at a time, so this parser finds each field's end with
  native indexOf scans and takes the field with one slice. See the
  header comment in solve.js for the exact semantics it matches
  (BOM, CRLF/LF, stray CR, quoted fields, doubled quotes, quote junk,
  unterminated quotes, short/long rows, error order and line/row).
- `main.ts` — the harness driver: reads every case from
  /input/cases.json, answers each alone with run() from solve.js, and
  writes /output/answers.json. Keep the baseline driver as-is,
  including `--no-incremental-marking`.
- No dependencies, no WebAssembly, no native addon, no prebuilt
  binary, nothing installed before the program runs. Nothing cached
  from one case to the next.

## Repo, kit, submission
- Repo root is `~/workspace/csv-reader-speed-01-run-20261121-entry/`.
  The matching GitHub repo is
  `https://github.com/godanaaa/csv-reader-speed-01-run-20261121-entry`,
  public. Do not push from here: this machine has no GitHub
  credentials, and the coordinator uploads files through the browser.
- Kit: `~/workspace/csv-reader-speed-01-run-20261121-kit/`. Its
  practice set is the authority for exactness and speed: all 6
  practice cases must match the reference exactly, then the entry
  must be clearly faster than the baseline on the same set.
- This bounty is escrowed ($100, 10 places x $10). Submit signed
  with `--keypair ~/.makefun/keypairs/https_make.fun.json`. Entry fee
  is $0. Bundle is not required for this bounty; do not let bundling
  block the submission.
- Root commit holds only `.makefun/freshness.json` (kit init wrote
  it, anchor 19b3dc39, drand round 34157130); LICENSE is the next
  commit, then the rest. README carries the three live make.fun
  badges; About carries the bounty-page website and the makefun,
  ai-agents, bounties, code topics.

## Checks before submitting
- Run the entry against the kit practice set exactly as the grader
  runs it and compare every answer with the reference expected
  output; all 6 cases must match exactly.
- Time the entry against the baseline on the same practice set;
  submit only if it is clearly faster.
- Run the kit check and fix every failed gate before submitting.
