import { expect, test } from "@playwright/test";

test.describe("Smoke проверки портфолио", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("отображает основной контент портфолио", async ({ page }) => {
    await expect(page).toHaveTitle("Максим - QA Engineer");
    await expect(page.getByRole("heading", { name: "Максим", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "К началу страницы" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Компании, роли и зоны ответственности" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Что показывает мой подход к качеству" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  });

  test("содержит рабочие семантические ссылки десктопной навигации", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "Десктопная навигация намеренно скрыта на мобильном экране.");

    const navigation = page.getByRole("navigation", { name: "Основные разделы" });

    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Обо мне", exact: true })).toHaveAttribute("href", "#about");
    await expect(navigation.getByRole("link", { name: "Опыт", exact: true })).toHaveAttribute("href", "#experience");
    await expect(navigation.getByRole("link", { name: "Проекты", exact: true })).toHaveAttribute("href", "#projects");
    await expect(navigation.getByRole("link", { name: "Контакты", exact: true })).toHaveAttribute("href", "#contact");
    await expect(navigation.getByRole("link", { name: "QA Lab", exact: true })).toHaveAttribute(
      "href",
      "api-lab.html"
    );
  });

  test("сохраняет выбранную тему", async ({ page }) => {
    const themeToggle = page.getByRole("button", { name: "Переключить тему" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "false");

    await themeToggle.click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("portfolio-theme")))
      .toBe("light");

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
  });

  test("содержит аватар", async ({ page }) => {
    await expect(page.getByAltText("Аватар")).toBeVisible();
  });

  test("содержит ожидаемые контактные ссылки", async ({ page }) => {
    await expect(page.getByRole("link", { name: /e-mail/i })).toHaveAttribute(
      "href",
      "mailto:m.manyshev@yandex.ru"
    );
    const telegramLink = page.getByRole("link", { name: /telegram/i });
    const linkedinLink = page.getByRole("link", { name: /linkedin/i });
    const githubLink = page.getByRole("link", { name: /github/i });

    await expect(telegramLink).toHaveAttribute("href", "https://t.me/emtuse");
    await expect(linkedinLink).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/momanyshev"
    );
    await expect(githubLink).toHaveAttribute("href", "https://github.com/momanyshev");

    for (const socialLink of [telegramLink, linkedinLink, githubLink]) {
      await expect(socialLink).toHaveAttribute("target", "_blank");
      await expect(socialLink).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
