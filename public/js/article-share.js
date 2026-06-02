(function () {
  function getShareData() {
    return {
      url: window.location.href,
      title: (document.querySelector('.article-hero h1')?.textContent || document.title || 'The Lighthouse').trim(),
    };
  }

  function getShareUrl(type, url, title) {
    if (type === 'x') {
      const shareUrl = new URL('https://twitter.com/intent/tweet');
      shareUrl.searchParams.set('url', url);
      shareUrl.searchParams.set('text', title);
      return shareUrl.href;
    }

    if (type === 'facebook') {
      const shareUrl = new URL('https://www.facebook.com/sharer/sharer.php');
      shareUrl.searchParams.set('u', url);
      return shareUrl.href;
    }

    return url;
  }

  async function copyToClipboard(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const input = document.createElement('input');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  function hydrateShareLinks() {
    const { url, title } = getShareData();
    document.querySelectorAll('a[data-share]').forEach((link) => {
      link.href = getShareUrl(link.dataset.share, url, title);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  function setShareStatus(message) {
    const status = document.querySelector('[data-share-status]');
    if (!status) return;
    status.textContent = message;
    if (message) {
      setTimeout(() => {
        status.textContent = '';
      }, 2400);
    }
  }

  document.addEventListener('click', async (event) => {
    const control = event.target.closest('[data-share]');
    if (!control) return;

    event.preventDefault();

    const { url, title } = getShareData();
    const shareType = control.dataset.share;

    if (shareType === 'x') {
      window.open(getShareUrl('x', url, title), '_blank', 'noopener,noreferrer,width=680,height=520');
      return;
    }

    if (shareType === 'facebook') {
      window.open(getShareUrl('facebook', url, title), '_blank', 'noopener,noreferrer,width=680,height=520');
      return;
    }

    if (shareType === 'copy') {
      try {
        await copyToClipboard(url);
        setShareStatus('Link copied');
      } catch {
        setShareStatus(url);
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateShareLinks);
  } else {
    hydrateShareLinks();
  }
})();
