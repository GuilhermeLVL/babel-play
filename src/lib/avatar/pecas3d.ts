/**
 * AS PEÇAS DO AVATAR EM 3D: geometrias procedurais simples (primitivas, tubos e extrusões; nenhum arquivo externo),
 * presas ao osso `head` (ou `neck`) do VRM, com os deslocamentos calibrados pelo tamanho REAL da cabeça do modelo
 * (caixa dos vértices acima do osso da cabeça, medida uma vez). O catálogo (ids, orçamento, regras) é de
 * `src/core/avatar/pecas.ts`.
 *
 *  · Todas as peças dividem UM material (`MeshLambertMaterial` com cor por vértice): o conjunto soma 1 material e
 *    cada peça soma 0. Trocar a cor de uma peça reescreve só o atributo de cor da peça.
 *  · Cada peça tem no máximo 500 triângulos (teste mede a geometria real contra o `orcamento` do catálogo).
 *  · Tier fraco e PiP: só as peças de acessibilidade (aparelho auditivo, implante coclear, óculos); o resto é
 *    cortado por `pecasParaOTier`. Representação importa em qualquer aparelho.
 *  · Modelo que não é VRM (GLB comum) ou que não tem o osso pedido: a peça não é montada e o relatório diz por quê.
 *
 * Convenção (VRM normalizado): Y para cima, Z para a frente; o lado ESQUERDO do personagem é +X. Esta é uma das
 * portas de `three` (só por `import()`, via `pecasNaSessao.ts`).
 */
