/**
 * BUS.BRUSSELS — Main JavaScript
 * Handles: navigation, FAQ accordion, form, sticky CTA, animations
 */

(function () {
  'use strict';

  /* ---- STICKY NAVBAR ---- */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---- MOBILE MENU ---- */
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');

  function closeMobileMenu() {
    if (!navLinks) return;
    navLinks.classList.remove('open');
    document.body.style.overflow = '';
    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    }
    // Close all mega items
    navLinks.querySelectorAll('.mega-item.mega-open').forEach(item => {
      item.classList.remove('mega-open');
      const trigger = item.querySelector('.mega-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
      const spans = menuToggle.querySelectorAll('span');
      if (isOpen) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
      }
    });

    // Close menu on non-mega link click
    navLinks.querySelectorAll('a:not(.mega-trigger)').forEach(link => {
      link.addEventListener('click', () => closeMobileMenu());
    });
  }

  /* ---- MEGA MENU — mobile accordion ---- */
  document.querySelectorAll('.mega-trigger').forEach(trigger => {
    trigger.addEventListener('click', e => {
      if (window.innerWidth < 1024) {
        e.preventDefault();
        const item = trigger.closest('.mega-item');
        const isOpen = item.classList.toggle('mega-open');
        trigger.setAttribute('aria-expanded', isOpen);
      }
    });
  });

  // Close mega menu when clicking outside (desktop)
  document.addEventListener('click', e => {
    if (!e.target.closest('.mega-item')) {
      document.querySelectorAll('.mega-item.mega-open').forEach(item => {
        item.classList.remove('mega-open');
      });
    }
  });

  /* ---- FAQ ACCORDION ---- */
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
      // Toggle current
      if (!isOpen) item.classList.add('open');
    });
  });

  /* ---- SMOOTH SCROLL FOR ANCHOR LINKS ---- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ---- COMPARATEUR ---- */
  const COWRKBUS = {
    name: 'CowrkBus',
    url: 'devis-bus-bruxelles.html',
    prix: 1,        // 1=€ (less = cheaper)
    rating: 5,
    extras: 6,      // GPS, WiFi, assurance, boissons, guide, accessibilité
    responseTime: 1, // 1=rapide (less = faster)
    services: ['Événement', 'Scolaire', 'Entreprise', 'Aéroport', 'Tourisme', 'Privé'],
    isCowrk: true
  };

  const competitors = [
    { name: 'Location Bus',       url: 'https://location-bus.be',           prix: 2, rating: 4, extras: 3, responseTime: 2, services: ['Événement', 'Privé'] },
    { name: 'LocationAutocar',    url: 'https://www.locationautocar.be',     prix: 2, rating: 3, extras: 2, responseTime: 2, services: ['Privé', 'Entreprise'] },
    { name: 'LVC Brussels',       url: 'https://lvc.brussels',               prix: 3, rating: 4, extras: 3, responseTime: 2, services: ['Privé', 'Événement'] },
    { name: 'Transport Belgique', url: 'https://transportbelgique.com',      prix: 2, rating: 3, extras: 2, responseTime: 3, services: ['Entreprise'] },
    { name: 'RentABus',           url: 'https://rentabus.be',                prix: 2, rating: 3, extras: 2, responseTime: 2, services: ['Privé', 'Tourisme'] },
    { name: 'BusMinibus',         url: 'https://busminibus.com',             prix: 2, rating: 3, extras: 2, responseTime: 2, services: ['Privé'] },
    { name: 'Autocar Bruxelles',  url: 'https://autocar-bruxelles.be',       prix: 2, rating: 4, extras: 3, responseTime: 2, services: ['Entreprise', 'Tourisme'] },
    { name: 'BusRental BXL',      url: 'https://busrental.brussels',         prix: 3, rating: 3, extras: 2, responseTime: 3, services: ['Privé', 'Événement'] },
    { name: 'LocationBus',        url: 'https://locationbus.be',             prix: 2, rating: 3, extras: 2, responseTime: 2, services: ['Privé'] },
    { name: 'Shuttle Service',    url: 'https://shuttle-service.be',         prix: 2, rating: 4, extras: 3, responseTime: 1, services: ['Aéroport', 'Entreprise'] },
    { name: 'LimoStar',           url: 'https://limostar.be',                prix: 3, rating: 4, extras: 4, responseTime: 1, services: ['Privé', 'Événement'] },
    { name: 'RentBus BXL',        url: 'https://rentbus.brussels',           prix: 2, rating: 3, extras: 2, responseTime: 2, services: ['Privé'] },
    { name: 'VTC Brussels',       url: 'https://vtc.brussels',               prix: 3, rating: 4, extras: 3, responseTime: 1, services: ['Privé'] },
    { name: 'Bus4Rent',           url: 'https://bus4rent.be',                prix: 2, rating: 3, extras: 2, responseTime: 2, services: ['Privé', 'Tourisme'] },
    { name: 'Chauffeur BXL',      url: 'https://chauffeur.brussels',         prix: 3, rating: 4, extras: 4, responseTime: 1, services: ['Privé', 'Entreprise'] },
    { name: 'Autocar Service',    url: 'https://autocar-service.com',        prix: 2, rating: 3, extras: 2, responseTime: 3, services: ['Scolaire', 'Entreprise'] },
    { name: 'Autocar.Brussels',   url: 'https://www.autocar.brussels',       prix: 2, rating: 4, extras: 3, responseTime: 2, services: ['Tourisme', 'Privé'] },
    { name: 'Belgian Train',      url: 'https://www.belgiantrain.be',        prix: 1, rating: 3, extras: 1, responseTime: 3, services: ['Entreprise'] },
    { name: 'De Lijn',            url: 'https://www.delijn.be',              prix: 1, rating: 2, extras: 1, responseTime: 3, services: ['Scolaire'] },
    { name: 'TEC',                url: 'https://www.letec.be',               prix: 1, rating: 2, extras: 1, responseTime: 3, services: ['Scolaire'] },
    { name: 'STIB-MIVB',          url: 'https://www.stib-mivb.be',          prix: 1, rating: 3, extras: 1, responseTime: 3, services: ['Entreprise'] },
    { name: 'Limousine BXL',      url: 'https://limousine.brussels',         prix: 3, rating: 4, extras: 4, responseTime: 1, services: ['Privé', 'Événement'] },
  ];

  function scoreCompetitor(c, criteria) {
    let s = 0;
    if (criteria.includes('prix'))   s += (4 - c.prix) * 3;
    if (criteria.includes('rapide')) s += (4 - c.responseTime) * 3;
    if (criteria.includes('rating')) s += c.rating * 2;
    if (criteria.includes('extras')) s += c.extras;
    return s;
  }

  function prixLabel(n)  { return ['', '€', '€€', '€€€'][n] || '?'; }
  function starsHtml(n)  { return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function rtLabel(n)    { return ['', '< 2h ⚡', '2–4h', '+ 4h'][n] || '?'; }
  function extrasLabel(n){ return n + ' / 6'; }

  function buildList(items) {
    return items.map((c, i) => {
      const isCowrk = !!c.isCowrk;
      const target  = isCowrk ? '_self'  : '_blank';
      const rel     = isCowrk ? ''       : 'noopener noreferrer';
      const starsEl = `<span class="comp-stars">${starsHtml(c.rating)}</span>`;
      const tags = [
        `<span class="comp-tag comp-tag-prix">${prixLabel(c.prix)}</span>`,
        `<span class="comp-tag comp-tag-rt">${rtLabel(c.responseTime)}</span>`,
        `<span class="comp-tag">${c.services.length} service${c.services.length > 1 ? 's' : ''}</span>`,
        `<span class="comp-tag">${extrasLabel(c.extras)} extras</span>`,
      ].join('');
      const badge = isCowrk ? `<span class="comp-badge">Meilleur choix</span>` : '';
      return `<div class="comp-list-item${isCowrk ? ' comp-list-item--best' : ''}">
        <div class="comp-list-rank">#${i + 1}</div>
        <div class="comp-list-body">
          <div class="comp-list-header">
            <a class="comp-list-name" href="${c.url}" target="${target}" rel="${rel}">${c.name} ↗</a>
            ${badge}
          </div>
          <div class="comp-list-meta">${starsEl} ${tags}</div>
        </div>
      </div>`;
    }).join('');
  }

  const comparerBtn = document.getElementById('comparerBtn');
  if (comparerBtn) {
    comparerBtn.addEventListener('click', function () {
      const checked = [...document.querySelectorAll('.criteria-grid input:checked')].map(i => i.value);
      const errEl  = document.getElementById('comparateurError');
      const resEl  = document.getElementById('comparateurResults');

      if (checked.length === 0) {
        errEl.style.display = 'block';
        resEl.style.display = 'none';
        return;
      }
      errEl.style.display = 'none';

      const ranked = [...competitors]
        .sort((a, b) => scoreCompetitor(b, checked) - scoreCompetitor(a, checked))
        .slice(0, 5);

      resEl.innerHTML = buildList([COWRKBUS, ...ranked]);
      resEl.style.display = 'block';
      resEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  /* ---- COUNTER ANIMATION ---- */
  const animateCounters = () => {
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = parseInt(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const duration = 1800;
      const step = target / (duration / 16);
      let current = 0;
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = Math.floor(current) + suffix;
        if (current >= target) clearInterval(timer);
      }, 16);
    });
  };

  /* ---- INTERSECTION OBSERVER for animations ---- */
  if ('IntersectionObserver' in window) {
    // Stats counter
    const statsEl = document.querySelector('.stats-bar');
    if (statsEl) {
      let counted = false;
      new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !counted) {
          counted = true;
          animateCounters();
        }
      }, { threshold: 0.5 }).observe(statsEl);
    }

    // Fade-in elements
    const fadeEls = document.querySelectorAll('.card, .service-card, .pricing-card, .testimonial-card, .step-card');
    if (fadeEls.length) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

      fadeEls.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(16px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
      });
    }
  } else {
    // Fallback: show everything
    animateCounters();
  }


  /* ---- FORM: date minimum today ---- */
  const dateInputs = document.querySelectorAll('input[type="date"]');
  if (dateInputs.length) {
    const today = new Date().toISOString().split('T')[0];
    dateInputs.forEach(input => { if (!input.min) input.min = today; });
  }

})();
