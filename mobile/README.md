# QA Lab Mobile — трекер дефектов

Нативное кроссплатформенное приложение для iOS и Android переносит возможности
веб-страницы `site/api-lab.html` в мобильный интерфейс. Приложение работает с тем
же REST API `/api/issues`, не использует WebView и не содержит собственной копии
backend.

Идентификатор приложения на обеих платформах: `ru.maksim.qalab`.

## Возможности

- полный CRUD дефектов через Netlify Function;
- поиск с debounce и мультифильтры по статусу и критичности;
- допустимые статусные переходы и быстрое изменение статуса в карточке;
- изолированные Workspace с хранением UUID в AsyncStorage;
- отдельная вкладка инспектора последнего HTTP-запроса с телами, статусом,
  длительностью и воспроизводимой cURL-командой;
- копирование Workspace ID, тел запроса/ответа и cURL;
- тёмная и светлая темы с сохранением выбора;
- pull-to-refresh, пустые состояния, ошибки и повтор загрузки;
- защита несохранённых изменений и обработка устаревших конкурентных ответов;
- доступные подписи и роли для VoiceOver, TalkBack и UI-автоматизации.

## Технологии

- Expo SDK 57 и Expo Development Build;
- React Native 0.86, React 19 и TypeScript в строгом режиме;
- Expo Router с нижней навигацией;
- собственный типизированный API-клиент на `fetch` и `AbortController`;
- AsyncStorage, Expo Crypto и Expo Clipboard;
- Jest и React Native Testing Library;
- Maestro для базовых E2E-пользовательских сценариев.

Приложение рассчитано именно на development build. Expo Go не является целевым
способом запуска, потому что проект использует native-конфигурацию и локальный
config plugin.

## Архитектура

```text
mobile/
├── app.config.ts                 Expo-конфигурация iOS и Android
├── plugins/with-local-http.js    iOS-настройка локального API для dev build
├── src/
│   ├── app/                      маршруты «Дефекты» и «API-запрос»
│   ├── api/                      HTTP-клиент и данные API-инспектора
│   ├── components/               карточки, формы, фильтры и UI-примитивы
│   ├── domain/                   модель дефекта, переходы, фильтры, валидация
│   ├── lib/                      UUID, query string, ошибки, cURL, sequencing
│   ├── providers/                состояние Workspace, дефектов и темы
│   ├── theme/                    токены светлой и тёмной тем
│   └── __tests__/                unit-тесты бизнес-логики
└── e2e/maestro/                  мобильные E2E-сценарии
```

`docs/openapi.yaml` в корне репозитория остаётся источником истины для HTTP-
контракта. `site/api-lab.js` и Playwright-тесты фиксируют ожидаемую клиентскую
логику веб-версии.

Поток данных выглядит так:

```text
Экран/модальная форма
        ↓
IssuesProvider ── AsyncStorage (Workspace и тема)
        ↓
типизированный API-клиент
        ↓
Netlify Function /api/issues
        ↓
Netlify Blobs
```

Фоновый `GET` после мутации выполняется без публикации в инспектор, поэтому
последним видимым запросом остаётся `POST`, `PATCH` или `DELETE`. Номер запроса и
ревизия Workspace не позволяют позднему ответу затереть более новое состояние.

## Требования

- macOS для локального запуска обеих платформ;
- Node.js 22 (`.nvmrc` находится в корне репозитория);
- npm;
- Xcode с установленным iOS Simulator;
- Android Studio, Android SDK и хотя бы один AVD;
- JDK, выбранный Android Studio;
- Maestro CLI — только для мобильных E2E-тестов.

В репозитории два независимых lock-файла: один для сайта/API, второй для
мобильного приложения. Поэтому зависимости устанавливаются отдельно.

```bash
cd /path/to/portfolio-site
nvm use
npm ci

cd mobile
npm ci
```

## Конфигурация API

Клиент читает базовый URL из `EXPO_PUBLIC_API_BASE_URL`. Значение должно
содержать только origin, без `/api/issues` и без завершающего слеша.

