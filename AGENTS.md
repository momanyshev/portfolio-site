# Repository Guidelines

## Project Structure & Module Organization

`site/` is the deployable frontend. It contains the portfolio, QA Lab pages, vanilla JavaScript, styles, and static assets. `netlify/functions/issues.mjs` exposes the CRUD API; reusable validation and persistence code lives in `netlify/lib/`. Keep Playwright specifications in `tests/e2e/`. Postman API tests live in the single collection `tests/api/api-lab.postman_collection.json`; iteration data belongs in `tests/api/data/`, the local environment belongs in `tests/api/environments/`, and usage notes belong in `tests/api/README.md`. Supporting API documentation and the OpenAPI contract live in `docs/`. Root files such as `netlify.toml` and `playwright.config.ts` define hosting, redirects, browsers, and local test startup.

## Build, Test, and Development Commands

Use Node 22 (`nvm use`) and install the locked dependency set with `npm ci`.

- `npm run dev` starts the static site and Netlify Functions at `http://127.0.0.1:8888`.
- `npm run serve:static` serves only `site/` at `http://127.0.0.1:4173`; API features will not work.
- `npm test` runs the complete Playwright suite.
- `npm run test:ui` or `npm run test:headed` helps debug tests interactively.
- `npm run report` opens the latest HTML report.
- `npx --no-install newman run tests/api/api-lab.postman_collection.json -e tests/api/environments/api-lab.local.postman_environment.json --folder "01 — CRUD smoke"` runs the Postman smoke folder against a separately running `npm run dev` server.

Newman is a locked dev dependency. Invoke it through `npx --no-install newman` or an npm script, not through an assumed global installation. See `tests/api/README.md` for the matching folder and `-d` data-file commands for POST, PATCH, and query validation. Do not use Newman `--bail`, because an early stop can skip teardown requests.

There is no separate compile step: Netlify publishes `site/` directly.

## Coding Style & Naming Conventions

Follow the existing two-space indentation and semicolon style. Use double quotes in JavaScript and TypeScript, `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants, and kebab-case for CSS classes and data attributes. Prefer semantic HTML and accessible labels because tests locate elements by roles and names. Name tests after features, for example `api-lab.spec.ts`. No formatter or linter is enforced, so match adjacent code and keep changes focused.

## Testing Guidelines

### Playwright

Tests use `@playwright/test` across Chromium, Firefox, WebKit, and mobile Chrome. Name files `*.spec.ts` and prefer `getByRole`, `getByLabel`, or `getByText` over brittle CSS selectors. Isolate CRUD scenarios with a unique workspace ID, and assert both HTTP responses and visible UI outcomes where relevant.

### Postman and Newman

Keep one Postman collection divided into independently runnable folders: CRUD smoke, data-driven validation, protocol/contract, and workspace isolation. Each folder must generate fresh workspace IDs at runtime, create its own fixtures, and remove created issues in explicit teardown requests. Store only `baseUrl` in a committed Postman environment; never persist runtime workspace or issue IDs.

Put universal response-time and protocol assertions in the collection-level post-response script. Keep expected status codes and business-body assertions at request level. Every request must check its expected status, complete in under one second, and validate the relevant response body or the intentionally empty `204` body. Error scenarios must verify `error.code`, relevant `error.fields`, and the common error contract.

Run each data-driven folder only with its matching file:

- `02.1 — POST body (data-driven)` with `tests/api/data/post-validation-cases.json`;
- `02.2 — PATCH body (data-driven)` with `tests/api/data/patch-validation-cases.json`;
- `02.3 — Query (data-driven)` with `tests/api/data/query-validation-cases.json`.

Each data row represents one independent iteration and includes a case name, request input, expected status, expected error code, and expected fields. Update the collection, matching data file, and `tests/api/README.md` together when the data contract or folder names change. Do not run the parent `02 — Validation` folder with one child folder's data file.

Run `npm test` for frontend or E2E changes and the relevant Newman folders for API collection or contract changes. The project has no numeric coverage threshold; generated reports and test results must remain untracked.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects, such as `Add Playwright testing setup`. Keep each commit scoped to one logical change. Pull requests should explain the behavior changed, list verification commands, link relevant issues, and include screenshots for visual updates.

## Security & Configuration

Do not commit secrets, `.netlify/`, `node_modules/`, `playwright-report/`, `test-results/`, or generated Newman reports. Committed Postman environments may contain non-sensitive endpoints such as `baseUrl` only. The demo workspace header separates test data; it is not authentication and must not be presented as a security boundary.
