# Rifft Exceptional Roadmap

This roadmap is for taking Rifft from "strong open-source alpha" to "exceptional product that developers recommend to each other".

It is intentionally opinionated. The goal is not to add the most features. The goal is to make Rifft feel indispensable for debugging multi-agent systems.

## Current position

Rifft already has a lot going for it:

- strong product category: debugger for multi-agent systems
- real end-to-end tracing with HTTP and gRPC ingest
- working web product with graph, timeline, replay, and MAST views
- published JavaScript and Python packages
- real framework validation for CrewAI and AutoGen
- good self-hosted story with Docker Compose

That means the next stage is no longer basic implementation. The next stage is trust, speed to value, product sharpness, and category leadership.

## What exceptional means

For Rifft to feel exceptional, a user should be able to:

1. install it fast
2. see their first useful trace in minutes
3. immediately understand why an agent system failed
4. trust the classifications and visuals
5. recommend it because it solves a painful, specific problem better than logs

## Priority 1: Make onboarding unforgettable

This is the highest leverage work left.

### Goals

- first useful trace in under 5 minutes
- no confusion about package names, endpoints, or setup order
- one obvious path for each major framework

### Work

- Create one polished quickstart per supported integration:
  - Python SDK
  - JavaScript SDK
  - CrewAI
  - AutoGen
  - MCP
- Add copy-paste examples that produce traces users can immediately find in the UI.
- Add a "Where is my trace?" troubleshooting section to the root README and docs.
- Add screenshots for:
  - trace list
  - communication graph
  - replay mode
  - agent detail / MAST breakdown
- Add a one-command demo path for screenshots and local validation:
  - seed compelling trace
  - open trace detail directly

### Definition of done

- a new user can self-host and see a real trace without reading the source code
- the README feels like a product page, not a repo dump

## Priority 2: Make the core debugging experience obviously better than logs

This is the product moat.

### Goals

- users should understand failures at a glance
- graph, timeline, replay, and agent panel should feel like one system
- interactions should feel fast and intentional

### Work

- Tighten graph readability:
  - improve edge labeling for repeated communications
  - make failure cascades visually clearer
  - refine root-cause styling so it is unmistakable
- Tighten timeline readability:
  - keep duration formatting consistent everywhere
  - add better hover states and clearer failure semantics
  - make orchestration spans visually distinct from agent work
- Tighten replay:
  - make current step state more obvious
  - keep graph, message detail, and timeline synchronized during replay
  - support deeper "why did this step matter?" context
- Tighten MAST presentation:
  - keep human-readable labels everywhere
  - make the recommended fix actionable, not generic
  - distinguish benign vs fatal more clearly in UI copy and color

### Definition of done

- a screenshot or short screen recording tells a compelling story by itself
- users can explain an agent failure to someone else using the UI alone

## Priority 3: Make MAST feel trustworthy

Classification quality will determine whether users treat Rifft as insight or decoration.

### Goals

- reduce noisy false positives
- increase confidence in real failure attribution
- make users trust the system enough to act on it

### Work

- Review real traces and classify false positive / false negative patterns.
- Add trace fixtures for each important MAST mode, not only unit tests.
- Add a "why this fired" explanation model for each failure:
  - rule inputs
  - affected agent
  - evidence span(s)
- Add classifier confidence or evidence detail where helpful.
- Create a "known-good healthy traces" suite that should stay clean.
- Create a "known-bad failure traces" suite that should stay meaningfully flagged.

### Definition of done

- healthy demo traces remain clean
- intentional failure traces remain convincingly broken
- changes to classifier logic can be regression-tested on real fixtures

## Priority 4: Strengthen package and install quality

Publishing happened. Now the packages need to feel deliberate.

### Goals

- installation should be boring and reliable
- package pages should look polished
- import and versioning should feel stable

### Work

- Improve package READMEs on npm and PyPI:
  - short explanation
  - install
  - minimal example
  - link back to main docs
- Align package versions and release notes across:
  - `@rifft-dev/rifft`
  - `@rifft-dev/mcp`
  - `rifft-sdk`
  - `rifft-crewai`
  - `rifft-autogen`
  - `rifft-mcp`
- Add package publishing docs:
  - version bump flow
  - build and verification steps
  - npm and PyPI release checklist
- Verify fresh-install examples from the published packages, not only from the repo.

### Definition of done

- a user can install from npm or PyPI without repo context
- package pages reinforce trust rather than looking scaffolded

## Priority 5: Add proof of reliability

This is what turns "cool demo" into "tool teams rely on".

### Goals

- prove Rifft behaves well under realistic workloads
- reduce fear around data integrity and product stability

### Work

- Build a repeatable validation matrix:
  - clean-start self-host check
  - package install checks
  - framework runtime validation
  - performance checks
  - browser QA
- Add seeded trace fixtures for:
  - healthy run
  - fatal communication failure
  - unverified propagation failure
  - timeout / cost stress cases
- Add smoke CI for:
  - web typecheck and build
  - collector tests
  - Python SDK tests
  - JS SDK tests
- Add backup/retention guidance for self-hosted users.

### Definition of done

- there is one place where maintainers can see whether the launch bar still holds
- releases feel repeatable, not heroic

## Priority 6: Win the category narrative

A technically good project can still stay small if the positioning is fuzzy.

### Goals

- make Rifft easy to describe in one sentence
- make the problem and value obvious to developers, founders, and infra teams

### Work

- Keep the positioning sharp:
  - "Debugger for multi-agent AI systems"
- Create launch assets:
  - one hero screenshot
  - one 30-60 second walkthrough
  - one "broken run to root cause" story
- Write comparison copy:
  - why Rifft is not prompt management
  - why Rifft is not generic observability
  - why Rifft is not just logs
- Add concrete public examples:
  - CrewAI failure walkthrough
  - AutoGen failure walkthrough
  - MCP trace walkthrough

### Definition of done

- someone encountering Rifft for the first time immediately understands what it is for

## Priority 7: Prepare for scale without losing the product

This is not the immediate launch blocker, but it matters if adoption grows.

### Goals

- keep the product architecture ready for a future hosted version
- avoid painting the project into a corner

### Work

- document data model and retention assumptions
- harden idempotency and ingest concurrency guarantees
- improve large-trace pagination and graph rendering behavior
- define the path to:
  - auth
  - multi-project ownership
  - hosted deployment
  - billing / limits
- decide what remains open-source core vs hosted product value-add

### Definition of done

- Rifft can grow without requiring a full conceptual rewrite

## Recommended next 30 days

If the goal is to make the project exceptional quickly, the best next sequence is:

1. polish the root README and all package pages
2. create a full quickstart set for Python SDK, JS SDK, CrewAI, AutoGen, and MCP
3. build a real trace fixture suite for MAST quality regression
4. record one short walkthrough video/GIF from seeded failure to root cause
5. run a published-package install validation pass from clean sample apps
6. write a lightweight release checklist for npm, PyPI, and Docker

## The bar

Rifft becomes exceptional when a developer can say:

> "My agents were doing something weird. I installed Rifft, ran the workflow, and it showed me exactly where the failure started."

That is the standard to optimize for.
