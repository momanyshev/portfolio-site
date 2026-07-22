import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test as base } from "@playwright/test";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const test = base.extend<{ workspaceId: string }>({
  workspaceId: async ({ context }, use) => {
    const workspaceId = randomUUID();

    await context.addInitScript((id: string) => {
      localStorage.setItem("qa-lab-workspace-id", id);
    }, workspaceId);

    await use(workspaceId);
  }
});

function waitForApiResponse(page: Page, method: string, pathname: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === method && url.pathname === pathname;
  });
}

function waitForWorkspaceListResponse(page: Page, workspaceId: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/issues" &&
      response.request().headers()["x-demo-workspace-id"] === workspaceId
    );
  });
}

function waitForFilteredListResponse(
  page: Page,
  {
    q = "",
    severity = [],
    status = []
  }: { q?: string; severity?: string[]; status?: string[] }
) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/issues" &&
      (url.searchParams.get("q") || "") === q &&
      JSON.stringify(url.searchParams.getAll("status")) === JSON.stringify(status) &&
      JSON.stringify(url.searchParams.getAll("severity")) ===
        JSON.stringify(severity)
    );
  });
}

type TestIssue = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical" | "blocker";
  status: "open" | "in_progress" | "testing" | "resolved";
};

type FilterName = "status" | "severity";

type TestIssuePayload = Pick<
  TestIssue,
  "title" | "description" | "severity" | "status"
>;

async function createIssueFixture(
  page: Page,
  workspaceId: string,
  status: TestIssue["status"] = "open"
): Promise<TestIssue> {
  const payload = {
    title: `Close guard ${workspaceId.slice(0, 8)}`,
    description: "Дефект для проверки защиты несохранённых изменений.",
    severity: "medium" as const,
    status
  };
  const response = await page.request.post("/api/issues", {
    headers: { "X-Demo-Workspace-Id": workspaceId },
    data: payload
  });

  expect(response.status()).toBe(201);
  return (await response.json()) as TestIssue;
}

async function createFilterIssueFixture(
  page: Page,
  workspaceId: string,
  payload: TestIssuePayload
): Promise<TestIssue> {
  const response = await page.request.post("/api/issues", {
    headers: { "X-Demo-Workspace-Id": workspaceId },
    data: payload
  });

  expect(response.status()).toBe(201);
  return (await response.json()) as TestIssue;
}

function getFilterMultiselect(page: Page, name: FilterName) {
  return page.locator(`[data-filter-multiselect="${name}"]`);
}

function getFilterTrigger(page: Page, name: FilterName) {
  return getFilterMultiselect(page, name).locator("[data-filter-trigger]");
}

function getFilterCheckbox(page: Page, name: FilterName, label: string) {
  return getFilterMultiselect(page, name).getByRole("checkbox", {
    name: label,
    exact: true,
    includeHidden: true
  });
}

async function openFilterMultiselect(page: Page, name: FilterName) {
  const trigger = getFilterTrigger(page, name);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return getFilterMultiselect(page, name);
}

async function clickFilterCheckbox(
  page: Page,
  name: FilterName,
  label: string
) {
  await openFilterMultiselect(page, name);
  await getFilterCheckbox(page, name, label).click();
}

async function clickDialogBackdrop(page: Page) {
  await page.mouse.click(2, 2);
}

function getHeaderCreateButton(page: Page) {
  return page
    .getByRole("banner", { name: "Навигация QA Lab" })
    .getByRole("button", { name: "Создать дефект" });
}

function getCardStatusControl(page: Page, title: string) {
  return page
    .getByRole("article", { name: title })
    .getByRole("combobox", { name: `Статус дефекта «${title}»`, exact: true });
}

type ClipboardTestState = {
  attempts: string[];
  writes: string[];
  fallbackWrites: string[];
  fallbackSucceeds: boolean;
};

async function installClipboardMock(
  page: Page,
  { rejectNative = false, fallbackSucceeds = true } = {}
) {
  await page.addInitScript(
    ({ rejectNative, fallbackSucceeds }) => {
      const state: ClipboardTestState = {
        attempts: [],
        writes: [],
        fallbackWrites: [],
        fallbackSucceeds
      };

      Object.defineProperty(window, "__clipboardTest", {
        configurable: true,
        value: state
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText(text: string) {
            state.attempts.push(text);
            if (rejectNative) {
              return Promise.reject(new DOMException("Denied", "NotAllowedError"));
            }
            state.writes.push(text);
            return Promise.resolve();
          }
        }
      });
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value(command: string) {
          if (command !== "copy" || !state.fallbackSucceeds) return false;
          const activeElement = document.activeElement;
          state.fallbackWrites.push(
            activeElement instanceof HTMLTextAreaElement ? activeElement.value : ""
          );
          return true;
        }
      });
    },
    { rejectNative, fallbackSucceeds }
  );
}

function readClipboardState(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __clipboardTest: ClipboardTestState;
        }
      ).__clipboardTest
  );
}

function quoteShellArgument(value: string) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

async function expectFormSelectsAligned(dialog: Locator) {
  const severity = dialog.getByLabel("Критичность");
  const status = dialog.getByLabel("Статус");

  await expect
    .poll(
      async () => {
        const [severityRect, statusRect] = await Promise.all(
          [severity, status].map((control) =>
            control.evaluate((element) => {
              const { top, bottom } = element.getBoundingClientRect();
              return { top, bottom };
            })
          )
        );

        return Math.max(
          Math.abs(severityRect.top - statusRect.top),
          Math.abs(severityRect.bottom - statusRect.bottom)
        );
      },
      { message: "Селекты критичности и статуса должны находиться на одной линии" }
    )
    .toBeLessThanOrEqual(2);
}

