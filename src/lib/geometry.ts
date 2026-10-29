// Géométrie des livres détectés : quadrilatères inclinés (4 coins) au lieu de rectangles droits.
// Toutes les coordonnées sont normalisées entre 0 et 1 (relatives à la largeur / hauteur de la photo).

export interface Point {
  x: number;
  y: number;
}

/** Rectangle droit englobant, gardé pour la compatibilité avec les anciens scans. */
export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sens de lecture du texte sur la tranche, tel qu'il apparaît sur la photo ("right_to_left" = texte à l'envers). */
export type TextDirection = "bottom_to_top" | "top_to_bottom" | "left_to_right" | "right_to_left";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Aire signée (formule du lacet) : sert à vérifier qu'un quadrilatère n'est pas plat. */
export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Remet les points dans l'ordre du tour (sens horaire à l'écran), en partant du coin le plus en haut à gauche. */
export function orderAround(pts: Point[]): Point[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  }
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}

/**
 * Convertit les 4 coins renvoyés par le modèle (en pixels de l'image envoyée) en quadrilatère normalisé.
 * Renvoie null si la forme est inutilisable (pas 4 points ou surface quasi nulle).
 */
export function normalizeQuad(corners: { x: number; y: number }[], width: number, height: number): Point[] | null {
  if (corners.length !== 4 || width <= 0 || height <= 0) return null;
  const pts = orderAround(corners.map((c) => ({ x: clamp01(c.x / width), y: clamp01(c.y / height) })));
  if (Math.abs(polygonArea(pts)) < 0.00002) return null;
  return pts;
}

export function quadToBox(quad: Point[]): NormalizedBox {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function boxToQuad(b: NormalizedBox): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/** Part du plus petit rectangle couverte par l'autre (1 = entièrement dedans). Repère un livre coupé vu deux fois. */
export function overlapOfSmaller(a: NormalizedBox, b: NormalizedBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? (ix * iy) / smaller : 0;
}

/** Part de recouvrement entre deux rectangles (intersection / union), entre 0 et 1. */
export function iou(a: NormalizedBox, b: NormalizedBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Repère "redressé" d'une tranche, en pixels : de quoi recopier la tranche à l'horizontale,
 * texte à l'endroit (comme les vignettes de BiblioScan).
 * - origin : coin de départ ; u : direction de lecture ; d : direction "vers le bas des lettres".
 * - length : longueur de la tranche ; thickness : épaisseur.
 */
export interface SpineFrame {
  origin: Point;
  u: Point;
  d: Point;
  length: number;
  thickness: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function spineFrame(quad: Point[], width: number, height: number, direction: TextDirection | null): SpineFrame {
  const p = quad.map((q) => ({ x: q.x * width, y: q.y * height }));
  // Les deux axes du quadrilatère : direction moyenne de chaque paire de côtés opposés, et leur longueur.
  const axis = (a0: Point, a1: Point, b0: Point, b1: Point) => {
    const x = a1.x - a0.x + (b1.x - b0.x);
    const y = a1.y - a0.y + (b1.y - b0.y);
    const n = Math.hypot(x, y) || 1;
    return { x: x / n, y: y / n, len: (dist(a0, a1) + dist(b0, b1)) / 2 };
  };
  const axes = [axis(p[0], p[1], p[3], p[2]), axis(p[1], p[2], p[0], p[3])];
  const isVertical = (v: { x: number; y: number }) => Math.abs(v.y) > Math.abs(v.x);
  // La vignette suit toujours le grand côté (comme BiblioScan) ; seul le sens de lecture la retourne.
  const along = axes[0].len >= axes[1].len ? axes[0] : axes[1];
  const across = along === axes[0] ? axes[1] : axes[0];

  // Sens de lecture : par défaut, une tranche verticale se lit de bas en haut (convention française).
  // Une étiquette horizontale sur une tranche debout (ou l'inverse) ne dit rien du sens de la vignette :
  // on revient alors au sens par défaut.
  const vertical = isVertical(along);
  const verticalDir = direction === "bottom_to_top" || direction === "top_to_bottom";
  const dir = direction && verticalDir === vertical ? direction : vertical ? "bottom_to_top" : "left_to_right";

  let { x: ux, y: uy } = along;
  const flip =
    dir === "bottom_to_top" ? uy > 0 : dir === "top_to_bottom" ? uy < 0 : dir === "right_to_left" ? ux > 0 : ux < 0;
  if (flip) {
    ux = -ux;
    uy = -uy;
  }
  const d = { x: -uy, y: ux };
  const u = { x: ux, y: uy };

  const center = { x: p.reduce((s, q) => s + q.x, 0) / 4, y: p.reduce((s, q) => s + q.y, 0) / 4 };
  const length = along.len;
  const thickness = across.len;
  const origin = {
    x: center.x - (u.x * length) / 2 - (d.x * thickness) / 2,
    y: center.y - (u.y * length) / 2 - (d.y * thickness) / 2,
  };
  return { origin, u, d, length, thickness };
}

/**
 * Agrandit le cadre autour de son centre (marge en proportion de l'épaisseur et de la longueur),
 * pour ne pas couper le bord d'une tranche quand le rectangle lu est un peu trop serré.
 */
export function padFrame(f: SpineFrame, thicknessPad: number, lengthPad: number): SpineFrame {
  const dt = f.thickness * thicknessPad;
  const dl = f.length * lengthPad;
  return {
    ...f,
    origin: { x: f.origin.x - f.u.x * dl - f.d.x * dt, y: f.origin.y - f.u.y * dl - f.d.y * dt },
    length: f.length + 2 * dl,
    thickness: f.thickness + 2 * dt,
  };
}

/**
 * Paramètres de canvas.setTransform(a, b, c, d, e, f) qui envoient la photo dans le repère de la tranche,
 * avec un zoom `scale` (pixels de sortie par pixel de photo).
 */
export function spineTransform(f: SpineFrame, scale = 1): [number, number, number, number, number, number] {
  const ou = f.origin.x * f.u.x + f.origin.y * f.u.y;
  const od = f.origin.x * f.d.x + f.origin.y * f.d.y;
  return [f.u.x * scale, f.d.x * scale, f.u.y * scale, f.d.y * scale, -ou * scale, -od * scale];
}
