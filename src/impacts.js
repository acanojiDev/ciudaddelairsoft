import {
  WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, Mesh, ShaderMaterial,
  TextureLoader, Vector2, Vector4, LinearSRGBColorSpace, NoColorSpace, LinearFilter,
} from 'three';

const MAX = 48;

const vert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Impactos de bola de 6 mm sobre cal:
//  · cráter pequeño con relieve (iluminado desde arriba a la izquierda)
//  · desconchón irregular que deja ver el yeso gris de debajo
//  · esquirlas que saltan y caen con gravedad
//  · polvo con textura de ruido que se abre y se disipa
const frag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uRes;
  uniform float uImgAspect;
  uniform float uTime;
  uniform float uZoom;
  uniform float uFocusY;
  uniform float uScale;
  uniform int uCount;
  uniform vec4 uHit[${MAX}];     // x, y (0..1, y hacia arriba), tamaño, t0
  uniform float uSeed[${MAX}];

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
               mix(hash2(i + vec2(0.0, 1.0)), hash2(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) {
    return vnoise(p) * 0.55 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 + 7.1) * 0.15;
  }

  void main() {
    float sa = uRes.x / uRes.y;
    vec2 tuv = vUv - 0.5;
    if (sa > uImgAspect) tuv.y *= uImgAspect / sa; else tuv.x *= sa / uImgAspect;
    tuv /= uZoom;
    tuv += vec2(0.5, uFocusY);
    vec3 col = texture2D(uTex, tuv).rgb;

    vec2 px = vUv * uRes;
    vec3 L = normalize(vec3(-0.55, 0.6, 0.6));
    float dust = 0.0;
    float chips = 0.0;

    for (int i = 0; i < ${MAX}; i++) {
      if (i >= uCount) break;
      vec4 h = uHit[i];
      float age = uTime - h.w;
      if (age < 0.0) continue;
      float seed = uSeed[i];
      vec2 c = h.xy * uRes;
      vec2 d = px - c;
      float r = length(d);
      float s = h.z * uScale;                 // radio del cráter en px
      if (r > s * 30.0) continue;

      float a = atan(d.y, d.x);
      float on = smoothstep(0.0, 0.03, age);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));

      // roce: halo gris suave y sucio donde la bola arrastra la cal
      float scuffR = s * (3.2 + 1.5 * hash(seed + 2.1));
      float scuff = exp(-pow(r / scuffR, 2.0)) * (0.55 + 0.45 * vnoise(d * 0.35 + seed));
      col *= 1.0 - scuff * 0.16 * on;

      // desconchón: la cal salta en un borde irregular (ruido, sin simetrías)
      // y deja ver el yeso de debajo, siempre algo más oscuro y cálido que la pared
      float edge = 1.0
        + 0.32 * (vnoise(vec2(a * 1.4 + seed * 3.0, seed)) - 0.5) * 2.0
        + 0.10 * (vnoise(vec2(a * 9.0, seed * 7.0)) - 0.5) * 2.0;
      float flakeR = s * (1.25 + 0.6 * hash(seed + 1.3)) * edge;
      float flake = smoothstep(flakeR, flakeR - 0.8, r) * on;
      col = mix(col, col * vec3(0.8, 0.76, 0.7), flake * 0.85);
      // borde de la cal rota: una línea de sombra fina en el lado contrario a la luz
      float lip = (smoothstep(flakeR + 0.9, flakeR, r) - smoothstep(flakeR, flakeR - 0.7, r)) * on;
      float facing = dot(d / max(r, 0.001), vec2(-0.7, 0.7));
      col *= 1.0 - lip * 0.22 * clamp(0.4 - facing, 0.0, 1.0);

      // cráter: cuenco con relieve y oclusión en el fondo
      float rr = r / (1.0 + 0.12 * (vnoise(vec2(a * 3.0, seed * 2.0)) - 0.5));
      if (rr < s) {
        float k = rr / s;
        vec3 n = normalize(vec3(-d / max(r, 0.001) * k * 1.4, 1.0));
        float shade = clamp(dot(n, L) / L.z, 0.0, 1.6);
        float ao = mix(0.35, 1.0, k * k);
        float rim = smoothstep(s - 1.0, s, rr);
        col = mix(col, mix(col * shade * ao * 0.8, col, rim), on);
      }

      // grieta capilar ocasional, corta
      if (hash(seed + 9.0) < 0.45) {
        float ang = hash(seed + 4.0) * 6.2831;
        vec2 dir = vec2(cos(ang), sin(ang));
        float along = dot(d, dir);
        float across = abs(dot(d, vec2(-dir.y, dir.x)) + sin(along * 0.9 + seed) * 0.6);
        float len = s * (2.2 + 1.5 * hash(seed + 6.0));
        float crack = step(s * 0.8, along) * step(along, len) * smoothstep(0.7, 0.0, across);
        col *= 1.0 - crack * 0.35 * on * (1.0 - along / len);
      }

      // esquirlas: salen despedidas y caen
      if (age < 0.8) {
        for (int k = 0; k < 9; k++) {
          float fk = float(k);
          float ang = hash(seed + fk * 2.7) * 6.2831;
          float spd = (90.0 + 220.0 * hash(seed + fk * 5.3)) * uScale;
          vec2 v = vec2(cos(ang), sin(ang) * 0.8 + 0.35) * spd;
          vec2 pos = c + v * age + vec2(0.0, -900.0 * uScale) * age * age * 0.5;
          float sz = (0.7 + 1.1 * hash(seed + fk * 8.1)) * uScale;
          float fade = 1.0 - smoothstep(0.45, 0.8, age);
          chips = max(chips, smoothstep(sz, sz - 0.8, length(px - pos)) * fade);
        }
      }

      // polvo de yeso
      if (age < 1.4) {
        float t = age / 1.4;
        float R = s * (2.5 + 13.0 * (1.0 - pow(1.0 - t, 2.5)));
        vec2 q = (d - vec2(0.0, 6.0 * uScale * t)) / R;    // sube un poco
        float n = fbm(q * 2.6 + seed + t * 0.8);
        float body = exp(-dot(q, q) * 1.6);
        dust = max(dust, body * smoothstep(0.25, 0.85, n + body * 0.35) * pow(1.0 - t, 1.6) * 0.75);
      }
    }

    col = mix(col, vec3(0.88, 0.86, 0.82), clamp(dust, 0.0, 0.8));
    col = mix(col, vec3(0.93, 0.92, 0.9), chips * 0.95);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class HeroImpacts {
  constructor(canvas, src) {
    this.canvas = canvas;
    this.index = 0;
    this.count = 0;
    this.clock0 = performance.now();
    this.visible = true;
    this.running = false;

    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));

    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      uTex: { value: null },
      uRes: { value: new Vector2(1, 1) },
      uImgAspect: { value: 4 / 3 },
      uTime: { value: 0 },
      uZoom: { value: 1 },
      uFocusY: { value: 0.52 },
      uScale: { value: 1 },
      uCount: { value: 0 },
      uHit: { value: Array.from({ length: MAX }, () => new Vector4()) },
      uSeed: { value: new Array(MAX).fill(0) },
    };

    this.mesh = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, depthTest: false })
    );
    this.scene.add(this.mesh);

    this.ready = new Promise((resolve, reject) => {
      new TextureLoader().load(src, (tex) => {
        tex.colorSpace = NoColorSpace;
        tex.minFilter = LinearFilter;
        tex.generateMipmaps = false;
        this.uniforms.uTex.value = tex;
        this.uniforms.uImgAspect.value = tex.image.width / tex.image.height;
        this.resize();
        this.start();
        resolve();
      }, undefined, reject);
    });

    window.addEventListener('resize', () => this.resize());
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.start();
    }).observe(canvas);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.uniforms.uRes.value.set(w, h);
    this.uniforms.uScale.value = Math.max(0.85, h / 900);
    this.render();
  }

  now() { return (performance.now() - this.clock0) / 1000; }

  /** Un impacto. x, y en 0..1 desde la esquina superior izquierda del lienzo. */
  hit(x, y, { size, delay = 0 } = {}) {
    const i = this.index;
    this.uniforms.uHit.value[i].set(x, 1 - y, size ?? 2.6 + Math.random() * 1.6, this.now() + delay);
    this.uniforms.uSeed.value[i] = Math.random() * 100;
    this.index = (this.index + 1) % MAX;
    this.count = Math.min(this.count + 1, MAX);
    this.uniforms.uCount.value = this.count;
    this.lastShot = Math.max(this.lastShot ?? -Infinity, this.now() + delay);
    this.start();
  }

  /** Ráfaga corta: la dispersión crece con cada disparo, como con una réplica real. */
  burst(x, y, { shots = 3, spread = 0.014, interval = 0.08, delay = 0 } = {}) {
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight || 1;
    const out = [];
    for (let n = 0; n < shots; n++) {
      const k = n === 0 ? 0.25 : n;
      const dx = (Math.random() - 0.5) * spread * k / aspect * 1.4;
      const dy = (Math.random() - 0.7) * spread * k;   // la réplica sube un poco
      const t = delay + n * interval;
      this.hit(x + dx, y + dy, { delay: t });
      out.push(t);
    }
    return out;
  }

  setZoom(z) {
    this.uniforms.uZoom.value = z;
    if (!this.running) this.render();
  }

  render() {
    this.uniforms.uTime.value = this.now();
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running || !this.uniforms.uTex.value) return;
    this.running = true;
    const loop = () => {
      const busy = this.lastShot !== undefined && this.now() - this.lastShot < 1.6;
      this.render();
      if (!this.visible || !busy) { this.running = false; return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}
