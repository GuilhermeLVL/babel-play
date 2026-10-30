/**
 * AS MÃOS DO AVATAR: aplica uma `PoseDeMao` (núcleo puro em `core/avatar/sinais`) aos ossos de braço, mão e dedos
 * de um VRM (humanoide NORMALIZADO, T-pose) ou de um GLB com ossos de nomes reconhecíveis. Porta do motor de
 * poses do protótipo P2/A1 (IK de dois ossos + dedos + polegar), generalizado para qualquer rig.
 *
 * Só é alcançado por `import()` (junto do motor): este módulo importa `three` em tempo de execução.
 *
 * MAPA DOS OSSOS (protótipo, rig Quaternius -> humanoides do VRM; `left`/`right` = lado do PERSONAGEM):
 *
 *   clavicle_X   -> XShoulder              upperarm_X -> XUpperArm        lowerarm_X -> XLowerArm      hand_X -> XHand
 *   index_01..03 -> XIndexProximal/Intermediate/Distal      middle_01..03 -> XMiddle...
 *   ring_01..03  -> XRing...                                pinky_01..03  -> XLittle...   (VRM chama o mínimo de "little")
 *   thumb_01..03 -> XThumbMetacarpal/Proximal/Distal  (VRM 1.0; o three-vrm normaliza o 0.x para estes nomes)
 *   thumb_04_leaf -> sem osso: a direção do último osso do polegar repete a do anterior
 *
 * GLB puro: reconhecemos três dialetos de nome (Quaternius `hand_r`/`index_01_r`, Mixamo `mixamorig:RightHandIndex1`
 * e humanoide `rightIndexProximal`). Fora disso, `suportaSinais` diz que NÃO suporta (e por quê).
 *
 * CALIBRAÇÃO NO RIG NORMALIZADO: nada de ângulo fixo de rig. Os eixos de curvatura (F x N) e de abdução (F x T) dos
 * dedos saem da geometria de repouso (posições dos ossos); o zero do polegar também (elevação sobre a palma e
 * ângulo no plano da palma, comparados com os do rig de referência), então o `cmc_abd = 0` dos dados significa
 * "polegar deitado na palma" em qualquer modelo.
 *
 * MÁSCARA PARA CLIPES DE CORPO: este motor é dono do braço da mão que sinaliza (ombro-mão-dedos). Para tocar um
 * clipe por cima, tire as faixas desses ossos dele com `filtrarClipe(clip, ctl.nomesDaMascara())`; o resto
 * (tronco, cabeça, outro braço, pernas) segue o clipe. `outraMao: 'livre'` deixa a outra mão por conta do clipe.
 */
import type { VRM } from '@pixiv/three-vrm';
import { type AnimationClip, Matrix4, type Object3D, PropertyBinding, Quaternion, Vector3 } from 'three';

import { clampOsso } from '../../core/avatar/sinais/limites';
import { espelharPose } from '../../core/avatar/sinais/pose';
import { type Limites, NOMES_DOS_DEDOS, type PoseDeMao } from '../../core/avatar/sinais/tipos';

const D2R = Math.PI / 180;

export type LadoDaMao = 'R' | 'L';

export interface OssosDaMao {
  lado: LadoDaMao;
  /** Pode faltar (rig sem clavícula): o pai do braço faz o papel. */
  clavicula: Object3D | null;
  braco: Object3D;
  antebraco: Object3D;
  mao: Object3D;
  /** [indicador, médio, anelar, mínimo][proximal, intermediário, distal] */
  dedos: Object3D[][];
  /** [metacarpo, proximal, distal] */
  polegar: Object3D[];
}

export interface AvatarParaMaos {
  objeto: Object3D;
  vrm: VRM | null;
}

export type MotivoSemSinais = 'sem_modelo' | 'sem_braco' | 'sem_dedos' | 'sem_ossos_reconheciveis';
export type SuporteDeSinais =
  | { suporta: true; origem: 'vrm' | 'glb'; dialeto: string }
  | { suporta: false; motivo: MotivoSemSinais; detalhe: string };

interface Achados {
  origem: 'vrm' | 'glb';
  dialeto: string;
  R: OssosDaMao;
  L: OssosDaMao;
}

/* ---------- localizar os ossos ---------- */

const FALTA = (m: MotivoSemSinais, detalhe: string): { suporta: false; motivo: MotivoSemSinais; detalhe: string } => ({
  suporta: false,
  motivo: m,
  detalhe,
});

const PREFIXO_DEDO_VRM = ['index', 'middle', 'ring', 'little'] as const;

