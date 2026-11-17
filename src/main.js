import './style.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { plantPines, setActiveZone } from './map.js';
// three.js (hero) y el sonido se cargan después del primer pintado: la web aparece al instante

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

if (reduced) document.documentElement.classList.add('no-motion');

/* ---------- Scroll suave ---------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.12, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

// anclas internas con Lenis
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id === '#' || id.length < 2) return;
    const target = $(id);
    if (!target) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(target, { offset: id === '#top' ? 0 : -10, duration: 1.2 });
    else target.scrollIntoView();
    if (id !== '#top') history.replaceState(null, '', id);
  });
});

/* ---------- Entrada del hero (sin pantalla de carga) ---------- */
const hero = $('.hero');
const canvas = $('.hero__canvas');
const media = $('.hero__media');
const titleLines = $$('.hero__title .line__in');
const heroBits = [$('.hero__event'), $('.hero__lede'), $('.hero__actions')];
if (!reduced) {
  gsap.timeline({ delay: 0.05 })
    // y: 0 anula el translateY inicial del CSS (que GSAP leería como píxeles)
    .fromTo(titleLines, { y: 0, yPercent: 105 }, { y: 0, yPercent: 0, duration: 1, stagger: 0.09, ease: 'expo.out' })
    .fromTo(heroBits, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out' }, 0.25)
    .fromTo(media, { scale: 1.06 }, { scale: 1, duration: 1.6, ease: 'power2.out' }, 0);
}

/* ---------- Hero WebGL: impactos en la pared (carga diferida) ---------- */
let wall = null;
let sound = null;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

// retroceso: un temblor mínimo de la foto en cada disparo
function recoil(shots = 3, interval = 0.08) {
  if (reduced) return;
  const tl = gsap.timeline();
  for (let n = 0; n < shots; n++) {
    tl.to(canvas, { x: gsap.utils.random(-3, 3), y: gsap.utils.random(-2, 2), duration: interval / 2, ease: 'power1.out' }, n * interval)
      .to(canvas, { x: 0, y: 0, duration: interval / 2, ease: 'power1.in' }, n * interval + interval / 2);
  }
}

// ráfaga de bienvenida que cruza la fachada
function introShots(past = 0) {
  if (!wall) return;
  const wide = hero.clientWidth > 700;
  const pts = wide
    ? [[0.86, 0.3], [0.8, 0.26], [0.74, 0.31], [0.67, 0.24], [0.6, 0.29], [0.9, 0.5], [0.83, 0.47]]
    : [[0.82, 0.26], [0.7, 0.3], [0.58, 0.24], [0.45, 0.29], [0.3, 0.22], [0.76, 0.42]];
  pts.forEach(([x, y], n) => wall.hit(x, y, { delay: n * 0.085 - past }));
  if (!past) recoil(pts.length, 0.085);
}

async function startWall() {
  if (!webglAvailable()) return;
  try {
    const { HeroImpacts } = await import('./impacts.js');
    wall = new HeroImpacts(canvas, `${import.meta.env.BASE_URL}img/pueblo.jpg`);
    await wall.ready;
    document.documentElement.classList.add('is-live');
    if (reduced) introShots(20);
    else if (scrollY < innerHeight * 0.5) setTimeout(() => introShots(), 350);
    import('./sound.js').then((m) => { sound = m; }).catch(() => {});
  } catch {
    wall = null;
  }
}
const whenIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 150));
if (document.readyState === 'complete') whenIdle(startWall);
else window.addEventListener('load', () => whenIdle(startWall), { once: true });

// sonido: solo suena cuando el visitante dispara, y se puede silenciar
const soundBtn = $('.hero__sound');
let soundOn = true;
try { soundOn = localStorage.getItem('cda-sound') !== 'off'; } catch { /* sin almacenamiento */ }
soundBtn.setAttribute('aria-pressed', String(soundOn));
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  try { localStorage.setItem('cda-sound', soundOn ? 'on' : 'off'); } catch { /* sin almacenamiento */ }
});

