# Repository Guidelines

## Project Structure & Module Organization

This repository contains a static portfolio site with Playwright e2e tests.

- `site/` contains the production site: `index.html`, `styles.css`, `script.js`, `favicon.svg`, and `assets/`.
- `tests/e2e/` contains active Playwright tests. Keep new specs here.
- `docs/` contains learning notes and project documentation.
- `docs/archive/` keeps old scaffold or reference tests that should not run.
- `playwright.config.ts` configures browsers, local server startup, traces, screenshots, and videos.
- `netlify.toml` publishes `site/` on Netlify.

## Build, Test, and Development Commands

- `npm install` installs local dependencies.
- `npm run serve` starts the static site locally with Vite at `http://127.0.0.1:4173`.
- `npm test` runs all Playwright tests from `tests/e2e/`.
- `npm run test:ui` opens Playwright UI mode for interactive debugging.
- `npm run test:headed` runs tests with visible browsers.
- `npm run report` opens the latest Playwright HTML report.

## Coding Style & Naming Conventions

Use two-space indentation in HTML, CSS, JavaScript, TypeScript, JSON, and Markdown. Prefer semantic HTML and accessible names because tests rely on roles, labels, headings, and link names. Keep CSS class names descriptive and kebab-cased, for example `theme-toggle` or `achievement-card`. Name Playwright files by feature, such as `theme.spec.ts` or `contacts.spec.ts`.

## Testing Guidelines

Tests use `@playwright/test`. Prefer user-visible locators such as `getByRole`, `getByText`, and `getByAltText` before CSS selectors. Keep smoke coverage small and stable; put scenario-specific checks in separate specs. Before opening a PR, run `npm test`. If a test is intentionally skipped, include the reason in the test code, as with the mobile skip for desktop navigation.

## Commit & Pull Request Guidelines

The current history is minimal (`Initial portfolio site`), so no strict convention is established yet. Use short imperative commit subjects, for example `Add theme persistence tests` or `Move static assets into site`. Pull requests should include a brief summary, test results, linked issues when relevant, and screenshots for visual changes.

## Agent-Specific Instructions

Treat `site/` as the deployable app and `tests/e2e/` as the regression suite. Do not commit generated folders such as `node_modules/`, `playwright-report/`, or `test-results/`.
