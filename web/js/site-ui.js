(function () {
  'use strict';

  function markLogoState(img) {
    const media = img.closest('.site-logo-media');
    const lockup = img.closest('[data-brand-lockup]') || img.closest('.nav-logo');
    if (!media || !lockup) return;

    function handleLoaded() {
      if (img.naturalWidth > 0) {
        lockup.classList.add('has-custom-logo');
      }
    }

    function handleError() {
      lockup.classList.remove('has-custom-logo');
    }

    img.addEventListener('load', handleLoaded);
    img.addEventListener('error', handleError);

    if (img.complete) {
      if (img.naturalWidth > 0) handleLoaded();
      else handleError();
    }
  }

  document.querySelectorAll('[data-site-logo]').forEach(markLogoState);

  document.querySelectorAll('[data-current-year]').forEach(function (node) {
    node.textContent = new Date().getFullYear();
  });

  const loader = document.getElementById('site-loader');

  const finishLoading = function () {
    document.body.classList.remove('site-loading');
    if (!loader) return;
    loader.classList.add('is-loaded');
    window.setTimeout(function () {
      loader.remove();
    }, 500);
  };

  window.addEventListener('load', function () {
    window.setTimeout(finishLoading, 500);
  });

  window.setTimeout(finishLoading, 3500);
})();