hero.addEventListener('pointerdown', (e) => {
  if (!wall || e.target.closest('a, button')) return;
  const r = canvas.getBoundingClientRect();
  const times = wall.burst((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  recoil(times.length, 0.08);
  if (soundOn && sound) sound.playBurst(times);
});

/* ---------- Hero al hacer scroll (solo transformaciones CSS, sin redibujar WebGL) ---------- */
if (!reduced) {
  gsap.to('.hero__zoom', {
    scale: 1.12, ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.hero__content', {
    yPercent: -16, autoAlpha: 0.25, ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
  });
}

/* ---------- Mira personalizada ---------- */
if (finePointer && !reduced) {
  const cursor = $('.cursor');
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.25, ease: 'power3' });
  const yTo = gsap.quickTo(cursor, 'y', { duration: 0.25, ease: 'power3' });
  hero.addEventListener('pointermove', (e) => {
    pos.x = e.clientX; pos.y = e.clientY;
    xTo(pos.x); yTo(pos.y);
    const overUi = !!e.target.closest('a, button');
    cursor.classList.toggle('is-on', !overUi);
  });
  hero.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
  hero.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button')) return;
    gsap.fromTo(cursor, { scale: 0.7 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
  });
}

/* ---------- Botones magnéticos ---------- */
if (finePointer && !reduced) {
  $$('[data-magnetic]').forEach((btn) => {
    const xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3' });
    const yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.25);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
    });
    btn.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
}

/* ---------- Navegación ---------- */
const nav = $('[data-nav]');
let lastY = 0;
function onScrollNav(y) {
  const pastHero = y > hero.offsetHeight - 80;
  nav.classList.toggle('is-solid', pastHero);
  const goingDown = y > lastY && y > 200;
  if (!document.body.classList.contains('menu-open')) nav.classList.toggle('is-hidden', goingDown);
  lastY = y;
}
if (lenis) lenis.on('scroll', ({ scroll }) => onScrollNav(scroll));
else window.addEventListener('scroll', () => onScrollNav(scrollY), { passive: true });

