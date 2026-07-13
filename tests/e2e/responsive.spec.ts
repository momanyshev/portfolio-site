import { expect, type Page, test } from "@playwright/test";

const desktopViewport = { width: 1280, height: 900 };
const mobileViewport = { width: 390, height: 844 };

async function openAtViewport(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto("/");
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
  });

  test("скрывает верхнюю навигацию на mobile", async ({ page }) => {
    await openAtViewport(page, mobileViewport);

    await expect(page.locator(".site-nav")).toBeHidden();
    await expect(page.getByRole("link", { name: "К началу страницы" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Переключить тему" })).toBeVisible();
  });

  for (const viewport of [desktopViewport, mobileViewport]) {
    test(`не создает горизонтальный скролл при ширине ${viewport.width}px`, async ({ page }) => {
      await openAtViewport(page, viewport);

      await expectNoHorizontalScroll(page);
    });
  }

  test("оставляет hero-кнопки в одну строку на desktop", async ({ page }) => {
    await openAtViewport(page, desktopViewport);

    const heroActions = page.locator(".hero-actions");

    await expect(heroActions).toHaveCSS("flex-direction", "row");
    await expect(heroActions.getByRole("link", { name: "Опыт", exact: true })).toBeVisible();
    await expect(heroActions.getByRole("link", { name: "Достижения и проекты", exact: true })).toBeVisible();
  });

  test("перестраивает hero-кнопки в колонку на mobile", async ({ page }) => {
    await openAtViewport(page, mobileViewport);

    const heroActions = page.locator(".hero-actions");
    const primaryButton = heroActions.getByRole("link", { name: "Опыт", exact: true });
    const secondaryButton = heroActions.getByRole("link", { name: "Достижения и проекты", exact: true });

    await expect(heroActions).toHaveCSS("flex-direction", "column");
    await expect(primaryButton).toBeVisible();
    await expect(secondaryButton).toBeVisible();

    const [actionsBox, primaryBox, secondaryBox] = await Promise.all([
      heroActions.boundingBox(),
      primaryButton.boundingBox(),
      secondaryButton.boundingBox()
    ]);

    expect(actionsBox).not.toBeNull();
    expect(primaryBox).not.toBeNull();
    expect(secondaryBox).not.toBeNull();

    expect(primaryBox!.width).toBeGreaterThanOrEqual(actionsBox!.width - 1);
    expect(secondaryBox!.width).toBeGreaterThanOrEqual(actionsBox!.width - 1);
    expect(secondaryBox!.y).toBeGreaterThan(primaryBox!.y + primaryBox!.height);
  });
});
