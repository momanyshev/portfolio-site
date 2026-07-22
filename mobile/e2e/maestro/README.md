# Maestro E2E для QA Lab Mobile

Каталог содержит 12 независимых базовых пользовательских сценариев для
приложения `ru.maksim.qalab`. Flows работают через accessibility tree и используют
стабильные React Native `testID` там, где текст элемента динамический.

Это отдельный слой над unit-тестами. Он проверяет установленную native-сборку,
реальный UI и настоящий REST API.

## Сценарии

| Flow | Проверка |
| --- | --- |
| `01-first-launch-workspace.yaml` | первый запуск, создание и сохранение Workspace |
| `02-create-issue.yaml` | создание дефекта |
| `03-search-and-multifilters.yaml` | поиск, статусный и severity-мультифильтры |
| `04-view-issue.yaml` | загрузка и просмотр карточки |
| `05-edit-issue.yaml` | редактирование дефекта |
| `06-quick-status-change.yaml` | быстрый допустимый переход статуса |
| `07-unsaved-changes.yaml` | защита несохранённой формы |
| `08-delete-issue.yaml` | подтверждение и удаление |
| `09-load-error-and-retry.yaml` | недоступный API и повтор загрузки |
| `10-workspace-isolation.yaml` | смена Workspace и изоляция данных |
| `11-api-inspector-and-curl.yaml` | инспектор POST, тела, cURL и копирование |
| `12-theme-persistence.yaml` | переключение и сохранение темы |

## Предварительные условия

1. Установите Maestro CLI по официальной инструкции и проверьте:

   ```bash
   maestro --version
   ```

2. Запустите API из корня репозитория:

   ```bash
   nvm use
   npm ci
   npm run dev
   ```

3. Соберите и установите приложение на уже запущенный Simulator/Emulator:

   ```bash
   cd mobile
   npm ci
   npm run ios:local
   ```

   или:

   ```bash
   cd mobile
   npm ci
   npm run android:local
   ```

4. Не закрывайте Netlify Dev и Metro во время обычного прогона.

Каждый автоматический flow запускает приложение с `clearState: true`. Это
сбрасывает AsyncStorage и заставляет приложение создать новый Workspace UUID,
поэтому CRUD-сценарии не зависят друг от друга. Сценарий изоляции использует два
явных тестовых UUID и удаляет созданную запись в конце.

## Запуск

Из каталога `mobile/` запустите основной набор. Сценарий намеренной сетевой
ошибки исключён, потому что ему нужен недоступный endpoint:

```bash
maestro test --exclude-tags=manual-network e2e/maestro/flows
```

Один сценарий:

```bash
maestro test e2e/maestro/flows/02-create-issue.yaml
```

Если одновременно запущено несколько устройств, сначала посмотрите их ID:

```bash
adb devices
xcrun simctl list devices booted
```

Затем передайте нужное устройство:

```bash
maestro --device <device-id> test \
  --exclude-tags=manual-network e2e/maestro/flows
```

Для полного покрытия запустите один и тот же основной набор отдельно на iOS
Simulator и Android Emulator.

## Сценарий сетевой ошибки

`09-load-error-and-retry.yaml` должен видеть заведомо недоступный API. Соберите
отдельный local development client на закрытый порт и не запускайте сервер на
этом порту.

iOS Simulator:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:1 \
npx expo run:ios
```

Android Emulator:

```bash
APP_ENV=local \
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:1 \
npx expo run:android
```

Затем:

```bash
maestro test e2e/maestro/flows/09-load-error-and-retry.yaml
```

Flow проверяет сообщение об ошибке, кнопку «Повторить» и повторное появление
ошибки. После него пересоберите обычный local client с `npm run ios:local` или
`npm run android:local`.

## Селекторы и тестовые данные

- `workspace-id`, `workspace-input` — текущее пространство и поле смены UUID;
- `create-issue-button` — открытие формы;
- `issue-title-input`, `issue-description-input` — поля формы;
- `issue-severity-picker`, `issue-status-picker` — enum-поля;
- `issue-search-input` — поиск;
- `filter-modal-*`, `filter-status-*`, `filter-severity-*` — мультифильтры;
- `issue-form-modal`, `issue-details-modal`, `delete-issue-modal` — модальные
  экраны;
- `api-inspector*`, `inspector-*` — метаданные, секции и кнопки копирования.

Динамические кнопки карточек ищутся по доступной подписи с названием дефекта,
например `Редактировать дефект «Maestro edit defect»`. Это одновременно
проверяет, что подписи для VoiceOver и TalkBack присутствуют.

Тестовые title и description намеренно набраны латиницей: команда Maestro
`inputText` не поддерживает Unicode на Android. Русские системные подписи
проверяются через `assertVisible` и `tapOn`.

Native Picker отличается на iOS и Android, но flows используют одинаковую
последовательность: открыть picker по `testID`, затем выбрать русскую подпись.
Если конкретная версия iOS отображает wheel без popup, убедитесь, что нужный
вариант находится в accessibility tree; при обновлении Picker допускается
разделить только этот шаг на platform-specific subflows.

## Диагностика нестабильного прогона

- убедитесь, что `curl http://127.0.0.1:8888/api/issues` отвечает через Netlify
  Dev с обязательным Workspace header;
- для Android используйте API URL `10.0.2.2`, а не `127.0.0.1`;
- дождитесь полного запуска Metro и исчезновения development-client overlay;
- проверьте, что на устройстве установлено приложение именно с app ID
  `ru.maksim.qalab`;
- не запускайте несколько CRUD-flows параллельно на одном и том же устройстве;
- используйте артефакты Maestro и `maestro hierarchy`, если изменился
  accessibility tree;
- конкурентные тесты Netlify Blobs запускайте на deploy preview, а не на
  локальном эмуляторе Blobs.

Flows являются исходными regression-сценариями. Перед включением в CI их нужно
прогнать на выбранных версиях iOS Simulator и Android Emulator и зафиксировать
эти версии в CI-образах.

## Ссылки

- [Maestro Flows](https://docs.maestro.dev/maestro-flows)
- [Maestro selectors](https://docs.maestro.dev/api-reference/selectors)
- [Команды Maestro](https://docs.maestro.dev/api-reference/commands)
- [Основной README приложения](../../README.md)
