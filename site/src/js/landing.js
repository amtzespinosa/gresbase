// Interactions of the landing, from site/reference/landing-referencia.html. The markup is rendered at
// build time; this only runs the carousel, tabs, theme selector and copy. Texts come from data-* attributes.
(function () {
  var state = { tab: 'demo', slide: 0, hover: false, focus: false };
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var root = document.documentElement;
  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ---------- Carrusel ---------- */
  var screens = document.getElementById('screens');
  var captions = JSON.parse(screens.dataset.captions);
  var dotLabels = JSON.parse(screens.dataset.dots);
  var caption = document.getElementById('caption');
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function renderSlide(animateCaption) {
    document.querySelectorAll('.slide').forEach(function (s, i) {
      s.classList.toggle('on', i === state.slide);
      s.setAttribute('aria-hidden', String(i !== state.slide));
    });
    if (animateCaption && !reduceMQ.matches) {
      caption.classList.add('fade');
      setTimeout(function () { caption.textContent = captions[state.slide]; caption.classList.remove('fade'); }, 350);
    } else {
      caption.textContent = captions[state.slide];
    }
    /* Se recrean los puntos para que la barra de progreso empiece de cero */
    document.getElementById('dots').innerHTML = dotLabels.map(function (d, i) {
      return '<button type="button" class="dot" data-i="' + i + '" aria-label="' + esc(d) + '" aria-pressed="' + (i === state.slide) + '"><span></span></button>';
    }).join('');
  }
  function go(i) { state.slide = (i + 3) % 3; renderSlide(true); }
  document.getElementById('dots').addEventListener('click', function (e) {
    var b = e.target.closest('.dot'); if (b) go(Number(b.dataset.i));
  });
  document.getElementById('prev').addEventListener('click', function () { go(state.slide - 1); });
  document.getElementById('next').addEventListener('click', function () { go(state.slide + 1); });
  /* Avance automático: cuando el punto activo termina de rellenarse (sin avance con reducir movimiento) */
  document.getElementById('dots').addEventListener('animationend', function (e) {
    if (e.animationName === 'fill' && !reduceMQ.matches) go(state.slide + 1);
  });
  function setPaused() { screens.classList.toggle('paused', state.hover || state.focus || document.hidden); }
  screens.addEventListener('mouseenter', function () { state.hover = true; setPaused(); });
  screens.addEventListener('mouseleave', function () { state.hover = false; setPaused(); });
  screens.addEventListener('focusin', function () { state.focus = true; setPaused(); });
  screens.addEventListener('focusout', function (e) { if (!screens.contains(e.relatedTarget)) { state.focus = false; setPaused(); } });
  document.addEventListener('visibilitychange', setPaused);
  screens.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(state.slide - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(state.slide + 1); }
  });
  /* Deslizar con el dedo */
  var startX = null;
  var stageEl = document.getElementById('stage');
  stageEl.addEventListener('pointerdown', function (e) { startX = e.clientX; });
  stageEl.addEventListener('pointerup', function (e) {
    if (startX === null) return;
    var dx = e.clientX - startX; startX = null;
    if (Math.abs(dx) > 40) go(state.slide + (dx < 0 ? 1 : -1));
  });
  stageEl.addEventListener('pointercancel', function () { startX = null; });

  /* Escala de la captura al ancho disponible */
  var stage = document.getElementById('stage');
  function fit() { stage.style.setProperty('--s', Math.min(1, stage.clientWidth / 980)); }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else window.addEventListener('resize', fit);
  fit();

  /* ---------- Tema ---------- */
  var themeGroup = document.getElementById('theme-group');
  function themePref() { return root.getAttribute('data-theme') || 'system'; }
  function renderTheme() {
    var dark = isDark(), pref = themePref();
    themeGroup.querySelectorAll('[data-theme-opt]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeOpt === pref));
    });
    var third = document.querySelector('.slide[data-slide="2"] .shot');
    if (third) { third.classList.toggle('t-light', dark); third.classList.toggle('t-dark', !dark); }
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
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTheme);

  /* ---------- Pestañas y copiar ---------- */
  document.querySelector('.card-head .seg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    state.tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(function (t) {
      var on = t.dataset.tab === state.tab;
      t.setAttribute('aria-selected', String(on));
      document.getElementById('code-' + t.dataset.tab).hidden = !on;
      document.getElementById('steps-' + t.dataset.tab).hidden = !on;
    });
  });
  var copyBtn = document.getElementById('copy-btn');
  var copyLabel = copyBtn.querySelector('.label');
  var copyText = copyLabel.textContent;
  copyBtn.addEventListener('click', function () {
    var cb = this;
    var txt = document.getElementById('code-' + state.tab).dataset.copy;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    cb.classList.add('copied'); copyLabel.textContent = cb.dataset.copied;
    clearTimeout(cb._t);
    cb._t = setTimeout(function () { cb.classList.remove('copied'); copyLabel.textContent = copyText; }, 1600);
  });

  renderTheme();
})();
