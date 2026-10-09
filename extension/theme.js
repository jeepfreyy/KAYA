(() => {
  const storageKey = 'kaya-theme';
  const root = document.documentElement;

  function readSavedTheme() {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  function preferredTheme() {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const isDark = theme === 'dark';
    const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  let theme = readSavedTheme() || preferredTheme();
  applyTheme(theme);

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(theme);
    const toggle = document.getElementById('theme-toggle');
    toggle?.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(storageKey, theme); } catch { /* The theme still works for this session. */ }
      applyTheme(theme);
    });

    const preference = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    preference?.addEventListener?.('change', (event) => {
      if (readSavedTheme()) return;
      theme = event.matches ? 'dark' : 'light';
      applyTheme(theme);
    });
  }, { once: true });
})();