| Среда | Значение |
| --- | --- |
| iOS Simulator | `http://127.0.0.1:8888` |
| Android Emulator | `http://10.0.2.2:8888` |
| Физическое устройство | `http://<LAN-IP-компьютера>:8888` |
| Production | `https://<site>.netlify.app` |

Для development-сборки без переменной клиент использует платформенный локальный
адрес из таблицы. Для production-сборки URL обязателен: приложение намеренно не
подставляет localhost.

Пример локального env-файла:

```bash
cd mobile
cp .env.example .env.local
```

Оставьте в `.env.local` только адрес текущей цели. Например, для iOS Simulator:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8888
```

Переменные с префиксом `EXPO_PUBLIC_` попадают в клиентский bundle и не являются
секретами. Не помещайте туда токены, пароли и закрытые ключи.

### `APP_ENV` и локальный HTTP

`APP_ENV` управляет native-конфигурацией во время prebuild. Если переменная не
задана, конфигурация считается локальной — поэтому требуемые команды
`npx expo run:ios` и `npx expo run:android` работают без дополнительного флага.

- local-конфигурация подключает `plugins/with-local-http.js` и добавляет на iOS
  ограниченное ATS-разрешение локальной сети с понятным privacy-описанием;
- сгенерированный Expo Android-проект разрешает cleartext только в
  `src/debug` и `src/debugOptimized`, не в main/release manifest;
- при `APP_ENV=production` локальный config plugin не подключается;
- `NSAllowsArbitraryLoads` остаётся `false` во всех проверенных iOS-конфигурациях.

Это build-time настройка. Смена переменной после генерации `ios/` и `android/`
не переписывает уже созданные native-проекты. При переходе с local на production
обязательно выполните чистый prebuild, описанный ниже.

## Запуск локального Netlify API

В первом терминале, из корня репозитория:

```bash
nvm use
npm ci
npm run dev
```

Проверка API:

```bash
curl -i \
  -H 'X-Demo-Workspace-Id: 3f64012e-4f50-4d6f-80ea-f51e840abc91' \
  http://127.0.0.1:8888/api/issues
```

Используйте именно `npm run dev`. Команда `npm run serve:static` не запускает
Netlify Functions и для мобильного приложения не подходит.

## iOS Simulator

1. Запустите локальный API в отдельном терминале.
2. Откройте Xcode и убедитесь, что нужный Simulator runtime установлен.
3. Из каталога `mobile/` выполните:

```bash
npm run ios:local
```

Скрипт эквивалентен запуску с `APP_ENV=local` и URL
`http://127.0.0.1:8888`. Expo сгенерирует native-проект при необходимости,
соберёт development client, установит его в Simulator и запустит Metro.