test.describe("QA Lab", () => {
  test("переходит в QA Lab из портфолио", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Открыть QA Lab" }).click();

    await expect(page).toHaveURL(/\/api-lab\.html$/);
    await expect(
      page.getByRole("heading", { name: "Трекер дефектов", level: 1 })
    ).toBeVisible();
    await expect(getHeaderCreateButton(page)).toBeVisible();
    await expect(
      page.locator(".lab-hero").getByRole("button", { name: "Создать дефект" })
    ).toHaveCount(0);
  });

  test("валидирует изменение Workspace и защищает несохранённый UUID", async ({
    page,
    workspaceId
  }) => {
    await installClipboardMock(page);
    await page.goto("/api-lab.html");
    await expect(page.getByRole("heading", { name: "Дефектов пока нет" })).toBeVisible();

    const workspaceValue = page.locator("[data-workspace-id]");
    const copyWorkspace = page.getByRole("button", {
      name: "Копировать Workspace ID"
    });
    const editWorkspace = page.getByRole("button", {
      name: "Изменить Workspace ID"
    });
    const workspaceDialog = page.getByRole("dialog", {
      name: "Изменить Workspace"
    });
    const workspaceInput = workspaceDialog.getByLabel("Workspace ID");
    const submitWorkspace = workspaceDialog.getByRole("button", {
      name: "Сохранить и перейти"
    });
    let listRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "GET" && url.pathname === "/api/issues") {
        listRequests += 1;
      }
    });

    await expect(workspaceValue).toHaveText(workspaceId);
    await expect(workspaceValue).toHaveCSS("font-style", "italic");
    await expect(copyWorkspace).toHaveAttribute("data-tooltip", "Копировать");
    await copyWorkspace.focus();
    await page.keyboard.press("Enter");
    await expect(copyWorkspace).toHaveAttribute("data-tooltip", "Скопировано");
    await expect(copyWorkspace).toBeFocused();
    expect((await readClipboardState(page)).writes).toEqual([workspaceId]);
    await expect(page.locator("[data-announcer]")).toHaveText(
      "Workspace ID скопирован."
    );

    const editButtonSizes = await editWorkspace.evaluate((button) => {
      const icon = button.querySelector("svg");
      const buttonRect = button.getBoundingClientRect();
      const iconRect = icon?.getBoundingClientRect();
      return {
        buttonHeight: buttonRect.height,
        buttonWidth: buttonRect.width,
        iconHeight: iconRect?.height || 0,
        iconWidth: iconRect?.width || 0
      };
    });
    expect(editButtonSizes.buttonHeight).toBeLessThanOrEqual(40);
    expect(editButtonSizes.buttonWidth).toBeLessThanOrEqual(40);
    expect(editButtonSizes.iconHeight).toBeLessThanOrEqual(16);
    expect(editButtonSizes.iconWidth).toBeLessThanOrEqual(16);

    await editWorkspace.click();
    await expect(workspaceDialog).toBeVisible();
    await expect(workspaceInput).toHaveValue(workspaceId);
    await expect(workspaceInput).toBeFocused();
    await expect
      .poll(() =>
        workspaceInput.evaluate((input: HTMLInputElement) => ({
          end: input.selectionEnd,
          start: input.selectionStart
        }))
      )
      .toEqual({ start: 0, end: workspaceId.length });

    await clickDialogBackdrop(page);
    await expect(workspaceDialog).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(workspaceDialog).toBeHidden();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(editWorkspace).toBeFocused();

    await editWorkspace.click();
    await workspaceInput.fill("");
    await submitWorkspace.click();
    await expect(workspaceDialog.getByRole("alert")).toHaveText(
      "Введите Workspace ID."
    );
    await expect(workspaceInput).toHaveAttribute("aria-invalid", "true");
    await expect(workspaceInput).toBeFocused();

    await workspaceInput.fill("not-a-uuid");
    await expect(workspaceDialog.getByRole("alert")).toBeHidden();
    await submitWorkspace.click();
    await expect(workspaceDialog.getByRole("alert")).toHaveText(
      "Введите UUID в формате 123e4567-e89b-12d3-a456-426614174000."
    );

    const otherWorkspaceId = randomUUID();
    await workspaceInput.fill(otherWorkspaceId);
    await clickDialogBackdrop(page);
    await expect(workspaceDialog).toBeVisible();
    await expect(workspaceInput).toHaveValue(otherWorkspaceId);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.keyboard.press("Escape");

    const warning = page.getByRole("alertdialog", {
      name: "Закрыть без сохранения?"
    });
    await expect(warning).toContainText("Новый Workspace ID не будет сохранён.");
    await warning.getByRole("button", { name: "Продолжить работу" }).click();
    await expect(workspaceDialog).toBeVisible();
    await expect(workspaceInput).toHaveValue(otherWorkspaceId);
    await expect(workspaceInput).toBeFocused();

    await workspaceDialog.getByRole("button", { name: "Отмена" }).click();
    await expect(warning).toBeVisible();
    await warning.getByRole("button", { name: "Продолжить работу" }).click();
    await expect(workspaceInput).toBeFocused();

    await workspaceDialog.getByRole("button", { name: "Отмена" }).click();
    await expect(warning).toBeVisible();
    await warning.getByRole("button", { name: "Закрыть без сохранения" }).click();
    await expect(workspaceDialog).toBeHidden();
    await expect(workspaceValue).toHaveText(workspaceId);
    await expect(editWorkspace).toBeFocused();
    expect(
      await page.evaluate(() => localStorage.getItem("qa-lab-workspace-id"))
    ).toBe(workspaceId);
    expect(listRequests).toBe(0);

    await editWorkspace.click();
    await workspaceInput.fill(`  ${workspaceId.toUpperCase()}  `);
    await submitWorkspace.click();
    await expect(workspaceDialog).toBeHidden();
    await expect(page.locator("[data-announcer]")).toHaveText(
      "Workspace не изменён."
    );
    await expect(workspaceValue).toHaveText(workspaceId);
    await expect(editWorkspace).toBeFocused();
    expect(
      await page.evaluate(() => localStorage.getItem("qa-lab-workspace-id"))
    ).toBe(workspaceId);
    expect(listRequests).toBe(0);
  });

  test("нормализует сохранённый Workspace при загрузке", async ({ page }) => {
    const workspaceId = randomUUID();
    await page.addInitScript((id: string) => {
      localStorage.setItem("qa-lab-workspace-id", id.toUpperCase());
    }, workspaceId);

    await page.goto("/api-lab.html");
    await expect(page.locator("[data-workspace-id]")).toHaveText(workspaceId);
    expect(
      await page.evaluate(() => localStorage.getItem("qa-lab-workspace-id"))
    ).toBe(workspaceId);

    const editWorkspace = page.getByRole("button", {
      name: "Изменить Workspace ID"
    });
    await editWorkspace.click();
    await expect(page.getByRole("dialog", { name: "Изменить Workspace" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Изменить Workspace" })).toBeHidden();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(editWorkspace).toBeFocused();
  });

  test("переключает Workspace, изолирует данные и сохраняет выбор", async ({ page }) => {
    await installClipboardMock(page);
    await page.goto("/api-lab.html");
    const workspaceValue = page.locator("[data-workspace-id]");
    await expect(workspaceValue).not.toHaveText("создаётся…");
    const workspaceAId = (await workspaceValue.innerText()).trim();
    const workspaceBId = randomUUID();
    expect(workspaceAId).toMatch(UUID_PATTERN);

    const issueA = await createIssueFixture(page, workspaceAId);
    const issueB = await createIssueFixture(page, workspaceBId);

    const reloadA = waitForWorkspaceListResponse(page, workspaceAId);
    await page.reload();
    expect((await reloadA).status()).toBe(200);
    await expect(page.getByRole("article", { name: issueA.title })).toBeVisible();
    await expect(page.getByRole("article", { name: issueB.title })).toHaveCount(0);

    const search = page
      .getByRole("search", { name: "Поиск и фильтры дефектов" })
      .getByLabel("Поиск");
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/issues" && url.searchParams.get("q") === issueA.title;
    });
    await search.fill(issueA.title);
    expect((await filtered).status()).toBe(200);

    const editWorkspace = page.getByRole("button", {
      name: "Изменить Workspace ID"
    });
    await editWorkspace.click();
    const workspaceDialog = page.getByRole("dialog", {
      name: "Изменить Workspace"
    });
    await workspaceDialog
      .getByLabel("Workspace ID")
      .fill(`  ${workspaceBId.toUpperCase()}  `);

    const switchToB = waitForWorkspaceListResponse(page, workspaceBId);
    await workspaceDialog
      .getByRole("button", { name: "Сохранить и перейти" })
      .click();
    expect((await switchToB).status()).toBe(200);

    await expect(workspaceDialog).toBeHidden();
    await expect(workspaceValue).toHaveText(workspaceBId);
    await expect(search).toHaveValue("");
    await expect(page.getByRole("article", { name: issueB.title })).toBeVisible();
    await expect(page.getByRole("article", { name: issueA.title })).toHaveCount(0);
    await expect(page.locator("[data-operation-status]")).toHaveText(
      "Workspace изменён. В списке: 1 дефект."
    );
    await expect(editWorkspace).toBeFocused();
    expect(
      await page.evaluate(() => localStorage.getItem("qa-lab-workspace-id"))
    ).toBe(workspaceBId);
    const copyWorkspace = page.getByRole("button", {
      name: "Копировать Workspace ID"
    });
    await copyWorkspace.click();
    expect((await readClipboardState(page)).writes.at(-1)).toBe(workspaceBId);
    await expect(copyWorkspace).toHaveAttribute("data-tooltip", "Скопировано");

    const reloadB = waitForWorkspaceListResponse(page, workspaceBId);
    await page.reload();
    expect((await reloadB).status()).toBe(200);
    await expect(workspaceValue).toHaveText(workspaceBId);
    await expect(page.getByRole("article", { name: issueB.title })).toBeVisible();
    await expect(page.getByRole("article", { name: issueA.title })).toHaveCount(0);

    await editWorkspace.click();
    await workspaceDialog.getByLabel("Workspace ID").fill(workspaceAId);
    const switchBackToA = waitForWorkspaceListResponse(page, workspaceAId);
    await workspaceDialog
      .getByRole("button", { name: "Сохранить и перейти" })
      .click();
    expect((await switchBackToA).status()).toBe(200);
    await expect(page.getByRole("article", { name: issueA.title })).toBeVisible();
    await expect(page.getByRole("article", { name: issueB.title })).toHaveCount(0);
  });

  test("повторяет загрузку после ошибки переключения Workspace", async ({ page }) => {
    await page.goto("/api-lab.html");
    const workspaceAId = (await page.locator("[data-workspace-id]").innerText()).trim();
    const workspaceBId = randomUUID();
    const issueA = await createIssueFixture(page, workspaceAId);
    const issueB = await createIssueFixture(page, workspaceBId);

    await page.reload();
    await expect(page.getByRole("article", { name: issueA.title })).toBeVisible();

    let failWorkspaceBList = true;
    await page.route("**/api/issues*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        failWorkspaceBList &&
        request.method() === "GET" &&
        url.pathname === "/api/issues" &&
        request.headers()["x-demo-workspace-id"] === workspaceBId
      ) {
        failWorkspaceBList = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Workspace list is temporarily unavailable",
              fields: {},
              requestId: randomUUID()
            }
          })
        });
        return;
      }

      await route.continue();
    });

    await page.getByRole("button", { name: "Изменить Workspace ID" }).click();
    const workspaceDialog = page.getByRole("dialog", {
      name: "Изменить Workspace"
    });
    await workspaceDialog.getByLabel("Workspace ID").fill(workspaceBId);
    const failedList = waitForWorkspaceListResponse(page, workspaceBId);
    await workspaceDialog
      .getByRole("button", { name: "Сохранить и перейти" })
      .click();
    expect((await failedList).status()).toBe(503);

    await expect(page.locator("[data-workspace-id]")).toHaveText(workspaceBId);
    expect(
      await page.evaluate(() => localStorage.getItem("qa-lab-workspace-id"))
    ).toBe(workspaceBId);
    await expect(page.locator("[data-load-error]")).toContainText(
      "Workspace list is temporarily unavailable"
    );
    await expect(page.locator("[data-operation-status]")).toHaveText(
      "Workspace изменён, но загрузить дефекты не удалось."
    );
    await expect(page.getByRole("article", { name: issueA.title })).toHaveCount(0);

    const retriedList = waitForWorkspaceListResponse(page, workspaceBId);
    await page.getByRole("button", { name: "Повторить" }).click();
    expect((await retriedList).status()).toBe(200);
    await expect(page.getByRole("article", { name: issueB.title })).toBeVisible();
    await expect(page.getByRole("article", { name: issueA.title })).toHaveCount(0);
    await expect(page.locator("[data-load-error]")).toBeHidden();
    await expect(page.locator("[data-operation-status]")).toBeHidden();
  });

  test("игнорирует завершение inline PATCH предыдущего Workspace", async ({
    page,
    workspaceId
  }) => {
    const issueA = await createIssueFixture(page, workspaceId);
    const workspaceBId = randomUUID();
    const issueB = await createIssueFixture(page, workspaceBId);
    let releasePatch!: () => void;
    let markPatchStarted!: () => void;
    const patchRelease = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });
    const patchStarted = new Promise<void>((resolve) => {
      markPatchStarted = resolve;
    });

    await page.route(`**/api/issues/${issueA.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        markPatchStarted();
        await patchRelease;
      }
      await route.continue();
    });

    await page.goto("/api-lab.html");
    const patchResponsePromise = waitForApiResponse(
      page,
      "PATCH",
      `/api/issues/${issueA.id}`
    );
    await getCardStatusControl(page, issueA.title).selectOption("in_progress");
    await patchStarted;

    await page.getByRole("button", { name: "Изменить Workspace ID" }).click();
    const workspaceDialog = page.getByRole("dialog", {
      name: "Изменить Workspace"
    });
    await workspaceDialog.getByLabel("Workspace ID").fill(workspaceBId);
    const switchToB = waitForWorkspaceListResponse(page, workspaceBId);
    await workspaceDialog
      .getByRole("button", { name: "Сохранить и перейти" })
      .click();
    expect((await switchToB).status()).toBe(200);
    await expect(page.getByRole("article", { name: issueB.title })).toBeVisible();

    releasePatch();
    const patchResponse = await patchResponsePromise;
    expect(patchResponse.status()).toBe(200);
    await patchResponse.finished();
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );

    await expect(page.locator("[data-workspace-id]")).toHaveText(workspaceBId);
    await expect(page.getByRole("article", { name: issueB.title })).toBeVisible();
    await expect(page.getByRole("article", { name: issueA.title })).toHaveCount(0);
    await expect(page.locator("[data-operation-status]")).toHaveText(
      "Workspace изменён. В списке: 1 дефект."
    );
    await expect(page.locator("[data-request-method]")).toHaveText("GET");
    await expect(page.locator("[data-request-url]")).toHaveText("/api/issues");
  });

  test("выравнивает критичность и статус в формах создания и редактирования", async ({
    page,
    workspaceId
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    const issue = await createIssueFixture(page, workspaceId, "resolved");

    await page.goto("/api-lab.html");
    await getHeaderCreateButton(page).click();

    const createDialog = page.getByRole("dialog", { name: "Создать дефект" });
    await expect(createDialog.locator("[data-status-hint]")).not.toBeEmpty();
    await expectFormSelectsAligned(createDialog);

    await page.keyboard.press("Escape");
    await expect(createDialog).toBeHidden();

    await page
      .getByRole("article", { name: issue.title })
      .getByRole("button", { name: "Редактировать" })
      .click();

    const editDialog = page.getByRole("dialog", { name: "Редактировать дефект" });
    await expect(editDialog.locator("[data-status-hint]")).not.toBeEmpty();
    await expectFormSelectsAligned(editDialog);
  });

  test("выполняет полный CRUD через интерфейс", async ({ page, workspaceId }) => {
    const title = `E2E defect ${workspaceId.slice(0, 8)}`;
    const updatedTitle = `${title} updated`;
    const description = "Кнопка отправки не отвечает после заполнения обязательных полей.";

    await page.goto("/api-lab.html");
    await expect(page.getByRole("heading", { name: "Дефектов пока нет" })).toBeVisible();

    await getHeaderCreateButton(page).click();

    const createDialog = page.getByRole("dialog", { name: "Создать дефект" });
    await createDialog.getByLabel("Название").fill(title);
    await createDialog.getByLabel("Описание").fill(description);
    await createDialog.getByLabel("Критичность").selectOption("blocker");
    const createStatus = createDialog.getByLabel("Статус");
    await expect(
      createDialog.getByText(
        "При создании можно выбрать начальный статус. Дальнейшие изменения выполняются по статусной модели."
      )
    ).toBeVisible();
    await expect(createStatus.locator("option")).toHaveText([
      "Открыт",
      "В работе",
      "Тестирование",
      "Решён"
    ]);
    await createStatus.selectOption("testing");

    const postPromise = waitForApiResponse(page, "POST", "/api/issues");
    await createDialog.getByRole("button", { name: "Создать", exact: true }).click();
    const postResponse = await postPromise;

    expect(postResponse.status()).toBe(201);
    expect(postResponse.headers().location).toMatch(/^\/api\/issues\/[0-9a-f-]+$/i);
    expect(postResponse.request().headers()["x-demo-workspace-id"]).toBe(workspaceId);
    const created = await postResponse.json();
    expect(created.severity).toBe("blocker");
    expect(created.status).toBe("testing");

    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("article", { name: title }).getByText("Блокер", { exact: true })
    ).toBeVisible();
    await expect(getCardStatusControl(page, title)).toHaveValue("testing");
    await expect(page.locator("[data-empty-state]")).toBeHidden();
    await expect(page.locator("[data-operation-status]")).toHaveText("Дефект создан.");
    await expect(page.locator("[data-request-method]")).toHaveText("POST");
    await expect(page.locator("[data-response-status]")).toContainText("201");
    await expect(page.locator("[data-request-json]")).toContainText(title);

    const persistentCreateButton = getHeaderCreateButton(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(persistentCreateButton).toBeVisible();
    await expect(persistentCreateButton).toBeInViewport();
    await persistentCreateButton.click();
    await expect(createDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(createDialog).toBeHidden();
    await expect(persistentCreateButton).toBeFocused();

    const testingFilterPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/issues" &&
        url.searchParams.get("status") === "testing"
      );
    });
    await clickFilterCheckbox(page, "status", "Тестирование");
    expect((await testingFilterPromise).status()).toBe(200);
    await expect(page.getByRole("article", { name: title })).toBeVisible();

    const blockerFilterPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/issues" &&
        url.searchParams.get("severity") === "blocker"
      );
    });
    await clickFilterCheckbox(page, "severity", "Блокер");
    expect((await blockerFilterPromise).status()).toBe(200);
    await expect(page.getByRole("article", { name: title })).toBeVisible();

    const reloadListPromise = waitForApiResponse(page, "GET", "/api/issues");
    await page.reload();
    expect((await reloadListPromise).status()).toBe(200);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const issueCard = page.getByRole("article", { name: title });
    const getOnePromise = waitForApiResponse(page, "GET", `/api/issues/${created.id}`);
    await issueCard.getByRole("button", { name: "Открыть" }).click();
    expect((await getOnePromise).status()).toBe(200);

    const detailsDialog = page.getByRole("dialog", { name: title });
    await expect(detailsDialog.getByText(description)).toBeVisible();
    await expect(detailsDialog.getByText("Блокер", { exact: true })).toBeVisible();
    await expect(detailsDialog.getByText("Тестирование", { exact: true })).toBeVisible();
    await detailsDialog.getByRole("button", { name: "Редактировать" }).click();

    const editDialog = page.getByRole("dialog", { name: "Редактировать дефект" });
    await expect(editDialog.getByLabel("Статус").locator("option")).toHaveText([
      "Тестирование",
      "В работе",
      "Решён"
    ]);
    await expect(
      editDialog.getByText("Доступные переходы — «В работе» или «Решён».")
    ).toBeVisible();
    await editDialog.getByLabel("Название").fill(updatedTitle);
    await editDialog.getByLabel("Статус").selectOption("resolved");

    const patchPromise = waitForApiResponse(page, "PATCH", `/api/issues/${created.id}`);
    await editDialog.getByRole("button", { name: "Сохранить" }).click();
    const patchResponse = await patchPromise;
    expect(patchResponse.status()).toBe(200);
    expect((await patchResponse.json()).status).toBe("resolved");
    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
    await expect(page.locator("[data-operation-status]")).toHaveText("Дефект обновлён.");
    await expect(page.locator("[data-request-method]")).toHaveText("PATCH");
    await expect(page.locator("[data-response-status]")).toContainText("200");

    const persistedListPromise = waitForApiResponse(page, "GET", "/api/issues");
    await page.reload();
    expect((await persistedListPromise).status()).toBe(200);

    const updatedCard = page.getByRole("article", { name: updatedTitle });
    await expect(getCardStatusControl(page, updatedTitle)).toHaveValue("resolved");
    await expect(getCardStatusControl(page, updatedTitle).locator("option")).toHaveText([
      "Решён",
      "Открыт"
    ]);
    await expect(getCardStatusControl(page, updatedTitle)).toBeEnabled();
    await updatedCard.getByRole("button", { name: "Редактировать" }).click();
    await expect(editDialog.getByLabel("Статус")).toHaveValue("resolved");
    await expect(editDialog.getByLabel("Статус").locator("option")).toHaveText([
      "Решён",
      "Открыт"
    ]);
    await expect(editDialog.getByLabel("Статус")).toBeEnabled();
    await expect(
      editDialog.getByText("Доступный переход — «Открыт».")
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();
    await updatedCard.getByRole("button", { name: "Удалить" }).click();

    const deleteDialog = page.getByRole("dialog", { name: "Удалить дефект?" });
    await expect(deleteDialog.getByText(updatedTitle)).toBeVisible();

    const deletePromise = waitForApiResponse(page, "DELETE", `/api/issues/${created.id}`);
    await deleteDialog.getByRole("button", { name: "Удалить" }).click();
    expect((await deletePromise).status()).toBe(204);

    await expect(page.getByRole("heading", { name: "Дефектов пока нет" })).toBeVisible();
    await expect(page.locator("[data-operation-status]")).toHaveText("Дефект удалён.");
    await expect(page.locator("[data-request-method]")).toHaveText("DELETE");
    await expect(page.locator("[data-response-status]")).toContainText("204");

    const finalListPromise = waitForApiResponse(page, "GET", "/api/issues");
    await page.reload();
    expect((await finalListPromise).status()).toBe(200);
    await expect(page.getByRole("heading", { name: updatedTitle })).toHaveCount(0);
  });

  test("применяет мультивыбор фильтров и сворачивает полный набор в Все", async ({
    page,
    workspaceId
  }) => {
    const needle = `multi-${workspaceId.slice(0, 8)}`;
    const fixturePayloads: TestIssuePayload[] = [
      {
        title: `${needle} open high`,
        description: "Совпадает с поиском, открытым статусом и высокой критичностью.",
        severity: "high",
        status: "open"
      },
      {
        title: `${needle} testing blocker`,
        description: "Совпадает с поиском, тестированием и критичностью блокер.",
        severity: "blocker",
        status: "testing"
      },
      {
        title: `${needle} open low`,
        description: "Совпадает с поиском и статусом, но не с критичностью.",
        severity: "low",
        status: "open"
      },
      {
        title: `other-${workspaceId.slice(0, 8)} testing high`,
        description: "Совпадает со статусом и критичностью, но не с поиском.",
        severity: "high",
        status: "testing"
      },
      {
        title: `${needle} resolved blocker`,
        description: "Совпадает с поиском и критичностью, но не со статусом.",
        severity: "blocker",
        status: "resolved"
      },
      {
        title: `${needle} in progress critical`,
        description: "Дополнительная запись для полного набора статусов.",
        severity: "critical",
        status: "in_progress"
      }
    ];

    const issues: TestIssue[] = [];
    for (const payload of fixturePayloads) {
      issues.push(await createFilterIssueFixture(page, workspaceId, payload));
    }

    await page.goto("/api-lab.html");
    await expect(page.getByRole("article", { name: issues[0].title })).toBeVisible();

    const statusTrigger = getFilterTrigger(page, "status");
    await expect(statusTrigger).toHaveText("Все статусы");
    await expect(statusTrigger).toHaveAccessibleDescription("Выбраны все статусы");
    await openFilterMultiselect(page, "status");
    await expect(getFilterCheckbox(page, "status", "Все статусы")).toBeChecked();
    await expect(getFilterCheckbox(page, "status", "Открыт")).not.toBeChecked();

    await page.keyboard.press("Escape");
    await expect(statusTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(statusTrigger).toBeFocused();

    const openResponsePromise = waitForFilteredListResponse(page, {
      status: ["open"]
    });
    await clickFilterCheckbox(page, "status", "Открыт");
    const openResponse = await openResponsePromise;
    expect(openResponse.status()).toBe(200);
    expect(
      ((await openResponse.json()) as { items: TestIssue[] }).items
        .map((issue) => issue.title)
        .sort()
    ).toEqual([fixturePayloads[0].title, fixturePayloads[2].title].sort());
    await expect(statusTrigger).toHaveText("Открыт");
    await expect(getFilterCheckbox(page, "status", "Все статусы")).not.toBeChecked();
    await expect(getFilterCheckbox(page, "status", "Открыт")).toBeChecked();

    const statusMultiResponsePromise = waitForFilteredListResponse(page, {
      status: ["open", "testing"]
    });
    await clickFilterCheckbox(page, "status", "Тестирование");
    const statusMultiResponse = await statusMultiResponsePromise;
    expect(statusMultiResponse.status()).toBe(200);
    expect(new URL(statusMultiResponse.url()).searchParams.getAll("status")).toEqual([
      "open",
      "testing"
    ]);
    await expect(statusTrigger).toHaveText("2 выбрано");
    await expect(statusTrigger).toHaveAccessibleDescription(
      "Выбрано: Открыт, Тестирование"
    );

    const searchInput = page
      .getByRole("search", { name: "Поиск и фильтры дефектов" })
      .getByLabel("Поиск");
    const searchResponsePromise = waitForFilteredListResponse(page, {
      q: needle,
      status: ["open", "testing"]
    });
    await searchInput.fill(needle);
    expect((await searchResponsePromise).status()).toBe(200);

    const highResponsePromise = waitForFilteredListResponse(page, {
      q: needle,
      severity: ["high"],
      status: ["open", "testing"]
    });
    await clickFilterCheckbox(page, "severity", "Высокая");
    expect((await highResponsePromise).status()).toBe(200);

    const combinedResponsePromise = waitForFilteredListResponse(page, {
      q: needle,
      severity: ["high", "blocker"],
      status: ["open", "testing"]
    });
    await clickFilterCheckbox(page, "severity", "Блокер");
    const combinedResponse = await combinedResponsePromise;
    expect(combinedResponse.status()).toBe(200);
    const combinedUrl = new URL(combinedResponse.url());
    expect(combinedUrl.searchParams.getAll("status")).toEqual(["open", "testing"]);
    expect(combinedUrl.searchParams.getAll("severity")).toEqual([
      "high",
      "blocker"
    ]);
    expect(
      ((await combinedResponse.json()) as { items: TestIssue[] }).items
        .map((issue) => issue.title)
        .sort()
    ).toEqual([fixturePayloads[0].title, fixturePayloads[1].title].sort());
    await expect(page.getByRole("article", { name: fixturePayloads[0].title })).toBeVisible();
    await expect(page.getByRole("article", { name: fixturePayloads[1].title })).toBeVisible();
    await expect(page.getByRole("article", { name: fixturePayloads[2].title })).toHaveCount(0);
    await expect(page.getByRole("article", { name: fixturePayloads[3].title })).toHaveCount(0);

    const inspectedUrl = new URL(
      await page.locator("[data-request-url]").innerText(),
      "http://example.test"
    );
    expect(inspectedUrl.searchParams.getAll("status")).toEqual(["open", "testing"]);
    expect(inspectedUrl.searchParams.getAll("severity")).toEqual([
      "high",
      "blocker"
    ]);

    const threeStatusesPromise = waitForFilteredListResponse(page, {
      q: needle,
      severity: ["high", "blocker"],
      status: ["open", "in_progress", "testing"]
    });
    await clickFilterCheckbox(page, "status", "В работе");
    expect((await threeStatusesPromise).status()).toBe(200);

    const allStatusesPromise = waitForFilteredListResponse(page, {
      q: needle,
      severity: ["high", "blocker"]
    });
    await clickFilterCheckbox(page, "status", "Решён");
    expect((await allStatusesPromise).status()).toBe(200);
    await expect(statusTrigger).toHaveText("Все статусы");
    await expect(statusTrigger).toHaveAccessibleDescription("Выбраны все статусы");
    await expect(getFilterCheckbox(page, "status", "Все статусы")).toBeChecked();
    for (const label of ["Открыт", "В работе", "Тестирование", "Решён"]) {
      await expect(getFilterCheckbox(page, "status", label)).not.toBeChecked();
    }

    const lowSeverityPromise = waitForFilteredListResponse(page, {
      q: needle,
      severity: ["low", "high", "blocker"]
    });
    await clickFilterCheckbox(page, "severity", "Низкая");
    expect((await lowSeverityPromise).status()).toBe(200);

    const mediumSeverityPromise = waitForFilteredListResponse(page, {
      q: needle,
      severity: ["low", "medium", "high", "blocker"]
    });
    await clickFilterCheckbox(page, "severity", "Средняя");
    expect((await mediumSeverityPromise).status()).toBe(200);

    const allSeveritiesPromise = waitForFilteredListResponse(page, { q: needle });
    await clickFilterCheckbox(page, "severity", "Критическая");
    expect((await allSeveritiesPromise).status()).toBe(200);
    const severityTrigger = getFilterTrigger(page, "severity");
    await expect(severityTrigger).toHaveText("Все значения");
    await expect(severityTrigger).toHaveAccessibleDescription(
      "Выбраны все значения критичности"
    );
    await expect(getFilterCheckbox(page, "severity", "Все значения")).toBeChecked();
    for (const label of [
      "Низкая",
      "Средняя",
      "Высокая",
      "Критическая",
      "Блокер"
    ]) {
      await expect(getFilterCheckbox(page, "severity", label)).not.toBeChecked();
    }

    const resetResponsePromise = waitForFilteredListResponse(page, {});
    await page
      .getByRole("search", { name: "Поиск и фильтры дефектов" })
      .getByRole("button", { name: "Сбросить", exact: true })
      .click();
    expect((await resetResponsePromise).status()).toBe(200);
    await expect(searchInput).toHaveValue("");
    await expect(statusTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(statusTrigger).toHaveText("Все статусы");
    await expect(getFilterTrigger(page, "severity")).toHaveText("Все значения");
    await expect(getFilterCheckbox(page, "severity", "Все значения")).toBeChecked();
    await expect(page.getByRole("article")).toHaveCount(fixturePayloads.length);
  });

  test("оставляет мультифильтры доступными на мобильном экране", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/api-lab.html");

    const statusTrigger = getFilterTrigger(page, "status");
    const severityTrigger = getFilterTrigger(page, "severity");
    await openFilterMultiselect(page, "status");

    const sizes = await getFilterMultiselect(page, "status").evaluate((component) => {
      const trigger = component.querySelector("[data-filter-trigger]");
      const options = Array.from(
        component.querySelectorAll<HTMLElement>(".filter-multiselect-option")
      );
      if (!(trigger instanceof HTMLElement)) throw new Error("Не найден триггер");
      return {
        optionHeights: options.map((option) => option.getBoundingClientRect().height),
        triggerHeight: trigger.getBoundingClientRect().height
      };
    });
    expect(sizes.triggerHeight).toBeGreaterThanOrEqual(44);
    expect(Math.min(...sizes.optionHeights)).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);

    await openFilterMultiselect(page, "severity");
    await expect(statusTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(severityTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(getFilterCheckbox(page, "severity", "Все значения")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(severityTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(severityTrigger).toBeFocused();
  });

  test("меняет статус непосредственно из карточки по статусной модели", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");

    const transitions = [
      { from: "open", to: "in_progress", labels: ["Открыт", "В работе"] },
      {
        from: "in_progress",
        to: "testing",
        labels: ["В работе", "Тестирование"]
      },
      {
        from: "testing",
        to: "resolved",
        labels: ["Тестирование", "В работе", "Решён"]
      },
      { from: "resolved", to: "open", labels: ["Решён", "Открыт"] },
      { from: "open", to: "in_progress", labels: ["Открыт", "В работе"] },
      {
        from: "in_progress",
        to: "testing",
        labels: ["В работе", "Тестирование"]
      },
      {
        from: "testing",
        to: "in_progress",
        labels: ["Тестирование", "В работе", "Решён"]
      }
    ] as const;

    for (const transition of transitions) {
      const statusControl = getCardStatusControl(page, issue.title);
      await expect(statusControl).toHaveValue(transition.from);
      await expect(statusControl.locator("option")).toHaveText(transition.labels);

      const patchPromise = waitForApiResponse(page, "PATCH", `/api/issues/${issue.id}`);
      await statusControl.selectOption(transition.to);
      const patchResponse = await patchPromise;

      expect(patchResponse.status()).toBe(200);
      expect(patchResponse.request().headers()["x-demo-workspace-id"]).toBe(workspaceId);
      expect(patchResponse.request().postDataJSON()).toEqual({ status: transition.to });
      expect((await patchResponse.json()).status).toBe(transition.to);
      await expect(getCardStatusControl(page, issue.title)).toHaveValue(transition.to);
      await expect(getCardStatusControl(page, issue.title)).toBeFocused();
    }

    const finalControl = getCardStatusControl(page, issue.title);
    await expect(finalControl.locator("option")).toHaveText([
      "В работе",
      "Тестирование"
    ]);
    await expect(finalControl).toBeEnabled();
    await expect(page.locator("[data-operation-status]")).toHaveText(
      `Статус дефекта «${issue.title}» изменён на «В работе».`
    );
    await expect(page.locator("[data-request-method]")).toHaveText("PATCH");
    await expect(page.locator("[data-response-status]")).toContainText("200");
    await expect(page.locator("[data-request-json]")).toContainText(
      '"status": "in_progress"'
    );

    const reloadPromise = waitForApiResponse(page, "GET", "/api/issues");
    await page.reload();
    expect((await reloadPromise).status()).toBe(200);
    await expect(getCardStatusControl(page, issue.title)).toHaveValue("in_progress");
    await expect(getCardStatusControl(page, issue.title)).toBeEnabled();
  });

  test("API атомарно отклоняет переход с пропуском статуса", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    const changedTitle = `${issue.title} changed`;
    const response = await page.request.patch(`/api/issues/${issue.id}`, {
      headers: { "X-Demo-Workspace-Id": workspaceId },
      data: { title: changedTitle, status: "resolved" }
    });

    expect(response.status()).toBe(409);
    const payload = await response.json();
    expect(payload.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect(payload.error.fields.status).toContain('"open"');
    expect(payload.error.fields.status).toContain('"in_progress"');

    const persistedResponse = await page.request.get(`/api/issues/${issue.id}`, {
      headers: { "X-Demo-Workspace-Id": workspaceId }
    });
    expect(persistedResponse.status()).toBe(200);
    const persisted = await persistedResponse.json();
    expect(persisted.title).toBe(issue.title);
    expect(persisted.status).toBe("open");
    expect(persisted.updatedAt).toBe(issue.updatedAt);
  });

  test("обновляет карточку при конфликте статуса с другой операцией", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");
    await expect(getCardStatusControl(page, issue.title)).toHaveValue("open");

    for (const status of ["in_progress", "testing", "resolved"] as const) {
      const response = await page.request.patch(`/api/issues/${issue.id}`, {
        headers: { "X-Demo-Workspace-Id": workspaceId },
        data: { status }
      });
      expect(response.status()).toBe(200);
    }

    const conflictPromise = waitForApiResponse(page, "PATCH", `/api/issues/${issue.id}`);
    await getCardStatusControl(page, issue.title).selectOption("in_progress");
    expect((await conflictPromise).status()).toBe(409);

    const refreshedControl = getCardStatusControl(page, issue.title);
    await expect(refreshedControl).toHaveValue("resolved");
    await expect(refreshedControl.locator("option")).toHaveText([
      "Решён",
      "Открыт"
    ]);
    await expect(refreshedControl).toBeFocused();
    await expect(page.locator("[data-operation-status]")).toHaveText(
      "Статус дефекта уже изменился. Список обновлён."
    );
    await expect(page.locator("[data-response-status]")).toContainText("409");
  });

  test("синхронизирует карточку после конфликта в форме редактирования", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");

    const card = page.getByRole("article", { name: issue.title });
    await card.getByRole("button", { name: "Редактировать" }).click();

    const editDialog = page.getByRole("dialog", { name: "Редактировать дефект" });
    const draftTitle = `${issue.title} draft`;
    await editDialog.getByLabel("Название").fill(draftTitle);
    await editDialog.getByLabel("Статус").selectOption("in_progress");

    for (const status of ["in_progress", "testing", "resolved"] as const) {
      const response = await page.request.patch(`/api/issues/${issue.id}`, {
        headers: { "X-Demo-Workspace-Id": workspaceId },
        data: { status }
      });
      expect(response.status()).toBe(200);
    }

    const conflictPromise = waitForApiResponse(page, "PATCH", `/api/issues/${issue.id}`);
    await editDialog.getByRole("button", { name: "Сохранить" }).click();
    expect((await conflictPromise).status()).toBe(409);

    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByLabel("Название")).toHaveValue(draftTitle);
    await expect(editDialog.getByLabel("Статус")).toHaveValue("resolved");
    await expect(editDialog.getByLabel("Статус").locator("option")).toHaveText([
      "Решён",
      "Открыт"
    ]);
    await expect(editDialog.locator('[data-field-error="status"]')).toContainText(
      "Статус уже изменился. Доступный переход — «Открыт». Остальные данные формы сохранены."
    );
    await expect(getCardStatusControl(page, issue.title)).toHaveValue("resolved");
    await expect(getCardStatusControl(page, issue.title).locator("option")).toHaveText([
      "Решён",
      "Открыт"
    ]);
    await expect(page.locator("[data-response-status]")).toContainText("409");

    await page.keyboard.press("Escape");
    const warning = page.getByRole("alertdialog", { name: "Закрыть без сохранения?" });
    await expect(warning).toBeVisible();
    await warning.getByRole("button", { name: "Закрыть без сохранения" }).click();
    await expect(editDialog).toBeHidden();
    await expect(
      page
        .getByRole("article", { name: issue.title })
        .getByRole("button", { name: "Редактировать" })
    ).toBeFocused();
  });

  test("сохраняет фильтр при смене статуса из карточки", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    let releasePatch!: () => void;
    let markPatchStarted!: () => void;
    const patchRelease = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });
    const patchStarted = new Promise<void>((resolve) => {
      markPatchStarted = resolve;
    });

    await page.route(`**/api/issues/${issue.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        markPatchStarted();
        await patchRelease;
      }
      await route.continue();
    });

    await page.goto("/api-lab.html");

    const patchPromise = waitForApiResponse(page, "PATCH", `/api/issues/${issue.id}`);
    await getCardStatusControl(page, issue.title).selectOption("in_progress");
    await patchStarted;

    const openFilterPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/issues" && url.searchParams.get("status") === "open";
    });
    await clickFilterCheckbox(page, "status", "Открыт");
    expect((await openFilterPromise).status()).toBe(200);
    await expect(page.getByRole("article", { name: issue.title })).toBeVisible();

    const refreshPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/issues" && url.searchParams.get("status") === "open";
    });
    releasePatch();
    expect((await patchPromise).status()).toBe(200);
    expect((await refreshPromise).status()).toBe(200);

    await expect(page.getByRole("article", { name: issue.title })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ничего не найдено" })).toBeVisible();
    await expect(page.locator("[data-operation-status]")).toContainText(
      "Карточка скрыта текущим фильтром."
    );

    const allStatusesPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/issues" && !url.searchParams.has("status");
    });
    await clickFilterCheckbox(page, "status", "Все статусы");
    expect((await allStatusesPromise).status()).toBe(200);

    const inProgressFilterPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/issues" &&
        url.searchParams.getAll("status").join(",") === "in_progress"
      );
    });
    await clickFilterCheckbox(page, "status", "В работе");
    expect((await inProgressFilterPromise).status()).toBe(200);
    await expect(getCardStatusControl(page, issue.title)).toHaveValue("in_progress");
  });

  test("откатывает статус при ошибке inline PATCH и позволяет повторить", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    let failPatch = true;

    await page.route(`**/api/issues/${issue.id}`, async (route) => {
      if (failPatch && route.request().method() === "PATCH") {
        failPatch = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Diagnostic failure",
              fields: {},
              requestId: randomUUID()
            }
          })
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/api-lab.html");
    const statusControl = getCardStatusControl(page, issue.title);
    const failedPatchPromise = waitForApiResponse(
      page,
      "PATCH",
      `/api/issues/${issue.id}`
    );
    await statusControl.selectOption("in_progress");
    const failedPatchResponse = await failedPatchPromise;

    expect(failedPatchResponse.status()).toBe(503);
    expect(failedPatchResponse.request().postDataJSON()).toEqual({ status: "in_progress" });
    await expect(statusControl).toHaveValue("open");
    await expect(statusControl).toBeEnabled();
    await expect(statusControl).toBeFocused();
    await expect(
      page.getByRole("article", { name: issue.title }).getByRole("alert")
    ).toContainText("Сохранён прежний статус «Открыт». Diagnostic failure");
    await expect(page.locator("[data-request-method]")).toHaveText("PATCH");
    await expect(page.locator("[data-response-status]")).toContainText("503");

    const retryPromise = waitForApiResponse(page, "PATCH", `/api/issues/${issue.id}`);
    await statusControl.selectOption("in_progress");
    expect((await retryPromise).status()).toBe(200);
    await expect(getCardStatusControl(page, issue.title)).toHaveValue("in_progress");
  });

  test("открывает карточку кликом по записи и закрывает просмотр", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");

    const issueCard = page.getByRole("article", { name: issue.title });
    const detailsDialog = page.getByRole("dialog", { name: issue.title });

    const detailsRequest = waitForApiResponse(page, "GET", `/api/issues/${issue.id}`);
    await issueCard.getByRole("heading", { name: issue.title }).click();
    expect((await detailsRequest).status()).toBe(200);
    await expect(detailsDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detailsDialog).toBeHidden();
    await expect(issueCard.getByRole("button", { name: "Открыть" })).toBeFocused();

    await issueCard.getByRole("button", { name: "Открыть" }).click();
    await expect(detailsDialog).toBeVisible();
    await clickDialogBackdrop(page);
    await expect(detailsDialog).toBeHidden();
  });

  test("закрывает чистую или восстановленную форму создания без предупреждения", async ({
    page
  }) => {
    await page.goto("/api-lab.html");

    const createButton = getHeaderCreateButton(page);
    const createDialog = page.getByRole("dialog", { name: "Создать дефект" });

    await createButton.click();
    await expect(createDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(createDialog).toBeHidden();

    await createButton.click();
    await createDialog.getByLabel("Название").fill("Временный заголовок");
    await createDialog.getByLabel("Название").fill("");
    await createDialog.getByLabel("Критичность").selectOption("critical");
    await createDialog.getByLabel("Критичность").selectOption("medium");
    await createDialog.getByLabel("Статус").selectOption("resolved");
    await createDialog.getByLabel("Статус").selectOption("open");
    await clickDialogBackdrop(page);

    await expect(createDialog).toBeHidden();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("считает изменением каждое поле формы создания", async ({ page }) => {
    await page.goto("/api-lab.html");

    const createButton = getHeaderCreateButton(page);
    const createDialog = page.getByRole("dialog", { name: "Создать дефект" });
    const warningDialog = page.getByRole("alertdialog", {
      name: "Закрыть без сохранения?"
    });
    const changes = [
      { label: "Название", method: "fill", value: "Заполнено только название" },
      { label: "Описание", method: "fill", value: "Заполнено только описание" },
      { label: "Критичность", method: "select", value: "high" },
      { label: "Статус", method: "select", value: "in_progress" }
    ] as const;

    for (const change of changes) {
      await createButton.click();
      const control = createDialog.getByLabel(change.label);
      if (change.method === "fill") {
        await control.fill(change.value);
      } else {
        await control.selectOption(change.value);
      }

      await page.keyboard.press("Escape");
      await expect(warningDialog).toBeVisible();
      await warningDialog
        .getByRole("button", { name: "Закрыть без сохранения" })
        .click();
      await expect(createDialog).toBeHidden();
    }
  });

  test("предупреждает о данных в форме создания и сохраняет черновик при продолжении", async ({
    page
  }) => {
    await page.goto("/api-lab.html");
    await getHeaderCreateButton(page).click();

    const createDialog = page.getByRole("dialog", { name: "Создать дефект" });
    const titleInput = createDialog.getByLabel("Название");
    const warningDialog = page.getByRole("alertdialog", {
      name: "Закрыть без сохранения?"
    });

    await titleInput.fill("Несохранённый дефект");
    await page.keyboard.press("Escape");

    await expect(warningDialog).toBeVisible();
    await expect(
      warningDialog.getByText("Данные нового дефекта ещё не сохранены")
    ).toBeVisible();
    await expect(
      warningDialog.getByRole("button", { name: "Продолжить работу" })
    ).toBeFocused();

    await warningDialog
      .getByRole("button", { name: "Продолжить работу" })
      .click();
    await expect(warningDialog).toBeHidden();
    await expect(titleInput).toHaveValue("Несохранённый дефект");
    await expect(titleInput).toBeFocused();

    await clickDialogBackdrop(page);
    await expect(warningDialog).toBeVisible();
    await clickDialogBackdrop(page);
    await expect(warningDialog).toBeHidden();
    await expect(createDialog).toBeVisible();
    await expect(titleInput).toHaveValue("Несохранённый дефект");

    await clickDialogBackdrop(page);
    await warningDialog
      .getByRole("button", { name: "Закрыть без сохранения" })
      .click();

    await expect(warningDialog).toBeHidden();
    await expect(createDialog).toBeHidden();
  });

  test("не закрывает форму редактирования по backdrop", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");

    const issueCard = page.getByRole("article", { name: issue.title });
    const editDialog = page.getByRole("dialog", { name: "Редактировать дефект" });

    await issueCard.getByRole("button", { name: "Редактировать" }).click();
    await expect(editDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();

    await issueCard.getByRole("button", { name: "Редактировать" }).click();
    await editDialog.getByLabel("Название").fill("Изменённый заголовок");
    await editDialog.getByLabel("Название").fill(issue.title);
    await editDialog.getByLabel("Описание").fill("Изменённое описание дефекта");
    await editDialog.getByLabel("Описание").fill(issue.description);
    await editDialog.getByLabel("Критичность").selectOption("critical");
    await editDialog.getByLabel("Критичность").selectOption(issue.severity);
    await expect(editDialog.getByLabel("Статус").locator("option")).toHaveText([
      "Открыт",
      "В работе"
    ]);
    await expect(editDialog.getByText("Доступный переход — «В работе».")).toBeVisible();
    await editDialog.getByLabel("Статус").selectOption("in_progress");
    await editDialog.getByLabel("Статус").selectOption(issue.status);
    await clickDialogBackdrop(page);

    await expect(editDialog).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();
  });

  test("предупреждает об изменениях при редактировании и позволяет их отбросить", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");

    const issueCard = page.getByRole("article", { name: issue.title });
    await issueCard.getByRole("button", { name: "Редактировать" }).click();

    const editDialog = page.getByRole("dialog", { name: "Редактировать дефект" });
    const statusInput = editDialog.getByLabel("Статус");
    const warningDialog = page.getByRole("alertdialog", {
      name: "Закрыть без сохранения?"
    });

    await statusInput.selectOption("in_progress");
    await page.keyboard.press("Escape");

    await expect(warningDialog).toBeVisible();
    await expect(
      warningDialog.getByText("Изменения в дефекте ещё не сохранены")
    ).toBeVisible();
    await warningDialog
      .getByRole("button", { name: "Продолжить работу" })
      .click();
    await expect(statusInput).toHaveValue("in_progress");

    await clickDialogBackdrop(page);
    await expect(editDialog).toBeVisible();
    await expect(statusInput).toHaveValue("in_progress");
    await expect(warningDialog).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(warningDialog).toBeVisible();
    await warningDialog
      .getByRole("button", { name: "Закрыть без сохранения" })
      .click();

    await expect(warningDialog).toBeHidden();
    await expect(editDialog).toBeHidden();
    await expect(getCardStatusControl(page, issue.title)).toHaveValue("open");
  });

  test("показывает ошибку загрузки и успешно повторяет запрос", async ({
    page,
    workspaceId
  }) => {
    let failedOnce = false;

    await page.route("**/api/issues", async (route) => {
      if (!failedOnce && route.request().method() === "GET") {
        failedOnce = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Diagnostic failure",
              fields: {},
              requestId: randomUUID()
            }
          })
        });
        return;
      }

      await route.continue();
    });

    await page.goto("/api-lab.html");
    await expect(page.getByRole("alert").filter({ hasText: "Diagnostic failure" })).toBeVisible();
    const failedCurl = await page.locator("[data-curl-command]").textContent();
    expect(failedCurl).toContain("curl --request GET");
    expect(failedCurl).toContain(
      `--url '${new URL(page.url()).origin}/api/issues'`
    );
    expect(failedCurl).toContain(
      `--header 'X-Demo-Workspace-Id: ${workspaceId}'`
    );

    await page.getByRole("button", { name: "Повторить" }).click();

    await expect(page.getByRole("heading", { name: "Дефектов пока нет" })).toBeVisible();
    await expect(page.locator("[data-load-error]")).toBeHidden();
  });

  test("показывает и копирует воспроизводимый cURL для GET", async ({
    page,
    workspaceId
  }) => {
    await installClipboardMock(page);
    await page.goto("/api-lab.html");

    const inspector = page.getByRole("complementary", {
      name: "Последний API-запрос"
    });
    const requestSection = inspector.locator("[data-request-body-section]");
    const responseSection = inspector.locator("[data-response-body-section]");
    const curlSection = inspector.locator("[data-curl-section]");

    await expect(inspector.locator("[data-api-details]")).toBeVisible();
    await expect(requestSection).toBeHidden();
    await expect(
      inspector.getByRole("button", { name: "Копировать тело запроса" })
    ).toBeHidden();
    await expect(responseSection).toBeVisible();
    await expect(curlSection).toHaveJSProperty("open", false);

    await curlSection.locator("summary").click();
    const curlCode = inspector.locator("[data-curl-command]");
    const curlCommand = await curlCode.textContent();
    const origin = new URL(page.url()).origin;

    expect(curlCommand).toContain("curl --request GET");
    expect(curlCommand).toContain(`--url '${origin}/api/issues'`);
    expect(curlCommand).toContain("--header 'Accept: application/json'");
    expect(curlCommand).toContain(
      `--header 'X-Demo-Workspace-Id: ${workspaceId}'`
    );
    expect(curlCommand).not.toContain("Content-Type");
    expect(curlCommand).not.toContain("--data-raw");

    const copyCurl = inspector.getByRole("button", { name: "Копировать cURL" });
    await expect(copyCurl).toHaveAttribute("data-tooltip", "Копировать");
    await expect(copyCurl.locator(".copy-icon")).toBeVisible();
    expect((await copyCurl.innerText()).trim()).toBe("");
    const copyButtonBox = await copyCurl.boundingBox();
    expect(copyButtonBox).not.toBeNull();
    expect(copyButtonBox!.height).toBeLessThanOrEqual(40);
    expect(copyButtonBox!.width).toBeLessThanOrEqual(40);
    await copyCurl.hover();
    await expect
      .poll(() =>
        copyCurl.evaluate(
          (button) => getComputedStyle(button, "::after").opacity
        )
      )
      .toBe("1");
    await copyCurl.focus();
    await page.keyboard.press("Enter");
    await expect(copyCurl).toHaveAttribute("data-tooltip", "Скопировано");
    await expect(copyCurl).toBeFocused();
    expect((await readClipboardState(page)).writes).toEqual([curlCommand]);
    await expect(inspector.locator("[data-api-copy-status]")).toHaveText(
      "cURL скопирован."
    );

    await responseSection.locator("summary").click();
    const responseText = await inspector.locator("[data-response-json]").textContent();
    expect(JSON.parse(responseText || "")).toEqual({ items: [], total: 0 });
    const copyResponse = inspector.getByRole("button", {
      name: "Копировать тело ответа"
    });
    await copyResponse.focus();
    await page.keyboard.press("Enter");
    await expect(copyResponse).toHaveAttribute("data-tooltip", "Скопировано");
    expect((await readClipboardState(page)).writes.at(-1)).toBe(responseText);

    const query = "O'Reilly Привет & $HOME";
    const filteredPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/issues" &&
        url.searchParams.get("q") === query
      );
    });
    await page
      .getByRole("search", { name: "Поиск и фильтры дефектов" })
      .getByLabel("Поиск")
      .fill(query);
    const filteredResponse = await filteredPromise;
    expect(filteredResponse.status()).toBe(200);

    const filteredCurl = await curlCode.textContent();
    expect(filteredCurl).toContain(
      "--url " + quoteShellArgument(filteredResponse.url())
    );
    expect(filteredCurl).not.toContain("Content-Type");
    expect(filteredCurl).not.toContain("--data-raw");
  });

  test("копирует тела POST и формирует shell-safe cURL", async ({
    page,
    workspaceId
  }) => {
    await installClipboardMock(page);
    const title = `O'Reilly defect ${workspaceId.slice(0, 8)}`;
    const description =
      "Проверка кавычек O'Reilly, $HOME, `command` и обратного слеша \\\\.\n" +
      "Вторая строка описания дефекта.";

    await page.goto("/api-lab.html");
    await getHeaderCreateButton(page).click();

    const createDialog = page.getByRole("dialog", { name: "Создать дефект" });
    await createDialog.getByLabel("Название").fill(title);
    await createDialog.getByLabel("Описание").fill(description);

    const postPromise = waitForApiResponse(page, "POST", "/api/issues");
    await createDialog.getByRole("button", { name: "Создать", exact: true }).click();
    const postResponse = await postPromise;
    expect(postResponse.status()).toBe(201);

    const inspector = page.getByRole("complementary", {
      name: "Последний API-запрос"
    });
    const requestSection = inspector.locator("[data-request-body-section]");
    const responseSection = inspector.locator("[data-response-body-section]");
    const curlSection = inspector.locator("[data-curl-section]");
    await expect(inspector.locator("[data-request-method]")).toHaveText("POST");

    await requestSection.locator("summary").click();
    const requestText = await inspector.locator("[data-request-json]").textContent();
    expect(JSON.parse(requestText || "")).toEqual(
      postResponse.request().postDataJSON()
    );
    const copyRequest = inspector.getByRole("button", {
      name: "Копировать тело запроса"
    });
    await copyRequest.click();
    await expect(copyRequest).toHaveAttribute("data-tooltip", "Скопировано");
    expect((await readClipboardState(page)).writes.at(-1)).toBe(requestText);

    await responseSection.locator("summary").click();
    const responseText = await inspector.locator("[data-response-json]").textContent();
    expect(JSON.parse(responseText || "")).toEqual(await postResponse.json());
    const copyResponse = inspector.getByRole("button", {
      name: "Копировать тело ответа"
    });
    await copyResponse.click();
    await expect(copyResponse).toHaveAttribute("data-tooltip", "Скопировано");
    expect((await readClipboardState(page)).writes.at(-1)).toBe(responseText);

    await curlSection.locator("summary").click();
    const curlCommand = await inspector.locator("[data-curl-command]").textContent();
    const serializedBody = postResponse.request().postData();
    const origin = new URL(page.url()).origin;

    expect(curlCommand).toContain("curl --request POST");
    expect(curlCommand).toContain(`--url '${origin}/api/issues'`);
    expect(curlCommand).toContain("--header 'Accept: application/json'");
    expect(curlCommand).toContain(
      `--header 'X-Demo-Workspace-Id: ${workspaceId}'`
    );
    expect(curlCommand).toContain("--header 'Content-Type: application/json'");
    expect(curlCommand).toContain(
      "--data-raw " + quoteShellArgument(serializedBody || "")
    );
    expect(curlCommand).toContain("O'\"'\"'Reilly");

    const copyCurl = inspector.getByRole("button", { name: "Копировать cURL" });
    await copyCurl.click();
    await expect(copyCurl).toHaveAttribute("data-tooltip", "Скопировано");
    expect((await readClipboardState(page)).writes.at(-1)).toBe(curlCommand);
  });

  test("очищает старые тела для DELETE без содержимого", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");

    const card = page.getByRole("article", { name: issue.title });
    await card.getByRole("button", { name: "Удалить" }).click();
    const deletePromise = waitForApiResponse(page, "DELETE", `/api/issues/${issue.id}`);
    await page
      .getByRole("dialog", { name: "Удалить дефект?" })
      .getByRole("button", { name: "Удалить" })
      .click();
    expect((await deletePromise).status()).toBe(204);

    const inspector = page.getByRole("complementary", {
      name: "Последний API-запрос"
    });
    await expect(inspector.locator("[data-request-method]")).toHaveText("DELETE");
    await expect(inspector.locator("[data-request-body-section]")).toBeHidden();
    await expect(inspector.locator("[data-response-body-section]")).toBeHidden();
    await expect(inspector.locator("[data-request-json]")).toBeEmpty();
    await expect(inspector.locator("[data-response-json]")).toBeEmpty();

    const curlSection = inspector.locator("[data-curl-section]");
    await curlSection.locator("summary").click();
    const curlCommand = await inspector.locator("[data-curl-command]").textContent();
    expect(curlCommand).toContain("curl --request DELETE");
    expect(curlCommand).toContain(`/api/issues/${issue.id}'`);
    expect(curlCommand).not.toContain("Content-Type");
    expect(curlCommand).not.toContain("--data-raw");
    expect(curlCommand).not.toContain(issue.title);
  });

  test("использует fallback копирования и выделяет код при полном отказе", async ({
    page
  }) => {
    await installClipboardMock(page, { rejectNative: true });
    await page.goto("/api-lab.html");

    const inspector = page.getByRole("complementary", {
      name: "Последний API-запрос"
    });
    const curlSection = inspector.locator("[data-curl-section]");
    await expect(inspector.locator("[data-api-details]")).toBeVisible();
    await curlSection.locator("summary").click();

    const curlPre = curlSection.locator("pre");
    const curlCommand = await inspector.locator("[data-curl-command]").textContent();
    const copyCurl = inspector.getByRole("button", { name: "Копировать cURL" });
    await copyCurl.focus();
    await page.keyboard.press("Enter");
    await expect(copyCurl).toHaveAttribute("data-tooltip", "Скопировано");
    await expect(copyCurl).toBeFocused();
    let clipboardState = await readClipboardState(page);
    expect(clipboardState.writes).toEqual([]);
    expect(clipboardState.fallbackWrites).toEqual([curlCommand]);

    await page.evaluate(() => {
      (
        window as typeof window & {
          __clipboardTest: ClipboardTestState;
        }
      ).__clipboardTest.fallbackSucceeds = false;
    });
    await page.keyboard.press("Enter");

    await expect(copyCurl).toHaveAttribute("data-tooltip", "Не скопировано");
    await expect(curlPre).toBeFocused();
    await expect(curlSection.locator("[data-copy-message='curl']")).toHaveText(
      "Содержимое выделено — скопируйте его вручную (Ctrl+C или ⌘C)."
    );
    await expect(curlSection.locator("[data-copy-message='curl']")).toBeVisible();
    await expect(inspector.locator("[data-api-copy-status]")).toContainText(
      "Содержимое выделено"
    );
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(curlCommand);
    clipboardState = await readClipboardState(page);
    expect(clipboardState.attempts).toEqual([curlCommand, curlCommand]);
    expect(clipboardState.fallbackWrites).toEqual([curlCommand]);
  });

  test("применяет светлую палитру к последнему API-запросу", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/api-lab.html");

    const inspector = page.getByRole("complementary", {
      name: "Последний API-запрос"
    });
    const issuesPanel = page.locator(".issues-panel");
    const themeToggle = page.getByRole("button", { name: "Переключить тему" });

    await expect(inspector.locator("[data-api-details]")).toBeVisible();
    await inspector.locator("[data-response-body-section] summary").click();
    await inspector.locator("[data-curl-section] summary").click();

    const readInspectorPalette = () =>
      inspector.evaluate((element) => {
        const readStyle = (selector: string) => {
          const target = element.querySelector(selector);
          if (!(target instanceof HTMLElement)) throw new Error(`Не найден ${selector}`);
          const style = getComputedStyle(target);
          return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            color: style.color
          };
        };
        const readDocumentBackground = (selector: string) => {
          const target = document.querySelector(selector);
          if (!(target instanceof HTMLElement)) throw new Error(`Не найден ${selector}`);
          return getComputedStyle(target).backgroundColor;
        };

        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          color: style.color,
          eyebrow: readStyle(".eyebrow"),
          json: readStyle("[data-response-body-section] .api-json"),
          curl: readStyle("[data-curl-section] .api-json"),
          copyButton: readStyle("[data-copy-api='curl']"),
          metaLabel: readStyle(".request-meta dt"),
          summary: readStyle("[data-response-body-section] summary"),
          surfaces: {
            body: readDocumentBackground("body"),
            content: readDocumentBackground(".lab-content"),
            filter: readDocumentBackground(".filter-bar"),
            issues: readDocumentBackground(".issues-panel")
          }
        };
      });

    const darkPalette = await readInspectorPalette();

    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const lightPalette = await readInspectorPalette();
    const referencePalette = await issuesPanel.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color
      };
    });

    expect(lightPalette.backgroundColor).not.toBe(darkPalette.backgroundColor);
    expect(lightPalette.color).not.toBe(darkPalette.color);
    expect(lightPalette.json.backgroundColor).not.toBe(
      darkPalette.json.backgroundColor
    );
    expect(lightPalette.json.color).not.toBe(darkPalette.json.color);
    expect(lightPalette.curl.backgroundColor).not.toBe(
      darkPalette.curl.backgroundColor
    );
    expect(lightPalette.curl.color).not.toBe(darkPalette.curl.color);
    expect(lightPalette.copyButton.backgroundColor).not.toBe(
      darkPalette.copyButton.backgroundColor
    );
    expect(lightPalette.copyButton.color).not.toBe(darkPalette.copyButton.color);
    expect(lightPalette.eyebrow.color).not.toBe(darkPalette.eyebrow.color);
    expect(lightPalette.metaLabel.color).not.toBe(darkPalette.metaLabel.color);
    expect(lightPalette.summary.color).not.toBe(darkPalette.summary.color);
    for (const surface of ["body", "content", "filter", "issues"] as const) {
      expect(darkPalette.surfaces[surface]).not.toBe("rgba(0, 0, 0, 0)");
      expect(lightPalette.surfaces[surface]).not.toBe(
        darkPalette.surfaces[surface]
      );
    }
    expect(lightPalette.backgroundColor).toBe(referencePalette.backgroundColor);
    expect(lightPalette.borderColor).toBe(referencePalette.borderColor);
    expect(lightPalette.color).toBe(referencePalette.color);
  });

  test("сохраняет тему при прямом открытии QA Lab", async ({ page }) => {
    await page.goto("/api-lab.html");
    const themeToggle = page.getByRole("button", { name: "Переключить тему" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
  });
});
