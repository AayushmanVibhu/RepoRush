# Company interview practice collection

This collection contains six focused practice exercises, two each in Java, Python, and JavaScript. They are derived from company-published hiring assessments, not candidate recollections or leaked questions. Publication establishes provenance, not a claim that a company still asks the same task today. No company endorsement is implied.

| ID              | Company and original repository                                                   | Language   | What RepoRush includes                                                                     |
| --------------- | --------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| RR-INT-JAVA-001 | [Checkout.com](https://github.com/cko-recruitment/payment-gateway-challenge-java) | Java       | Independently authored payment validation, masking and persistence practice implementation |
| RR-INT-JAVA-002 | [Quickbase](https://github.com/QuickBase/interview-demos/tree/master/backend)     | Java       | Independently authored local/remote population merge practice implementation               |
| RR-INT-PY-001   | [Sainsbury’s](https://github.com/JSainsburyPLC/shopping-basket)                   | Python     | MIT-licensed source snapshot with an injected shared-state bug and regression              |
| RR-INT-PY-002   | [Aquatic Capital Management](https://github.com/aquanauts/streaming_interview)    | Python     | MIT-licensed original streaming starter with additional behavioral tests                   |
| RR-INT-JS-001   | [Barstool Sports](https://github.com/BarstoolSports/backend-challenge)            | JavaScript | Source snapshot with focused authentication regressions; upstream package declares MIT     |
| RR-INT-JS-002   | [Anvil](https://github.com/anvilco/internal-coding-challenge)                     | JavaScript | MIT-licensed snapshot plus an offline helper for the original prevalence task              |

## Scope and attribution

Checkout.com and Quickbase did not provide an explicit source redistribution license in the inspected repositories. Their code and original briefs are not bundled. Instead, RepoRush links to their assessments and supplies newly authored code and regression tests for a focused, paraphrased functional task. The MIT license for those practice projects covers only RepoRush's implementation. The payment exercise excludes bank simulation, expiry validation, HTTP routing and card-network processing; it is not the complete company assessment.

For the four reusable source repositories, the generator retains tracked text files, upstream license declarations and copyright notices. Binary files, files larger than 250 KB and environment configuration are omitted and listed in attribution. Barstool's MIT declaration is retained in its original package.json; no missing upstream copyright notice is invented. Every snapshot pins a full Git commit in `scripts/interview-specs.mjs` and the generated `app/interview-data/challenges.json`. `ATTRIBUTION.md` records the adaptation scope inside each workspace.

RepoRush regression tests, reference implementations, tie-breaking rules, focused task scopes, fixtures and hints are additions. They are not represented as official company graders. Reference implementations stay in `scripts/interview-references` outside the learner workspace and client dependency graph.

## Run and verify

```powershell
npm run verify:interviews
npm run typecheck
npm run build
```

The verifier requires Node 20+, Python 3.10+, and a JDK supporting Java 17. It honors `PYTHON` and `JAVA_HOME`; on Windows it can discover a JDK in Program Files/Java. It writes isolated projects below ignored `.oss-work/`, checks a six-challenge/two-per-language distribution, verifies starter rejection and reference acceptance in the catalog's static checks, then executes regressions in both starter and reference projects. Every Java starter must compile; every starter must fail a regression (not fail to launch), and every reference must pass. Authentication regression tests stub the database boundary while executing the actual CommonAuth class. The Anvil prevalence exercise is offline and needs no API key. Python regressions use unittest and have no third-party dependencies.

These checks execute the added targeted regressions, not every original upstream test suite. The original Aquatic placeholder test expects the passthrough starter and is preserved for provenance; the RepoRush tests replace its role for this exercise. Upstream environments and full assignments may need additional dependencies, services and tests.

## Browser grading limitation

Run/Submit retains the existing static evaluation architecture. Each new task explicitly labels these results as source heuristics, supplies an actual runtime command, and explains that alternative correct implementations may not satisfy a heuristic. There is no new server execution of arbitrary user code. A proper isolated execution service is still required for behavioral grading of user submissions in the deployed application.

## Rebuilding snapshots

Clone Sainsbury's, Aquatic's, Barstool's and Anvil's repositories into the checkout names in `scripts/interview-specs.mjs`, making the pinned commits available. `npm run build:interviews` reads their pinned Git objects, overlays authored files from `content/interviews`, injects the basket mutation exactly once, and generates the committed JSON. Builds and verification use committed snapshots offline; Vercel does not need GitHub credentials or source clones. The six exercises are discoverable through company names and the existing Interview skill filter without a layout or style change.
