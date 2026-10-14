// Interactions of the docs, from site/reference/docs-referencia.html. Sidebar, page index and texts are
// rendered at build time; the search index (search-<lang>.json) is fetched the first time search opens.
(function () {
  var root = document.documentElement;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------- Índice de la página ---------- */
  var heads = document.querySelectorAll('.doc h2[id], .doc h3[id]');
  var links = document.querySelectorAll('#toc-list a');
  var visible = {};
  if (window.IntersectionObserver && heads.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var firstVisible = Array.prototype.find.call(heads, function (h) { return visible[h.id]; });
      if (!firstVisible) return;
      links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + firstVisible.id); });
    }, { rootMargin: '0px 0px -70% 0px' });
    heads.forEach(function (h) { observer.observe(h); });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('.toc-inline a'); if (a) a.closest('details').open = false;
  });

  /* ---------- Tema: Sistema / Claro / Oscuro ---------- */
  var themeGroup = document.getElementById('theme-group');
  function renderTheme() {
    var pref = root.getAttribute('data-theme') || 'system';
    themeGroup.querySelectorAll('[data-theme-opt]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeOpt === pref)); });
  }
  themeGroup.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-opt]'); if (!b) return;
    var o = b.dataset.themeOpt;
    try {
      if (o === 'system') { root.removeAttribute('data-theme'); localStorage.removeItem('gb-theme'); }
      else { root.setAttribute('data-theme', o); localStorage.setItem('gb-theme', o); }
    } catch (err) {}
    renderTheme();
  });
  renderTheme();

  /* ---------- Pestañas de código (la elección se recuerda en todas las páginas) ---------- */
  // Only blocks that have the chosen tab switch: a block without it keeps its own selection.
  function setTab(tab, save) {
    document.querySelectorAll('[data-tabs]').forEach(function (block) {
      if (!block.querySelector('[data-panel="' + tab + '"]')) return;
      block.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
      block.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== tab; });
    });
    if (save) try { localStorage.setItem('gb-code-tab', tab); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tabs] [data-tab]'); if (b) setTab(b.dataset.tab, true);
  });
  try { var savedTab = localStorage.getItem('gb-code-tab'); if (savedTab) setTab(savedTab, false); } catch (e) {}

  /* Code that scrolls sideways must be reachable with the keyboard to scroll it (WCAG 2.1.1). */
  function focusableOverflow() {
    document.querySelectorAll('.code-block pre').forEach(function (p) {
      if (p.scrollWidth > p.clientWidth) p.tabIndex = 0; else p.removeAttribute('tabindex');
    });
  }
  focusableOverflow();
  if (document.fonts) document.fonts.ready.then(focusableOverflow); // Geist is wider than the fallback
  window.addEventListener('resize', focusableOverflow);
  document.addEventListener('click', function (e) { if (e.target.closest('[data-tabs] [data-tab]')) focusableOverflow(); });

  /* ---------- Copiar ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy'); if (!btn) return;
    var block = btn.closest('.code-block');
    var panel = block.querySelector('.tab-panel:not([hidden]) pre') || block.querySelector('pre');
    if (navigator.clipboard) navigator.clipboard.writeText(panel.innerText.replace(/\n$/, '') + '\n').catch(function () {});
    var label = btn.querySelector('.label');
    if (!btn._label) btn._label = label.textContent;
    btn.classList.add('copied'); label.textContent = btn.dataset.copied;
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { btn.classList.remove('copied'); label.textContent = btn._label; }, 1600);
  });

  /* ---------- Menú en móvil ---------- */
  var sidebar = document.getElementById('sidebar'), scrim = document.getElementById('scrim'), menuBtn = document.getElementById('menu-btn');
  function setNav(open) {
    sidebar.classList.toggle('open', open); scrim.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('locked', open);
    if (open) { var cur = sidebar.querySelector('[aria-current="page"]'); (cur || sidebar.querySelector('a')).focus(); }
    else menuBtn.focus();
  }
  menuBtn.addEventListener('click', function () { setNav(true); });
  scrim.addEventListener('click', function () { setNav(false); });

  /* ---------- Buscador ---------- */
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' '); }
  function score(entry, terms) {
    var t = norm(entry.page), h = norm(entry.heading), b = norm(entry.text), total = 0, all = true;
    terms.forEach(function (term) {
      var re = new RegExp('\\b' + term);
      var s = (re.test(t) ? 10 : 0) + (re.test(h) ? 5 : 0) + (re.test(b) ? 1 : 0);
      if (!s) all = false; total += s;
    });
    return all ? total * 1.5 : total * 0.5;
  }
  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (term) {
      var plain = norm(text), i = plain.indexOf(term);
      if (i < 0) return;
      var orig = text.substr(i, term.length);
      out = out.replace(esc(orig), '<mark>' + esc(orig) + '</mark>');
    });
    return out;
  }
  var dialog = document.getElementById('search'), input = document.getElementById('search-input'), results = document.getElementById('search-results');
  var index = null, loading = null, selected = 0, lastFocus = null;
  function loadIndex() {
    if (!loading) loading = fetch(dialog.dataset.index).then(function (r) { return r.json(); }).then(function (data) { index = data; renderResults(); });
    return loading;
  }
  function renderResults() {
    var q = input.value.trim();
    var terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length || !index) { results.innerHTML = ''; return; }
    var hits = index.map(function (e) { return { e: e, s: score(e, terms) }; }).filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, 12);
    if (!hits.length) { results.innerHTML = '<div class="search-empty">' + esc(dialog.dataset.empty) + ' «' + esc(q) + '». ' + esc(dialog.dataset.emptyHint) + '</div>'; return; }
    var groups = {};
    hits.forEach(function (x) { (groups[x.e.page] = groups[x.e.page] || []).push(x.e); });
    var i = 0;
    results.innerHTML = Object.keys(groups).map(function (page) {
      return '<div class="res-group" role="group" aria-label="' + esc(page) + '"><div class="res-page">' + esc(page) + '</div>' + groups[page].map(function (e) {
        var id = i++;
        var title = e.heading || e.page, sub = e.heading ? e.text : e.section;
        var icon = e.heading ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/></svg>'
                             : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
        return '<a class="res" role="option" id="res-' + id + '" href="' + esc(e.href) + '" aria-selected="' + (id === selected) + '">' + icon + '<div style="min-width:0"><b>' + highlight(title, terms) + '</b><span>' + highlight(sub, terms) + '</span></div></a>';
      }).join('') + '</div>';
    }).join('');
  }
  function move(d) {
    var opts = results.querySelectorAll('.res'); if (!opts.length) return;
    selected = (selected + d + opts.length) % opts.length;
    opts.forEach(function (o, i) { o.setAttribute('aria-selected', String(i === selected)); });
    opts[selected].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', opts[selected].id);
  }
  function openSearch() {
    selected = 0; lastFocus = document.activeElement;
    dialog.classList.add('open'); document.body.classList.add('locked');
    input.value = ''; renderResults(); input.focus();
    loadIndex();
  }
  function closeSearch() {
    dialog.classList.remove('open'); document.body.classList.remove('locked');
    // body can't take focus: blur instead, or "/" would keep typing into the hidden input.
    if (lastFocus && lastFocus !== document.body) lastFocus.focus(); else input.blur();
  }
  document.getElementById('search-btn').addEventListener('click', openSearch);
  input.addEventListener('input', function () { selected = 0; renderResults(); });
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) closeSearch();
    if (e.target.closest('.res')) closeSearch();
  });
  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { var o = results.querySelectorAll('.res')[selected]; if (o) { e.preventDefault(); closeSearch(); location.href = o.href; } }
    else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
  });
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  document.getElementById('mod-key').textContent = isMac ? '⌘' : 'Ctrl';
  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); dialog.classList.contains('open') ? closeSearch() : openSearch(); }
    else if (e.key === '/' && !typing && !dialog.classList.contains('open')) { e.preventDefault(); openSearch(); }
    else if (e.key === 'Escape') {
      if (dialog.classList.contains('open')) closeSearch();
      else if (sidebar.classList.contains('open')) setNav(false);
    }
  });
})();
