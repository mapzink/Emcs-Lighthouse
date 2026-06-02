(() => {
  const STYLE_ID = 'article-storyteller-style';

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .storytelling-ready article .story-reveal {
        opacity: 0;
        transform: translate3d(0, 64px, 0) scale(0.92);
        filter: blur(6px) saturate(0.9);
        transform-origin: center center;
        transition:
          opacity 520ms ease,
          transform 620ms cubic-bezier(0.18, 0.9, 0.2, 1.2),
          filter 620ms ease,
          color 360ms ease,
          text-shadow 360ms ease,
          box-shadow 360ms ease,
          background 360ms ease;
        will-change: opacity, transform, filter;
      }

      .storytelling-ready article .story-reveal.is-visible {
        opacity: 1;
        transform: translate3d(0, calc((1 - var(--story-focus, 0)) * 10px), 0) scale(calc(1 + (var(--story-focus, 0) * 0.055)));
        filter: blur(0);
      }

      .storytelling-ready article .story-reveal.is-active {
        color: #ffffff;
        transform: translate3d(0, -4px, 0) scale(1.055);
        text-shadow:
          0 0 18px rgba(255, 214, 150, 0.34),
          0 0 42px rgba(255, 75, 43, 0.18),
          0 18px 40px rgba(0, 0, 0, 0.36);
      }

      .storytelling-ready article blockquote.story-reveal.is-active {
        background: rgba(255, 255, 255, 0.075);
        box-shadow:
          0 18px 46px rgba(0, 0, 0, 0.28),
          0 0 32px rgba(255, 75, 43, 0.13);
      }

      @media (prefers-reduced-motion: reduce) {
        .storytelling-ready article .story-reveal,
        .storytelling-ready article .story-reveal.is-visible,
        .storytelling-ready article .story-reveal.is-active {
          opacity: 1;
          transform: none;
          filter: none;
          transition: none;
          text-shadow: none;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const article = document.querySelector('.article-container article');
  if (!article) return;

  injectStyles();
  document.documentElement.classList.add('storytelling-ready');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const blocks = Array.from(article.children).filter((element) => {
    return element.matches('p, h2, h3, h4, blockquote, ul, ol, figure, table, pre');
  });

  if (!blocks.length) return;

  blocks.forEach((block) => {
    block.classList.add('story-reveal');
  });

  if (reduceMotion.matches) {
    blocks.forEach((block) => block.classList.add('is-visible'));
    return;
  }

  const revealObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, {
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.16
      })
    : null;

  if (revealObserver) {
    blocks.forEach((block) => revealObserver.observe(block));
  } else {
    blocks.forEach((block) => block.classList.add('is-visible'));
  }

  let activeBlock = null;
  let ticking = false;

  const setActiveBlock = () => {
    ticking = false;

    const focusLine = window.innerHeight * 0.55;
    const focusRange = Math.max(220, window.innerHeight * 0.45);
    let bestBlock = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    blocks.forEach((block) => {
      const rect = block.getBoundingClientRect();
      const visible = rect.bottom > window.innerHeight * 0.12 && rect.top < window.innerHeight * 0.9;
      const blockCenter = rect.top + rect.height * 0.5;
      const distance = Math.abs(blockCenter - focusLine);
      const focus = visible ? Math.max(0, 1 - (distance / focusRange)) : 0;
      block.style.setProperty('--story-focus', focus.toFixed(3));

      if (!visible) return;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestBlock = block;
      }
    });

    if (activeBlock === bestBlock) return;
    if (activeBlock) activeBlock.classList.remove('is-active');
    activeBlock = bestBlock;
    if (activeBlock) {
      activeBlock.classList.add('is-visible', 'is-active');
    }
  };

  const requestActiveUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(setActiveBlock);
  };

  requestActiveUpdate();
  window.addEventListener('scroll', requestActiveUpdate, { passive: true });
  window.addEventListener('resize', requestActiveUpdate, { passive: true });
})();