import type { VRM } from '@pixiv/three-vrm';
import {
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';

import {
  hexDaCorDePeca,
  type PecaDoCatalogo,
  pecaPorId,
  pecasParaOTier,
  TOKEN_DE_COR_PADRAO,
} from '../../core/avatar/pecas';
import type { TierDoAvatar } from '../../core/avatar/tiers';

export interface ConfigDePecas {
  /** Ids na ordem da receita. */
  ids: readonly string[];
  /** id da peça para id de `CORES_DE_PECA`. */
  cores?: Readonly<Record<string, string>>;
  tier: TierDoAvatar;
}

export type MotivoDeOmissao = 'tier' | 'orcamento' | 'desconhecida' | 'sem_osso' | 'sem_vrm';

export interface RelatorioDePecas {
  montadas: string[];
  omitidas: { id: string; motivo: MotivoDeOmissao }[];
  /** Triângulos que as peças montadas somam (medido na geometria). */
  triangulos: number;
  /** Medidas da cabeça usadas na calibração (diagnóstico). */
  medidas?: MedidasDaCabeca;
}

export interface PecasMontadas {
  atualizar(config: ConfigDePecas): RelatorioDePecas;
  dispose(): void;
}

/** As medidas da cabeça, em unidades do osso `head` (a escala do modelo já está dentro). */
export interface MedidasDaCabeca {
  /** Extensões da caixa dos vértices acima do osso. */
  largura: number;
  profundidade: number;
  /** Do osso ao topo. */
  topo: number;
  cx: number;
  cz: number;
  /** Frente do rosto (z máximo). */
  frente: number;
  olhosY: number;
  /** Metade da distância entre os olhos. */
  olhosX: number;
  /** Metade da largura da cabeça na altura da orelha (em cabeças cônicas é bem menor que `largura / 2`). */
  meiaNaOrelha: number;
  /** A altura da testa (do osso) e a meia largura / meia profundidade da cabeça NELA: o que boné e chapéu vestem. */
  yTesta: number;
  meiaNaTesta: number;
  meiaProfundidadeNaTesta: number;
}

/* ── Medição ─────────────────────────────────────────────────────────────────────────────────── */

const OSSOS_DO_TRONCO = ['spine', 'chest', 'upperChest', 'neck', 'head'] as const;

function percentil(v: number[], p: number): number {
  const o = Float32Array.from(v).sort();
  return o[Math.min(o.length - 1, Math.max(0, Math.round((o.length - 1) * p)))];
}

/** Mede a cabeça com o tronco em repouso (zera as rotações um instante e as devolve). */
/** VRM 0.x olha para -Z e `rotateVRM0` gira a cena inteira: o osso normalizado fica de costas. Medimos e construímos no quadro canônico (frente +Z) e giramos a geometria no fim. */
const quadroInvertido = (vrm: VRM): boolean =>
  String((vrm.meta as { metaVersion?: unknown } | undefined)?.metaVersion) === '0';

export function medirCabeca(vrm: VRM, cabeca: Object3D): MedidasDaCabeca | null {
  const g = quadroInvertido(vrm) ? -1 : 1;
  const nos = OSSOS_DO_TRONCO.map((n) => vrm.humanoid?.getNormalizedBoneNode(n)).filter((n): n is Object3D => !!n);
  const guardadas = nos.map((n) => n.rotation.clone());
  nos.forEach((n) => n.rotation.set(0, 0, 0));
  vrm.scene.updateMatrixWorld(true);
  try {
    const inversa = new Matrix4().copy(cabeca.matrixWorld).invert();
    const m = new Matrix4();
    const p = new Vector3();
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    vrm.scene.traverse((o) => {
      const malha = o as Mesh;
      if (!malha.isMesh || !malha.geometry?.attributes?.position) return;
      m.multiplyMatrices(inversa, malha.matrixWorld);
      const pos = malha.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m);
        p.x *= g;
        p.z *= g;
        if (p.y < 0) continue;
        xs.push(p.x);
        ys.push(p.y);
        zs.push(p.z);
      }
    });
    if (ys.length < 30) return null;
    const x0 = percentil(xs, 0.005);
    const x1 = percentil(xs, 0.995);
    const z0 = percentil(zs, 0.005);
    const z1 = percentil(zs, 0.995);
    const topo = percentil(ys, 0.995);
    const olho = vrm.humanoid?.getNormalizedBoneNode('leftEye');
    let olhosY = topo * 0.45;
    let olhosX = (x1 - x0) * 0.2;
    if (olho) {
      const q = olho.getWorldPosition(new Vector3()).applyMatrix4(inversa);
      q.x *= g;
      q.z *= g;
      if (q.y > 0 && q.y < topo) {
        olhosY = q.y;
        olhosX = Math.max(Math.abs(q.x), olhosX * 0.5);
      }
    }
    const yo = olhosY - topo * 0.08;
    const nx = xs.filter((_, i) => Math.abs(ys[i] - yo) < topo * 0.06);
    const meiaNaOrelha = nx.length > 20 ? (percentil(nx, 0.99) - percentil(nx, 0.01)) / 2 : (x1 - x0) / 2;
    // A testa: um pouco acima dos olhos. Boné e chapéu vestem a largura DAQUI, não a máxima da cabeça (que, em
    // cabeça cônica ou de caixa, está noutra altura e deixava a peça flutuando ou enterrada).
    const yTesta = Math.min(topo * 0.9, Math.max(olhosY + (topo - olhosY) * 0.4, topo * 0.6));
    const naTesta = ys.map((y, i) => (Math.abs(y - yTesta) < topo * 0.05 ? i : -1)).filter((i) => i >= 0);
    const txs = naTesta.map((i) => xs[i]);
    const tzs = naTesta.map((i) => zs[i]);
    const meiaNaTesta = txs.length > 20 ? (percentil(txs, 0.99) - percentil(txs, 0.01)) / 2 : (x1 - x0) / 2;
    const meiaProfundidadeNaTesta = tzs.length > 20 ? (percentil(tzs, 0.99) - percentil(tzs, 0.01)) / 2 : (z1 - z0) / 2;
    return {
      yTesta,
      meiaNaTesta,
      meiaProfundidadeNaTesta,
      meiaNaOrelha,
      largura: x1 - x0,
      profundidade: z1 - z0,
      topo,
      cx: (x0 + x1) / 2,
      cz: (z0 + z1) / 2,
      frente: z1,
      olhosY,
      olhosX,
    };
  } finally {
    nos.forEach((n, i) => n.rotation.copy(guardadas[i]));
    vrm.scene.updateMatrixWorld(true);
  }
}

/* ── Construção das partes ───────────────────────────────────────────────────────────────────── */

interface Parte {
  geo: BufferGeometry;
  /** `true`: a parte leva a cor escolhida; senão, `fixa`. */
  principal: boolean;
  fixa?: string;
}

const PRETO = '#26232b';
const METAL = '#b9bcc4';

const mover = (geo: BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);

function tubo(pontos: Vector3[], raio: number, segmentos: number, radial: number): BufferGeometry {
  return new TubeGeometry(new CatmullRomCurve3(pontos), segmentos, raio, radial, false);
}

