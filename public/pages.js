/* The Tiny Apps Company: theme toggle for the text pages, remembered per browser like the home page. */
(() => {
  const root = document.documentElement;
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ttac-theme', root.dataset.theme); } catch {}
  });
})();
