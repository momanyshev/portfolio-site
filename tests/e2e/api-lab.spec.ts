import { randomUUID } from "node:crypto";
import { expect, type Page, test as base } from "@playwright/test";

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

type TestIssue = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved";
};

async function createIssueFixture(page: Page, workspaceId: string): Promise<TestIssue> {
  const payload = {
    title: `Close guard ${workspaceId.slice(0, 8)}`,
    description: "Дефект для проверки защиты несохранённых изменений.",
    severity: "medium" as const,
    status: "open" as const
  };
  const response = await page.request.post("/api/issues", {
    headers: { "X-Demo-Workspace-Id": workspaceId },
    data: payload
  });

  expect(response.status()).toBe(201);
  return (await response.json()) as TestIssue;
}

async function clickDialogBackdrop(page: Page) {
  await page.mouse.click(2, 2);
}

test.describe("QA Lab", () => {
  test("переходит в QA Lab из портфолио", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Открыть QA Lab" }).click();

    await expect(page).toHaveURL(/\/api-lab\.html$/);
    await expect(
      page.getByRole("heading", { name: "Трекер дефектов", level: 1 })
    ).toBeVisible();
    await expect(
      page.locator(".lab-hero").getByRole("button", { name: "Создать дефект" })
    ).toBeVisible();
  });

  test("выполняет полный CRUD через интерфейс", async ({ page, workspaceId }) => {
    const title = `E2E defect ${workspaceId.slice(0, 8)}`;
    const updatedTitle = `${title} updated`;
    const description = "Кнопка отправки не отвечает после заполнения обязательных полей.";

    await page.goto("/api-lab.html");
    await expect(page.getByRole("heading", { name: "Дефектов пока нет" })).toBeVisible();

    await page
      .locator(".lab-hero")
      .getByRole("button", { name: "Создать дефект" })
      .click();

    const createDialog = page.getByRole("dialog", { name: "Создать дефект" });
    await createDialog.getByLabel("Название").fill(title);
    await createDialog.getByLabel("Описание").fill(description);
    await createDialog.getByLabel("Критичность").selectOption("high");

    const postPromise = waitForApiResponse(page, "POST", "/api/issues");
    await createDialog.getByRole("button", { name: "Создать", exact: true }).click();
    const postResponse = await postPromise;

    expect(postResponse.status()).toBe(201);
    expect(postResponse.headers().location).toMatch(/^\/api\/issues\/[0-9a-f-]+$/i);
    expect(postResponse.request().headers()["x-demo-workspace-id"]).toBe(workspaceId);
    const created = await postResponse.json();

    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator("[data-operation-status]")).toHaveText("Дефект создан.");
    await expect(page.locator("[data-request-method]")).toHaveText("POST");
    await expect(page.locator("[data-response-status]")).toContainText("201");
    await expect(page.locator("[data-request-json]")).toContainText(title);

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
    await detailsDialog.getByRole("button", { name: "Редактировать" }).click();

    const editDialog = page.getByRole("dialog", { name: "Редактировать дефект" });
    await editDialog.getByLabel("Название").fill(updatedTitle);
    await editDialog.getByLabel("Статус").selectOption("in_progress");

    const patchPromise = waitForApiResponse(page, "PATCH", `/api/issues/${created.id}`);
    await editDialog.getByRole("button", { name: "Сохранить" }).click();
    expect((await patchPromise).status()).toBe(200);
    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
    await expect(page.locator("[data-operation-status]")).toHaveText("Дефект обновлён.");
    await expect(page.locator("[data-request-method]")).toHaveText("PATCH");
    await expect(page.locator("[data-response-status]")).toContainText("200");

    const persistedListPromise = waitForApiResponse(page, "GET", "/api/issues");
    await page.reload();
    expect((await persistedListPromise).status()).toBe(200);

    const updatedCard = page.getByRole("article", { name: updatedTitle });
    await expect(updatedCard.getByText("В работе")).toBeVisible();
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

  test("закрывает карточку просмотра по Escape и клику вне неё", async ({
    page,
    workspaceId
  }) => {
    const issue = await createIssueFixture(page, workspaceId);
    await page.goto("/api-lab.html");

    const issueCard = page.getByRole("article", { name: issue.title });
    const detailsDialog = page.getByRole("dialog", { name: issue.title });

    await issueCard.getByRole("button", { name: "Открыть" }).click();
    await expect(detailsDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detailsDialog).toBeHidden();

    await issueCard.getByRole("button", { name: "Открыть" }).click();
    await expect(detailsDialog).toBeVisible();
    await clickDialogBackdrop(page);
    await expect(detailsDialog).toBeHidden();
  });

  test("закрывает чистую или восстановленную форму создания без предупреждения", async ({
    page
  }) => {
    await page.goto("/api-lab.html");

    const createButton = page
      .locator(".lab-hero")
      .getByRole("button", { name: "Создать дефект" });
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

    const createButton = page
      .locator(".lab-hero")
      .getByRole("button", { name: "Создать дефект" });
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
    await page
      .locator(".lab-hero")
      .getByRole("button", { name: "Создать дефект" })
      .click();

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

  test("закрывает неизменённую или восстановленную форму редактирования", async ({
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
    await editDialog.getByLabel("Статус").selectOption("resolved");
    await editDialog.getByLabel("Статус").selectOption(issue.status);
    await clickDialogBackdrop(page);

    await expect(editDialog).toBeHidden();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
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
    await expect(warningDialog).toBeVisible();
    await warningDialog
      .getByRole("button", { name: "Закрыть без сохранения" })
      .click();

    await expect(warningDialog).toBeHidden();
    await expect(editDialog).toBeHidden();
    await expect(issueCard.getByText("Открыт", { exact: true })).toBeVisible();
  });

  test("показывает ошибку загрузки и успешно повторяет запрос", async ({ page }) => {
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

    await page.getByRole("button", { name: "Повторить" }).click();

    await expect(page.getByRole("heading", { name: "Дефектов пока нет" })).toBeVisible();
    await expect(page.locator("[data-load-error]")).toBeHidden();
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
