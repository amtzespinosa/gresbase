// Inlined in <head> by the build: applies the saved theme before the first paint (no flash).
// Without a saved choice ("System") tokens.css follows prefers-color-scheme. The selector lives in landing.js.
(function () {
  try {
    var t = localStorage.getItem('gb-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
