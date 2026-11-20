/**
 * POSES DE MÃO: da letra do JSON à pose resolvida, interpolação, percurso, espelho e clamp por osso.
 *
 * Convenções (iguais às do protótipo P2/A1; ver ESQUEMA.md):
 *  · `dip: null` = DIP ACOPLADO = `dip_acoplado` (2/3) do PIP, também no percurso (um `dflex` no PIP leva 2/3
 *    dele ao DIP);
 *  · polegar com `cmc_abd = 0` deitado NA PALMA (zero relativo à palma). O zero do RIG (`polegar_zero`) é somado
 *    só por quem aplica nos ossos (`lib/avatar/maos.ts`), não aqui;
 *  · espelhar (canhoto) reflete x da posição e da orientação e marca `espelhada`; os JSON guardam só a destra.
 */
import { clampOsso, limiteDoDedo } from './limites';
import {
  type LetraDoAlfabeto,
  type Limites,
  NOMES_DOS_DEDOS,
  NUM_ANGULOS,
  type PontoDoCaminho,
  type PoseDeMao,
  type Vec3,
} from './tipos';
import { girarPorQuat, girarXYZ, lerpV, quatDeFN, slerp, unitario } from './vetor';

type DadosDePose = Pick<LetraDoAlfabeto, 'mao' | 'orientacao' | 'posicao' | 'cotovelo'>;

export function poseDaLetra(letra: DadosDePose, lim: Limites): PoseDeMao {
  const a = new Array<number>(NUM_ANGULOS).fill(0);
  const p = letra.mao.polegar;
  a[0] = p.cmc_flex;
  a[1] = p.cmc_abd;
  a[2] = p.mcp;
  a[3] = p.ip;
  a[4] = p.oposicao;
  const acoplado: boolean[] = [];
  NOMES_DOS_DEDOS.forEach((nome, i) => {
    const d = letra.mao[nome];
    a[5 + 4 * i] = d.mcp;
    a[6 + 4 * i] = d.pip;
    a[8 + 4 * i] = d.abd;
    const ac = d.dip === null || d.dip === undefined;
    acoplado.push(ac);
    a[7 + 4 * i] = ac ? d.pip * lim.dip_acoplado : (d.dip as number);
  });
  return {
    a,
    acoplado,
    posicao: [...letra.posicao],
    dedos: [...letra.orientacao.dedos],
    palma: [...letra.orientacao.palma],
    giro: letra.cotovelo?.giro ?? 0,
    espelhada: false,
  };
}

/** Aplica um ponto do percurso (delta) sobre a pose-base. */
export function comDelta(pose: PoseDeMao, ponto: Omit<PontoDoCaminho, 't'>, lim: Limites): PoseDeMao {
  const o: PoseDeMao = { ...pose, a: pose.a.slice(), posicao: pose.posicao };
  if (ponto.dpos)
    o.posicao = [pose.posicao[0] + ponto.dpos[0], pose.posicao[1] + ponto.dpos[1], pose.posicao[2] + ponto.dpos[2]];
  if (ponto.rot) {
    // a rotação do sinalizador é aplicada DEPOIS da orientação-base (premultiplica)
    o.dedos = girarXYZ(pose.dedos, ponto.rot);
    o.palma = girarXYZ(pose.palma, ponto.rot);
  }
  if (ponto.dflex) {
    for (const [nome, v] of Object.entries(ponto.dflex)) {
      if (!v) continue;
      if (nome === 'polegar') for (let k = 0; k < 5; k++) o.a[k] += v[k] || 0;
      else {
        const i = (NOMES_DOS_DEDOS as readonly string[]).indexOf(nome);
        if (i < 0) continue;
        for (let k = 0; k < 4; k++) o.a[5 + 4 * i + k] += v[k] || 0;
        if (pose.acoplado[i] && v[1]) o.a[7 + 4 * i] += (v[1] || 0) * lim.dip_acoplado; // DIP segue o PIP
      }
    }
  }
  return o;
}

