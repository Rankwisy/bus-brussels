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

  /* ---- QUOTE FORM HANDLER ---- */
  const quoteForm = document.getElementById('quoteForm');
  if (quoteForm) {
    quoteForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const btn = this.querySelector('[type="submit"]');
      const original = btn.textContent;
      btn.textContent = 'Envoi en cours…';
      btn.disabled = true;

      // Simulate API call (replace with real endpoint)
      setTimeout(() => {
        const successMsg = document.getElementById('formSuccess');
        if (successMsg) {
          quoteForm.style.display = 'none';
          successMsg.style.display = 'block';
          successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          btn.textContent = '✓ Demande envoyée !';
          btn.style.background = '#27AE60';
          btn.style.color = 'white';
        }
      }, 1200);
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

  /* ---- PHONE / WHATSAPP TRACKING ---- */
  document.querySelectorAll('a[href^="tel:"]').forEach(link => {
    link.addEventListener('click', () => {
      if (typeof gtag !== 'undefined') {
        gtag('event', 'phone_click', { event_category: 'CTA', event_label: link.href });
      }
    });
  });
  document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
    link.addEventListener('click', () => {
      if (typeof gtag !== 'undefined') {
        gtag('event', 'whatsapp_click', { event_category: 'CTA' });
      }
    });
  });

  /* ---- AUTO-HIDE STICKY CTA on footer ---- */
  const stickyCta = document.querySelector('.sticky-cta');
  const footer = document.querySelector('.footer');
  if (stickyCta && footer) {
    const obs = new IntersectionObserver(entries => {
      stickyCta.style.opacity = entries[0].isIntersecting ? '0' : '1';
      stickyCta.style.pointerEvents = entries[0].isIntersecting ? 'none' : 'auto';
    });
    obs.observe(footer);
  }

  /* ---- FORM: date minimum today ---- */
  const dateInputs = document.querySelectorAll('input[type="date"]');
  if (dateInputs.length) {
    const today = new Date().toISOString().split('T')[0];
    dateInputs.forEach(input => { if (!input.min) input.min = today; });
  }

})();
