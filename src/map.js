const NS = 'http://www.w3.org/2000/svg';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rellena el pinar del plano con pinos repartidos dentro de su contorno */
export function plantPines(svg) {
  const zone = svg.querySelector('#z-pinar');
  const area = zone.querySelector('.zone__area');
  const group = zone.querySelector('.map__pines');
  const box = area.getBBox();
  const rand = mulberry32(7);
  const placed = [];
  let tries = 0;
  while (placed.length < 46 && tries < 2000) {
    tries++;
    const x = box.x + rand() * box.width;
    const y = box.y + rand() * box.height;
    const r = 5 + rand() * 6;
    const pt = new DOMPoint(x, y);
    if (!area.isPointInFill(pt)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 2)) continue;
    placed.push({ x, y, r });
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x.toFixed(1));
    c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r', r.toFixed(1));
    group.appendChild(c);
  }

  // algunos pinos sueltos alrededor del pueblo y del helipuerto
  const loose = [[450, 250], [470, 270], [560, 230], [610, 360], [580, 420], [120, 240], [100, 610], [520, 620], [760, 380], [430, 610]];
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'map__pines map__pines--loose');
  loose.forEach(([x, y]) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 6 + rand() * 4);
    g.appendChild(c);
  });
  svg.querySelector('.map__tracks').after(g);
}

export function setActiveZone(svg, name) {
  svg.querySelectorAll('.zone').forEach((z) => z.classList.toggle('is-active', z.dataset.zone === name));
}
