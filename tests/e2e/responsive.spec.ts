import { expect, type Page, test } from "@playwright/test";

const desktopViewport = { width: 1280, height: 900 };
const mobileViewport = { width: 390, height: 844 };

async function openAtViewport(
  page: Page,
  viewport: { width: number; height: number },
  path = "/"
) {
  await page.setViewportSize(viewport);
  await page.goto(path);
}

async function expectNoHorizontalScroll(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }))
    )
    .toMatchObject({
      scrollWidth: expect.any(Number),
      clientWidth: expect.any(Number)
    });

  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe("Адаптивная верстка", () => {
  test("показывает верхнюю навигацию на desktop", async ({ page }) => {
    await openAtViewport(page, desktopViewport);

    const navigation = page.getByRole("navigation", { name: "Основные разделы" });

    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Обо мне", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Опыт", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Проекты", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Контакты", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "QA Lab", exact: true })).toBeVisible();
  });

  test("скрывает верхнюю навигацию на mobile", async ({ page }) => {
    await openAtViewport(page, mobileViewport);

    await expect(page.locator(".site-nav")).toBeHidden();
    await expect(page.getByRole("link", { name: "К началу страницы" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Переключить тему" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть QA Lab" })).toBeVisible();
  });

  for (const viewport of [desktopViewport, mobileViewport]) {
    test(`не создает горизонтальный скролл при ширине ${viewport.width}px`, async ({ page }) => {
      await openAtViewport(page, viewport);

      await expectNoHorizontalScroll(page);
    });

    test(`открывает QA Lab напрямую без горизонтального скролла при ширине ${viewport.width}px`, async ({ page }) => {
      await openAtViewport(page, viewport, "/api-lab.html");

      await expect(
        page.getByRole("heading", { name: "Трекер дефектов", level: 1 })
      ).toBeVisible();
      await expect(
        page
          .getByRole("banner", { name: "Навигация QA Lab" })
          .getByRole("button", { name: "Создать дефект" })
      ).toBeVisible();
      await expectNoHorizontalScroll(page);

      if (viewport.width === mobileViewport.width) {
        await expect(page.locator(".site-nav")).toBeHidden();
        await expect(page.getByRole("link", { name: "Вернуться к портфолио" })).toBeVisible();

        const editWorkspace = page.getByRole("button", {
          name: "Изменить Workspace ID"
        });
        const editWorkspaceBox = await editWorkspace.boundingBox();
        expect(editWorkspaceBox).not.toBeNull();
        expect(editWorkspaceBox!.width).toBeGreaterThanOrEqual(44);
        expect(editWorkspaceBox!.height).toBeGreaterThanOrEqual(44);

        await editWorkspace.click();
        const workspaceDialog = page.getByRole("dialog", {
          name: "Изменить Workspace"
        });
        await expect(workspaceDialog).toBeVisible();
        await expect(workspaceDialog.locator(".dialog-actions")).toHaveCSS(
          "flex-direction",
          "column"
        );
        await expectNoHorizontalScroll(page);
      }
    });
  }

  test("оставляет hero-кнопки в одну строку на desktop", async ({ page }) => {
    await openAtViewport(page, desktopViewport);

    const heroActions = page.locator(".hero-actions");

    await expect(heroActions).toHaveCSS("flex-direction", "row");
    await expect(heroActions.getByRole("link", { name: "Опыт", exact: true })).toBeVisible();
    await expect(heroActions.getByRole("link", { name: "Достижения и проекты", exact: true })).toBeVisible();
    await expect(heroActions.getByRole("link", { name: "Открыть QA Lab" })).toBeVisible();
  });

  test("перестраивает hero-кнопки в колонку на mobile", async ({ page }) => {
    await openAtViewport(page, mobileViewport);

    const heroActions = page.locator(".hero-actions");
    const primaryButton = heroActions.getByRole("link", { name: "Опыт", exact: true });
    const secondaryButton = heroActions.getByRole("link", { name: "Достижения и проекты", exact: true });
    const labButton = heroActions.getByRole("link", { name: "Открыть QA Lab" });

    await expect(heroActions).toHaveCSS("flex-direction", "column");
    await expect(primaryButton).toBeVisible();
    await expect(secondaryButton).toBeVisible();
    await expect(labButton).toBeVisible();

    const [actionsBox, primaryBox, secondaryBox, labBox] = await Promise.all([
      heroActions.boundingBox(),
      primaryButton.boundingBox(),
      secondaryButton.boundingBox(),
      labButton.boundingBox()
    ]);

    expect(actionsBox).not.toBeNull();
    expect(primaryBox).not.toBeNull();
    expect(secondaryBox).not.toBeNull();
    expect(labBox).not.toBeNull();

    expect(primaryBox!.width).toBeGreaterThanOrEqual(actionsBox!.width - 1);
    expect(secondaryBox!.width).toBeGreaterThanOrEqual(actionsBox!.width - 1);
    expect(labBox!.width).toBeGreaterThanOrEqual(actionsBox!.width - 1);
    expect(secondaryBox!.y).toBeGreaterThan(primaryBox!.y + primaryBox!.height);
    expect(labBox!.y).toBeGreaterThan(secondaryBox!.y + secondaryBox!.height);
  });
});
