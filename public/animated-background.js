const AUTH_ICON_DEFS = [
  {
    type: 'mail',
    weight: 0.38,
    color: 'rgb(52, 120, 255)',
    glow: 'rgba(52, 120, 255, 0.25)',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">
  <rect x="4" y="7" width="16" height="10" rx="2"></rect>
  <path d="M4.5 8.5L12 13.8L19.5 8.5"></path>
</svg>`
  },
  {
    type: 'check',
    weight: 0.24,
    color: 'rgb(34, 197, 94)',
    glow: 'rgba(34, 197, 94, 0.22)',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">
  <circle cx="12" cy="12" r="8"></circle>
  <path d="M8.5 12.3l2.2 2.2 4.9-5"></path>
</svg>`
  },
  {
    type: 'clock',
    weight: 0.22,
    color: 'rgb(245, 158, 11)',
    glow: 'rgba(245, 158, 11, 0.22)',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">
  <circle cx="12" cy="12" r="8"></circle>
  <path d="M12 7.8v4.6l2.9 1.7"></path>
</svg>`
  },
  {
    type: 'x',
    weight: 0.16,
    color: 'rgb(239, 68, 68)',
    glow: 'rgba(239, 68, 68, 0.22)',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">
  <circle cx="12" cy="12" r="8"></circle>
  <path d="M9.4 9.4l5.2 5.2"></path>
  <path d="M14.6 9.4l-5.2 5.2"></path>
</svg>`
  }
];

let animatedBgFlashTimer = null;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pickAuthIconDef() {
  const roll = Math.random();
  let cumulative = 0;
  for (const def of AUTH_ICON_DEFS) {
    cumulative += def.weight;
    if (roll <= cumulative) {
      return def;
    }
  }
  return AUTH_ICON_DEFS[0];
}

function populateAnimatedBackgroundIcons(layer, { count, debug }) {
  if (!layer) {
    return 0;
  }
  layer.innerHTML = '';

  const opacityBump = debug ? 0.08 : 0;

  for (let index = 0; index < count; index += 1) {
    const icon = document.createElement('span');
    icon.className = 'animated-bg-icon';
    icon.setAttribute('aria-hidden', 'true');

    const def = pickAuthIconDef();
    const left = Math.random() * 100;

    const sizeRoll = Math.random();
    let sizeBase = 14;
    let durationMin = 18;
    let durationMax = 22;
    let opacityMin = 0.22;
    let opacityMax = 0.32;
    if (sizeRoll > 0.55 && sizeRoll <= 0.87) {
      sizeBase = 18;
      durationMin = 14;
      durationMax = 20;
      opacityMin = 0.24;
      opacityMax = 0.36;
    } else if (sizeRoll > 0.87) {
      sizeBase = 26;
      durationMin = 10;
      durationMax = 16;
      opacityMin = 0.28;
      opacityMax = 0.4;
    }

    const size = sizeBase + (Math.random() * 2 - 1);
    const opacityMinClamped = Math.min(opacityMin + opacityBump, 0.75);
    const opacityMaxClamped = Math.min(opacityMax + opacityBump, 0.75);
    const opacity = opacityMinClamped + Math.random() * (opacityMaxClamped - opacityMinClamped);
    const driftX = (Math.random() * 120 - 60).toFixed(1);
    const duration = durationMin + Math.random() * (durationMax - durationMin);
    const delay = -Math.random() * duration;
    const startY = 54 + Math.random() * 18;
    const endY = -(20 + Math.random() * 25);
    const rot0 = Math.random() * 16 - 8;
    const rotDelta = Math.random() * 20 - 10;
    const rot1 = Math.max(-15, Math.min(15, rot0 + rotDelta));

    icon.style.setProperty('--x', `${left.toFixed(2)}vw`);
    icon.style.setProperty('--size', `${size.toFixed(2)}px`);
    icon.style.setProperty('--opacity', opacity.toFixed(3));
    icon.style.setProperty('--driftX', `${driftX}px`);
    icon.style.setProperty('--dur', `${duration.toFixed(2)}s`);
    icon.style.setProperty('--delay', `${delay.toFixed(2)}s`);
    icon.style.setProperty('--startY', `${startY.toFixed(2)}vh`);
    icon.style.setProperty('--endY', `${endY.toFixed(2)}vh`);
    icon.style.setProperty('--rot0', `${rot0.toFixed(1)}deg`);
    icon.style.setProperty('--rot1', `${rot1.toFixed(1)}deg`);
    icon.style.setProperty('--icon-color', def.color);
    icon.style.setProperty('--icon-glow', def.glow);
    icon.dataset.icon = def.type;
    icon.innerHTML = def.svg;

    layer.appendChild(icon);
  }

  return count;
}

function getAnimatedBackgroundIconCount({ variant, debug, reducedMotion }) {
  if (variant !== 'auth') {
    return 0;
  }
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth || 1024 : 1024;
  let desiredCount = 30;
  if (viewportWidth < 520) {
    desiredCount = 14;
  } else if (viewportWidth < 900) {
    desiredCount = 22;
  }
  if (debug) {
    desiredCount = Math.max(desiredCount, 44);
  }
  return reducedMotion ? Math.min(desiredCount, 14) : desiredCount;
}