Для выбора конкретного симулятора:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8888 \
npx expo run:ios --device
```

### Запуск через Xcode

Сначала создайте local-native проект:

```bash
APP_ENV=local npx expo prebuild --clean
```

Затем откройте `mobile/ios/*.xcworkspace` в Xcode, выберите схему приложения и
Simulator, после чего нажмите Run. Metro для уже установленного development
client запускается отдельно:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8888 \
npm start
```

## Android Emulator

1. Запустите локальный API.
2. В Android Studio откройте Device Manager и запустите AVD.
3. Из каталога `mobile/` выполните:

```bash
npm run android:local
```

`10.0.2.2` — специальный адрес host-машины из стандартного Android Emulator;
`127.0.0.1` внутри эмулятора указывает на сам эмулятор.

Для выбора устройства:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8888 \
npx expo run:android --device
```

### Запуск через Android Studio

Сгенерируйте local-native проект:

```bash
APP_ENV=local npx expo prebuild --clean
```

Откройте каталог `mobile/android` в Android Studio, дождитесь Gradle Sync,
выберите AVD и запустите конфигурацию `app`. Metro запускается отдельно:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8888 \
npm start
```

## Физическое устройство

Телефон и компьютер должны находиться в одной локальной сети. Узнайте LAN IPv4
компьютера, например `192.168.1.42`, и сначала проверьте с телефона, что адрес
`http://192.168.1.42:8888/api/issues` доступен. При необходимости разрешите
входящие подключения для Node/Netlify CLI в firewall.

Сборка и установка на выбранное устройство:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8888 \
npx expo run:ios --device
```

или:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8888 \
npx expo run:android --device
```

Для последующих JS/TS-изменений достаточно Metro:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8888 \
npx expo start --dev-client --lan
```

На iPhone нужно включить Developer Mode и подтвердить доверие компьютеру. На
Android включите Developer options и USB debugging. Если корпоративная сеть
блокирует соединения между устройствами, используйте HTTPS Netlify deploy вместо
локального HTTP.

## Ежедневный цикл разработки

После первой native-сборки изменения только в JS/TS не требуют повторной
компиляции:

```bash
npm start
```

Повторите `expo run:ios`/`expo run:android` после изменения native-зависимостей,
`app.config.ts` или config plugin. Если среда изменилась с production на local
либо наоборот, сначала выполните `prebuild --clean` с правильным `APP_ENV`.

## Production prebuild и release

Production должен обращаться к HTTPS-деплою Netlify. Укажите его в локальном,
не коммитящемся `.env.local`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://example.netlify.app
```

После любой local-сборки обязательно удалите и пересоздайте native-проекты:

```bash
npm run prebuild:production
```

Этот скрипт выполняет `APP_ENV=production expo prebuild --clean`. Флаг `--clean`
принципиален: он удаляет local-native проекты и генерирует их заново без
`with-local-http`. Expo Development Client может сохранять ограниченное iOS-
разрешение локальной сети для обнаружения Metro, но произвольные ATS-загрузки не
разрешены; Android main/release manifest не разрешает cleartext.

После этого:

- iOS: откройте `ios/*.xcworkspace`, настройте signing, выберите Release и
  выполните Product → Archive;
- Android: откройте `android` в Android Studio, настройте signing и соберите
  signed Android App Bundle либо выполните release-задачу Gradle.

Перед архивированием убедитесь, что итоговый `EXPO_PUBLIC_API_BASE_URL` начинается
с `https://`, и не запускайте local-prebuild поверх production-native проекта.

## Проверки качества

Из каталога `mobile/`:

```bash
npm run lint
npm run typecheck
npm test
npm run doctor
```

- `lint` запускает Expo ESLint-конфигурацию;
- `typecheck` выполняет `tsc --noEmit` в strict mode;
- `test` запускает Jest последовательно;
- `doctor` проверяет согласованность Expo SDK, native-зависимостей и конфигурации.

После изменения API отдельно прогоните проверки корневого проекта по правилам
репозитория. Мобильные Maestro-сценарии описаны в
[`e2e/maestro/README.md`](e2e/maestro/README.md).

### Фактически проверено

- `npm run lint` и `npm run typecheck` завершились успешно.
- `npm test` завершился успешно: 12 наборов, 57 тестов. TypeScript и Jest также
  отдельно проверены под Node.js 22.23.1.
- `npm run doctor` прошёл 20 из 20 проверок Expo.
- Android Debug собран задачей `:app:assembleDebug` с результатом
  `BUILD SUCCESSFUL`, установлен и запущен на `Medium_Phone_API_36.1`; реальный
  API вернул пустой список без ошибки. APK находится в
  [`android/app/build/outputs/apk/debug/app-debug.apk`](android/app/build/outputs/apk/debug/app-debug.apk).
- iOS Debug для `arm64` собран через `xcodebuild`, установлен и запущен на
  iPhone 17 Pro Simulator с iOS 26.5; bundle ID — `ru.maksim.qalab`.
- Web-export и визуальный smoke-test завершились успешно: проверены основной
  экран, форма создания, обе темы и API-инспектор.
- CRUD smoke локального REST API прошёл 52 из 52 Newman-проверок, включая
  создание, мультифильтры, чтение, статусные переходы, удаление и teardown.
- В `e2e/maestro/flows/` подготовлено 12 YAML-сценариев. Maestro CLI в этой
  среде не установлен, поэтому сами native E2E-сценарии здесь не запускались.

## Безопасность и ограничения демо

- Workspace ID разделяет данные, но не является аутентификацией или секретом.
- Любой, кто знает UUID, может прочитать и изменить данные workspace.
- Не вводите персональные, конфиденциальные или production-данные.
- В одном workspace допускается не более 50 дефектов.
- Workspace логически истекает через 30 дней после последней успешной мутации;
  обычное чтение срок не продлевает.
- Локальные Netlify Blobs не синхронизируются с production и могут исчезнуть при
  очистке локального состояния Netlify.
- Production API рассчитан на HTTPS; cleartext HTTP разрешается только native-
  проекту, созданному с `APP_ENV=local`.

### Ограничение конкурентных тестов Netlify Dev

Production-хранилище использует strong consistency и условные записи по ETag.
Локальный Blobs-сервер Netlify CLI 26 не полностью воспроизводит атомарность
одновременных conditional writes. Последовательные CRUD-сценарии локально
поддерживаются, но стресс-тесты с параллельными мутациями одного workspace нужно
запускать на Netlify deploy preview. Локально несколько конкурентных `POST` могут
получить `201`, после чего часть записей будет перезаписана.

## Отличия мобильного UX от веб-страницы

- основные разделы представлены нативной нижней навигацией «Дефекты» и
  «API-запрос»;
- создание, просмотр, редактирование, удаление, фильтры и Workspace открываются
  полноэкранными native-модальными экранами;
- системная кнопка Back и кнопка «Закрыть» учитывают несохранённые изменения;
- интерактивный swipe-dismiss намеренно отключён полноэкранной презентацией:
  системный sheet не позволяет надёжно остановить уже завершившийся жест до
  подтверждения, поэтому мобильная версия не допускает потери черновика этим
  путём;
- select-элементы заменены нативными Picker, подтверждения — системными Alert;
- список поддерживает pull-to-refresh, safe areas и работу с экранной клавиатурой;
- API-инспектор вынесен в отдельную вкладку, чтобы JSON и cURL не перегружали
  карточки дефектов;
- ссылки портфолио не перенесены, потому что не участвуют в работе трекера;
- размеры интерактивных зон и подписи адаптированы для VoiceOver и TalkBack,
  а модальные экраны переводят фокус на заголовок и возвращают его на основной
  экран после закрытия.

Бизнес-правила, HTTP-контракт, фильтры, статусы и смысл Workspace при этом
остаются общими с веб-версией.

## Чек-лист реализации

- [x] Одна кодовая база React Native для iOS и Android без WebView.
- [x] Expo Development Build и запуск через Expo CLI, Xcode и Android Studio.
- [x] Строгие типы API и проверка формы с Unicode-подсчётом символов.
- [x] Workspace UUID: создание, нормализация, сохранение, копирование и смена.
- [x] Изоляция состояния и отмена/игнорирование ответов старого Workspace.
- [x] Создание, просмотр, частичное редактирование и удаление дефектов.
- [x] Статусная модель и быстрое изменение статуса.
- [x] Поиск 300 мс и мультифильтры с состоянием «Все».
- [x] Loading, refresh, empty, filtered-empty, network error и retry-состояния.
- [x] API-инспектор для GET/POST/PATCH/DELETE и `NETWORK ERROR`.
- [x] Копирование Workspace, request body, response body и shell-safe cURL.
- [x] Защита мутации инспектора от фонового GET и старых параллельных ответов.
- [x] Светлая/тёмная тема с сохранением выбора.
- [x] Safe areas, клавиатура, системный Back, VoiceOver и TalkBack labels.
- [x] Unit-тесты доменной логики и API utilities.
- [x] 12 базовых Maestro E2E-сценариев для iOS и Android.
- [x] Документация env, local HTTP, production prebuild и всех способов запуска.

## Полезные документы

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Локальная сборка Expo](https://docs.expo.dev/guides/local-app-development/)
- [Переменные окружения Expo](https://docs.expo.dev/guides/environment-variables/)
- [Maestro Flows](https://docs.maestro.dev/maestro-flows)
- [`docs/openapi.yaml`](../docs/openapi.yaml)
- [`docs/api-lab.md`](../docs/api-lab.md)
