const root = document.documentElement;
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeIcon = themeToggle?.querySelector(".theme-toggle-icon");
const savedTheme = localStorage.getItem("portfolio-theme");
const initialTheme = savedTheme || root.dataset.theme || "dark";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let themeTimer;

function applyTheme(theme) {
  root.dataset.theme = theme;

  if (!themeToggle || !themeIcon) return;

  const isLight = theme === "light";
  themeToggle.setAttribute("aria-pressed", String(isLight));
  themeToggle.setAttribute("title", isLight ? "Включить темную тему" : "Включить светлую тему");
  themeIcon.textContent = isLight ? "☀" : "☾";
}

function setTheme(theme, shouldSave = false) {
  clearTimeout(themeTimer);
  root.classList.add("theme-switching");
  void root.offsetWidth;
  applyTheme(theme);

  if (shouldSave) {
    localStorage.setItem("portfolio-theme", theme);
  }

  themeTimer = setTimeout(() => {
    root.classList.remove("theme-switching");
  }, 560);
}

applyTheme(initialTheme);

themeToggle?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "light" ? "dark" : "light";

  if (document.startViewTransition && !reducedMotion.matches) {
    root.classList.add("theme-switching");
    document.startViewTransition(() => setTheme(nextTheme, true));
    return;
  }

  setTheme(nextTheme, true);
});
