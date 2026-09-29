(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return;

  const EXIT_MS = 140;
  const REVEAL_MS = 180;
  const STYLE_ID = 'page-transition-style';
  const OVERLAY_ID = 'page-transition-overlay';
  let isNavigating = false;
  let resizeFrame = 0;
  let headerElement = null;

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        --transition-blue: #020411;
        --transition-blue-soft: #0a0e27;
        --transition-header-offset: 128px;
        position: fixed;
        inset: var(--transition-header-offset) 0 0 0;
        z-index: 2147483646;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        background: linear-gradient(135deg, rgba(8, 12, 25, 0.96), rgba(2, 4, 17, 0.72));
        transition: opacity 140ms ease, visibility 0s linear 140ms;
      }

      #${OVERLAY_ID}.is-covering,
      #${OVERLAY_ID}.is-revealing {
        opacity: 1;
        visibility: visible;
      }

      #${OVERLAY_ID}.is-covering {
        transition: opacity 140ms ease, visibility 0s;
      }

      #${OVERLAY_ID}.is-revealing {
        animation: pageTransitionFade ${REVEAL_MS}ms ease forwards;
      }

      .page-transitioning body {
        cursor: progress;
      }

      @keyframes pageTransitionFade {
        0% { opacity: 1; }
        100% { opacity: 0; visibility: hidden; }
      }

      @media (max-width: 768px) {
        #${OVERLAY_ID} {
          --transition-header-offset: 92px;
        }
      }

      @media (max-width: 480px) {
        #${OVERLAY_ID} {
          --transition-header-offset: 74px;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const getOverlay = () => {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = `
        <div class="page-transition__veil"></div>
        <div class="page-transition__beam"></div>
        <div class="page-transition__core"></div>
      `;
      document.body.appendChild(overlay);
      overlay.pageTransitionVeil = overlay.querySelector('.page-transition__veil');
    }
    updateHeaderOffset(overlay);
    return overlay;
  };

  const updateHeaderOffset = (overlay = document.getElementById(OVERLAY_ID)) => {
    if (!overlay) return;

    headerElement = headerElement || document.querySelector('.site-header');
    const header = headerElement;
    if (!header) {
      overlay.style.setProperty('--transition-header-offset', '0px');
      return;
    }

    const headerStyle = window.getComputedStyle(header);
    const keepsHeaderPinned = headerStyle.position === 'fixed' || headerStyle.position === 'sticky';
    const headerBottom = keepsHeaderPinned ? Math.max(0, Math.ceil(header.getBoundingClientRect().bottom)) : 0;
    overlay.style.setProperty('--transition-header-offset', `${headerBottom}px`);
  };

  const startSimpleFade = (overlay) => {
    overlay.classList.add('is-revealing');
  };

  const isModifiedClick = (event) => (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );

  const shouldTransition = (anchor) => {
    if (!anchor) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.dataset.noTransition !== undefined) return false;

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const samePath = url.pathname === window.location.pathname && url.search === window.location.search;
    if (samePath && url.hash) return false;

    return url.href !== window.location.href;
  };

  const resetOverlay = (overlay) => {
    overlay.classList.remove('is-covering', 'is-revealing');
    if (typeof overlay.getAnimations === 'function') {
      overlay.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    }
    overlay.offsetHeight;
  };

  const playExit = (href) => {
    if (isNavigating) return;
    isNavigating = true;

    const overlay = getOverlay();
    updateHeaderOffset(overlay);
    resetOverlay(overlay);
    document.documentElement.classList.add('page-transitioning');
    overlay.classList.add('is-covering');

    window.setTimeout(() => {
      window.location.href = href;
    }, EXIT_MS);
  };

  const playEntry = () => {
    const overlay = getOverlay();
    updateHeaderOffset(overlay);
    resetOverlay(overlay);
    document.documentElement.classList.add('page-transitioning');
    startSimpleFade(overlay);

    window.setTimeout(() => {
      resetOverlay(overlay);
      document.documentElement.classList.remove('page-transitioning');
    }, REVEAL_MS);
  };

  injectStyles();

  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      updateHeaderOffset();
    });
  }, { passive: true });

  window.addEventListener('pageshow', () => {
    isNavigating = false;
    playEntry();
  });

  document.addEventListener('click', (event) => {
    if (isModifiedClick(event)) return;

    const anchor = event.target.closest('a[href]');
    if (!shouldTransition(anchor)) return;

    event.preventDefault();
    playExit(anchor.href);
  });
})();
