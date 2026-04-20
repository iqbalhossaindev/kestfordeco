/* ============================================================
   KESTFORD — MAIN.JS
   Shared: canvas background, custom cursor, scroll reveals,
   nav scroll effect, mobile nav
   ============================================================ */

(function () {
  'use strict';

  /* ── CANVAS NEURAL NETWORK BACKGROUND ─────────────────── */
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, nodes, mouse = { x: -9999, y: -9999 }, clicked = { x: 0, y: 0, r: 0, active: false };
  const CYAN = '0, 210, 240';
  const NODE_COUNT = typeof window !== 'undefined' && window.innerWidth < 768 ? 50 : 90;
  const CONNECT_DIST = 130;
  const MOUSE_REPEL = 140;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    initNodes();
  }

  function initNodes() {
    nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
    }));
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);

    // Subtle vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(2,10,20,0)');
    vg.addColorStop(1, 'rgba(2,10,20,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Update + draw nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];

      // Mouse repel
      const dx = n.x - mouse.x, dy = n.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_REPEL) {
        const force = (MOUSE_REPEL - dist) / MOUSE_REPEL * 0.015;
        n.vx += (dx / dist) * force;
        n.vy += (dy / dist) * force;
      }

      // Damping + move
      n.vx *= 0.99; n.vy *= 0.99;
      n.x += n.vx; n.y += n.vy;

      // Bounce
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      n.x = Math.max(0, Math.min(W, n.x));
      n.y = Math.max(0, Math.min(H, n.y));

      // Draw node
      const nodeDist = Math.sqrt((n.x - mouse.x) ** 2 + (n.y - mouse.y) ** 2);
      const nodeAlpha = nodeDist < MOUSE_REPEL ? 0.6 : 0.25;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${CYAN}, ${nodeAlpha})`;
      ctx.fill();

      // Connections
      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        const cx = n.x - m.x, cy = n.y - m.y;
        const d = Math.sqrt(cx * cx + cy * cy);
        if (d < CONNECT_DIST) {
          const alpha = (1 - d / CONNECT_DIST) * 0.12;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.strokeStyle = `rgba(${CYAN}, ${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }

    // Click ripple
    if (clicked.active) {
      clicked.r += 4;
      const rippleAlpha = Math.max(0, 1 - clicked.r / 120);
      ctx.beginPath();
      ctx.arc(clicked.x, clicked.y, clicked.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${CYAN}, ${rippleAlpha * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (clicked.r > 120) clicked.active = false;
    }

    requestAnimationFrame(drawFrame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('touchmove', e => {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('click', e => {
    clicked.x = e.clientX;
    clicked.y = e.clientY;
    clicked.r = 0;
    clicked.active = true;
    // Add a burst of velocity to nearby nodes
    nodes.forEach(n => {
      const dx = n.x - e.clientX, dy = n.y - e.clientY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 100) {
        n.vx += (dx / d) * 1.5;
        n.vy += (dy / d) * 1.5;
      }
    });
  });

  resize();
  drawFrame();

  /* ── CUSTOM CURSOR ─────────────────────────────────────── */
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (dot && ring) {
    let ringX = 0, ringY = 0;
    document.addEventListener('mousemove', e => {
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
      ringX += (e.clientX - ringX) * 0.12;
      ringY += (e.clientY - ringY) * 0.12;
      ring.style.left = ringX + 'px';
      ring.style.top = ringY + 'px';
    });

    // Lerp ring continuously
    function lerpCursor() {
      requestAnimationFrame(lerpCursor);
    }
    lerpCursor();

    // Hover effect on interactive elements
    const interactiveEls = 'a, button, .btn, .p-arrow, .p-dot, .t-dot, .partner-logo, .service-card, .testimonial-card';
    document.querySelectorAll(interactiveEls).forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });
    // Also handle dynamically added elements
    const cursorObserver = new MutationObserver(() => {
      document.querySelectorAll(interactiveEls).forEach(el => {
        el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
        el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
      });
    });
    cursorObserver.observe(document.body, { childList: true, subtree: true });
  }

  /* ── NAVIGATION SCROLL EFFECT ──────────────────────────── */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  /* ── MOBILE NAV ────────────────────────────────────────── */
  const hamburger = document.querySelector('.nav-hamburger');
  const mobileNav = document.querySelector('.mobile-nav');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
      const spans = hamburger.querySelectorAll('span');
      if (mobileNav.classList.contains('open')) {
        spans[0].style.transform = 'translateY(6.5px) rotate(45deg)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'translateY(-6.5px) rotate(-45deg)';
      } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      }
    });
    mobileNav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => mobileNav.classList.remove('open'));
    });
  }

  /* ── SCROLL REVEAL ─────────────────────────────────────── */
  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => entry.target.classList.add('visible'), delay);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => revealObserver.observe(el));

  /* ── METRIC BARS (WHY SECTION) ─────────────────────────── */
  const metricBars = document.querySelectorAll('.metric-bar');
  if (metricBars.length) {
    const barObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.width = entry.target.dataset.width;
          barObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    metricBars.forEach(bar => barObserver.observe(bar));
  }

  /* ── COUNTER ANIMATION ─────────────────────────────────── */
  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const suffix = el.dataset.suffix || '';
    const dur = 1800;
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const counterEls = document.querySelectorAll('[data-counter]');
  if (counterEls.length) {
    const counterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counterEls.forEach(el => counterObserver.observe(el));
  }

})();