function barra(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, e: number): BufferGeometry {
  const a = new Vector3(x0, y0, z0);
  const b = new Vector3(x1, y1, z1);
  const comp = a.distanceTo(b);
  const g = new BoxGeometry(e, e, comp);
  const alvo = new Matrix4().lookAt(b, a, new Vector3(0, 1, 0)); // +Z do box aponta de a para b
  g.applyMatrix4(alvo);
  return g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

type Construtor = (m: MedidasDaCabeca, extra: { alturaDoPescoco: number }) => Parte[];

const LADO = { esq: 1, dir: -1 } as const;

function oculos(redondo: boolean): Construtor {
  return (m) => {
    const r = m.largura * 0.15;
    const e = m.largura * 0.014;
    const z = m.frente + m.largura * 0.012;
    const ex = Math.max(m.olhosX, r * 1.15);
    const partes: Parte[] = [];
    for (const lado of [1, -1]) {
      const cx = m.cx + lado * ex;
      if (redondo) {
        partes.push({ geo: mover(new TorusGeometry(r, e, 4, 12), cx, m.olhosY, z), principal: true });
      } else {
        const l = r * 0.95;
        const h = r * 0.8;
        partes.push(
          { geo: mover(new BoxGeometry(2 * l, 2 * e, 2 * e), cx, m.olhosY + h, z), principal: true },
          { geo: mover(new BoxGeometry(2 * l, 2 * e, 2 * e), cx, m.olhosY - h, z), principal: true },
          { geo: mover(new BoxGeometry(2 * e, 2 * h, 2 * e), cx - l, m.olhosY, z), principal: true },
          { geo: mover(new BoxGeometry(2 * e, 2 * h, 2 * e), cx + l, m.olhosY, z), principal: true },
        );
      }
      // Haste: da borda de fora da lente até a orelha.
      const fora = cx + lado * (redondo ? r : r * 0.95);
      partes.push({
        geo: barra(fora, m.olhosY, z, m.cx + lado * (m.largura / 2), m.olhosY, m.cz, e * 2),
        principal: true,
      });
    }
    const ponte = Math.max(0.0001, ex - r);
    partes.push({
      geo: mover(new BoxGeometry(2 * ponte, e * 1.6, e * 1.6), m.cx, m.olhosY + r * 0.1, z),
      principal: true,
    });
    return partes;
  };
}

const foneDeOuvido: Construtor = (m) => {
  const alturaDoOuvido = m.olhosY - m.topo * 0.05;
  const rx = m.largura / 2 + m.largura * 0.05;
  const ry = m.topo + m.largura * 0.07 - alturaDoOuvido;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const a = (i / 8) * Math.PI;
    pts.push(new Vector3(m.cx + Math.cos(a) * rx, alturaDoOuvido + Math.sin(a) * ry, m.cz));
  }
  const partes: Parte[] = [{ geo: tubo(pts, m.largura * 0.03, 12, 4), principal: true }];
  for (const lado of [1, -1]) {
    const copo = new CylinderGeometry(m.largura * 0.17, m.largura * 0.17, m.largura * 0.09, 10);
    copo.rotateZ(Math.PI / 2);
    partes.push({ geo: mover(copo, m.cx + lado * (rx + m.largura * 0.01), alturaDoOuvido, m.cz), principal: true });
  }
  return partes;
};

/** Posição aproximada da orelha, em função da cabeça medida. */
const orelha = (m: MedidasDaCabeca) => ({
  y: m.olhosY - m.topo * 0.08,
  z: m.cz - m.profundidade * 0.03,
  x: m.meiaNaOrelha,
});

function aparelhoAuditivo(lado: 1 | -1): Construtor {
  return (m) => {
    const o = orelha(m);
    // Maior e um pouco para FORA da cabeça, na frente do meio da orelha: de frente, aparece ao lado do rosto (a versão
    // colada atrás da orelha sumia atrás da cabeça, sobretudo nas cabeças de caixa).
    const x = m.cx + lado * (o.x + m.largura * 0.055);
    const corpo = new SphereGeometry(m.largura * 0.085, 8, 6).scale(0.7, 1.5, 0.9);
    const gancho = tubo(
      [
        new Vector3(x, o.y + m.topo * 0.02, o.z - m.profundidade * 0.02),
        new Vector3(x + lado * m.largura * 0.03, o.y + m.topo * 0.17, o.z - m.profundidade * 0.02),
        new Vector3(x + lado * m.largura * 0.03, o.y + m.topo * 0.16, o.z + m.profundidade * 0.07),
        new Vector3(x - lado * m.largura * 0.005, o.y - m.topo * 0.01, o.z + m.profundidade * 0.08),
      ],
      m.largura * 0.016,
      8,
      4,
    );
    const molde = new SphereGeometry(m.largura * 0.035, 6, 4);
    return [
      { geo: mover(corpo, x, o.y + m.topo * 0.04, o.z - m.profundidade * 0.02), principal: true },
      { geo: gancho, principal: true },
      {
        geo: mover(molde, x - lado * m.largura * 0.005, o.y - m.topo * 0.01, o.z + m.profundidade * 0.08),
        principal: false,
        fixa: '#e8c8b0',
      },
    ];
  };
}

