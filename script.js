document.documentElement.classList.add('js');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

// Scroll progress
const progress = document.getElementById('scroll-progress');
function updateProgress() {
  if (!progress) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const value = max > 0 ? (window.scrollY / max) * 100 : 0;
  progress.style.width = `${Math.min(100, Math.max(0, value))}%`;
}
window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);
updateProgress();

// Soft cursor spotlight
const cursorGlow = document.querySelector('.cursor-glow');
if (cursorGlow && finePointer && !reduceMotion) {
  window.addEventListener('pointermove', (event) => {
    cursorGlow.style.left = `${event.clientX}px`;
    cursorGlow.style.top = `${event.clientY}px`;
    cursorGlow.style.opacity = '1';
  }, { passive: true });
  document.addEventListener('mouseleave', () => { cursorGlow.style.opacity = '0'; });
}

// Reveal sections as they enter the viewport
const revealItems = document.querySelectorAll('[data-reveal]');
if (reduceMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('visible'));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  // threshold 0: tall sections (e.g. Projects on phones) can never show 12% of
  // themselves at once, which left them invisible.
  }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
}

// Safety net: never leave a section hidden once the reader has scrolled to it,
// even if the observer misfires (some mobile browsers, very tall sections).
function revealInView() {
  revealItems.forEach((item) => {
    if (item.classList.contains('visible')) return;
    const rect = item.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) item.classList.add('visible');
  });
}
['scroll', 'resize', 'hashchange', 'load'].forEach((type) =>
  window.addEventListener(type, revealInView, { passive: true }));
revealInView();

// Active navigation state
const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
if ('IntersectionObserver' in window && sections.length) {
  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`);
    });
  }, { threshold: [0.12, 0.25, 0.5], rootMargin: '-18% 0px -62% 0px' });
  sections.forEach((section) => navObserver.observe(section));
}

// Mobile navigation
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
if (menuToggle && nav) {
  const closeMenu = () => {
    menuToggle.classList.remove('open');
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  };
  menuToggle.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    menuToggle.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  navLinks.forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('click', (event) => {
    if (!nav.classList.contains('open')) return;
    if (nav.contains(event.target) || menuToggle.contains(event.target)) return;
    closeMenu();
  });
}

// Cursor-aware glow inside cards and panels
if (finePointer) {
  document.querySelectorAll('[data-glow]').forEach((surface) => {
    surface.addEventListener('pointermove', (event) => {
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      surface.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  });
}

// Subtle perspective tilt for project cards
if (finePointer && !reduceMotion) {
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const rotateX = y * -2.2;
      const rotateY = x * 2.2;
      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-3px)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}

// ---- Charts: data-driven geometry, then reveal on scroll ----
// Month math so the donut and timeline stay correct as time passes.
const monthPos = (value, isEnd) => {
  if (value === 'now') {
    const d = new Date();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getFullYear() * 12 + d.getMonth() + (d.getDate() - 1) / daysInMonth;
  }
  const [y, m] = value.split('-').map(Number);
  return y * 12 + (m - 1) + (isEnd ? 1 : 0);
};

// 50 dots for the privacy-automation card
document.querySelectorAll('[data-dots]').forEach((box) => {
  const n = Number(box.dataset.dots) || 0;
  for (let i = 0; i < n; i += 1) {
    const dot = document.createElement('i');
    dot.style.setProperty('--i', i);
    box.appendChild(dot);
  }
});

// Donut: share of career by organization
const segs = [...document.querySelectorAll('.seg[data-start]')];
if (segs.length) {
  const spans = segs.map((seg) => monthPos(seg.dataset.end, true) - monthPos(seg.dataset.start, false));
  const total = spans.reduce((a, b) => a + b, 0);
  const gap = 1.2;
  let used = 0;
  segs.forEach((seg, i) => {
    const pct = (spans[i] / total) * 100;
    const len = Math.max(pct - gap, 0.1);
    seg.style.setProperty('--len', len.toFixed(2));
    seg.style.setProperty('--rest', (100 - len).toFixed(2));
    seg.style.strokeDashoffset = (-used).toFixed(2);
    seg.style.setProperty('--d', `${i * 0.18}s`);
    used += pct;
    const label = document.querySelector(`[data-dur="${seg.dataset.key}"]`);
    if (label) {
      const years = spans[i] / 12;
      const nearest = Math.round(years);
      label.textContent = `${Math.abs(years - nearest) < 0.1 ? nearest : years.toFixed(1)} yrs`;
    }
  });
  const totalEl = document.querySelector('[data-years-total]');
  if (totalEl) {
    const wholeYears = Math.floor(total / 12);
    totalEl.dataset.value = String(wholeYears);
    totalEl.textContent = String(wholeYears);
  }
}

// Timeline: position each bar from its dates
document.querySelectorAll('.gantt').forEach((gantt) => {
  const axisStart = monthPos(gantt.dataset.axisStart, false);
  const span = monthPos(gantt.dataset.axisEnd, false) - axisStart;
  gantt.querySelectorAll('.gantt-bar').forEach((bar, i) => {
    const start = monthPos(bar.dataset.start, false);
    const end = monthPos(bar.dataset.end, true);
    bar.style.setProperty('--l', `${(((start - axisStart) / span) * 100).toFixed(2)}%`);
    bar.style.setProperty('--w', `${(((end - start) / span) * 100).toFixed(2)}%`);
    bar.style.setProperty('--d', `${0.1 + i * 0.22}s`);
  });
});

// Play each chart once when it scrolls into view
const chartItems = document.querySelectorAll('[data-chart]');
if (reduceMotion || !('IntersectionObserver' in window)) {
  chartItems.forEach((item) => item.classList.add('in'));
} else {
  const chartObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
  chartItems.forEach((item) => chartObserver.observe(item));
}

// Animate impact numbers once
const counters = document.querySelectorAll('[data-counter]');
function animateCounter(element) {
  const target = Number(element.dataset.value || 0);
  const suffix = element.dataset.suffix || '';
  if (reduceMotion || !target) {
    element.textContent = `${target}${suffix}`;
    return;
  }
  const duration = 900;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${Math.round(target * eased)}${suffix}`;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
if ('IntersectionObserver' in window && !reduceMotion) {
  const counterObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateCounter(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.65 });
  counters.forEach((counter) => counterObserver.observe(counter));
} else {
  counters.forEach(animateCounter);
}

