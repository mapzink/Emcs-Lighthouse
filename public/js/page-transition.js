(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return;

  const EXIT_MS = 220;
  const SWEEP_MS = 1240;
  const FADE_MS = 320;
  const REVEAL_MS = SWEEP_MS + FADE_MS;
  const STYLE_ID = 'page-transition-style';
  const OVERLAY_ID = 'page-transition-overlay';
  let isNavigating = false;
  let sweepFrame = null;

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @property --sweep-angle {
        syntax: '<angle>';
        inherits: true;
        initial-value: 0deg;
      }

      #${OVERLAY_ID} {
        --transition-blue: #020411;
        --transition-blue-soft: #0a0e27;
        --transition-accent: var(--accent, #ff4b2b);
        --transition-header-offset: 128px;
        --sweep-angle: 0deg;
        position: fixed;
        left: 0;
        right: 0;
        top: var(--transition-header-offset);
        bottom: 0;
        z-index: 2147483646;
        pointer-events: none;
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        isolation: isolate;
        transition: opacity 180ms ease, visibility 0s linear 180ms;
      }

      #${OVERLAY_ID} .page-transition__veil,
      #${OVERLAY_ID} .page-transition__beam,
      #${OVERLAY_ID} .page-transition__core {
        position: absolute;
        left: 50%;
        top: 50%;
        pointer-events: none;
      }

      #${OVERLAY_ID} .page-transition__veil {
        inset: 0;
        left: 0;
        top: 0;
        background:
          radial-gradient(circle at 50% 50%, rgba(255, 75, 43, 0.08), transparent 15rem),
          linear-gradient(135deg, var(--transition-blue-soft) 0%, var(--transition-blue) 58%, #01020a 100%);
        -webkit-mask-image: none;
        mask-image: none;
      }

      #${OVERLAY_ID} .page-transition__beam {
        width: 220vmax;
        height: 220vmax;
        transform: translate(-50%, -50%) rotate(var(--sweep-angle));
        border-radius: 50%;
        opacity: 0;
        background:
          conic-gradient(
            from 0deg,
            rgba(255, 242, 205, 0.78) 0deg,
            rgba(255, 160, 96, 0.34) 4deg,
            rgba(255, 75, 43, 0.03) 10deg,
            transparent 16deg 344deg,
            rgba(255, 75, 43, 0.03) 350deg,
            rgba(255, 160, 96, 0.34) 356deg,
            rgba(255, 242, 205, 0.78) 360deg
          );
        filter: blur(10px);
        mix-blend-mode: screen;
        transform-origin: center;
      }

      #${OVERLAY_ID} .page-transition__beam::before,
      #${OVERLAY_ID} .page-transition__beam::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background:
          conic-gradient(
            from 0deg,
            rgba(255, 248, 224, 0.86) 0deg,
            rgba(255, 180, 110, 0.28) 4deg,
            rgba(255, 75, 43, 0.02) 10deg,
            transparent 16deg 344deg,
            rgba(255, 75, 43, 0.02) 350deg,
            rgba(255, 180, 110, 0.28) 356deg,
            rgba(255, 248, 224, 0.86) 360deg
          );
      }

      #${OVERLAY_ID} .page-transition__beam::before {
        filter: blur(24px);
        opacity: 0.86;
      }

      #${OVERLAY_ID} .page-transition__beam::after {
        filter: blur(3px);
        opacity: 0.72;
      }

      #${OVERLAY_ID} .page-transition__core {
        width: 1.05rem;
        height: 1.05rem;
        transform: translate(-50%, -50%) scale(0.88);
        border-radius: 50%;
        background: var(--transition-accent);
        box-shadow:
          0 0 0 0.38rem rgba(255, 75, 43, 0.13),
          0 0 1.7rem rgba(255, 75, 43, 0.62);
        opacity: 0;
      }

      #${OVERLAY_ID}.is-covering,
      #${OVERLAY_ID}.is-revealing {
        opacity: 1;
        visibility: visible;
        transition: opacity 180ms ease, visibility 0s;
      }

      #${OVERLAY_ID}.is-covering .page-transition__veil {
        -webkit-mask-image: none;
        mask-image: none;
      }

      #${OVERLAY_ID}.is-covering .page-transition__core {
        opacity: 1;
        transition: opacity 120ms ease, transform 160ms ease;
        transform: translate(-50%, -50%) scale(1);
      }

      #${OVERLAY_ID}.is-revealing {
        animation: pageTransitionFade ${REVEAL_MS}ms ease forwards;
      }

      #${OVERLAY_ID}.is-revealing .page-transition__veil {
        will-change: mask-image, -webkit-mask-image;
      }

      #${OVERLAY_ID}.is-revealing .page-transition__beam {
        opacity: 1;
        animation: pageTransitionBeamBloom ${REVEAL_MS}ms ease forwards;
      }

      #${OVERLAY_ID}.is-revealing .page-transition__core {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        animation: pageTransitionCore ${REVEAL_MS}ms ease forwards;
      }

      .page-transitioning body {
        cursor: progress;
      }

      @keyframes pageTransitionBeamBloom {
        0% { opacity: 0; filter: blur(16px); }
        8% { opacity: 1; filter: blur(10px); }
        79% { opacity: 1; filter: blur(10px); }
        80% { opacity: 1; filter: blur(10px); }
        100% { opacity: 0; filter: blur(22px); }
      }

      @keyframes pageTransitionCore {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.74); }
        8% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        79% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.82); }
      }

      @keyframes pageTransitionFade {
        0% { opacity: 1; }
        79% { opacity: 1; }
        80% { opacity: 1; }
        100% { opacity: 0; visibility: hidden; }
      }

      @supports not ((mask-image: conic-gradient(#000, transparent)) or (-webkit-mask-image: conic-gradient(#000, transparent))) {
        #${OVERLAY_ID}.is-revealing .page-transition__veil {
          animation: pageTransitionFallbackVeil ${REVEAL_MS}ms ease forwards;
        }

        @keyframes pageTransitionFallbackVeil {
          0% { opacity: 1; }
          79% { opacity: 0.18; }
          80% { opacity: 0.18; }
          100% { opacity: 0; }
        }
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
    }
    updateHeaderOffset(overlay);
    return overlay;
  };

  const updateHeaderOffset = (overlay = document.getElementById(OVERLAY_ID)) => {
    if (!overlay) return;

    const header = document.querySelector('.site-header');
    if (!header) {
      overlay.style.setProperty('--transition-header-offset', '0px');
      return;
    }

    const headerStyle = window.getComputedStyle(header);
    const keepsHeaderPinned = headerStyle.position === 'fixed' || headerStyle.position === 'sticky';
    const headerBottom = keepsHeaderPinned ? Math.max(0, Math.ceil(header.getBoundingClientRect().bottom)) : 0;
    overlay.style.setProperty('--transition-header-offset', `${headerBottom}px`);
  };

  const easeSweep = (progress) => -(Math.cos(Math.PI * progress) - 1) / 2;

  const setSweepMask = (overlay, angle) => {
    const veil = overlay.querySelector('.page-transition__veil');
    if (!veil) return;

    const clampedAngle = Math.max(0, Math.min(360, angle));
    const remaining = Math.max(0, 360 - clampedAngle);
    overlay.style.setProperty('--sweep-angle', `${clampedAngle}deg`);

    if (remaining <= 0.25) {
      veil.style.webkitMaskImage = 'linear-gradient(transparent, transparent)';
      veil.style.maskImage = 'linear-gradient(transparent, transparent)';
      return;
    }

    const edge = Math.min(36, Math.max(12, remaining / 2));
    const gradient = remaining <= edge * 2 + 4
      ? `conic-gradient(from ${clampedAngle}deg at 50% 50%,
          transparent 0deg,
          rgba(0, 0, 0, 0.46) ${remaining / 2}deg,
          transparent ${remaining}deg,
          transparent 360deg)`
      : `conic-gradient(from ${clampedAngle}deg at 50% 50%,
          transparent 0deg,
          rgba(0, 0, 0, 0.16) ${edge * 0.25}deg,
          rgba(0, 0, 0, 0.72) ${edge * 0.58}deg,
          #000 ${edge}deg,
          #000 ${remaining - edge}deg,
          rgba(0, 0, 0, 0.72) ${remaining - edge * 0.58}deg,
          rgba(0, 0, 0, 0.16) ${remaining - edge * 0.25}deg,
          transparent ${remaining}deg,
          transparent 360deg)`;

    veil.style.webkitMaskImage = gradient;
    veil.style.maskImage = gradient;
  };

  const animateSweep = (overlay) => {
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / SWEEP_MS);
      setSweepMask(overlay, easeSweep(progress) * 360);

      if (progress < 1) {
        sweepFrame = window.requestAnimationFrame(tick);
      } else {
        sweepFrame = null;
        setSweepMask(overlay, 360);
      }
    };

    sweepFrame = window.requestAnimationFrame(tick);
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
    if (sweepFrame !== null) {
      window.cancelAnimationFrame(sweepFrame);
      sweepFrame = null;
    }

    overlay.classList.remove('is-covering', 'is-revealing');
    if (typeof overlay.getAnimations === 'function') {
      overlay.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    }
    overlay.style.setProperty('--sweep-angle', '0deg');
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
    setSweepMask(overlay, 0);
    document.documentElement.classList.add('page-transitioning');
    overlay.classList.add('is-revealing');
    animateSweep(overlay);

    window.setTimeout(() => {
      resetOverlay(overlay);
      document.documentElement.classList.remove('page-transitioning');
    }, REVEAL_MS);
  };

  injectStyles();

  window.addEventListener('resize', () => updateHeaderOffset(), { passive: true });

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
