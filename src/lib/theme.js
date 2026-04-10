// Admin UI theme application.
// Sets `data-theme` on <html>, which index.css uses to tint CSS variables.

const VALID_THEMES = new Set(['wordpress', 'word', 'obsidian', 'markdown']);

export function applyAdminTheme(themeId) {
  const theme = VALID_THEMES.has(themeId) ? themeId : 'wordpress';
  document.documentElement.dataset.theme = theme;
}