// Gentle magnetic movement on prominent buttons
if (finePointer && !reduceMotion) {
  document.querySelectorAll('.magnetic').forEach((button) => {
    button.addEventListener('pointermove', (event) => {
      const rect = button.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      button.style.transform = `translate(${dx * 0.06}px, ${dy * 0.08}px) translateY(-2px)`;
    });
    button.addEventListener('pointerleave', () => {
      button.style.transform = '';
    });
  });
}


// Hero "x-ray" demo: cycles through three texts with real scrubpii output
(() => {
  const box = document.getElementById('xray');
  if (!box) return;
  const tabs = [...box.querySelectorAll('[role="tab"]')];
  const scenes = [...box.querySelectorAll('.xs')];
  const count = box.querySelector('.xray-count');
  const DWELL = 3600;
  let current = 0, timer = null, started = 0, left = DWELL, visible = false, hovered = false;

  function show(n, animate) {
    current = n;
    scenes.forEach((s) => s.classList.remove('is-on', 'is-done', 'is-scan'));
    tabs.forEach((t, i) => {
      t.setAttribute('aria-selected', String(i === n));
      t.tabIndex = i === n ? 0 : -1;
      const bar = t.querySelector('i');           // restart the progress fill
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
    const on = scenes.filter((s) => s.dataset.n === String(n));
    const src = on[0];
    if (count && src) count.innerHTML = `<b>${src.dataset.found}</b> found · <b>${src.dataset.rules}</b> double-checked by checksum and format rules`;
    on.forEach((s) => s.classList.add('is-on'));
    if (!animate) { on.forEach((s) => s.classList.add('is-done')); return; }
    box.classList.remove('scanning');
    setTimeout(() => {
      if (current !== n) return;
      void box.offsetWidth;
      box.classList.add('scanning');
      on.forEach((s) => s.classList.add('is-scan'));
    }, 380);
  }

  function schedule(ms) {
    clearTimeout(timer);
    started = Date.now(); left = ms;
    timer = setTimeout(() => { show((current + 1) % tabs.length, true); schedule(DWELL); }, ms);
  }
  function pause() {
    if (!box.classList.contains('auto') || box.classList.contains('paused')) return;
    clearTimeout(timer); left = Math.max(300, left - (Date.now() - started));
    box.classList.add('paused');
  }
  function resume() {
    if (!box.classList.contains('auto') || hovered || !visible || document.hidden) return;
    if (box.classList.contains('paused')) { box.classList.remove('paused'); schedule(left); }
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { show(i, !reduceMotion); if (box.classList.contains('auto')) { box.classList.remove('paused'); schedule(DWELL); } });
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      tabs[j].focus(); tabs[j].click();
    });
  });

  if (reduceMotion) { show(0, false); return; }
  box.style.setProperty('--dwell', `${DWELL}ms`);
  box.addEventListener('mouseenter', () => { hovered = true; pause(); });
  box.addEventListener('mouseleave', () => { hovered = false; resume(); });
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  let first = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) { pause(); return; }
    if (first) { first = false; box.classList.add('auto'); show(0, true); schedule(DWELL); }
    else resume();
  }, { threshold: 0.35 });
  io.observe(box);
})();