const toggle = $('.nav__toggle');
const menu = $('#menu-movil');
function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
  lenis && lenis.start();
}
toggle.addEventListener('click', () => {
  const open = menu.hidden;
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
  if (open) {
    lenis && lenis.stop();
    if (!reduced) gsap.from($$('a', menu), { y: 30, autoAlpha: 0, stagger: 0.05, duration: 0.5, ease: 'power3.out' });
  } else {
    lenis && lenis.start();
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

/* ---------- Historia: palabras que se encienden ---------- */
const storyText = $('[data-scrub-words]');
if (storyText) {
  const words = storyText.textContent.trim().split(/\s+/);
  storyText.setAttribute('aria-label', storyText.textContent.trim());
  storyText.innerHTML = words.map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
  if (!reduced) {
    gsap.to($$('.w', storyText), {
      opacity: 1,
      stagger: 0.1,
      ease: 'none',
      scrollTrigger: { trigger: storyText, start: 'top 80%', end: 'bottom 45%', scrub: true },
    });
  }
}

/* ---------- Cifras ---------- */
$$('[data-count]').forEach((el) => {
  const end = Number(el.dataset.count);
  const fmt = (n) => Math.round(n).toLocaleString('es-ES');
  if (reduced) { el.textContent = fmt(end); return; }
  const o = { v: 0 };
  el.textContent = '0';
  gsap.to(o, {
    v: end, duration: 1.6, ease: 'power3.out',
    onUpdate: () => { el.textContent = fmt(o.v); },
    scrollTrigger: { trigger: el, start: 'top 85%', once: true },
  });
});

/* ---------- Día 0: cuenta atrás ---------- */
const countdown = $('[data-countdown]');
if (countdown) {
  const start = new Date(countdown.dataset.countdown).getTime();
  const end = new Date(countdown.dataset.end).getTime();
  const units = Object.fromEntries($$('[data-unit]', countdown).map((el) => [el.dataset.unit, el]));
  const status = $('.countdown__status');
  const daysLeft = $('[data-days-left]');
  const pad = (n) => String(n).padStart(2, '0');
  // cada cifra que cambia cae desde arriba, como un marcador mecánico
  const setUnit = (el, value) => {
    if (el.dataset.v === value) return;
    const first = el.dataset.v === undefined;
    el.dataset.v = value;
    el.innerHTML = `<span class="tick">${value}</span>`;
    if (!first && !reduced) {
      gsap.fromTo(el.firstChild, { yPercent: -60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.4, ease: 'power3.out' });
    }
  };
  const tick = () => {
    const now = Date.now();
    let diff = Math.max(0, start - now);
    const d = Math.floor(diff / 864e5); diff -= d * 864e5;
    const h = Math.floor(diff / 36e5); diff -= h * 36e5;
    const m = Math.floor(diff / 6e4); diff -= m * 6e4;
    const s = Math.floor(diff / 1e3);
    setUnit(units.d, String(d)); setUnit(units.h, pad(h)); setUnit(units.m, pad(m)); setUnit(units.s, pad(s));
    if (now >= end) {
      countdown.hidden = true; status.hidden = false;
      status.textContent = 'El Día 0 ya pasó. Gracias por venir: pronto anunciamos el siguiente evento.';
      daysLeft.textContent = '';
      return false;
    }
    if (now >= start) {
      countdown.hidden = true; status.hidden = false;
      status.textContent = 'Está pasando ahora mismo en el campo.';
      daysLeft.textContent = 'Hoy';
      return true;
    }
    daysLeft.textContent = d > 1 ? `Faltan ${d} días` : d === 1 ? 'Mañana' : 'Hoy';
    return true;
  };
  if (tick()) { const id = setInterval(() => { if (!tick()) clearInterval(id); }, 1000); }
}

/* ---------- Día 0: inscripción por correo ---------- */
const signup = $('.signup');
if (signup) {
  signup.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('.form-error', signup);
    const nombre = $('#s-nombre');
    const nac = $('#s-nac');
    let bad = null;
    [nombre, nac].forEach((el) => {
      const invalid = !el.value.trim();
      el.setAttribute('aria-invalid', String(invalid));
      if (invalid && !bad) bad = el;
    });
    if (bad) {
      err.hidden = false;
      err.textContent = 'Pon tu nombre completo y tu fecha de nacimiento.';
      bad.focus();
      return;
    }
    err.hidden = true;
    const bando = signup.bando.value;
    const nacTxt = new Date(nac.value + 'T12:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const body = [
      'Hola, quiero inscribirme en el Día 0 (12/12/2026).',
      '',
      `Nombre completo: ${nombre.value.trim()}`,
      `Fecha de nacimiento: ${nacTxt}`,
      `Bando: ${bando}`,
    ].join('\n');
    window.location.href = `mailto:info@ciudaddelairsoft.es?subject=${encodeURIComponent(`Inscripción Día 0 – ${bando}`)}&body=${encodeURIComponent(body)}`;
  });
}

/* ---------- Plano del campo ---------- */
const mapSvg = $('.map');
plantPines(mapSvg);
const steps = $$('.zone-step');
function activate(step) {
  steps.forEach((s) => s.classList.toggle('is-active', s === step));
  setActiveZone(mapSvg, step.dataset.zone);
}
activate(steps[0]);
// la zona activa es la más cercana a la línea de lectura
// (en móvil el plano ocupa la mitad superior, así que la línea va más abajo)
const stackedMq = window.matchMedia('(max-width: 860px)');
let current = steps[0];
ScrollTrigger.create({
  trigger: '.field__zones',
  start: 'top bottom',
  end: 'bottom top',
  onUpdate: () => {
    const line = innerHeight * (stackedMq.matches ? 0.7 : 0.5);
    let best = current;
    let bestDist = Infinity;
    steps.forEach((s) => {
      const r = s.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - line);
      if (dist < bestDist) { bestDist = dist; best = s; }
    });
    if (best !== current) { current = best; activate(best); }
  },
});

/* ---------- Franja con parallax ---------- */
if (!reduced) {
  gsap.fromTo('[data-parallax]', { yPercent: -8 }, {
    yPercent: 8, ease: 'none',
    scrollTrigger: { trigger: '.strip', start: 'top bottom', end: 'bottom top', scrub: true },
  });
  gsap.from('.strip__quote', {
    yPercent: 40, autoAlpha: 0, duration: 1, ease: 'power3.out',
    scrollTrigger: { trigger: '.strip', start: 'top 60%' },
  });
}

