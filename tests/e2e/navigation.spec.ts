import { expect, type Page, test } from "@playwright/test";

const desktopNavigationLinks = [
  { name: "Обо мне", hash: "#about", selector: "#about" },
  { name: "Опыт", hash: "#experience", selector: "#experience" },
  { name: "Проекты", hash: "#projects", selector: "#projects" },
  { name: "Контакты", hash: "#contact", selector: "#contact" }
];

async function expectSectionOpened(page: Page, hash: string, selector: string) {
  await expect(page).toHaveURL(new RegExp(`${hash}$`));
  await expect(page.locator(selector)).toBeInViewport({ ratio: 0.1 });
}

test.describe("Навигация по странице", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  for (const link of desktopNavigationLinks) {
    test(`переходит к разделу "${link.name}" из верхней навигации`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === "mobile-chrome", "Десктопная навигация намеренно скрыта на мобильном экране.");

      const navigation = page.getByRole("navigation", { name: "Основные разделы" });

      await navigation.getByRole("link", { name: link.name, exact: true }).click();

      await expectSectionOpened(page, link.hash, link.selector);
    });
  }

  test("переходит к разделу опыта по hero-кнопке", async ({ page }) => {
    const hero = page.locator("#about");

    await hero.getByRole("link", { name: "Опыт", exact: true }).click();

    await expectSectionOpened(page, "#experience", "#experience");
  });

  test("переходит к разделу проектов по hero-кнопке", async ({ page }) => {
    const hero = page.locator("#about");

    await hero.getByRole("link", { name: "Достижения и проекты", exact: true }).click();

    await expectSectionOpened(page, "#projects", "#projects");
  });
});