function implanteCoclear(lado: 1 | -1): Construtor {
  return (m) => {
    const o = orelha(m);
    const x = m.cx + lado * (o.x + m.largura * 0.06);
    const zp = o.z - m.profundidade * 0.01;
    const yp = o.y + m.topo * 0.05;
    // Processador atrás da orelha, bobina na lateral da cabeça (acima e atrás), cabo ligando os dois. Maiores e mais
    // para fora que antes, para aparecerem de frente.
    const processador = new SphereGeometry(m.largura * 0.09, 8, 6).scale(0.65, 1.55, 0.9);
    const bobina = new CylinderGeometry(m.largura * 0.075, m.largura * 0.075, m.largura * 0.03, 12);
    bobina.rotateZ(Math.PI / 2);
    const bx = x + lado * m.largura * 0.01;
    const by = o.y + m.topo * 0.2;
    const bz = zp - m.profundidade * 0.02;
    const imã = new CylinderGeometry(m.largura * 0.03, m.largura * 0.03, m.largura * 0.04, 6);
    imã.rotateZ(Math.PI / 2);
    return [
      { geo: mover(processador, x, yp, zp), principal: true },
      {
        geo: barra(x, yp + m.topo * 0.05, zp, bx, by - m.topo * 0.02, bz, m.largura * 0.02),
        principal: false,
        fixa: PRETO,
      },
      { geo: mover(bobina, bx, by, bz), principal: true },
      { geo: mover(imã, bx + lado * m.largura * 0.01, by, bz), principal: false, fixa: METAL },
    ];
  };
}

const bone: Construtor = (m) => {
  // Veste a largura da cabeça NA TESTA (e a profundidade dela), com folga de 8%; a cúpula nasce na altura da testa.
  const y0 = m.yTesta;
  const a = m.meiaNaTesta * 1.08;
  const b = m.meiaProfundidadeNaTesta * 1.08;
  const ry = Math.max(m.topo * 1.06 - y0, a * 0.5);
  const cupula = new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(a, ry, b);
  const aba = new CylinderGeometry(a * 0.95, a * 0.95, m.topo * 0.02, 12, 1, false, -Math.PI / 2, Math.PI);
  return [
    { geo: mover(cupula, m.cx, y0, m.cz), principal: true },
    { geo: mover(aba, m.cx, y0 + m.topo * 0.005, m.cz + b * 0.98), principal: true },
  ];
};

function chapeuDeAba(altura: number, abaLargura: number, copaAfunila: number): Construtor {
  return (m) => {
    // A copa veste a largura da cabeça na testa (`meiaNaTesta`); a aba nasce na altura da testa.
    const a = m.meiaNaTesta * 1.06;
    const b = m.meiaProfundidadeNaTesta * 1.06;
    const base = m.yTesta;
    const h = m.topo * altura;
    const copa = new CylinderGeometry(a * copaAfunila, a, h, 12).scale(1, 1, b / a);
    const aba = new RingGeometry(a * 0.98, a * abaLargura, 16).scale(1, b / a, 1).rotateX(-Math.PI / 2);
    const faixa = new CylinderGeometry(a * 1.03, a * 1.03, h * 0.22, 12, 1, true).scale(1, 1, b / a);
    return [
      { geo: mover(copa, m.cx, base + h / 2, m.cz), principal: true },
      { geo: mover(aba, m.cx, base, m.cz), principal: true },
      { geo: mover(faixa, m.cx, base + h * 0.14, m.cz), principal: false, fixa: PRETO },
    ];
  };
}

const faixaDeCabelo: Construtor = (m) => {
  const y0 = m.topo * 0.34;
  const rx = (m.largura / 2) * 1.05;
  const ry = m.topo * 1.04 - y0;
  const z = m.cz - m.profundidade * 0.08;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const a = (i / 8) * Math.PI;
    pts.push(new Vector3(m.cx + Math.cos(a) * rx, y0 + Math.sin(a) * ry, z));
  }
  return [{ geo: tubo(pts, m.largura * 0.026, 14, 4), principal: true }];
};