/* ---------- Foto de grupo con parallax interno ---------- */
if (!reduced) {
  $$('[data-parallax-inner]').forEach((img) => {
    gsap.fromTo(img, { yPercent: -9 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}

/* ---------- Nocturnas: linterna ---------- */
const night = $('.night');
if (night && !reduced) {
  const light = { x: 50, y: 62 };
  const apply = () => {
    night.style.setProperty('--x', `${light.x}%`);
    night.style.setProperty('--y', `${light.y}%`);
  };
  // barrido automático por las caras del grupo cuando nadie maneja la linterna
  const sweep = gsap.timeline({ repeat: -1, yoyo: true, paused: true, onUpdate: apply })
    .to(light, { x: 18, y: 66, duration: 2.6, ease: 'sine.inOut' })
    .to(light, { x: 52, y: 58, duration: 2.4, ease: 'sine.inOut' })
    .to(light, { x: 84, y: 64, duration: 2.6, ease: 'sine.inOut' });

  ScrollTrigger.create({
    trigger: night,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => (self.isActive ? sweep.play() : sweep.pause()),
  });

  if (finePointer) {
    const xTo = gsap.quickTo(light, 'x', { duration: 0.35, ease: 'power3', onUpdate: apply });
    const yTo = gsap.quickTo(light, 'y', { duration: 0.35, ease: 'power3', onUpdate: apply });
    night.addEventListener('pointerenter', () => sweep.pause());
    night.addEventListener('pointermove', (e) => {
      const r = night.getBoundingClientRect();
      xTo(((e.clientX - r.left) / r.width) * 100);
      yTo(((e.clientY - r.top) / r.height) * 100);
    });
    night.addEventListener('pointerleave', () => sweep.play());
  }
}

/* ---------- Tarifas: pestañas ---------- */
const tabs = $$('.prices__tabs [role="tab"]');
const ink = $('.prices__tab-ink');
function placeInk(tab) {
  ink.style.width = `${tab.offsetWidth}px`;
  ink.style.transform = `translateX(${tab.offsetLeft}px)`;
}
function selectTab(tab, focus = false) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $('#' + t.getAttribute('aria-controls')).hidden = !on;
  });
  placeInk(tab);
  if (focus) tab.focus();
  ScrollTrigger.refresh();
  if (!reduced) {
    gsap.from($$('#' + tab.getAttribute('aria-controls') + ' tbody tr'), {
      y: 14, autoAlpha: 0, stagger: 0.05, duration: 0.45, ease: 'power3.out',
    });
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(next, true);
  });
});
const placeCurrentInk = () => placeInk(tabs.find((t) => t.getAttribute('aria-selected') === 'true'));
(document.fonts ? document.fonts.ready : Promise.resolve()).then(placeCurrentInk);
window.addEventListener('resize', placeCurrentInk);

/* ---------- Reserva por WhatsApp ---------- */
const PHONE = '34622155696';
const form = $('.book__form');
const dateInput = $('#f-fecha');
const today = new Date();
dateInput.min = today.toISOString().slice(0, 10);


form.addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('.form-error', form);
  const required = [$('#f-nombre'), dateInput, $('#f-personas')];
  let firstBad = null;
  required.forEach((el) => {
    const bad = !el.value || !el.checkValidity();
    el.setAttribute('aria-invalid', String(bad));
    if (bad && !firstBad) firstBad = el;
  });
  if (firstBad) {
    err.hidden = false;
    err.textContent = firstBad === dateInput
      ? 'Elige una fecha a partir de hoy.'
      : 'Rellena tu nombre, la fecha y el número de personas.';
    firstBad.focus();
    return;
  }
  err.hidden = true;
  const d = new FormData(form);
  const fecha = new Date(d.get('fecha') + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const lines = [
    `Hola, soy ${d.get('nombre')}. Quiero reservar en Ciudad del Airsoft:`,
    `• ${d.get('plan')} · ${d.get('replica')}`,
    `• ${fecha}`,
    `• ${d.get('personas')} personas`,
  ];
  if (d.get('nota')) lines.push(`• ${d.get('nota')}`);
  window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
});

window.addEventListener('load', () => ScrollTrigger.refresh());
