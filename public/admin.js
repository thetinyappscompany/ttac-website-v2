/* Website admin: edit everything on the site, preview it live, then publish. */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const TOKEN_KEY = 'ttac-admin-token';
  const RESERVED = ['about', 'team', 'how-we-build', 'contact'];

  let state = null;          // content being edited
  let saved = '';            // JSON of the last published content
  let tab = 'apps';
  let appIndex = 0;
  let storage = 'local';     // 'github' on Vercel: publishing commits to the repo
  // images uploaded since the last publish: committed together with the content
  let pendingUploads = [];
  // until Vercel redeploys, a new /uploads/... path does not exist yet, so show the local copy
  const localImages = new Map();
  const showable = (url) => localImages.get(url) || url;

  /* ---------- Tiny DOM helper ---------- */
  function h(tag, attrs = {}, ...kids){
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)){
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const icon = (name, fill) => h('i', { class: `${fill ? 'ph-fill' : 'ph'} ph-${name}` });

  /* ---------- Auth and API ---------- */
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  const setToken = (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch {} };

  async function api(path, opts = {}){
    const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token()}` } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401){ setToken(''); showLogin('Your session ended. Please sign in again.'); throw new Error('signed out'); }
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  function showLogin(msg = ''){
    $('#shell').hidden = true;
    $('#login').hidden = false;
    $('#loginErr').textContent = msg;
    ($('#user').value ? $('#pw') : $('#user')).focus();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in';
    $('#loginErr').textContent = '';
    try {
      const res = await fetch('/api/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ username: $('#user').value, password: $('#pw').value }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not sign in.');
      setToken(body.token);
      $('#pw').value = '';
      await start();
    } catch (err) {
      $('#loginErr').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });

  $('#signOut').addEventListener('click', () => {
    if (isDirty() && !confirm('You have unpublished changes. Sign out and lose them?')) return;
    setToken(''); saved = JSON.stringify(state); showLogin();
  });

  /* ---------- Dirty state, publishing ---------- */
  const isDirty = () => state && JSON.stringify(state) !== saved;

  function refreshStatus(){
    const dirty = isDirty();
    $('#publishBtn').disabled = !dirty;
    $('#discardBtn').disabled = !dirty;
    const s = $('#status');
    s.classList.toggle('dirty', dirty);
    s.textContent = dirty ? 'Unpublished changes. The live site is unchanged until you publish.'
      : storage === 'github' ? 'Everything is published to GitHub.' : 'Everything is saved. (Local mode: publishing writes to public/content.json.)';
  }

  let previewTimer = 0;
  function changed(){
    refreshStatus();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(sendPreview, 200);
  }

  function problems(){
    const out = [];
    const ids = new Set();
    state.apps.forEach((a, i) => {
      if (!a.name.trim()) out.push(`App ${i + 1} needs a name.`);
      if (!/^[a-z0-9-]+$/.test(a.id)) out.push(`${a.name || `App ${i + 1}`}: the link name can only use a-z, 0-9 and dashes.`);
      if (RESERVED.includes(a.id)) out.push(`${a.name}: the link name "${a.id}" is used by the dock.`);
      if (ids.has(a.id)) out.push(`Two apps use the link name "${a.id}".`);
      ids.add(a.id);
    });
    return out;
  }

  $('#publishBtn').addEventListener('click', async () => {
    const issues = problems();
    if (issues.length){ toast(issues[0], true); return; }
    const btn = $('#publishBtn');
    btn.disabled = true;
    $('#status').textContent = 'Publishing';
    try {
      // keys starting with _ are editor-only notes (like "link name still follows the app name")
      const content = JSON.parse(JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v)));
      const body = JSON.stringify({ content, uploads: pendingUploads });
      const res = await api('/api/content', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body });
      saved = JSON.stringify(state);
      pendingUploads = [];
      toast(res.storage === 'github'
        ? 'Published to GitHub. Visitors see the changes within a minute.'
        : 'Saved to public/content.json on this computer.');
    } catch (err) {
      if (err.message !== 'signed out') toast(err.message, true);
    }
    refreshStatus();
  });

  $('#discardBtn').addEventListener('click', () => {
    if (!confirm('Throw away every unpublished change?')) return;
    state = JSON.parse(saved);
    appIndex = Math.min(appIndex, state.apps.length - 1);
    renderTab(); changed();
  });

  addEventListener('beforeunload', (e) => { if (isDirty()){ e.preventDefault(); e.returnValue = ''; } });

  let toastTimer = 0;
  function toast(msg, bad = false){
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
  }

  /* ---------- Live preview ---------- */
  const iframe = $('#previewIframe');
  let previewReady = false;
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.type !== 'ttac:ready') return;
    previewReady = true; sendPreview();
  });
  const hello = () => { try { iframe.contentWindow.postMessage({ type:'ttac:hello' }, location.origin); } catch {} };
  iframe.addEventListener('load', hello);
  function previewRoute(){
    if (tab === 'apps'){ const a = state.apps[appIndex]; return a && !a.hidden ? a.id : null; }
    return { about:'about', team:'team', build:'how-we-build', contact:'contact' }[tab] || null;
  }
  function sendPreview(){
    if (!previewReady || !state) return;
    let json = JSON.stringify(state);
    localImages.forEach((local, url) => { json = json.split(JSON.stringify(url)).join(JSON.stringify(local)); });
    iframe.contentWindow.postMessage({ type:'ttac:content', content: JSON.parse(json), route: previewRoute() }, location.origin);
  }

  /* ---------- Field builders ---------- */
  // Each builder gets the object and key it edits, and calls changed() after every edit.
  let uid = 0;
  function fieldWrap(def, control){
    const target = control.matches('input,textarea,select') ? control : control.querySelector('input:not([type=file]):not([type=color]),textarea,select');
    const id = `f${++uid}`;
    if (target) target.id = id;
    return h('div', { class: `field${def.full ? ' full' : ''}` },
      def.label && h('label', { class:'f-label', for: target ? id : null }, def.label),
      control,
      def.help && h('p', { class:'f-help', html: def.help }));
  }

  const BUILDERS = {
    text(def, obj){
      return fieldWrap(def, h('input', { class:'input', type: def.inputType || 'text', value: obj[def.key] ?? '', placeholder: def.placeholder,
        oninput: (e) => { obj[def.key] = e.target.value; def.onInput?.(e.target.value, obj); changed(); } }));
    },
    textarea(def, obj){
      return fieldWrap({ full:true, ...def }, h('textarea', { class:'input', rows: def.rows || 3, placeholder: def.placeholder,
        oninput: (e) => { obj[def.key] = e.target.value; changed(); } }, obj[def.key] ?? ''));
    },
    slug(def, obj){
      const input = h('input', { class:'input', value: obj[def.key] ?? '', spellcheck:'false',
        oninput: (e) => {
          const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          if (v !== e.target.value) e.target.value = v;
          obj[def.key] = v; obj._autoId = false;
          e.target.classList.toggle('bad', !v || RESERVED.includes(v));
          changed(); def.onInput?.();
        } });
      def.ref && def.ref(input);
      return fieldWrap(def, input);
    },
    color(def, obj){
      const text = h('input', { class:'input', value: obj[def.key] || '', spellcheck:'false' });
      const pick = h('input', { type:'color', value: /^#[0-9a-f]{6}$/i.test(obj[def.key]) ? obj[def.key] : '#008080' });
      pick.addEventListener('input', () => { obj[def.key] = pick.value; text.value = pick.value; changed(); def.onInput?.(); });
      text.addEventListener('input', () => {
        obj[def.key] = text.value;
        if (/^#[0-9a-f]{6}$/i.test(text.value)) pick.value = text.value;
        changed(); def.onInput?.();
      });
      return fieldWrap(def, h('div', { class:'color' }, pick, text));
    },
    select(def, obj){
      const sel = h('select', { class:'input', onchange: (e) => { obj[def.key] = e.target.value; changed(); def.onInput?.(); } },
        def.options.map(([v, label]) => h('option', { value: v, selected: obj[def.key] === v }, label)));
      return fieldWrap(def, sel);
    },
    toggle(def, obj){
      const input = h('input', { type:'checkbox', checked: !!obj[def.key], onchange: (e) => { obj[def.key] = e.target.checked; changed(); def.onInput?.(); } });
      return h('div', { class:'field full' }, h('label', { class:'toggle' }, input, h('span', { class:'sw' }),
        h('span', {}, h('strong', {}, def.label), def.help && h('span', { class:'f-help', html: def.help }))));
    },
    image(def, obj){
      const thumb = h('span', { class:'thumb' });
      const url = h('input', { class:'input', value: obj[def.key] || '', placeholder:'Upload an image, or paste its link' });
      const file = h('input', { type:'file', accept:'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', hidden:true });
      const paint = () => {
        thumb.innerHTML = '';
        thumb.append(obj[def.key] ? h('img', { src: showable(obj[def.key]), alt:'' }) : icon('image'));
      };
      const set = (v) => { obj[def.key] = v; url.value = v; paint(); changed(); def.onInput?.(); };
      url.addEventListener('input', () => { obj[def.key] = url.value.trim(); paint(); changed(); def.onInput?.(); });
      file.addEventListener('change', async () => {
        const f = file.files[0]; file.value = '';
        if (!f) return;
        if (f.size > 2 * 1024 * 1024){ toast('Images must be 2 MB or smaller.', true); return; }
        up.disabled = true; up.textContent = 'Uploading';
        try {
          const res = await api(`/api/upload?name=${encodeURIComponent(f.name)}`, { method:'POST', headers:{ 'Content-Type': f.type }, body: f });
          localImages.set(res.url, URL.createObjectURL(f));
          pendingUploads.push({ url: res.url, sha: res.sha });
          set(res.url);
        } catch (err) { if (err.message !== 'signed out') toast(err.message, true); }
        up.disabled = false; up.textContent = 'Upload';
      });
      const up = h('button', { class:'btn soft small', type:'button', onclick: () => file.click() }, 'Upload');
      paint();
      return fieldWrap({ full:true, ...def }, h('div', { class:'img-field' }, thumb,
        h('div', { class:'grow' }, url, h('div', { class:'row' }, up,
          h('button', { class:'btn ghost small', type:'button', onclick: () => set('') }, 'Remove'), file))));
    },
    glyph(def, obj){
      const prev = h('span', { class:'gp' });
      const paint = () => { prev.innerHTML = ''; prev.append(icon(obj[def.key] || 'question', true)); };
      const input = h('input', { class:'input', value: obj[def.key] || '', placeholder:'e.g. rocket-launch', spellcheck:'false',
        oninput: (e) => { obj[def.key] = e.target.value.trim().toLowerCase(); paint(); changed(); def.onInput?.(); } });
      paint();
      return fieldWrap({ help:'Any icon name from <a href="https://phosphoricons.com" target="_blank" rel="noopener">phosphoricons.com</a>.', ...def },
        h('div', { class:'glyph-field' }, prev, input));
    },
    tags(def, obj){
      if (!Array.isArray(obj[def.key])) obj[def.key] = [];
      const list = obj[def.key];
      const box = h('div', { class:'tags' });
      const input = h('input', { placeholder: def.placeholder || 'Type and press Enter' });
      const paint = () => {
        box.replaceChildren(...list.map((t, i) => h('span', { class:'tag' }, t,
          h('button', { type:'button', 'aria-label':`Remove ${t}`, onclick: () => { list.splice(i, 1); paint(); changed(); } }, icon('x')))), input);
      };
      const add = () => {
        const parts = input.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
        if (!parts.length) return;
        list.push(...parts); input.value = ''; paint(); input.focus(); changed();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); add(); }
        else if (e.key === 'Backspace' && !input.value && list.length){ list.pop(); paint(); input.focus(); changed(); }
      });
      input.addEventListener('blur', add);
      input.addEventListener('paste', () => setTimeout(() => { if (/[\n,]/.test(input.value)) add(); }));
      box.addEventListener('click', (e) => { if (e.target === box) input.focus(); });
      paint();
      return fieldWrap({ full:true, help:'Press Enter or type a comma to add. Click × to remove.', ...def }, box);
    },
    strings(def, obj){
      // a list of paragraphs
      return BUILDERS.list({ ...def, fields:[{ key:'v', type:'textarea', label:'' }], wrap:true }, obj);
    },
    video(def, obj){
      if (!obj[def.key] || typeof obj[def.key] !== 'object') obj[def.key] = { url:'', orientation:'auto', title:'' };
      const v = obj[def.key];
      const info = h('div', { class:'yt' });
      const paint = () => {
        info.innerHTML = '';
        if (!v.url) return info.append('No video. Paste a YouTube link to add one.');
        const id = youTubeId(v.url);
        if (!id) return info.append(h('span', { style:'color:var(--danger)' }, 'That does not look like a YouTube link.'));
        const o = v.orientation === 'auto' ? (/\/shorts\//.test(v.url) ? 'vertical (a Short)' : 'horizontal') : (v.orientation === 'portrait' ? 'vertical' : 'horizontal');
        info.append(h('img', { src:`https://i.ytimg.com/vi/${id}/mqdefault.jpg`, alt:'' }), h('span', {}, `Plays ${o}.`));
      };
      paint();
      const card = h('div', { class:'fields' });
      card.append(
        BUILDERS.text({ key:'url', label:'YouTube link', full:true, placeholder:'https://www.youtube.com/watch?v=... or /shorts/...', onInput: paint }, v),
        BUILDERS.select({ key:'orientation', label:'Video shape', options:[['auto', 'Detect from the link'], ['landscape', 'Horizontal (16:9)'], ['portrait', 'Vertical (9:16)']], onInput: paint }, v),
        BUILDERS.text({ key:'title', label:'Title on the video card', placeholder:'e.g. A 2-minute tour' }, v),
        h('div', { class:'field full' }, info));
      return h('div', { class:'field full' }, card);
    },
    list(def, obj){
      if (!Array.isArray(obj[def.key])) obj[def.key] = [];
      // paragraph lists hold plain strings; wrap them so fields can edit them
      const raw = obj[def.key];
      const box = h('div', { class:'list' });
      const items = def.wrap ? raw.map((s) => ({ v: s })) : raw;
      const sync = () => { if (def.wrap){ raw.length = 0; raw.push(...items.map((x) => x.v)); } };
      const titleOf = (it, i) => {
        const first = def.titleKey ? it[def.titleKey] : def.wrap ? it.v : it[def.fields[0].key];
        return (String(first || '').trim().slice(0, 60)) || `${def.itemName || 'Item'} ${i + 1}`;
      };
      const move = (i, d) => {
        const j = i + d; if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]]; sync(); paint(); changed();
      };
      const paint = () => {
        box.replaceChildren(...items.map((it, i) => {
          const acts = h('span', { class:'acts' },
            h('button', { class:'btn ghost icon-only small', type:'button', 'aria-label':'Move up', disabled: i === 0, onclick: () => move(i, -1) }, icon('arrow-up')),
            h('button', { class:'btn ghost icon-only small', type:'button', 'aria-label':'Move down', disabled: i === items.length - 1, onclick: () => move(i, 1) }, icon('arrow-down')),
            h('button', { class:'btn ghost icon-only small danger', type:'button', 'aria-label':'Delete', onclick: () => {
              if (!confirm(`Delete "${titleOf(it, i)}"?`)) return;
              items.splice(i, 1); sync(); paint(); changed();
            } }, icon('trash')));
          const fields = h('div', { class:'fields' }, def.fields.map((f) => build({ ...f, onInput: () => { sync(); f.onInput?.(); } }, it)));
          // keep the list in sync as fields change
          fields.addEventListener('input', sync, true);
          fields.addEventListener('change', sync, true);
          if (def.inline) return h('div', { class:'item inline' }, fields, acts);
          return h('div', { class:'item' },
            h('div', { class:'item-head' }, h('span', { class:'t' }, titleOf(it, i)), acts),
            h('div', { class:'item-body' }, fields));
        }));
      };
      paint();
      const add = h('button', { class:'btn soft small add', type:'button', onclick: () => {
        const blank = def.wrap ? { v:'' } : Object.fromEntries(def.fields.map((f) => [f.key, f.type === 'tags' ? [] : f.type === 'toggle' ? false : '']));
        items.push(blank); sync(); paint(); changed();
        box.lastElementChild?.querySelector('input,textarea')?.focus();
      } }, icon('plus'), `Add ${def.itemName || 'item'}`);
      return h('div', { class:'field full' }, def.label && h('span', { class:'f-label' }, def.label), def.help && h('p', { class:'f-help', html: def.help }), box, add);
    },
  };

  const build = (def, obj) => (BUILDERS[def.type || 'text'])(def, obj);
  const card = (title, iconName, fields, obj) =>
    h('section', { class:'card' }, h('h3', {}, icon(iconName), title), h('div', { class:'fields' }, fields.map((f) => build(f, obj))));

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

  /* ---------- Sections ---------- */
  const head = (title, lead) => [h('h2', {}, title), h('p', { class:'lead' }, lead)];

  function slugify(s){ return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app'; }
  function uniqueId(base, skip){
    let id = base, n = 2;
    while (state.apps.some((a) => a !== skip && a.id === id) || RESERVED.includes(id)) id = `${base}-${n++}`;
    return id;
  }

  function appThumb(a){
    if (a.icon) return h('span', { class:'ai' }, h('img', { src: showable(a.icon), alt:'' }));
    return h('span', { class:'ai', style:`background:linear-gradient(150deg,${a.colorTo || '#008080'},${a.colorFrom || '#111'})` }, icon(a.glyph || 'app-window', true));
  }

  function renderApps(root){
    root.append(...head('Apps', 'The icons on the phone. Pick an app to edit it. The order here is the order on the home screen.'));
    const layout = h('div', { class:'apps-layout' });
    const listEl = h('div', { class:'app-list' });
    const editEl = h('div');
    layout.append(listEl, editEl);
    root.append(layout);

    const paintList = () => {
      listEl.replaceChildren(...state.apps.map((a, i) => h('button', { class:`app-pick${i === appIndex ? ' on' : ''}`, type:'button',
        onclick: () => { appIndex = i; paintList(); paintEditor(); sendPreview(); } },
        appThumb(a), h('span', { class:'an' }, a.name || 'Untitled', a.hidden && h('div', { class:'hid' }, 'Hidden')))),
        h('div', { class:'app-tools' },
          h('button', { class:'btn soft small', type:'button', onclick: addApp }, icon('plus'), 'Add app')));
    };

    function addApp(){
      const id = uniqueId('new-app');
      state.apps.push({
        id, _autoId: true, name:'New app', category:'', tagline:'', description:'', icon:'', glyph:'app-window',
        colorFrom:'#003c3c', colorTo:'#008080', platforms:[], facts:[], highlights:[], groups:[], stack:'',
        websiteUrl:'', websiteLabel:'', video:{ url:'', orientation:'auto', title:'' }, hidden:false,
      });
      appIndex = state.apps.length - 1;
      paintList(); paintEditor(); changed();
      editEl.querySelector('input')?.select();
    }

    const paintEditor = () => {
      const a = state.apps[appIndex];
      editEl.innerHTML = '';
      if (!a){ editEl.append(h('p', { class:'lead' }, 'No apps yet. Add one.')); return; }
      let idInput;
      const relist = () => paintList();
      const move = (d) => {
        const j = appIndex + d; if (j < 0 || j >= state.apps.length) return;
        [state.apps[appIndex], state.apps[j]] = [state.apps[j], state.apps[appIndex]];
        appIndex = j; paintList(); paintEditor(); changed();
      };
      editEl.append(
        h('div', { class:'app-tools', style:'margin-top:0' },
          h('button', { class:'btn ghost small', type:'button', disabled: appIndex === 0, onclick: () => move(-1) }, icon('arrow-up'), 'Move up'),
          h('button', { class:'btn ghost small', type:'button', disabled: appIndex === state.apps.length - 1, onclick: () => move(1) }, icon('arrow-down'), 'Move down'),
          h('button', { class:'btn ghost small danger', type:'button', onclick: () => {
            if (!confirm(`Delete ${a.name || 'this app'} from the website?`)) return;
            state.apps.splice(appIndex, 1); appIndex = Math.max(0, appIndex - 1); paintList(); paintEditor(); changed();
          } }, icon('trash'), 'Delete app')),
        card('Basics', 'identification-card', [
          { key:'name', label:'App name', onInput: (v, obj) => {
            if (obj._autoId && idInput){ obj.id = uniqueId(slugify(v), obj); idInput.value = obj.id; }
            relist();
          } },
          { key:'id', type:'slug', label:'Link name', ref: (el) => { idInput = el; }, help:'The app\'s own link, like <code>/#spacepartner</code>. Lowercase letters, numbers and dashes.' },
          { key:'category', label:'Category', placeholder:'e.g. Coworking operations' },
          { key:'tagline', label:'Tagline', placeholder:'One short, bold line' },
          { key:'description', type:'textarea', label:'Description' },
          { key:'hidden', type:'toggle', label:'Hide this app from the website', help:'It stays here, so you can show it again later.', onInput: relist },
        ], a),
        card('Icon and colours', 'palette', [
          { key:'icon', type:'image', label:'Icon image', help:'A square image, at least 192 × 192 pixels. Leave empty to use a symbol.', onInput: relist },
          { key:'glyph', type:'glyph', label:'Symbol, if there is no image', onInput: relist },
          { key:'colorFrom', type:'color', label:'Header colour (dark)', onInput: relist },
          { key:'colorTo', type:'color', label:'Header colour (bright)', onInput: relist },
        ], a),
        card('Website button', 'link', [
          { key:'websiteUrl', label:'Website link', inputType:'url', placeholder:'https://', help:'Leave empty to show "Request a demo", which opens Contact.' },
          { key:'websiteLabel', label:'Button text', placeholder:'e.g. spacepartner.io', help:'The button reads "Visit" followed by this.' },
        ], a),
        card('Video', 'youtube-logo', [{ key:'video', type:'video' }], a),
        card('Info strip', 'rows', [
          { key:'platforms', type:'tags', label:'Platforms', help:'Small chips under the tagline, e.g. Android, Web.' },
          { key:'facts', type:'list', itemName:'fact', inline:true, help:'Short label and value pairs shown in a strip. Four fit on screen.', fields:[
            { key:'label', label:'Label', placeholder:'e.g. Built for' }, { key:'value', label:'Value', placeholder:'e.g. Coworking' }] },
        ], a),
        card('Highlights', 'sparkle', [
          { key:'highlights', type:'list', itemName:'highlight', titleKey:'title', help:'Swipeable cards under the description. Three works well.', fields:[
            { key:'title', label:'Title' }, { key:'icon', type:'glyph', label:'Symbol' }, { key:'text', type:'textarea', label:'Text', rows:2 }] },
        ], a),
        card('Features', 'list-checks', [
          { key:'groups', type:'list', itemName:'feature group', titleKey:'title', fields:[
            { key:'title', label:'Group name', full:true }, { key:'items', type:'tags', label:'Features' }] },
          { key:'stack', label:'Built with', full:true, placeholder:'e.g. Frappe, Flutter' },
        ], a));
    };

    paintList(); paintEditor();
  }

  function renderAbout(root){
    const ab = state.about;
    root.append(...head('About', 'The About screen in the dock.'),
      card('Header', 'text-aa', [
        { key:'subtitle', label:'Line under "About us"' },
        { key:'headline', label:'Headline', full:true },
      ], ab),
      card('Video', 'youtube-logo', [{ key:'video', type:'video' }], ab),
      card('Story', 'article', [{ key:'paragraphs', type:'strings', itemName:'paragraph' }], ab),
      card('Number tiles', 'squares-four', [
        { key:'tiles', type:'list', itemName:'tile', inline:true, help:'The first tile is shown wide, in teal.', fields:[
          { key:'value', label:'Big text', placeholder:'e.g. 5 products' }, { key:'label', label:'Small text', placeholder:'e.g. and counting' }] },
      ], ab));
  }

  function renderTeam(root){
    const t = state.team;
    root.append(...head('Team', 'The Team screen in the dock.'),
      card('Header', 'text-aa', [{ key:'subtitle', label:'Line under "Team"' }, { key:'headline', label:'Headline', full:true }], t),
      card('People', 'users-three', [
        { key:'members', type:'list', itemName:'person', titleKey:'name', fields:[
          { key:'name', label:'Name' }, { key:'role', label:'Role', placeholder:'e.g. Co-founder' },
          { key:'photo', type:'image', label:'Photo', help:'Square photo. Without one, their initials are shown.' },
          { key:'icon', type:'glyph', label:'Symbol instead of initials (optional)', help:'Used only when there is no photo, e.g. <code>robot</code>.' },
          { key:'bio', type:'textarea', label:'Short bio', rows:2 }] },
      ], t));
  }

  function renderBuild(root){
    const b = state.build;
    root.append(...head('How we build', 'The How we build screen in the dock.'),
      card('Header', 'text-aa', [{ key:'subtitle', label:'Line under the title' }, { key:'headline', label:'Headline', full:true }], b),
      card('Rules', 'list-numbers', [
        { key:'rules', type:'list', itemName:'rule', titleKey:'title', fields:[
          { key:'title', label:'Title' }, { key:'icon', type:'glyph', label:'Symbol' }, { key:'text', type:'textarea', label:'Text', rows:2 }] },
      ], b));
  }

  function renderContact(root){
    root.append(...head('Contact', 'The Contact screen in the dock: its Call, WhatsApp, Mail and Map buttons use these details.'),
      card('Details', 'address-book', [
        { key:'email', label:'Email', inputType:'email' },
        { key:'phone', label:'Phone', inputType:'tel', help:'Used by the Call buttons.' },
        { key:'whatsapp', label:'WhatsApp number', inputType:'tel', placeholder:'Same as the phone number', help:'Leave empty to use the phone number.' },
        { key:'whatsappMessage', label:'WhatsApp opening message', placeholder:'e.g. Hi TTAC, I would like to know more about your apps.', help:'Typed into the chat for the visitor, ready to send.' },
        { key:'address', label:'Office address', full:true },
        { key:'mapUrl', label:'Map link', inputType:'url', full:true, help:'Paste the Share link from Google Maps.' },
        { key:'note', type:'textarea', label:'Note at the bottom', rows:2 },
      ], state.contact));
  }

  function renderSite(root){
    root.append(...head('Site settings', 'Things that apply to the whole site.'),
      card('Headline', 'text-h-one', [
        { key:'tickerWords', type:'tags', label:'Words that rotate in "___ apps."', help:'Short words read best. The first one shows when the page loads.' },
        { key:'hint', label:'Hint under the headline', full:true },
        { key:'widgetLine', label:'Line on the phone\'s widget', full:true },
      ], state.site),
      card('Video', 'film-strip', [
        { key:'videoZoom', type:'toggle', label:'Zoom the phone when a video plays',
          help:'On: the phone grows to fill the screen, turning sideways for horizontal videos, and goes back when the video ends. Off: videos play inside the app screen.' },
      ], state.site));
  }

  function renderBackup(root){
    const file = h('input', { type:'file', accept:'application/json', hidden:true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.apps || !data.site) throw new Error();
        if (!confirm('Replace everything in the editor with this backup? Nothing goes live until you publish.')) return;
        state = data; appIndex = 0; changed(); toast('Backup loaded. Check it, then publish.');
      } catch { toast('That file is not a website backup.', true); }
    });
    root.append(...head('Backup', 'Keep a copy of all the website content, or bring one back.'),
      h('section', { class:'card' },
        h('h3', {}, icon('download-simple'), 'Download'),
        h('p', { class:'f-help', style:'margin-bottom:12px' }, 'Saves what is in the editor now, including unpublished changes, as a JSON file.'),
        h('button', { class:'btn ghost', type:'button', onclick: () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type:'application/json' })),
            download: `ttac-website-${new Date().toISOString().slice(0, 10)}.json` });
          a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } }, icon('download-simple'), 'Download backup')),
      h('section', { class:'card' },
        h('h3', {}, icon('upload-simple'), 'Restore'),
        h('p', { class:'f-help', style:'margin-bottom:12px' }, 'Loads a backup into the editor. The live site changes only when you publish.'),
        h('button', { class:'btn ghost', type:'button', onclick: () => file.click() }, icon('upload-simple'), 'Choose a backup file'), file));
  }

  const TABS = { apps: renderApps, about: renderAbout, team: renderTeam, build: renderBuild, contact: renderContact, site: renderSite, backup: renderBackup };

  function renderTab(){
    const root = $('#editor');
    root.innerHTML = '';
    TABS[tab](root);
    root.scrollTop = 0;
    document.querySelectorAll('#side [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  }

  $('#side').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab; renderTab(); sendPreview();
  });

  /* ---------- Start ---------- */
  async function start(){
    $('#login').hidden = true;
    $('#shell').hidden = false;
    const res = await fetch('/api/content?fresh=1');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load the content.');
    storage = res.headers.get('X-Storage') || 'local';
    state = await res.json();
    // older content files may miss newer fields
    state.site ??= {}; state.about ??= {}; state.team ??= { members:[] }; state.build ??= { rules:[] }; state.contact ??= {};
    saved = JSON.stringify(state);
    renderTab(); refreshStatus(); hello();
  }

  if (token()) start().catch((err) => showLogin(err.message));
  else showLogin();
})();