/** Mistura duas poses (u em 0..1). A orientação interpola por quaternion (sem atalho pelo caminho longo). */
export function misturar(p0: PoseDeMao, p1: PoseDeMao, u: number): PoseDeMao {
  if (u <= 0) return p0;
  if (u >= 1) return p1;
  const a = p0.a.map((x, i) => x + (p1.a[i] - x) * u);
  const q = slerp(quatDeFN(p0.dedos, p0.palma), quatDeFN(p1.dedos, p1.palma), u);
  return {
    a,
    acoplado: p0.acoplado,
    posicao: lerpV(p0.posicao, p1.posicao, u),
    dedos: unitario(girarPorQuat(q, [1, 0, 0])),
    palma: unitario(girarPorQuat(q, [0, 1, 0])),
    giro: p0.giro + (p1.giro - p0.giro) * u,
    espelhada: p0.espelhada,
  };
}

/** Canhoto: reflete x da posição e da orientação. Idempotente em dobro (espelhar duas vezes volta à destra). */
export function espelharPose(p: PoseDeMao): PoseDeMao {
  const rx = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
  return {
    ...p,
    a: p.a.slice(),
    posicao: rx(p.posicao),
    dedos: rx(p.dedos),
    palma: rx(p.palma),
    espelhada: !p.espelhada,
  };
}

export interface ResultadoDoClamp {
  a: number[];
  /** Quantas vezes o clamp AGIU (com dados válidos e percurso comportado deve ser 0). */
  ativacoes: number;
  maiorExcesso: number;
}

/** Clamp por osso de todos os ângulos da pose (interpolação e percurso nunca passam do limite). */
export function limitarAngulos(a: readonly number[], lim: Limites): ResultadoDoClamp {
  let ativacoes = 0;
  let maiorExcesso = 0;
  const contar = (e: number) => {
    ativacoes += 1;
    maiorExcesso = Math.max(maiorExcesso, e);
  };
  const out = a.slice();
  const lp = lim.polegar;
  out[0] = clampOsso(a[0], lp.cmc_flex, contar);
  out[1] = clampOsso(a[1], lp.cmc_abd, contar);
  out[2] = clampOsso(a[2], lp.mcp, contar);
  out[3] = clampOsso(a[3], lp.ip, contar);
  out[4] = clampOsso(a[4], lp.oposicao, contar);
  NOMES_DOS_DEDOS.forEach((nome, f) => {
    out[5 + 4 * f] = clampOsso(a[5 + 4 * f], limiteDoDedo(lim, nome, 'mcp'), contar);
    out[6 + 4 * f] = clampOsso(a[6 + 4 * f], limiteDoDedo(lim, nome, 'pip'), contar);
    out[7 + 4 * f] = clampOsso(a[7 + 4 * f], limiteDoDedo(lim, nome, 'dip'), contar);
    out[8 + 4 * f] = clampOsso(a[8 + 4 * f], limiteDoDedo(lim, nome, 'abd'), contar);
  });
  return { a: out, ativacoes, maiorExcesso };
}

/** Pose de repouso (mão solta ao lado do corpo) e de descanso (entre palavras): constantes do protótipo P2. */
const MAO_SOLTA = {
  polegar: { cmc_flex: 8, cmc_abd: 36, mcp: 10, ip: 8, oposicao: 0 },
  indicador: { mcp: 22, pip: 26, dip: 14, abd: 3 },
  medio: { mcp: 26, pip: 30, dip: 16, abd: 0 },
  anelar: { mcp: 30, pip: 34, dip: 18, abd: 0 },
  minimo: { mcp: 34, pip: 38, dip: 20, abd: 3 },
};
export function poseDeRepouso(lim: Limites): PoseDeMao {
  return poseDaLetra(
    {
      mao: MAO_SOLTA,
      orientacao: { dedos: [0.05, -1, 0.1], palma: [-1, 0, 0] },
      posicao: [0.07, -0.42, 0.1],
      cotovelo: { giro: 0 },
    },
    lim,
  );
}
export function poseDeDescanso(lim: Limites): PoseDeMao {
  return poseDaLetra(
    {
      mao: MAO_SOLTA,
      orientacao: { dedos: [-0.2, 0.55, 0.8], palma: [-0.8, -0.3, 0.1] },
      posicao: [-0.02, -0.12, 0.26],
      cotovelo: { giro: 0 },
    },
    lim,
  );
}
