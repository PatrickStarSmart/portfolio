(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------------------
     1. Scroll: reading-progress line + active rail link
        (one rAF-throttled handler for both)
  ------------------------------------------------------------ */
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.prepend(progress);

  const railLinks = $$('.rail-link');
  const sections  = $$('main section[id]');
  let ticking = false;

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    progress.style.transform = `scaleX(${ratio})`;

    let current = sections[0]?.id;
    const y = window.scrollY + 140;
    sections.forEach(s => { if (s.offsetTop <= y) current = s.id; });
    // The last section is short, so it never reaches the offset above;
    // force it active once the page bottoms out.
    if (max > 0 && window.scrollY >= max - 4) current = sections[sections.length - 1].id;

    railLinks.forEach(link => {
      const on = link.getAttribute('href') === '#' + current;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ------------------------------------------------------------
     2. Hero stat count-up (runs once, when the stats enter view)
  ------------------------------------------------------------ */
  function animateCount(el) {
    const target = parseInt(el.dataset.target, 10);
    if (reduceMotion) { el.textContent = target; return; }
    const duration = 900;
    const start = performance.now();
    (function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { animateCount(entry.target); io.unobserve(entry.target); }
      });
    }, { threshold: 0.4 });
    $$('.stat-num').forEach(el => io.observe(el));
  } else {
    $$('.stat-num').forEach(el => { el.textContent = el.dataset.target; });
  }

  /* ------------------------------------------------------------
     3. Docket filter: All / Live / In design
        Buttons are injected by JS, so without JS the page simply
        shows every entry and no dead controls appear.
  ------------------------------------------------------------ */
  const docket  = $('#docket');
  const entries = docket ? $$('.entry', docket) : [];

  if (entries.length) {
    const head    = $('.section-head', docket);
    const countEl = $('.num', head);

    entries.forEach(e => {
      e.dataset.status = $('.status', e)?.classList.contains('is-live') ? 'live' : 'design';
    });

    const counts = {
      all:    entries.length,
      live:   entries.filter(e => e.dataset.status === 'live').length,
      design: entries.filter(e => e.dataset.status === 'design').length,
    };
    const filters = [['all', 'All'], ['live', 'Live'], ['design', 'In design']];

    const group = document.createElement('div');
    group.className = 'filters';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Filter entries by status');

    const buttons = filters.map(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn';
      btn.dataset.filter = key;
      btn.innerHTML = `${label} <span class="count num">${counts[key]}</span>`;
      group.appendChild(btn);
      return btn;
    });
    head.after(group);

    // Status line read by screen readers when the list changes
    const live = document.createElement('p');
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    group.after(live);

    function applyFilter(key) {
      let shown = 0;
      entries.forEach(entry => {
        const match = key === 'all' || entry.dataset.status === key;
        entry.hidden = !match;
        entry.classList.remove('filter-in');
        if (match) {
          entry.classList.toggle('no-rule', shown === 0);
          if (!reduceMotion) {
            void entry.offsetWidth; // restart the animation
            entry.style.animationDelay = `${shown * 60}ms`;
            entry.classList.add('filter-in');
          }
          shown++;
        }
      });
      countEl.textContent = `${String(shown).padStart(2, '0')} ${shown === 1 ? 'entry' : 'entries'}`;
      live.textContent = `Showing ${shown} ${shown === 1 ? 'entry' : 'entries'}`;
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === key)));
    }

    buttons.forEach(b => b.addEventListener('click', () => applyFilter(b.dataset.filter)));
    applyFilter('all');
    live.textContent = ''; // don't announce the initial state
  }

  /* ------------------------------------------------------------
     4. Docket code scramble on hover (SATRIA, SITUTUR, ...)
  ------------------------------------------------------------ */
  if (canHover && !reduceMotion) {
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    entries.forEach(entry => {
      const code = $('.entry-code', entry);
      if (!code) return;
      const final = code.textContent;
      let raf;
      entry.addEventListener('mouseenter', () => {
        cancelAnimationFrame(raf);
        const start = performance.now();
        const duration = 480;
        (function tick(now) {
          const p = Math.min((now - start) / duration, 1);
          const settled = Math.floor(p * final.length);
          code.textContent = [...final]
            .map((ch, i) => (i < settled ? ch : glyphs[(Math.random() * glyphs.length) | 0]))
            .join('');
          if (p < 1) raf = requestAnimationFrame(tick);
          else code.textContent = final;
        })(start);
      });
    });
  }

  /* ------------------------------------------------------------
     5. Copy email + toast
  ------------------------------------------------------------ */
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback for http:// or older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('copy failed');
  }

  const mail = $('.contact-row a[href^="mailto:"]');
  if (mail) {
    const address = mail.getAttribute('href').replace(/^mailto:/, '');
    const wrap = document.createElement('span');
    wrap.className = 'copy-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy email address');
    mail.replaceWith(wrap);
    wrap.append(mail, btn);

    let resetTimer;
    btn.addEventListener('click', async () => {
      try {
        await copyText(address);
        btn.textContent = 'Copied';
        showToast('Copied ' + address);
      } catch {
        showToast('Could not copy. Select the address instead.');
      }
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
    });
  }

  /* ------------------------------------------------------------
     6. Keyboard: press 1–4 to jump to a section
        (matches the numbers already shown in the rail)
  ------------------------------------------------------------ */
  railLinks.forEach((link, i) => link.setAttribute('title', `Press ${i + 1}`));

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const i = parseInt(e.key, 10);
    if (i >= 1 && i <= railLinks.length) railLinks[i - 1].click();
  });
})();