export function removeAnimatedBackgroundLayout() {
  const existing = document.querySelector('.animated-bg');
  if (existing) {
    existing.remove();
  }
  document.body?.classList.remove('auth-bg-debug-flash');
  document.body?.classList.remove('auth-bg-debug');
  document.body?.classList.remove('force-auth-animation');
  if (animatedBgFlashTimer) {
    clearTimeout(animatedBgFlashTimer);
    animatedBgFlashTimer = null;
  }
}

// Shared layout wrapper for animated backgrounds used by auth and homepage views.
export function ensureAnimatedBackgroundLayout({ variant }) {
  if (!document?.body) {
    return;
  }
  const existing = document.querySelector('.animated-bg');
  const debug = Boolean(window?.DEBUG_AUTH_BG);
  const prefersReduced = prefersReducedMotion();
  const forceAnimation = Boolean(window?.FORCE_AUTH_ANIMATION);
  const reducedMotion = prefersReduced && !forceAnimation;
  const desiredIconCount = getAnimatedBackgroundIconCount({
    variant,
    debug,
    reducedMotion
  });
  document.body.classList.toggle('force-auth-animation', forceAnimation);
  if (existing) {
    const previousVariant = existing.dataset.variant || '';
    existing.dataset.variant = variant;
    const previousCount = Number(existing.dataset.iconCount || '-1');
    const iconsLayer = existing.querySelector('.animated-bg-icons');
    if (iconsLayer && (previousVariant !== variant || previousCount !== desiredIconCount)) {
      if (desiredIconCount > 0) {
        populateAnimatedBackgroundIcons(iconsLayer, {
          count: desiredIconCount,
          debug
        });
      } else {
        iconsLayer.innerHTML = '';
      }
      existing.dataset.iconCount = String(desiredIconCount);
    }
    existing.dataset.debug = debug ? '1' : '0';
    if (debug && !existing.dataset.debugEnabled) {
      existing.dataset.debugEnabled = '1';
      // eslint-disable-next-line no-console
      console.debug('[animated-bg] debug enabled');
      document.body?.classList.add('auth-bg-debug');
      document.body.classList.add('auth-bg-debug-flash');
      if (animatedBgFlashTimer) {
        clearTimeout(animatedBgFlashTimer);
      }
      animatedBgFlashTimer = setTimeout(() => {
        document.body?.classList.remove('auth-bg-debug-flash');
        animatedBgFlashTimer = null;
      }, 5000);
    }
    if (debug && !existing.dataset.debugLogged) {
      existing.dataset.debugLogged = '1';
      const beforeAnim = getComputedStyle(existing, '::before')?.animationName || null;
      const afterAnim = getComputedStyle(existing, '::after')?.animationName || null;
      const icon = existing.querySelector('.animated-bg-icon');
      const iconAnim = icon ? getComputedStyle(icon).animationName : null;
      // eslint-disable-next-line no-console
      console.debug('[animated-bg] status', {
        variant,
        prefersReducedMotion: prefersReduced,
        forceAuthAnimation: forceAnimation,
        reducedMotionEffective: reducedMotion,
        exists: true,
        icons: desiredIconCount,
        beforeAnim,
        afterAnim,
        iconAnim
      });
    }
    return;
  }

  const container = document.createElement('div');
  container.className = 'animated-bg';
  container.setAttribute('aria-hidden', 'true');
  container.dataset.variant = variant;

  const iconsLayer = document.createElement('div');
  iconsLayer.className = 'animated-bg-icons';
  iconsLayer.id = 'animated-bg-icons';

  container.appendChild(iconsLayer);
  document.body.insertBefore(container, document.body.firstChild);

  let iconCount = 0;
  if (desiredIconCount > 0) {
    iconCount = populateAnimatedBackgroundIcons(iconsLayer, { count: desiredIconCount, debug });
  }
  container.dataset.iconCount = String(iconCount);
  container.dataset.debug = debug ? '1' : '0';

  if (debug) {
    const beforeAnim = getComputedStyle(container, '::before')?.animationName || null;
    const afterAnim = getComputedStyle(container, '::after')?.animationName || null;
    const icon = container.querySelector('.animated-bg-icon');
    const iconAnim = icon ? getComputedStyle(icon).animationName : null;
    // eslint-disable-next-line no-console
    console.debug('[animated-bg] mounted', {
      icons: iconCount,
      variant,
      prefersReducedMotion: prefersReduced,
      forceAuthAnimation: forceAnimation,
      reducedMotionEffective: reducedMotion,
      beforeAnim,
      afterAnim,
      iconAnim
    });
    document.body?.classList.add('auth-bg-debug');
    document.body.classList.add('auth-bg-debug-flash');
    if (animatedBgFlashTimer) {
      clearTimeout(animatedBgFlashTimer);
    }
    animatedBgFlashTimer = setTimeout(() => {
      document.body?.classList.remove('auth-bg-debug-flash');
      animatedBgFlashTimer = null;
    }, 5000);
  }
}