function ossosDoVrm(vrm: VRM, lado: LadoDaMao): { ossos?: OssosDaMao; falta?: SuporteDeSinais } {
  const p = lado === 'R' ? 'right' : 'left';
  const h = vrm.humanoid;
  const no = (nome: string): Object3D | null => h?.getNormalizedBoneNode(nome as never) ?? null;
  const braco = no(`${p}UpperArm`);
  const antebraco = no(`${p}LowerArm`);
  const mao = no(`${p}Hand`);
  if (!braco || !antebraco || !mao)
    return { falta: FALTA('sem_braco', `faltam ossos do braço (${p}UpperArm/LowerArm/Hand)`) };
  const dedos: Object3D[][] = [];
  for (const d of PREFIXO_DEDO_VRM) {
    const c = [no(`${p}${cap(d)}Proximal`), no(`${p}${cap(d)}Intermediate`), no(`${p}${cap(d)}Distal`)];
    if (c.some((x) => !x)) return { falta: FALTA('sem_dedos', `o modelo não tem os 3 ossos do dedo ${d} (${p})`) };
    dedos.push(c as Object3D[]);
  }
  // polegar: 1.0 (Metacarpal, Proximal, Distal); por segurança aceita o 0.x cru (Proximal, Intermediate, Distal)
  const t1 = [no(`${p}ThumbMetacarpal`), no(`${p}ThumbProximal`), no(`${p}ThumbDistal`)];
  const t0 = [no(`${p}ThumbProximal`), no(`${p}ThumbIntermediate`), no(`${p}ThumbDistal`)];
  const polegar = t1.every(Boolean) ? t1 : t0.every(Boolean) ? t0 : null;
  if (!polegar) return { falta: FALTA('sem_dedos', `o modelo não tem os 3 ossos do polegar (${p})`) };
  return {
    ossos: { lado, clavicula: no(`${p}Shoulder`), braco, antebraco, mao, dedos, polegar: polegar as Object3D[] },
  };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** Nome comparável: minúsculas, sem pontuação e sem o prefixo `mixamorig`. */
const chaveDeNome = (n: string) =>
  n
    .toLowerCase()
    .replace(/^mixamorig/, '')
    .replace(/[^a-z0-9]/g, '');

interface Dialeto {
  nome: string;
  osso(lado: LadoDaMao, o: string): string;
}
const DIALETOS: Dialeto[] = [
  {
    nome: 'quaternius',
    osso: (l, o) => {
      const s = l === 'R' ? 'r' : 'l';
      const mapa: Record<string, string> = {
        clavicula: `clavicle_${s}`,
        braco: `upperarm_${s}`,
        antebraco: `lowerarm_${s}`,
        mao: `hand_${s}`,
      };
      if (mapa[o]) return mapa[o];
      const [d, i] = o.split(':');
      const dd = { indicador: 'index', medio: 'middle', anelar: 'ring', minimo: 'pinky', polegar: 'thumb' }[d];
      return `${dd}_0${Number(i) + 1}_${s}`;
    },
  },
  {
    nome: 'mixamo',
    osso: (l, o) => {
      const s = l === 'R' ? 'Right' : 'Left';
      const mapa: Record<string, string> = {
        clavicula: `${s}Shoulder`,
        braco: `${s}Arm`,
        antebraco: `${s}ForeArm`,
        mao: `${s}Hand`,
      };
      if (mapa[o]) return mapa[o];
      const [d, i] = o.split(':');
      const dd = { indicador: 'Index', medio: 'Middle', anelar: 'Ring', minimo: 'Pinky', polegar: 'Thumb' }[d];
      return `${s}Hand${dd}${Number(i) + 1}`;
    },
  },
  {
    nome: 'humanoide',
    osso: (l, o) => {
      const s = l === 'R' ? 'right' : 'left';
      const mapa: Record<string, string> = {
        clavicula: `${s}Shoulder`,
        braco: `${s}UpperArm`,
        antebraco: `${s}LowerArm`,
        mao: `${s}Hand`,
      };
      if (mapa[o]) return mapa[o];
      const [d, i] = o.split(':');
      const dd = { indicador: 'Index', medio: 'Middle', anelar: 'Ring', minimo: 'Little' }[d];
      if (d === 'polegar') return `${s}Thumb${['Metacarpal', 'Proximal', 'Distal'][Number(i)]}`;
      return `${s}${dd}${['Proximal', 'Intermediate', 'Distal'][Number(i)]}`;
    },
  },
];

function ossosDoGlb(raiz: Object3D): { achados?: Achados; falta?: SuporteDeSinais } {
  const porNome = new Map<string, Object3D>();
  raiz.traverse((o) => {
    if (o.name) porNome.set(chaveDeNome(o.name), o);
  });
  let temMao = false;
  for (const dia of DIALETOS) {
    const lados = {} as Record<LadoDaMao, OssosDaMao>;
    let completo = true;
    for (const lado of ['R', 'L'] as const) {
      const g = (o: string) => porNome.get(chaveDeNome(dia.osso(lado, o))) ?? null;
      const braco = g('braco');
      const antebraco = g('antebraco');
      const mao = g('mao');
      if (mao) temMao = true;
      const dedos = NOMES_DOS_DEDOS.map((d) => [0, 1, 2].map((i) => g(`${d}:${i}`)));
      const polegar = [0, 1, 2].map((i) => g(`polegar:${i}`));
      if (!braco || !antebraco || !mao || dedos.flat().some((x) => !x) || polegar.some((x) => !x)) {
        completo = false;
        break;
      }
      lados[lado] = {
        lado,
        clavicula: g('clavicula'),
        braco,
        antebraco,
        mao,
        dedos: dedos as Object3D[][],
        polegar: polegar as Object3D[],
      };
    }
    if (completo) return { achados: { origem: 'glb', dialeto: dia.nome, R: lados.R, L: lados.L } };
  }
  return {
    falta: temMao
      ? FALTA('sem_dedos', 'há ossos de mão, mas faltam os 3 ossos de algum dedo (só a palma?)')
      : FALTA('sem_ossos_reconheciveis', 'nomes de osso fora dos dialetos conhecidos (Quaternius, Mixamo, humanoide)'),
  };
}

function localizar(avatar: AvatarParaMaos): { achados?: Achados; falta?: SuporteDeSinais } {
  if (!avatar?.objeto) return { falta: FALTA('sem_modelo', 'sem modelo carregado') };
  if (avatar.vrm) {
    const r = ossosDoVrm(avatar.vrm, 'R');
    const l = ossosDoVrm(avatar.vrm, 'L');
    if (r.falta || l.falta || !r.ossos || !l.ossos) return { falta: r.falta ?? l.falta };
    return { achados: { origem: 'vrm', dialeto: 'vrm-normalizado', R: r.ossos, L: l.ossos } };
  }
  return ossosDoGlb(avatar.objeto);
}

/**
 * O modelo consegue soletrar? Devolve o motivo quando não (a UI de futuro ESCONDE o recurso). VRM: precisa dos
 * 3 ossos de cada dedo e dos ossos de braço nos dois lados; GLB: nomes reconhecíveis. Modelos só com a palma
 * (osso da mão sem dedos) dão `sem_dedos`.
 */
export function suportaSinais(avatar: AvatarParaMaos): SuporteDeSinais {
  const { achados, falta } = localizar(avatar);
  if (achados) return { suporta: true, origem: achados.origem, dialeto: achados.dialeto };
  return falta as SuporteDeSinais;
}

/* ---------- geometria de repouso por mão ---------- */

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const wpos = (b: Object3D) => b.getWorldPosition(new Vector3());
const wquat = (b: Object3D) => b.getWorldQuaternion(new Quaternion());
const rotAx = (ax: Vector3, graus: number) => new Quaternion().setFromAxisAngle(ax, graus * D2R);

interface Repouso {
  lq: Quaternion;
  wq: Quaternion;
}

interface MaoPronta {
  o: OssosDaMao;
  sign: number;
  rest: Map<Object3D, Repouso>;
  F0: Vector3;
  N0: Vector3;
  T0: Vector3;
  l1: number;
  l2: number;
  dirU0: Vector3;
  dirL0: Vector3;
  hinge0Loc: Vector3;
  axL: Vector3;
  palmaC: Vector3;
  axF: Vector3[][];
  axA: Vector3[][];
  axG: Vector3[];
  axH: Vector3[];
  axD: Vector3[];
  /** Zero do polegar NESTE rig: `cmc_abd` somado (graus) e deslocamento do `cmc_flex` (graus). */
  zeroCmcAbd: number;
  offsetCmcFlex: number;
  /** Elevação do polegar sobre a palma e ângulo no plano, em repouso (diagnóstico e calibração). */
  elevacaoDoPolegar: number;
  anguloNoPlano: number;
}

interface Quadro {
  sx: Vector3;
  up: Vector3;
  zs: Vector3;
}

const radDe = Math.PI / 180;
/**
 * Ângulo (graus) do polegar de repouso no plano da palma, medido de F0 em torno de gTh, no rig em que os dados
 * foram autorados (Quaternius UBC, medido com este mesmo código num GLB real: -18,26; elevação 27,7). Os dados
 * de `cmc_flex` valem a partir desta direção; em outro rig soma-se a diferença (`offsetCmcFlex`).
 */
export const POLEGAR_REFERENCIA_NO_PLANO = -18.26;

function prepararMao(o: OssosDaMao, quadro: Quadro): MaoPronta {
  const sign = o.lado === 'R' ? 1 : -1;
  const todos = [o.mao, o.antebraco, o.braco, ...o.dedos.flat(), ...o.polegar];
  const rest = new Map<Object3D, Repouso>(todos.map((b) => [b, { lq: b.quaternion.clone(), wq: wquat(b) }]));
  const hp = wpos(o.mao);
  const F0 = wpos(o.dedos[1][0]).sub(hp).normalize();
  const lat = wpos(o.dedos[0][0]).sub(wpos(o.dedos[3][0]));
  const T0 = lat.sub(F0.clone().multiplyScalar(lat.dot(F0))).normalize();
  // regra da mão: direita T = F x N; esquerda T = -(F x N). Logo N = T x F (direita) | F x T (esquerda)
  const N0 = o.lado === 'R' ? new Vector3().crossVectors(T0, F0) : new Vector3().crossVectors(F0, T0);
  const loc = (b: Object3D, vw: Vector3) => vw.clone().applyQuaternion((rest.get(b) as Repouso).wq.clone().invert());
  // eixo de flexão dos dedos (curvar em direção à palma): a = F x N; abdução: b = F x T
  const aFlex = new Vector3().crossVectors(F0, N0).normalize();
  const bAbd = new Vector3().crossVectors(F0, T0).normalize();
  const axF = o.dedos.map((c) => c.map((b) => loc(b, aFlex)));
  const axA = o.dedos.map((c) => c.map((b) => loc(b, bAbd)));
  // polegar: direção de cada osso em repouso; eixos g (curvar atravessando a palma), h (afastar da palma), d (rolar)
  const dTh = o.polegar.map((b, i) => {
    const alvo = i < 2 ? o.polegar[i + 1] : (b.children[0] ?? null);
    if (alvo) return wpos(alvo).sub(wpos(b)).normalize();
    return wpos(b)
      .sub(wpos(o.polegar[i - 1]))
      .normalize(); // sem folha: repete a direção do osso anterior
  });
  const gTh = new Vector3().crossVectors(T0, F0).normalize();
  const axG = o.polegar.map((b) => loc(b, gTh));
  const axH = o.polegar.map((b, i) => loc(b, new Vector3().crossVectors(dTh[i], N0).normalize()));
  const axD = o.polegar.map((b, i) => loc(b, dTh[i]));
  // zero do polegar neste rig
  const elevacao = Math.asin(Math.max(-1, Math.min(1, dTh[0].dot(N0)))) / radDe;
  const proj = dTh[0].clone().sub(N0.clone().multiplyScalar(dTh[0].dot(N0)));
  const e2 = new Vector3().crossVectors(gTh, F0);
  const noPlano = Math.atan2(proj.dot(e2), proj.dot(F0)) / radDe;
  const S = wpos(o.braco);
  const E0 = wpos(o.antebraco);
  const dirU0 = E0.clone().sub(S).normalize();
  const dirL0 = hp.clone().sub(E0).normalize();
  // eixo da dobradiça do cotovelo em repouso: a flexão acontece no plano do braço e da frente do avatar
  let hinge = new Vector3().crossVectors(dirU0, quadro.zs);
  if (hinge.length() < 0.2) hinge = new Vector3().crossVectors(dirU0, quadro.up);
  hinge.normalize();
  return {
    o,
    sign,
    rest,
    F0,
    N0,
    T0,
    l1: S.distanceTo(E0),
    l2: E0.distanceTo(hp),
    dirU0,
    dirL0,
    hinge0Loc: hinge.applyQuaternion((rest.get(o.braco) as Repouso).wq.clone().invert()),
    axL: dirL0.clone().applyQuaternion((rest.get(o.antebraco) as Repouso).wq.clone().invert()),
    palmaC: loc(o.mao, wpos(o.dedos[1][0]).sub(hp)),
    axF,
    axA,
    axG,
    axH,
    axD,
    zeroCmcAbd: -elevacao,
    offsetCmcFlex: POLEGAR_REFERENCIA_NO_PLANO - noPlano,
    elevacaoDoPolegar: elevacao,
    anguloNoPlano: noPlano,
  };
}

/* ---------- o controle ---------- */

export interface OpcoesDoControle {
  /** `repouso`: a outra mão vai ao repouso; `livre`: não toca nela (um clipe de corpo manda). Padrão `repouso`. */
  outraMao?: 'repouso' | 'livre';
}

export interface ControleDeMaos {
  origem: 'vrm' | 'glb';
  dialeto: string;
  /**
   * Aplica a pose à mão que sinaliza (`pose.espelhada` = esquerda) e o repouso à outra. Atualiza as matrizes dos
   * ossos tocados. Os ângulos passam pelo clamp por osso (`limites.json`).
   */
  aplicar(pose: PoseDeMao, repouso: PoseDeMao): void;
  /** Volta todos os ossos controlados ao repouso do modelo. */
  restaurar(): void;
  /** Quantas vezes o clamp AGIU (com dados válidos fica em 0) e o maior excesso, em graus. */
  clamp: { vezes: number; max: number };
  /** Nomes dos nós que um clipe NÃO pode animar enquanto soletra (braço, mão e dedos do lado que sinaliza). */
  nomesDaMascara(lado: LadoDaMao): string[];
  /** Calibração do polegar por lado (diagnóstico). */
  calibracao(): Record<LadoDaMao, { zeroCmcAbd: number; offsetCmcFlex: number; elevacao: number; noPlano: number }>;
  /** Pontas dos dedos no mundo [polegar, indicador, médio, anelar, mínimo] do lado `lado`. */
  pontasDosDedos(lado: LadoDaMao): Vector3[];
  /** Altura do modelo (m), para normalizar medidas para 1,7 m. */
  alturaDoModelo: number;
  ossos: Record<LadoDaMao, OssosDaMao>;
}

export function criarMaos(
  avatar: AvatarParaMaos,
  limites: Limites,
  opcoes: OpcoesDoControle = {},
): ControleDeMaos | null {
  const { achados } = localizar(avatar);
  if (!achados) return null;
  const raiz = avatar.objeto;
  raiz.updateMatrixWorld(true);
  const sR = wpos(achados.R.braco);
  const sL = wpos(achados.L.braco);
  const sx = sR.clone().sub(sL);
  sx.y = 0;
  sx.normalize();
  const up = V(0, 1, 0);
  const zs = new Vector3().crossVectors(up, sx).normalize();
  const quadro: Quadro = { sx, up, zs };
  const maos: Record<LadoDaMao, MaoPronta> = { R: prepararMao(achados.R, quadro), L: prepararMao(achados.L, quadro) };
  const clamp = { vezes: 0, max: 0 };
  const contar = (e: number) => {
    clamp.vezes += 1;
    clamp.max = Math.max(clamp.max, e);
  };
  const vetMundo = (v: readonly number[]) =>
    sx.clone().multiplyScalar(v[0]).add(up.clone().multiplyScalar(v[1])).add(zs.clone().multiplyScalar(v[2]));
  const lim = limites;
  const outraMao = opcoes.outraMao ?? 'repouso';

  function aplicarMao(H: MaoPronta, pose: PoseDeMao) {
    const o = H.o;
    // o ombro atual (a posição do osso do braço não depende da rotação dele; o tronco pode ter se movido)
    o.braco.parent?.updateWorldMatrix(true, false);
    const S = wpos(o.braco);
    const parentWQ = o.braco.parent ? wquat(o.braco.parent) : new Quaternion();
    // alvo da palma no mundo e orientação da mão (a pose já vem espelhada se for a esquerda)
    const palmaAlvo = S.clone().add(vetMundo(pose.posicao));
    const F = vetMundo(pose.dedos).normalize();
    let N = vetMundo(pose.palma);
    N = N.sub(F.clone().multiplyScalar(N.dot(F))).normalize();
    const Tt = new Vector3().crossVectors(F, N).multiplyScalar(H.sign);
    // as duas bases são impróprias na mão esquerda: multiplica as MATRIZES e só então tira o quaternion
    const Mt = new Matrix4().makeBasis(F, N, Tt);
    const Mr = new Matrix4().makeBasis(H.F0, H.N0, H.T0);
    const Qm = new Quaternion().setFromRotationMatrix(Mt.multiply(Mr.invert()));
    const qHand = Qm.clone().multiply((H.rest.get(o.mao) as Repouso).wq);
    const Wt = palmaAlvo.clone().sub(H.palmaC.clone().applyQuaternion(qHand));
    // IK de dois ossos
    const v = Wt.clone().sub(S);
    let d = v.length();
    d = Math.min(H.l1 + H.l2 - 1e-3, Math.max(Math.abs(H.l1 - H.l2) + 1e-3, d));
    const dirSW = v.normalize();
    const a1 = (H.l1 * H.l1 - H.l2 * H.l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(H.l1 * H.l1 - a1 * a1, 0));
    const fora = o.lado === 'R' ? sx : sx.clone().negate();
    const pole = fora
      .clone()
      .multiplyScalar(0.55)
      .add(V(0, -1, 0))
      .add(zs.clone().multiplyScalar(-0.45));
    pole.sub(dirSW.clone().multiplyScalar(pole.dot(dirSW))).normalize();
    if (pose.giro) pole.applyAxisAngle(dirSW, (o.lado === 'L' ? -1 : 1) * pose.giro * D2R);
    const E = S.clone().addScaledVector(dirSW, a1).addScaledVector(pole, h);
    const W = S.clone().addScaledVector(dirSW, d);
    const dirU = E.clone().sub(S).normalize();
    const dirL = W.clone().sub(E).normalize();
    // braço
    let qU = new Quaternion().setFromUnitVectors(H.dirU0, dirU).multiply((H.rest.get(o.braco) as Repouso).wq);
    const nrm = new Vector3().crossVectors(dirU, dirL);
    const ang = Math.atan2(nrm.length(), dirU.dot(dirL));
    if (nrm.length() > 1e-4) {
      nrm.normalize();
      const hw = H.hinge0Loc.clone().applyQuaternion(qU);
      const alvo = nrm.clone().multiplyScalar(Math.sign(hw.dot(nrm)) || 1);
      const tw = Math.atan2(dirU.dot(new Vector3().crossVectors(hw, alvo)), hw.dot(alvo));
      qU = rotAx(dirU, tw / D2R).multiply(qU);
    }
    o.braco.quaternion.copy(parentWQ.clone().invert().multiply(qU));
    let qL = (nrm.length() > 1e-4 ? rotAx(nrm, ang / D2R) : new Quaternion())
      .multiply(qU)
      .multiply((H.rest.get(o.antebraco) as Repouso).lq);
    const axL = H.axL.clone().applyQuaternion(qL);
    qL = new Quaternion().setFromUnitVectors(axL, dirL).multiply(qL);
    // torção do antebraço em torno do próprio eixo: metade no antebraço, metade na mão
    const rel = qL.clone().invert().multiply(qHand);
    const eixo = H.axL.clone().normalize();
    const proj = eixo.dot(V(rel.x, rel.y, rel.z));
    const tws = new Quaternion(eixo.x * proj, eixo.y * proj, eixo.z * proj, rel.w);
    if (tws.length() > 1e-6) {
      tws.normalize();
      qL = qL.clone().multiply(new Quaternion().slerp(tws, 0.5));
    }
    o.antebraco.quaternion.copy(qU.clone().invert().multiply(qL));
    o.mao.quaternion.copy(qL.clone().invert().multiply(qHand));
    // dedos (positivo = curvar em direção à palma), cada ângulo limitado ao osso
    const a = pose.a;
    NOMES_DOS_DEDOS.forEach((nome, f) => {
      const ch = o.dedos[f];
      const l = {
        mcp: dedoLim(lim, nome, 'mcp'),
        pip: dedoLim(lim, nome, 'pip'),
        dip: dedoLim(lim, nome, 'dip'),
        abd: dedoLim(lim, nome, 'abd'),
      };
      const abd = clampOsso(a[8 + 4 * f], l.abd, contar) * (f === 0 || f === 1 ? 1 : -1);
      const angs = [
        clampOsso(a[5 + 4 * f], l.mcp, contar),
        clampOsso(a[6 + 4 * f], l.pip, contar),
        clampOsso(a[7 + 4 * f], l.dip, contar),
      ];
      for (let i = 0; i < 3; i++) {
        const qq = (H.rest.get(ch[i]) as Repouso).lq.clone();
        if (i === 0 && abd) qq.multiply(rotAx(H.axA[f][0], abd));
        qq.multiply(rotAx(H.axF[f][i], angs[i]));
        ch[i].quaternion.copy(qq);
      }
    });
    // polegar: cmc_flex, cmc_abd (zero na palma), mcp, ip, oposição. O zero do RIG vem da calibração, não do dado.
    const LP = lim.polegar;
    const th = o.polegar;
    const flex = clampOsso(a[0], LP.cmc_flex, contar) + H.offsetCmcFlex;
    const abdTh = clampOsso(a[1], LP.cmc_abd, contar) + H.zeroCmcAbd;
    const opo = clampOsso(a[4], LP.oposicao, contar);
    th[0].quaternion.copy(
      (H.rest.get(th[0]) as Repouso).lq
        .clone()
        .multiply(rotAx(H.axH[0], abdTh))
        .multiply(rotAx(H.axD[0], opo))
        .multiply(rotAx(H.axG[0], flex)),
    );
    th[1].quaternion.copy(
      (H.rest.get(th[1]) as Repouso).lq.clone().multiply(rotAx(H.axG[1], clampOsso(a[2], LP.mcp, contar))),
    );
    th[2].quaternion.copy(
      (H.rest.get(th[2]) as Repouso).lq.clone().multiply(rotAx(H.axG[2], clampOsso(a[3], LP.ip, contar))),
    );
    o.braco.updateWorldMatrix(false, true);
  }

  const ctl: ControleDeMaos = {
    origem: achados.origem,
    dialeto: achados.dialeto,
    clamp,
    ossos: { R: achados.R, L: achados.L },
    alturaDoModelo: alturaDe(raiz),
    aplicar(pose, repouso) {
      const dominante: LadoDaMao = pose.espelhada ? 'L' : 'R';
      aplicarMao(maos[dominante], pose);
      if (outraMao === 'repouso') {
        const destra = repouso.espelhada ? espelharPose(repouso) : repouso;
        const outra: LadoDaMao = dominante === 'R' ? 'L' : 'R';
        aplicarMao(maos[outra], outra === 'L' ? espelharPose(destra) : destra);
      }
    },
    restaurar() {
      for (const lado of ['R', 'L'] as const) {
        for (const [osso, r] of maos[lado].rest) osso.quaternion.copy(r.lq);
      }
    },
    nomesDaMascara(lado) {
      const o = maos[lado].o;
      return [o.braco, o.antebraco, o.mao, ...o.dedos.flat(), ...o.polegar].map((b) => b.name);
    },
    calibracao() {
      const c = (H: MaoPronta) => ({
        zeroCmcAbd: H.zeroCmcAbd,
        offsetCmcFlex: H.offsetCmcFlex,
        elevacao: H.elevacaoDoPolegar,
        noPlano: H.anguloNoPlano,
      });
      return { R: c(maos.R), L: c(maos.L) };
    },
    pontasDosDedos(lado) {
      const o = maos[lado].o;
      const ponta = (c: Object3D[]) => {
        const dist = wpos(c[2]);
        return dist.clone().add(dist.clone().sub(wpos(c[1])).multiplyScalar(0.7));
      };
      return [ponta(o.polegar), ...o.dedos.map(ponta)];
    },
  };
  return ctl;
}

function dedoLim(lim: Limites, dedo: (typeof NOMES_DOS_DEDOS)[number], campo: 'mcp' | 'pip' | 'dip' | 'abd') {
  return lim.dedo_por_osso?.[dedo]?.[campo] ?? lim.dedo[campo];
}

function alturaDe(raiz: Object3D): number {
  let min = Infinity;
  let max = -Infinity;
  raiz.traverse((o) => {
    const p = wpos(o);
    if (p.y < min) min = p.y;
    if (p.y > max) max = p.y;
  });
  return Math.max(0.1, max - min);
}

/** Tira de um clipe as faixas dos nós mascarados (devolve uma cópia). */
export function filtrarClipe(clip: AnimationClip, nomes: readonly string[]): AnimationClip {
  const fora = new Set(nomes);
  const copia = clip.clone();
  copia.tracks = copia.tracks.filter((t) => !fora.has(PropertyBinding.parseTrackName(t.name).nodeName));
  return copia;
}

/**
 * Enquadramentos da soletração, em função da altura do modelo: `corpo` mostra cabeça e mãos (~58% da altura);
 * `maos` é mais fechado no espaço de soletração (altura do ombro, à frente do peito, ~32% da altura). Combine
 * `maos` com `ocultarCabeca` para não aparecer rosto.
 */
export function enquadramentoDaSoletracao(
  ctl: ControleDeMaos,
  modo: 'corpo' | 'maos',
  lado: LadoDaMao = 'R',
): { alvo: { x: number; y: number; z: number }; altura: number } {
  const ombro = wpos(ctl.ossos[lado].braco);
  const meio = wpos(ctl.ossos.R.braco).add(wpos(ctl.ossos.L.braco)).multiplyScalar(0.5);
  const h = ctl.alturaDoModelo;
  // `maos` desloca a mira para o lado da mão que sinaliza (G, H e M apontam para fora do ombro)
  return modo === 'maos'
    ? { alvo: { x: meio.x + (ombro.x - meio.x) * 0.7, y: meio.y + 0.01 * h, z: meio.z }, altura: 0.36 * h }
    : { alvo: { x: meio.x, y: meio.y + 0.0 * h, z: meio.z }, altura: 0.58 * h };
}

const ESCALA_ORIGINAL = new WeakMap<Object3D, Vector3>();
/**
 * Esconde (ou devolve) a cabeça colapsando a escala do osso da cabeça (as malhas do rosto e do cabelo têm peso
 * nele). VRM: osso CRU da cabeça (a escala não passa do rig normalizado para o cru); GLB: osso `head`.
 */
export function ocultarCabeca(avatar: AvatarParaMaos, ocultar: boolean): void {
  let cabeca: Object3D | null = avatar.vrm?.humanoid?.getRawBoneNode('head') ?? null;
  if (!cabeca) {
    avatar.objeto.traverse((o) => {
      if (!cabeca && /^(mixamorig:?)?head$/i.test(o.name)) cabeca = o;
    });
  }
  if (!cabeca) return;
  const osso: Object3D = cabeca;
  if (ocultar) {
    if (!ESCALA_ORIGINAL.has(osso)) ESCALA_ORIGINAL.set(osso, osso.scale.clone());
    osso.scale.setScalar(1e-4);
  } else {
    const original = ESCALA_ORIGINAL.get(osso);
    if (original) osso.scale.copy(original);
    ESCALA_ORIGINAL.delete(osso);
  }
}

/** Critério do verificador de independência (igual ao P1/D1): dedo acionado anda >= 8 cm, os outros <= 1 cm (1,7 m). */
export const INDEPENDENCIA = {
  minAcionadoM: 0.08,
  maxOutrosM: 0.01,
  alturaDeReferenciaM: 1.7,
  /** Mão de referência (punho até a ponta do médio) de uma pessoa de 1,7 m. */
  maoDeReferenciaM: 0.19,
} as const;

export interface ResultadoDeIndependencia {
  /**
   * Deslocamento da ponta de cada dedo acionado e o maior deslocamento dos outros, em metros NORMALIZADOS PARA
   * 1,7 m de altura (`andouM`, `outrosMaxM`: o critério do P1/D1). `andouRelM` normaliza pelo tamanho da mão do
   * próprio modelo (mão de 19 cm): separa "o dedo não anda" de "a mão do modelo é pequena" (avatar de desenho).
   */
  dedos: Array<{
    dedo: string;
    andouM: number;
    andouRelM: number;
    outrosMaxM: number;
    ok: boolean;
    okRelativo: boolean;
  }>;
  /** Critério estrito (todos os dedos >= 8 cm e os outros <= 1 cm, por altura). */
  ok: boolean;
  /** Os outros dedos nunca passam de 1 cm quando um se move (independência), em todos os dedos. */
  independentes: boolean;
  /** Critério pela mão do modelo: acionado >= 8 cm (mão de 19 cm) e os outros <= 1 cm. */
  okRelativo: boolean;
  /** Comprimento da mão do modelo (punho até a ponta do médio), em metros reais do modelo. */
  maoDoModeloM: number;
}

/**
 * VERIFICADOR AUTOMÁTICO: com o braço parado numa pose neutra, aciona UM dedo por vez e mede, no mundo, quanto
 * anda a ponta dele e a dos outros quatro. Reaproveita a ideia do teste de independência do P1/D1 (`__P5.testeDedos`).
 * Deixa a pose neutra aplicada ao terminar.
 */
export function medirIndependenciaDosDedos(ctl: ControleDeMaos, lado: LadoDaMao = 'R'): ResultadoDeIndependencia {
  const escala = INDEPENDENCIA.alturaDeReferenciaM / ctl.alturaDoModelo;
  const espelhada = lado === 'L';
  const neutra = (acoes: Record<number, number>): PoseDeMao => {
    const a = new Array<number>(21).fill(0);
    for (const [i, v] of Object.entries(acoes)) a[Number(i)] = v;
    const p: PoseDeMao = {
      a,
      acoplado: [false, false, false, false],
      posicao: [-0.05, 0.1, 0.3],
      dedos: [0, 1, 0],
      palma: [0, 0, 1],
      giro: 0,
      espelhada: false,
    };
    return espelhada ? espelharPose(p) : p;
  };
  const repouso = neutra({});
  const medir = (acoes: Record<number, number>) => {
    ctl.aplicar(neutra(acoes), repouso);
    return ctl.pontasDosDedos(lado).map((p) => p.clone());
  };
  const base = medir({});
  const nomes = ['polegar', ...NOMES_DOS_DEDOS];
  const acoesDe = (i: number): Record<number, number> =>
    i === 0 ? { 0: 50, 1: 55, 2: 40, 3: 50 } : { [5 + 4 * (i - 1)]: 85, [6 + 4 * (i - 1)]: 100, [7 + 4 * (i - 1)]: 67 };
  const maoDoModeloM = wpos(ctl.ossos[lado].mao).distanceTo(base[2]);
  const escalaMao = INDEPENDENCIA.maoDeReferenciaM / Math.max(1e-6, maoDoModeloM);
  const dedos = nomes.map((dedo, i) => {
    const m = medir(acoesDe(i));
    const bruto = m.map((p, k) => p.distanceTo(base[k]));
    const d = bruto.map((x) => x * escala);
    const outrosMaxM = Math.max(...d.filter((_, k) => k !== i));
    const outrosRel = Math.max(...bruto.filter((_, k) => k !== i)) * escalaMao;
    const andouM = d[i];
    const andouRelM = bruto[i] * escalaMao;
    return {
      dedo,
      andouM,
      andouRelM,
      outrosMaxM,
      ok: andouM >= INDEPENDENCIA.minAcionadoM && outrosMaxM <= INDEPENDENCIA.maxOutrosM,
      okRelativo: andouRelM >= INDEPENDENCIA.minAcionadoM && outrosRel <= INDEPENDENCIA.maxOutrosM,
    };
  });
  ctl.aplicar(neutra({}), repouso);
  return {
    dedos,
    ok: dedos.every((d) => d.ok),
    independentes: dedos.every((d) => d.outrosMaxM <= INDEPENDENCIA.maxOutrosM),
    okRelativo: dedos.every((d) => d.okRelativo),
    maoDoModeloM,
  };
}
