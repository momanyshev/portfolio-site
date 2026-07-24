# QA Engineer Portfolio

Сайт-портфолио QA Engineer и учебный стенд для практики UI- и API-тестирования.
Отдельная страница [QA Lab](http://127.0.0.1:8888/api-lab.html) содержит
трекер дефектов с полноценным CRUD через Netlify Functions и Netlify Blobs.

## Структура

- `site/` — статический frontend портфолио и QA Lab.
- `netlify/functions/` — HTTP API трекера дефектов.
- `netlify/lib/` — серверная валидация и слой Netlify Blobs.
- `mobile/` — QA Lab Mobile: Expo/React Native клиент того же API
  (см. `mobile/README.md`).
- `tests/e2e/` — e2e-тесты Playwright.
- `docs/` — API-контракт, архитектура и планы тестирования.
- `netlify.toml` — публикация `site/`, Functions и локальный Netlify Dev.

Исследование инструмента `sim-use` и будущий мобильный QA-агент живут в
отдельном репозитории `../mobile-qa-research`; этот проект служит для них
приложением-полигоном. Правила для AI-агентов см. в `AGENTS.md`.

## Требования

- Node.js 22 LTS (версия зафиксирована в `.nvmrc`);
- npm;
- браузеры Playwright.

Не используйте QA Lab для чувствительных данных: UUID пространства обеспечивает
изоляцию demo-наборов, но не является аутентификацией.

## Локальный запуск

```bash
nvm use
npm ci
npx playwright install
npm run dev
```

Откройте:

- портфолио — `http://127.0.0.1:8888/`;
- QA Lab — `http://127.0.0.1:8888/api-lab.html`.

Одна команда `npm run dev` поднимает frontend и API. Команда
`npm run serve:static` оставлена только для просмотра статических страниц без API.

## Тесты

```bash
npm test
```

Для интерактивного режима:

```bash
npm run test:ui
```

Playwright сам запускает Netlify Dev, если переменная `PLAYWRIGHT_BASE_URL` не
задана. Для проверки уже развёрнутого окружения:

```bash
PLAYWRIGHT_BASE_URL=https://example.netlify.app npm test
```

## Документация

- [Архитектура и запуск QA Lab](docs/api-lab.md)
- [OpenAPI 3.1](docs/openapi.yaml)
- [План будущих API-тестов](docs/api-test-plan.md)
- [Учебный план по тестированию](docs/testing-learning-plan.md)
