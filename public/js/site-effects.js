/* Global site effects: pointer light beam and carousel pointer bridge */
(function(){
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  // Create one light beam element if not present
  let lightBeam = document.getElementById('lightBeam');
  if (!lightBeam) {
    lightBeam = document.createElement('div');
    lightBeam.id = 'lightBeam';
    lightBeam.className = 'light-beam';
    lightBeam.setAttribute('aria-hidden','true');
    document.body.appendChild(lightBeam);
  }

  let framePending = 0;
  let lastX = 0, lastY = 0;

  function setLightPosition(x,y){
    lastX = x; lastY = y;
    if (framePending) return;
    framePending = requestAnimationFrame(()=>{
      framePending = 0;
      lightBeam.style.transform = `translate3d(${lastX}px, ${lastY}px, 0)`;
      lightBeam.style.opacity = '0.14';
    });
  }

  function fadeOut(){
    if (!lightBeam) return;
    lightBeam.style.opacity = '0.08';
  }

  // Local mouse movement
  window.addEventListener('mousemove', (e)=>{
    setLightPosition(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('mouseleave', fadeOut);
  window.addEventListener('mouseout', (e)=>{ if (!e.relatedTarget) fadeOut(); });

  // Listen for carousel iframe pointer messages and translate coords
  window.addEventListener('message', (event)=>{
    try{
      if (!event.data || event.origin !== window.location.origin) return;
      if (event.data.type !== 'carousel-pointer') return;
      const iframe = document.querySelector('.carousel-embed');
      if (!iframe) return;
      const rect = iframe.getBoundingClientRect();
      const scaleX = iframe.offsetWidth ? rect.width / iframe.offsetWidth : 1;
      const scaleY = iframe.offsetHeight ? rect.height / iframe.offsetHeight : 1;
      const x = rect.left + event.data.x * scaleX;
      const y = rect.top + event.data.y * scaleY;
      setLightPosition(x, y);
    }catch(err){ /* swallow */ }
  }, { passive: true });

})();
