
/* ============================================================
   KESTFORD — HOME.JS
   Portfolio slider, testimonial slider, partner marquee,
   form handling, typewriter effect
   ============================================================ */

(function () {
  'use strict';

  const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'];

  function imageExists(src, timeout = 1800) {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        resolve(result);
      }

      const timer = window.setTimeout(() => finish(null), timeout);
      img.onload = () => {
        window.clearTimeout(timer);
        finish(src);
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        finish(null);
      };
      img.src = src;
    });
  }

  function buildSequentialCandidates(folders, prefix, index) {
    const candidates = [];
    folders.forEach((folder) => {
      IMAGE_EXTENSIONS.forEach((ext) => {
        candidates.push(`${folder}/${prefix}${index}.${ext}`);
      });
    });
    return candidates;
  }

  async function firstExistingImage(candidates) {
    return new Promise((resolve) => {
      if (!candidates.length) {
        resolve(null);
        return;
      }

      let pending = candidates.length;
      let settled = false;

      candidates.forEach((src) => {
        imageExists(src).then((found) => {
          pending -= 1;
          if (found && !settled) {
            settled = true;
            resolve(found);
            return;
          }

          if (!pending && !settled) {
            settled = true;
            resolve(null);
          }
        });
      });
    });
  }

  async function detectSequentialImages(options) {
    const {
      folders,
      prefix,
      maxItems,
      startAt = 1,
      stopAfterMisses = 3,
    } = options;

    const results = [];
    let misses = 0;

    for (let i = startAt; i <= maxItems; i += 1) {
      const candidates = buildSequentialCandidates(folders, prefix, i);
      const found = await firstExistingImage(candidates);

      if (found) {
        results.push(found);
        misses = 0;
      } else {
        misses += 1;
        if (results.length && misses >= stopAfterMisses) {
          break;
        }
      }
    }

    return results;
  }

  /* ── HERO HEADLINE (ROTATING COPY) ───────────────────── */
  const heroPrefix = document.getElementById('hero-prefix');
  const typeTarget = document.getElementById('hero-typewriter');
  const heroDescription = document.getElementById('hero-description');
  if (typeTarget && heroDescription) {
    const heroItems = [
      {
        title: 'Web Design',
        description: 'Premium web design that helps your business look credible, load fast, and turn visitors into real customers.',
      },
      {
        title: 'Digital Marketing',
        description: 'Smart digital marketing campaigns that help your brand reach the right audience, generate quality leads, and grow with confidence.',
      },
      {
        title: 'Graphic Design',
        description: 'Professional graphic design for social media, ads, and brand materials that make your business look polished, trusted, and memorable.',
      },
      {
        title: 'Cyber Security',
        description: 'Reliable cyber security solutions that protect your website, systems, and digital assets from modern online threats.',
      },
    ];

    const wait = (delay) => new Promise((resolve) => window.setTimeout(resolve, delay));

    function typeText(node, text, speed) {
      return new Promise((resolve) => {
        node.textContent = '';
        let index = 0;

        function tick() {
          node.textContent = text.slice(0, index + 1);
          index += 1;
          if (index < text.length) {
            window.setTimeout(tick, speed);
          } else {
            resolve();
          }
        }

        if (!text) {
          resolve();
          return;
        }

        tick();
      });
    }

    function deleteText(node, speed) {
      return new Promise((resolve) => {
        let text = node.textContent || '';

        function tick() {
          if (!text.length) {
            node.textContent = '';
            resolve();
            return;
          }

          text = text.slice(0, -1);
          node.textContent = text;
          window.setTimeout(tick, speed);
        }

        tick();
      });
    }

    async function runHeroTypewriter() {
      let currentHeroIndex = 0;

      if (heroPrefix) {
        heroPrefix.textContent = 'We Create';
      }

      while (true) {
        const item = heroItems[currentHeroIndex];

        typeTarget.classList.add('is-typing');
        await typeText(typeTarget, item.title, 58);
        await wait(120);
        await typeText(heroDescription, item.description, 18);
        typeTarget.classList.remove('is-typing');

        await wait(1700);

        typeTarget.classList.add('is-typing');
        await deleteText(heroDescription, 10);
        await wait(60);
        await deleteText(typeTarget, 24);
        typeTarget.classList.remove('is-typing');

        currentHeroIndex = (currentHeroIndex + 1) % heroItems.length;
      }
    }

    heroDescription.textContent = '';
    typeTarget.textContent = '';
    runHeroTypewriter();
  }

  /* ── PORTFOLIO SLIDER ──────────────────────────────────── */
  const track = document.getElementById('portfolio-track');
  const dotsWrap = document.getElementById('portfolio-dots');
  const prevBtn = document.getElementById('p-prev');
  const nextBtn = document.getElementById('p-next');
  if (track) {
    const configuredProjects = Array.isArray(window.KESTFORD_PROJECTS) ? window.KESTFORD_PROJECTS : [];
    const metadataByFile = new Map(configuredProjects.map((item) => [String(item.file || '').toLowerCase(), item]));

    let current = 0;
    let autoSlide;
    let projects = [];

    function emptyPortfolioState() {
      track.innerHTML = `
        <div class="portfolio-empty">
          <strong>No project screenshots found yet</strong>
          <p>Upload files like <code>projects/project1.png</code>, <code>projects/project2.png</code>, <code>projects/project3.png</code>.</p>
        </div>`;
      if (dotsWrap) dotsWrap.innerHTML = '';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
    }

    function buildSlides() {
      track.innerHTML = '';
      if (dotsWrap) dotsWrap.innerHTML = '';

      if (!projects.length) {
        emptyPortfolioState();
        return;
      }

      if (prevBtn) prevBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = '';

      projects.forEach((p, i) => {
        const slide = document.createElement('div');
        slide.className = 'portfolio-slide';

        const img = document.createElement('img');
        img.alt = p.title;
        img.loading = 'lazy';
        img.src = p.src;

        const caption = document.createElement('div');
        caption.className = 'slide-caption';
        caption.innerHTML = `<h3>${p.title}</h3><p>${p.tag}</p>`;

        slide.appendChild(img);
        slide.appendChild(caption);
        track.appendChild(slide);

        if (dotsWrap) {
          const dot = document.createElement('div');
          dot.className = 'p-dot' + (i === 0 ? ' active' : '');
          dot.addEventListener('click', () => goTo(i));
          dotsWrap.appendChild(dot);
        }
      });
    }

    function goTo(idx) {
      if (!projects.length) return;
      current = (idx + projects.length) % projects.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      document.querySelectorAll('.p-dot').forEach((d, i) =>
        d.classList.toggle('active', i === current));
    }

    function startAuto() {
      if (projects.length < 2) return;
      autoSlide = setInterval(() => goTo(current + 1), 4500);
    }
    function stopAuto() { clearInterval(autoSlide); }

    async function initPortfolio() {
      const detected = await detectSequentialImages({
        folders: ['projects'],
        prefix: 'project',
        maxItems: 20,
      });

      projects = detected.map((src, index) => {
        const file = src.split('/').pop().replace(/\.[^.]+$/, '');
        const meta = metadataByFile.get(file.toLowerCase()) || {};
        return {
          src,
          title: meta.title || `Project ${String(index + 1).padStart(2, '0')}`,
          tag: meta.tag || 'Recent Project',
        };
      });

      if (!projects.length && configuredProjects.length) {
        projects = configuredProjects.map((item, index) => ({
          src: `projects/${item.file}.png`,
          title: item.title || `Project ${String(index + 1).padStart(2, '0')}`,
          tag: item.tag || 'Recent Project',
        }));
      }

      buildSlides();
      goTo(0);
      startAuto();
    }

    initPortfolio();

    if (prevBtn) prevBtn.addEventListener('click', () => { stopAuto(); goTo(current - 1); startAuto(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { stopAuto(); goTo(current + 1); startAuto(); });

    let touchStartX = 0;
    track.parentElement.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.parentElement.addEventListener('touchend', e => {
      if (!projects.length) return;
      const dx = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(dx) > 50) { stopAuto(); goTo(current + (dx > 0 ? 1 : -1)); startAuto(); }
    });
  }

  /* ── TESTIMONIAL SLIDER ────────────────────────────────── */
  const tTrack = document.getElementById('testimonial-track');
  const tDotsWrap = document.getElementById('testimonial-dots');
  if (tTrack) {
    let tCurrent = 0;
    const tCards = tTrack.querySelectorAll('.testimonial-card');
    const perView = window.innerWidth < 768 ? 1 : 2;
    const tMax = Math.ceil(tCards.length / perView) - 1;

    function tGoTo(idx) {
      tCurrent = Math.max(0, Math.min(tMax, idx));
      const offset = tCurrent * (perView === 2 ? 50 : 100);
      tTrack.style.transform = `translateX(-${offset}%)`;
      if (tDotsWrap) {
        tDotsWrap.querySelectorAll('.t-dot').forEach((d, i) =>
          d.classList.toggle('active', i === tCurrent));
      }
    }

    if (tDotsWrap) {
      for (let i = 0; i <= tMax; i++) {
        const d = document.createElement('div');
        d.className = 't-dot' + (i === 0 ? ' active' : '');
        d.addEventListener('click', () => tGoTo(i));
        tDotsWrap.appendChild(d);
      }
    }

    setInterval(() => tGoTo((tCurrent + 1) > tMax ? 0 : tCurrent + 1), 5500);
  }

  /* ── PARTNER MARQUEE LOADER ────────────────────────────── */
  const marqueeTrack = document.getElementById('marquee-track');
  if (marqueeTrack) {
    function createPartnerLogo(src) {
      const item = document.createElement('div');
      item.className = 'partner-logo';

      const img = document.createElement('img');
      img.src = src;
      img.alt = src.split('/').pop().replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      img.loading = 'eager';
      img.decoding = 'async';
      img.fetchPriority = 'high';

      item.appendChild(img);
      return item;
    }

    function renderPartnerLogos(items) {
      marqueeTrack.innerHTML = '';
      const logos = [...items, ...items];
      logos.forEach((src) => {
        marqueeTrack.appendChild(createPartnerLogo(src));
      });
      marqueeTrack.style.animation = '';
    }

    async function initPartners() {
      const configuredPartners = Array.isArray(window.KESTFORD_PARTNERS)
        ? window.KESTFORD_PARTNERS.filter(Boolean)
        : [];

      if (configuredPartners.length) {
        renderPartnerLogos(configuredPartners);
        return;
      }

      const detected = await detectSequentialImages({
        folders: ['partners', 'backend/Partner'],
        prefix: 'partner',
        maxItems: 24,
        stopAfterMisses: 3,
      });

      if (!detected.length) {
        marqueeTrack.innerHTML = `
          <div class="partners-empty">
            <strong>No partner logos found yet</strong>
            <p>Upload files like <code>partners/partner1.png</code> or <code>backend/Partner/partner1.png</code>.</p>
          </div>`;
        marqueeTrack.style.animation = 'none';
        return;
      }

      renderPartnerLogos(detected);
    }

    initPartners();
  }

  /* ── CONTACT FORM ──────────────────────────────────────── */
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const btn = this.querySelector('.form-submit');
      const original = btn.textContent;
      btn.textContent = 'Message Sent ✓';
      btn.style.background = 'rgba(0,210,240,0.15)';
      btn.style.color = 'var(--cyan)';
      btn.style.border = '1px solid var(--border-mid)';
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.style = '';
        btn.disabled = false;
        this.reset();
      }, 4000);
    });
  }

})();
