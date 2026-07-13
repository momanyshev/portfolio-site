# momanyshev.netlify.app + Playwright

Учебный проект для практики автоматизации тестирования сайта-визитки на Playwright и Playwright MCP.

## Структура

- `site/` - файлы самого сайта: HTML, CSS, JS и assets.
- `tests/e2e/` - автотесты Playwright.
- `docs/` - учебные материалы и план.
- `playwright.config.ts` - конфигурация Playwright.
- `netlify.toml` - настройка публикации статического сайта из `site/`.

## Команды

```bash
npm install
npx playwright install
npm test
```

Для интерактивного режима:

```bash
npm run test:ui
```

Для запуска сайта локально:

```bash
npm run serve
```
