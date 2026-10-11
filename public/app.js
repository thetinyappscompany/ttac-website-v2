/* The Tiny Apps Company: renders the phone from /api/content, handles navigation, video, ticker, clock, tilt and theme. */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const screen = $('#screen'), view = $('#view'), home = $('#home'), island = $('#island');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.2,.9,.22,1)';
  const BASE_TITLE = 'The Tiny Apps Company';
  const DOCK = ['about', 'team', 'how-we-build', 'contact'];
  const isPreview = new URLSearchParams(location.search).has('preview');

  let C = null;                       // site content
  let pages = new Map();
  let current = null, busy = false, homeAnim = null, islandTimer = 0;

  /* ---------- Safe output ---------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const safeUrl = (u) => {
    const s = String(u || '').trim();
    return /^(https?:|mailto:|tel:|\/)/i.test(s) ? s : '';
  };
  // images may also be the admin preview's local copies of not-yet-published uploads
  const imgUrl = (u) => safeUrl(u) || (isPreview && /^blob:/.test(String(u || '')) ? String(u) : '');
  const color = (c, fallback) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback);
  const glyph = (name) => String(name || '').replace(/[^a-z0-9-]/gi, '');
  const visibleApps = () => (C.apps || []).filter((a) => !a.hidden);

  /* ---------- YouTube helpers ---------- */
  function youTubeId(url){
    try {
      const u = new URL(url);
      let id = '';
      if (u.hostname.endsWith('youtu.be')) id = u.pathname.slice(1);
      else if (u.searchParams.get('v')) id = u.searchParams.get('v');
      else id = (u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/) || [])[2] || '';
      return /^[\w-]{11}$/.test(id) ? id : '';
    } catch { return ''; }
  }
  const orientationOf = (v) => (v.orientation === 'portrait' || v.orientation === 'landscape')
    ? v.orientation : (/\/shorts\//.test(v.url || '') ? 'portrait' : 'landscape');

  function videoCard(v, kind){
    const id = v && youTubeId(v.url);
    if (!id) return '';
    const o = orientationOf(v);
    return `<button class="vcard ${o}" data-video="${esc(kind)}" aria-label="Play video${v.title ? `: ${esc(v.title)}` : ''}">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">
      <span class="play"><i class="ph-fill ph-play"></i></span>
      <span class="vt"><small>Watch</small>${esc(v.title || '')}</span>
      <span class="vframe"></span>
    </button>`;
  }

  /* ---------- Icons ---------- */
  function appIcon(a){
    const bg = `background:linear-gradient(150deg,${color(a.colorTo, '#008080')},${color(a.colorFrom, '#111')})`;
    if (imgUrl(a.icon)) return `<span class="icon"><img src="${esc(imgUrl(a.icon))}" alt=""></span>`;
    return `<span class="icon" style="${bg}"><span class="gl" style="color:#fff"><i class="ph-fill ph-${glyph(a.glyph) || 'app-window'}"></i></span></span>`;
  }

  /* ---------- Screens ---------- */
  const back = '<a class="back" href="/" data-home><i class="ph-bold ph-caret-left"></i>Home</a>';
  const vars = (a1, a2) => `--a1:${a1};--a2:${a2}`;

  function appPage(a){
    const web = safeUrl(a.websiteUrl);
    const action = web
      ? { href: web, attrs: 'target="_blank" rel="noopener"', short: 'Visit', long: `Visit ${a.websiteLabel || 'website'}`, icon: 'arrow-up-right' }
      : { href: '#contact', attrs: 'data-route="contact"', short: 'Get a demo', long: 'Request a demo', icon: 'arrow-right' };
    const facts = (a.facts || []).filter((f) => f.label || f.value);
    const highlights = (a.highlights || []).filter((h) => h.title);
    const groups = (a.groups || []).filter((g) => (g.items || []).length);
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    return `
    <article class="page" data-page="${esc(a.id)}" data-kind="app" style="${vars(color(a.colorFrom, '#111'), color(a.colorTo, '#008080'))}" aria-label="${esc(a.name)}" hidden>
      <header class="band">
        ${back}
        <div class="v-head">${appIcon(a)}<div>
          <h2>${esc(a.name)}</h2><p class="k">${esc(a.category)}</p>
          <a class="pill" href="${esc(action.href)}" ${action.attrs}>${action.short}<i class="ph-bold ph-${action.icon}"></i></a>
        </div></div>
        ${a.tagline ? `<p class="v-line">${esc(a.tagline)}</p>` : ''}
        ${(a.platforms || []).length ? `<ul class="chips">${a.platforms.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      </header>
      <div class="body">
        ${facts.length ? `<div class="facts">${facts.map((f) => `<div><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join('')}</div>` : ''}
        ${videoCard(a.video, a.id)}
        ${a.description ? `<p>${esc(a.description)}</p>` : ''}
        ${highlights.length ? `<h3 class="sec">Why it's different</h3><div class="hl">${highlights.map((h) => `
          <article><span class="hi"><i class="ph-fill ph-${glyph(h.icon) || 'star'}"></i></span><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></article>`).join('')}</div>` : ''}
        ${groups.length ? `<h3 class="sec">What's inside <span style="font-weight:500;color:var(--sys-muted);font-size:.8em">${count} features, the short list</span></h3>
          ${groups.map((g) => `<section class="group"><h3>${esc(g.title)}</h3><ul class="feat">${g.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}` : ''}
        <div class="cta"><p>See ${esc(a.name)} for yourself.</p><a class="go" href="${esc(action.href)}" ${action.attrs}>${action.long}<i class="ph-bold ph-${action.icon}"></i></a></div>
        ${a.stack ? `<p class="stack">Built with <b>${esc(a.stack)}</b></p>` : ''}
      </div>
    </article>`;
  }

  function aboutPage(){
    const ab = C.about || {};
    return `
    <article class="page" data-page="about" style="${vars('#161616', '#008080')}" aria-label="About us" hidden>
      <header class="band" style="background:linear-gradient(165deg,#161616,#000)">
        ${back}
        <div class="v-head"><span class="icon t-about"><img src="/assets/ttac-icon.svg" alt=""></span><div><h2>About us</h2><p class="k">${esc(ab.subtitle)}</p></div></div>
        ${ab.headline ? `<p class="v-line">${esc(ab.headline)}</p>` : ''}
      </header>
      <div class="body">
        ${videoCard(ab.video, 'about')}
        ${(ab.paragraphs || []).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')}
        ${(ab.tiles || []).length ? `<div class="tiles">${ab.tiles.map((t) => `<div><b>${esc(t.value)}</b><span>${esc(t.label)}</span></div>`).join('')}</div>` : ''}
      </div>
    </article>`;
  }

  function teamPage(){
    const t = C.team || {};
    const initials = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const avatar = (m) => imgUrl(m.photo)
      ? `<span class="avatar"><img src="${esc(imgUrl(m.photo))}" alt=""></span>`
      : m.icon ? `<span class="avatar bot" aria-hidden="true"><i class="ph-fill ph-${glyph(m.icon)}"></i></span>`
      : `<span class="avatar" aria-hidden="true">${esc(initials(m.name))}</span>`;
    return `
    <article class="page" data-page="team" style="${vars('#003c3c', '#008080')}" aria-label="Team" hidden>
      <header class="band" style="background:linear-gradient(165deg,#006a6a,#003c3c)">
        ${back}
        <div class="v-head"><span class="icon t-team"><span class="gl"><i class="ph-fill ph-users-three"></i></span></span><div><h2>Team</h2><p class="k">${esc(t.subtitle)}</p></div></div>
        ${t.headline ? `<p class="v-line">${esc(t.headline)}</p>` : ''}
      </header>
      <div class="body"><div class="list">
        ${(t.members || []).filter((m) => m.name).map((m) => `
          <div class="row">${avatar(m)}<div><h3>${esc(m.name)}</h3>${m.role ? `<p class="role">${esc(m.role)}</p>` : ''}${m.bio ? `<p>${esc(m.bio)}</p>` : ''}</div></div>`).join('')}
      </div></div>
    </article>`;
  }

  function buildPage(){
    const b = C.build || {};
    return `
    <article class="page" data-page="how-we-build" style="${vars('#002e2e', '#008080')}" aria-label="How we build" hidden>
      <header class="band" style="background:linear-gradient(165deg,#1c1c1c,#002e2e)">
        ${back}
        <div class="v-head"><span class="icon t-build"><span class="gl"><i class="ph-fill ph-compass-tool"></i></span></span><div><h2>How we build</h2><p class="k">${esc(b.subtitle)}</p></div></div>
        ${b.headline ? `<p class="v-line">${esc(b.headline)}</p>` : ''}
      </header>
      <div class="body"><div class="list">
        ${(b.rules || []).filter((r) => r.title).map((r) => `
          <div class="row"><span class="ri" aria-hidden="true"><i class="ph-fill ph-${glyph(r.icon) || 'check'}"></i></span><div><h3>${esc(r.title)}</h3><p>${esc(r.text)}</p></div></div>`).join('')}
      </div></div>
    </article>`;
  }

  function contactPage(){
    const c = C.contact || {};
    const tel = String(c.phone || '').replace(/[^\d+]/g, '');
    const map = safeUrl(c.mapUrl);
    return `
    <article class="page" data-page="contact" style="${vars('#0f3d2a', '#008080')}" aria-label="Contact" hidden>
      <header class="band" style="background:linear-gradient(165deg,#0f3d2a,#0a0a0a)">
        ${back}
        <div class="v-head"><span class="icon t-about"><img src="/assets/ttac-icon.svg" alt=""></span><div><h2>Contact</h2><p class="k">${BASE_TITLE}</p></div></div>
        <div class="actions">
          ${c.email ? `<a href="mailto:${esc(c.email)}"><i class="ph-fill ph-envelope-simple"></i>Mail</a>` : ''}
          ${tel ? `<a href="tel:${esc(tel)}"><i class="ph-fill ph-phone"></i>Call</a>` : ''}
          ${map ? `<a href="${esc(map)}" target="_blank" rel="noopener"><i class="ph-fill ph-map-trifold"></i>Map</a>` : ''}
        </div>
      </header>
      <div class="body">
        <address class="list" style="font-style:normal">
          ${c.email ? `<div class="row"><span class="ri" aria-hidden="true"><i class="ph-fill ph-envelope-simple"></i></span><div><p>Email</p><h3><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></h3></div></div>` : ''}
          ${tel ? `<div class="row"><span class="ri" aria-hidden="true"><i class="ph-fill ph-phone"></i></span><div><p>Phone</p><h3><a href="tel:${esc(tel)}">${esc(c.phone)}</a></h3></div></div>` : ''}
          ${c.address ? `<div class="row"><span class="ri" aria-hidden="true"><i class="ph-fill ph-buildings"></i></span><div><p>Office</p><h3>${esc(c.address)}</h3></div></div>` : ''}
        </address>
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      </div>
    </article>`;
  }

  /* ---------- Render everything from content ---------- */
  function renderAll(){
    stopVideo(true);
    const apps = visibleApps();
    $('#grid').innerHTML = apps.map((a, i) => `
      <a class="app" href="#${esc(a.id)}" data-route="${esc(a.id)}" style="--i:${i + 1}">${appIcon(a)}<span class="label">${esc(a.name)}</span></a>`).join('');
    $('#badge').textContent = apps.length;
    $('#badge').setAttribute('aria-label', `${apps.length} apps`);
    $('#widgetLine').textContent = C.site?.widgetLine || '';
    if (!current) $('#hintText').textContent = C.site?.hint || 'Tap an app to look inside';
    setupTicker(C.site?.tickerWords);

    view.innerHTML = apps.map(appPage).join('') + aboutPage() + teamPage() + buildPage() + contactPage();
    pages = new Map([...view.querySelectorAll('[data-page]')].map((p) => [p.dataset.page, p]));
    watchHeaders();
    if (current){
      if (pages.has(current)) { pages.get(current).hidden = false; describe(current, false); }
      else { current = null; view.hidden = true; screen.classList.remove('in-app'); homeAnim?.cancel(); homeAnim = null; }
    }
  }

  /* the status bar turns frosted once the coloured header scrolls under it */
  let headerObserver = null;
  function watchHeaders(){
    headerObserver?.disconnect();
    const statusH = $('.status').offsetHeight;
    headerObserver = new IntersectionObserver((entries) => {
      for (const e of entries) if (!e.target.closest('.page').hidden) screen.classList.toggle('scrolled', !e.isIntersecting);
    }, { root: view, rootMargin: `-${statusH}px 0px 0px 0px` });
    view.querySelectorAll('.band').forEach((b) => headerObserver.observe(b));
  }

  /* ---------- In-phone screens: zoom out of the icon, like iOS ---------- */
  const launcher = (id) => $(`#home [data-route="${CSS.escape(id)}"]`);

  function zoomFrames(id){
    const s = screen.getBoundingClientRect();
    const o = (launcher(id) || $('#grid')).querySelector('.icon')?.getBoundingClientRect() || s;
    const dx = (o.left + o.width / 2) - (s.left + s.width / 2);
    const dy = (o.top + o.height / 2) - (s.top + s.height / 2);
    return [
      { transform:`translate(${dx}px,${dy}px) scale(${o.width / s.width})`, borderRadius:`${s.width * .225}px`, opacity:0 },
      { opacity:1, offset:.3 },
      { transform:'none', borderRadius:getComputedStyle(view).borderRadius, opacity:1 },
    ];
  }

  function describe(id, withIsland = true){
    const page = pages.get(id);
    const name = page.getAttribute('aria-label');
    const isApp = page.dataset.kind === 'app';
    document.title = `${name}, by ${BASE_TITLE}`;
    $('#hintText').innerHTML = `${isApp ? 'Now inside' : 'Now reading'} <b>${esc(name)}</b>`;
    if (!withIsland) return;
    const icon = launcher(id)?.querySelector('.icon');
    $('#islandIcon').replaceChildren(icon ? icon.cloneNode(true) : '');
    $('#islandText').innerHTML = `${esc(name)}<small>${isApp ? 'Opening' : BASE_TITLE}</small>`;
    island.classList.add('big');
    clearTimeout(islandTimer);
    islandTimer = setTimeout(() => island.classList.remove('big'), 1700);
  }

  function showPage(id, focus = true){
    stopVideo(true);
    pages.forEach((p, key) => { p.hidden = key !== id; });
    view.scrollTop = 0;
    screen.classList.remove('scrolled');
    current = id;
    describe(id);
    if (focus) pages.get(id).querySelector('[data-home]').focus({ preventScroll:true });
  }

  function openScreen(id){
    view.hidden = false;
    screen.classList.add('in-app');
    showPage(id);
    if (reduce) return;
    busy = true;
    view.animate(zoomFrames(id), { duration:560, easing:EASE }).onfinish = () => { busy = false; };
    homeAnim = home.animate(
      [{ transform:'scale(1)', opacity:1, filter:'blur(0)' }, { transform:'scale(1.12)', opacity:.25, filter:'blur(4px)' }],
      { duration:520, easing:EASE, fill:'forwards' });
  }

  function swapScreen(id){
    showPage(id);
    if (!reduce) view.animate([{ opacity:0, transform:'translateX(8%)' }, { opacity:1, transform:'none' }], { duration:320, easing:EASE });
  }

  function closeScreen(){
    stopVideo(true);
    const from = current;
    const done = () => {
      view.hidden = true;
      pages.forEach((p) => { p.hidden = true; });
      screen.classList.remove('in-app', 'scrolled');
      homeAnim?.cancel(); homeAnim = null;
      current = null; busy = false;
      launcher(from)?.focus({ preventScroll:true });
    };
    document.title = BASE_TITLE;
    $('#hintText').textContent = C.site?.hint || 'Tap an app to look inside';
    if (reduce || !launcher(from)){ done(); return; }
    busy = true;
    const frames = zoomFrames(from).reverse();
    frames[1] = { opacity:1, offset:.7 };
    const anim = view.animate(frames, { duration:440, easing:EASE, fill:'forwards' });
    homeAnim?.reverse();
    anim.onfinish = () => { anim.cancel(); done(); };
  }

  function render(id){
    if (id && !pages.has(id)) id = null;
    if (id === current) return;
    if (busy){ setTimeout(() => render(routeFromHash()), 120); return; }
    if (id && current) swapScreen(id);
    else if (id) openScreen(id);
    else closeScreen();
  }

  /* ---------- Routing: each screen has its own link, e.g. /#spacepartner ---------- */
  const routeFromHash = () => decodeURIComponent(location.hash.slice(1)) || null;

  function go(id){
    // moving between screens keeps one history entry, so Home always lands on the home screen
    if (current) history.replaceState(history.state, '', `#${id}`);
    else history.pushState({ pushed:true }, '', `#${id}`);
    render(id);
  }

  function goHome(){
    if (!current) return;
    if (history.state && history.state.pushed) history.back();
    else { history.replaceState(null, '', location.pathname + location.search); render(null); }
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const vid = e.target.closest('[data-video]');
    if (vid){ e.preventDefault(); playVideo(vid); return; }
    const route = e.target.closest('a[data-route]');
    if (route){ e.preventDefault(); go(route.dataset.route); return; }
    if (e.target.closest('[data-home]')){ e.preventDefault(); goHome(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('video-on')) stopVideo();
    else goHome();
  });
  addEventListener('popstate', () => render(routeFromHash()));

  const bar = $('#homeBar');
  let y0 = null;
  bar.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  bar.addEventListener('pointerup', (e) => {
    if (y0 !== null && (y0 - e.clientY > 12 || Math.abs(y0 - e.clientY) < 6)) goHome();
    y0 = null;
  });

  /* ---------- Video ---------- */
  let ytLoading = null, player = null, layer = null, inlineCard = null;

  function loadYouTube(){
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (!ytLoading) ytLoading = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytLoading = null; reject(new Error('YouTube did not load')); };
      document.head.append(s);
    });
    return ytLoading;
  }

  function videoFor(kind){
    if (kind === 'about') return C.about?.video;
    return (C.apps || []).find((a) => a.id === kind)?.video;
  }

  function makePlayer(YT, mount, id){
    return new YT.Player(mount, {
      host: 'https://www.youtube-nocookie.com',
      videoId: id,
      width: '100%', height: '100%',
      playerVars: { autoplay:1, playsinline:1, rel:0, modestbranding:1 },
      events: {
        onReady: (e) => e.target.playVideo(),
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) stopVideo(); },
      },
    });
  }

  function fitPhone(orientation){
    const zoom = $('#phoneZoom'), phone = $('#phone');
    const prev = zoom.style.transform;
    zoom.style.transition = 'none'; zoom.style.transform = 'none';
    const r = zoom.getBoundingClientRect();
    zoom.style.transform = prev; void zoom.offsetWidth; zoom.style.transition = '';
    const pw = phone.offsetWidth, ph = phone.offsetHeight, m = .92;
    const landscape = orientation === 'landscape';
    const s = landscape ? Math.min(innerWidth * m / ph, innerHeight * m / pw) : Math.min(innerHeight * m / ph, innerWidth * m / pw);
    const dx = innerWidth / 2 - (r.left + r.width / 2), dy = innerHeight / 2 - (r.top + r.height / 2);
    zoom.style.transform = `translate(${dx}px,${dy}px) rotate(${landscape ? -90 : 0}deg) scale(${s})`;
  }

  async function playVideo(card){
    const v = videoFor(card.dataset.video);
    const id = v && youTubeId(v.url);
    if (!id) return;
    stopVideo(true);
    const orientation = orientationOf(v);

    if (!C.site?.videoZoom){
      // zoom switched off in the admin panel: play inside the card
      inlineCard = card;
      card.classList.add('playing');
      const mount = document.createElement('div');
      card.querySelector('.vframe').replaceChildren(mount);
      try { player = makePlayer(await loadYouTube(), mount, id); } catch { stopVideo(true); }
      return;
    }

    document.body.classList.add('video-on');
    tiltOff = true;
    $('#phoneWrap').style.setProperty('--rx', '0deg');
    $('#phoneWrap').style.setProperty('--ry', '0deg');
    fitPhone(orientation);

    layer = document.createElement('div');
    layer.className = `video-layer ${orientation}`;
    layer.style.setProperty('--sw', `${screen.offsetWidth}px`);
    layer.style.setProperty('--sh', `${screen.offsetHeight}px`);
    layer.innerHTML = '<div class="vl"><div></div></div>';
    screen.append(layer);
    requestAnimationFrame(() => layer && layer.classList.add('show'));
    $('#videoClose').focus({ preventScroll:true });
    layer.dataset.orientation = orientation;
    try { player = makePlayer(await loadYouTube(), layer.querySelector('.vl > div'), id); }
    catch { stopVideo(); }
  }

  function stopVideo(instant = false){
    try { player && player.destroy(); } catch {}
    player = null;
    if (inlineCard){
      inlineCard.classList.remove('playing');
      inlineCard.querySelector('.vframe').replaceChildren();
      inlineCard = null;
    }
    if (!layer) return;
    const old = layer; layer = null;
    const zoom = $('#phoneZoom');
    if (instant) zoom.style.transition = 'none';
    zoom.style.transform = '';
    document.body.classList.remove('video-on');
    tiltOff = false;
    old.classList.remove('show');
    setTimeout(() => old.remove(), instant ? 0 : 400);
    if (instant){ void zoom.offsetWidth; zoom.style.transition = ''; }
  }

  $('#videoClose').addEventListener('click', () => stopVideo());
  $('#videoScrim').addEventListener('click', () => stopVideo());
  addEventListener('resize', () => { if (layer) fitPhone(layer.dataset.orientation); });

  /* ---------- Headline ticker ---------- */
  const ticker = $('#ticker');
  let words = [], wi = 0, tickTimer = 0, tickerKey = '';

  function setupTicker(list){
    const clean = (Array.isArray(list) ? list : []).map((w) => String(w).trim()).filter(Boolean);
    const all = clean.length ? clean : ['Deep'];
    const key = all.join('|');
    if (key === tickerKey) return;
    tickerKey = key;
    clearInterval(tickTimer);
    ticker.innerHTML = `<span class="sizer">${esc(all[0])}</span>` + all.map((w, i) => `<span class="w${i ? '' : ' on'}">${esc(w)}</span>`).join('');
    $('#h1Text').textContent = `A tiny name. ${all.join(', ')} apps.`;
    words = [...ticker.querySelectorAll('.w')];
    wi = 0;
    fit();
    if (!reduce && words.length > 1) tickTimer = setInterval(nextWord, 2300);
  }

  function fit(){ if (words[wi]) ticker.style.width = `${words[wi].offsetWidth}px`; }

  function nextWord(){
    if (document.hidden) return;
    const prev = words[wi];
    wi = (wi + 1) % words.length;
    const next = words[wi];
    prev.classList.replace('on', 'out');
    next.classList.add('on');
    fit();
    // park the old word below the line without sliding it back through the visible area
    setTimeout(() => {
      prev.classList.add('reset');
      prev.classList.remove('out');
      void prev.offsetWidth;
      prev.classList.remove('reset');
    }, 800);
  }
  document.fonts.ready.then(fit);
  addEventListener('resize', fit);

  /* ---------- Clock and widget date ---------- */
  function tick(){
    const d = new Date();
    $('#clock').textContent = d.toLocaleTimeString('en-IN', { hour:'numeric', minute:'2-digit', hour12:true }).replace(/\s?[ap]m/i, '');
    $('#wDay').textContent = d.toLocaleDateString('en-IN', { weekday:'long' });
    $('#wNum').textContent = d.getDate();
  }
  tick();
  setInterval(tick, 15000);

  /* ---------- Gentle tilt toward the pointer (mouse and trackpad only) ---------- */
  let tiltOff = false;
  if (!reduce && matchMedia('(pointer: fine)').matches && !document.documentElement.classList.contains('phone-only')){
    const col = $('#phoneCol'), wrap = $('#phoneWrap');
    let raf = 0;
    col.addEventListener('pointermove', (e) => {
      if (tiltOff) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = col.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        wrap.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`);
        wrap.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
      });
    });
    col.addEventListener('pointerleave', () => {
      wrap.style.setProperty('--ry', '0deg');
      wrap.style.setProperty('--rx', '0deg');
    });
  }

  /* ---------- Theme toggle, remembered per browser ---------- */
  const root = document.documentElement;
  $('#themeBtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ttac-theme', root.dataset.theme); } catch {}
  });

  /* ---------- Admin live preview: the admin panel posts unsaved content here ---------- */
  if (isPreview){
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data) return;
      // the admin panel may start listening after this page loaded, so it asks
      if (e.data.type === 'ttac:hello'){ if (C) parent.postMessage({ type:'ttac:ready' }, location.origin); return; }
      if (e.data.type !== 'ttac:content') return;
      C = e.data.content;
      renderAll();
      const want = e.data.route === undefined ? current : e.data.route;
      if (want !== current){
        if (want && pages.has(want)){
          if (!current){ view.hidden = false; screen.classList.add('in-app'); }
          showPage(want, false);
          history.replaceState(null, '', `${location.pathname}${location.search}#${want}`);
        } else if (!want && current){
          history.replaceState(null, '', location.pathname + location.search);
          view.hidden = true; screen.classList.remove('in-app'); pages.forEach((p) => { p.hidden = true; });
          homeAnim?.cancel(); homeAnim = null; current = null;
          document.title = BASE_TITLE; $('#hintText').textContent = C.site?.hint || '';
        }
      }
    });
  }

  /* ---------- Start ---------- */
  fetch('/api/content', { cache:'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((content) => {
      C = content;
      renderAll();
      if (isPreview) parent.postMessage({ type:'ttac:ready' }, location.origin);
      const initial = routeFromHash();
      if (initial && pages.has(initial)) setTimeout(() => render(initial), reduce || isPreview ? 0 : 900);
    })
    .catch(() => {
      $('#grid').innerHTML = '<p class="empty" style="grid-column:1/-1">Our apps did not load. Please refresh the page.</p>';
    });
})();