const balaoDeFala: Construtor = (m) => {
  const w = m.largura * 0.62;
  const h = m.largura * 0.36;
  const r = h * 0.35;
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(-w * 0.1, -h / 2);
  s.lineTo(-w * 0.3, -h / 2 - h * 0.45); // a pontinha, apontando para a cabeça
  s.lineTo(-w * 0.28 + w * 0.2, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const espessura = m.largura * 0.025;
  const corpo = new ExtrudeGeometry(s, { depth: espessura, bevelEnabled: false, curveSegments: 3 });
  const cx = m.cx + m.largura * 0.5 + w * 0.55;
  const cy = m.topo * 0.78;
  const cz = m.cz;
  const partes: Parte[] = [{ geo: mover(corpo, cx, cy, cz), principal: true }];
  for (const i of [-1, 0, 1]) {
    const ponto = new CylinderGeometry(h * 0.1, h * 0.1, espessura * 0.6, 6).rotateX(Math.PI / 2);
    partes.push({ geo: mover(ponto, cx + i * w * 0.22, cy, cz + espessura * 1.2), principal: false, fixa: PRETO });
  }
  return partes;
};

/** O pescoço: o osso `neck` fica na base; o `head`, `alturaDoPescoco` acima. As peças de pescoço usam o espaço do `neck`. */
const lenco: Construtor = (m, { alturaDoPescoco }) => {
  const R = m.largura * 0.4;
  const y = alturaDoPescoco * 0.3;
  const argola = new TorusGeometry(R, m.largura * 0.075, 6, 14).rotateX(Math.PI / 2);
  const ponta = new BoxGeometry(m.largura * 0.14, m.largura * 0.4, m.largura * 0.045);
  return [
    { geo: mover(argola, 0, y, 0), principal: true },
    { geo: mover(ponta, m.largura * 0.07, y - m.largura * 0.2, R + m.largura * 0.045), principal: true },
  ];
};

const capa: Construtor = (m, { alturaDoPescoco }) => {
  const topo = alturaDoPescoco * 0.15;
  const comp = m.largura * 2.8;
  const manto = new CylinderGeometry(
    m.largura * 0.55,
    m.largura * 1.9,
    comp,
    8,
    1,
    true,
    Math.PI * 0.55,
    Math.PI * 0.9,
  );
  const gola = new TorusGeometry(m.largura * 0.4, m.largura * 0.04, 4, 12).rotateX(Math.PI / 2);
  return [
    { geo: mover(manto, 0, topo - comp / 2, m.largura * 0.02), principal: true },
    { geo: mover(gola, 0, topo, 0), principal: true },
  ];
};

const CONSTRUTORES: Record<string, Construtor> = {
  'oculos-redondo': oculos(true),
  'oculos-quadrado': oculos(false),
  'fone-de-ouvido': foneDeOuvido,
  'aparelho-auditivo-esq': aparelhoAuditivo(LADO.esq),
  'aparelho-auditivo-dir': aparelhoAuditivo(LADO.dir),
  'implante-coclear-esq': implanteCoclear(LADO.esq),
  'implante-coclear-dir': implanteCoclear(LADO.dir),
  bone,
  'chapeu-simples': chapeuDeAba(0.38, 1.9, 0.9),
  cartola: chapeuDeAba(0.75, 1.3, 1),
  'chapeu-de-explorador': chapeuDeAba(0.4, 2.1, 0.7),
  'faixa-de-cabelo': faixaDeCabelo,
  'balao-de-fala': balaoDeFala,
  lenco,
  capa,
};

/** Os ids que `pecas3d` sabe desenhar (teste: tem de ser exatamente o catálogo). */
export const IDS_COM_GEOMETRIA: readonly string[] = Object.keys(CONSTRUTORES);

export const triangulosDaGeometria = (g: BufferGeometry): number =>
  Math.floor((g.index?.count ?? g.attributes.position?.count ?? 0) / 3);

/** Constrói as partes de uma peça com medidas dadas (sem cena nem WebGL; usado também pelos testes). */
export function construirPartes(id: string, m: MedidasDaCabeca, alturaDoPescoco = m.largura * 0.5): Parte[] | null {
  const c = CONSTRUTORES[id];
  return c ? c(m, { alturaDoPescoco }) : null;
}

/** Pinta o atributo de cor da geometria inteira com um hex. */
function pintar(geo: BufferGeometry, hex: string) {
  const n = geo.attributes.position.count;
  const cor = new Color(hex);
  const dados = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    dados[i * 3] = cor.r;
    dados[i * 3 + 1] = cor.g;
    dados[i * 3 + 2] = cor.b;
  }
  geo.setAttribute('color', new Float32BufferAttribute(dados, 3));
}

