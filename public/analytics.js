/* Clarity custom tags and events for every public page.
   Only page names, screen names and link types are sent: no names, numbers or anything typed.
   window.clarity is missing in the /admin live preview, so nothing is tracked there. */
(() => {
  if (typeof window.clarity !== 'function') return;
  // look clarity up on every call: the real Clarity script replaces the loader's stub once it arrives
  const clarity = (...args) => window.clarity(...args);
  const page = location.pathname.replace(/^\/+|\.html$|\/+$/g, '') || 'home';
  clarity('set', 'page', page);

  // which kind of link was tapped
  function kindOf(a){
    const href = a.getAttribute('href') || '';
    if (/^tel:/i.test(href)) return 'contact_call';
    if (/(^|\/\/)(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(href)) return 'contact_whatsapp';
    if (/^mailto:/i.test(href)) return 'contact_email';
    if (/maps\.google\.|google\.[a-z.]+\/maps|maps\.app\.goo\.gl/i.test(href)) return 'contact_map';
    if (a.host && a.host !== location.host) return 'outbound_click';
    return null;
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const event = kindOf(a);
    if (!event) return;
    // where it was tapped: the phone screen it sits on (an app or a dock screen), else the page
    const screen = a.closest('[data-page]');
    clarity('set', 'click_place', screen ? screen.dataset.page : page);
    if (event === 'outbound_click'){
      clarity('set', 'outbound_site', a.host);
      if (screen && screen.dataset.kind === 'app'){
        clarity('set', 'website_app', screen.dataset.page);
        clarity('event', 'app_website_visit');
      }
    }
    clarity('event', event);
    // keep the full recording of anyone who reaches out
    if (event.startsWith('contact_')) clarity('upgrade', event);
  }, true);
})();
