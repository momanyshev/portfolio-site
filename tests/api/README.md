# Postman-тесты QA Lab

Набор хранится в одной Postman collection и разделён на независимо запускаемые папки. В environment находится только `baseUrl`; workspace и issue ID генерируются во время запуска и очищаются teardown-запросами.

## Структура

```text
tests/api/
├── api-lab.postman_collection.json
├── data/
│   ├── post-validation-cases.json
│   ├── patch-validation-cases.json
│   ├── query-validation-cases.json
│   └── status-transition-cases.json
├── environments/
│   └── api-lab.local.postman_environment.json
└── README.md
```

Папки коллекции:

- `01 — CRUD smoke` — полный позитивный CRUD, включая `blocker`, цепочку `open → in_progress → testing → resolved`, мультифильтры с повторяющимися `status`/`severity`, проверку удаления и teardown;
- `02.1 — POST body (data-driven)` — негативная валидация POST;
- `02.2 — PATCH body (data-driven)` — негативная валидация PATCH с отдельной фикстурой на каждой итерации;
- `02.3 — Query (data-driven)` — негативная валидация query-параметров;
- `02.4 — Status transitions (data-driven)` — полная матрица допустимых и запрещённых переходов, атомарность отказа и PATCH без `status`;
- `03 — Protocol and contract` — workspace/id, JSON, Content-Type, методы, `Allow` и формат ошибок;
- `04 — Workspace isolation` — чтение и мутации между двумя workspace и удаление обеих фикстур.

Общий post-response скрипт коллекции проверяет для каждого ответа:

- время ответа менее одной секунды;
- `Cache-Control`, `Vary` и UUID в `X-Request-Id`;
- JSON `Content-Type` и валидное JSON-тело для всех ответов, кроме `204`;
- пустое тело и отсутствие `Content-Type` для `204`;
- единый объект ошибки и совпадение `error.requestId` с заголовком.

Ожидаемый статус и бизнес-значения проверяются на уровне конкретных запросов.

### Query-параметры мультифильтров

Для мультивыбора передавайте `status` и `severity` отдельными повторяющимися
query-параметрами, например:

```text
?status=open&status=testing&severity=high&severity=blocker
```

Разные значения одного поля объединяются по правилу OR, а `status`, `severity`
и `q` — по правилу AND. Один `status` или `severity` остаётся обратно
совместимым. Не передавайте CSV: `status=open,testing` считается невалидным.

API возвращает `400 INVALID_QUERY`, если `q` указан более одного раза, если
конкретное значение `status`/`severity` продублировано, пусто или не входит в
поддерживаемый enum. Позитивная обработка разных повторяющихся значений
проверяется в `01 — CRUD smoke`, а перечисленные ошибки — в
`02.3 — Query (data-driven)`.

## Локальный запуск

Запустите API:

```bash
npm run dev
```

В Postman импортируйте:

1. `api-lab.postman_collection.json`;
2. `environments/api-lab.local.postman_environment.json`.

Выберите environment `API Lab — Local`. Smoke, contract и isolation запускайте как отдельные папки через Collection Runner. Для validation-папок укажите соответствующий файл из `data/` в поле Data.

## Запуск через Newman

Newman установлен как `devDependency`. Выполняйте команды из корня проекта через `npx --no-install newman`, чтобы использовать зафиксированную локальную версию без скачивания другой.

CRUD smoke:

```bash
npx --no-install newman run tests/api/api-lab.postman_collection.json \
  -e tests/api/environments/api-lab.local.postman_environment.json \
  --folder "01 — CRUD smoke"
```

POST validation:

```bash
npx --no-install newman run tests/api/api-lab.postman_collection.json \
  -e tests/api/environments/api-lab.local.postman_environment.json \
  --folder "02.1 — POST body (data-driven)" \
  -d tests/api/data/post-validation-cases.json
```

PATCH validation:

```bash
npx --no-install newman run tests/api/api-lab.postman_collection.json \
  -e tests/api/environments/api-lab.local.postman_environment.json \
  --folder "02.2 — PATCH body (data-driven)" \
  -d tests/api/data/patch-validation-cases.json
```

Query validation (невалидные значения, точные дубликаты, пустые значения и CSV):

```bash
npx --no-install newman run tests/api/api-lab.postman_collection.json \
  -e tests/api/environments/api-lab.local.postman_environment.json \
  --folder "02.3 — Query (data-driven)" \
  -d tests/api/data/query-validation-cases.json
```

Status transitions:

```bash
npx --no-install newman run tests/api/api-lab.postman_collection.json \
  -e tests/api/environments/api-lab.local.postman_environment.json \
  --folder "02.4 — Status transitions (data-driven)" \
  -d tests/api/data/status-transition-cases.json
```

Protocol and contract:

```bash
npx --no-install newman run tests/api/api-lab.postman_collection.json \
  -e tests/api/environments/api-lab.local.postman_environment.json \
  --folder "03 — Protocol and contract"
```

Workspace isolation:

```bash
npx --no-install newman run tests/api/api-lab.postman_collection.json \
  -e tests/api/environments/api-lab.local.postman_environment.json \
  --folder "04 — Workspace isolation"
```

Не используйте `--bail`: при ранней остановке Runner может не дойти до teardown-запросов. У каждого сценария создаётся уникальный workspace, поэтому аварийно оставшиеся записи не влияют на последующие запуски и будут логически удалены сервером после срока хранения.

## Data-driven формат

Каждая строка validation-файла содержит:

| Поле | Назначение |
| --- | --- |
| `caseName` | Название сценария в отчёте |
| `requestBody` или `queryString` | Входные данные запроса |
| `expectedStatus` | Ожидаемый HTTP-статус |
| `expectedCode` | Ожидаемый `error.code` |
| `expectedFields` | Поля, которые должны присутствовать в `error.fields` |
| `fromStatus` | Исходный статус фикстуры для `02.4` |
| `expectedPersistedStatus` | Статус после контрольного GET в `02.4` |
| `expectedPersistedTitle` | Заголовок после контрольного GET для проверки атомарности в `02.4` |
| `expectedPersistedSeverity` | Критичность после контрольного GET в `02.4`; по умолчанию `medium` |

Для `02.4 — Status transitions` строки дополнительно содержат исходный статус,
тело PATCH и ожидаемое сохранённое состояние. Каждая итерация создаёт собственную
фикстуру, выполняет контрольный GET и удаляет запись независимо от остальных строк.

Без data-файла каждая validation-папка выполняет один встроенный fallback-сценарий. Для полного набора используйте команды с `-d`.

## Переменные и изоляция

- `baseUrl` — единственная сохранённая environment-переменная;
- динамические ID находятся только в collection/local scope во время выполнения;
- каждая папка создаёт собственные UUID и не зависит от предыдущей папки;
- созданные дефекты удаляются явными teardown-запросами;
- секреты и production workspace ID в файлах не хранятся.