/* ── Montagem na cena ────────────────────────────────────────────────────────────────────────── */

interface Montada {
  grupo: Group;
  cor: string;
  triangulos: number;
}

export function criarPecas(vrm: VRM | null): PecasMontadas {
  const montadas = new Map<string, Montada>();
  let material: MeshLambertMaterial | null = null;
  let medidas: MedidasDaCabeca | null | undefined;
  let descartado = false;

  const liberar = (id: string) => {
    const g = montadas.get(id);
    if (!g) return;
    g.grupo.removeFromParent();
    g.grupo.traverse((o) => (o as Mesh).geometry?.dispose());
    montadas.delete(id);
  };

  function osso(p: PecaDoCatalogo): Object3D | null {
    const no = vrm?.humanoid?.getNormalizedBoneNode(p.requer[0]) ?? null;
    return no && p.requer.every((o) => vrm?.humanoid?.getNormalizedBoneNode(o)) ? no : null;
  }

  function montar(p: PecaDoCatalogo, token: string): Montada | null {
    const no = osso(p);
    if (!vrm || !no) return null;
    const cabeca = vrm.humanoid?.getNormalizedBoneNode('head');
    if (!cabeca) return null;
    medidas ??= medirCabeca(vrm, cabeca);
    if (!medidas) return null;
    // Peças do pescoço vivem no espaço do `neck`; a altura do pescoço é a distância neck -> head.
    let alturaDoPescoco = medidas.largura * 0.5;
    if (p.requer[0] === 'neck') {
      vrm.scene.updateMatrixWorld(true);
      alturaDoPescoco = Math.max(0.01, no.worldToLocal(cabeca.getWorldPosition(new Vector3())).y);
    }
    const partes = CONSTRUTORES[p.id]?.(medidas, { alturaDoPescoco });
    if (!partes) return null;
    material ??= new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    const grupo = new Group();
    grupo.name = `peca:${p.id}`;
    const hex = hexDaCorDePeca(token) ?? hexDaCorDePeca(p.corPadrao) ?? '#888888';
    let triangulos = 0;
    for (const parte of partes) {
      if (quadroInvertido(vrm)) parte.geo.rotateY(Math.PI);
      pintar(parte.geo, parte.principal ? hex : (parte.fixa ?? PRETO));
      triangulos += triangulosDaGeometria(parte.geo);
      const malha = new Mesh(parte.geo, material);
      malha.frustumCulled = false;
      grupo.add(malha);
    }
    no.add(grupo);
    return { grupo, cor: token, triangulos };
  }

  return {
    atualizar(config) {
      const relatorio: RelatorioDePecas = { montadas: [], omitidas: [], triangulos: 0 };
      if (descartado) return relatorio;
      const { usadas, cortadas } = pecasParaOTier(config.ids, config.tier);
      for (const c of cortadas) relatorio.omitidas.push({ id: c.id, motivo: c.motivo });
      for (const id of [...montadas.keys()]) if (!usadas.includes(id)) liberar(id);
      usadas.forEach((id, ordem) => {
        const p = pecaPorId(id);
        if (!p) return;
        const token = config.cores?.[id] ?? TOKEN_DE_COR_PADRAO;
        const antes = montadas.get(id);
        if (antes && antes.cor !== token) liberar(id);
        if (!montadas.has(id)) {
          if (!vrm) return void relatorio.omitidas.push({ id, motivo: 'sem_vrm' });
          const nova = montar(p, token);
          if (!nova) return void relatorio.omitidas.push({ id, motivo: 'sem_osso' });
          montadas.set(id, nova);
        }
        const m = montadas.get(id)!;
        m.grupo.renderOrder = ordem;
        relatorio.montadas.push(id);
        relatorio.triangulos += m.triangulos;
      });
      relatorio.medidas = medidas ?? undefined;
      return relatorio;
    },
    dispose() {
      descartado = true;
      for (const id of [...montadas.keys()]) liberar(id);
      material?.dispose();
      material = null;
    },
  };
}
