/**
 * VALIDADOR DO ALFABETO MANUAL (porta de `validar.mjs` do protótipo): campos obrigatórios, ângulos dentro dos
 * limites anatômicos (`limites.json`), orientação e posição plausíveis, letras exigidas. Recebe `unknown` (o
 * dado vem de JSON) e NUNCA lança: devolve a lista de erros. Esquema: `src/data/avatar/sinais/ESQUEMA.md`.
 */
import { limiteDoDedo } from './limites';
import { type Intervalo, type Limites, type Lingua, NOMES_DOS_DEDOS } from './tipos';

export const ESQUEMA_DO_ALFABETO = 'frasy-alfabeto-mao/2';
const ALCANCE_M = 0.5; // distância máxima do centro da palma ao ombro dominante (braço do modelo: ~0,47 m)
const FIDELIDADES = ['alta', 'media', 'baixa'];
const LETRAS_AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const LETRAS_EXIGIDAS: Record<Lingua, string[]> = { libras: [...LETRAS_AZ, 'Ç'], asl: LETRAS_AZ };
/** Letras que DEVEM ter `movimento: true`. */
const MOVIMENTO_EXIGIDO: Record<Lingua, string[]> = { libras: ['H', 'J', 'X', 'Z', 'Ç'], asl: ['J', 'Z'] };

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(num);

export interface ResultadoDaValidacao {
  ok: boolean;
  erros: string[];
}

export function validarAlfabeto(dados: unknown, lingua: Lingua, lim: Limites): ResultadoDaValidacao {
  const erros: string[] = [];
  const erro = (m: string) => erros.push(m);

  const confere = (valor: unknown, [lo, hi]: Intervalo, nome: string, onde: string) => {
    if (!num(valor)) return erro(`${onde}: ${nome} ausente ou não numérico`);
    if (valor < lo || valor > hi) erro(`${onde}: ${nome}=${valor} fora do limite anatômico [${lo}, ${hi}]`);
  };
  const confereMao = (mao: unknown, onde: string) => {
    if (!ehObj(mao)) return erro(`${onde}: mao ausente`);
    const p = mao.polegar;
    if (!ehObj(p)) erro(`${onde}: polegar ausente`);
    else for (const [k, i] of Object.entries(lim.polegar)) confere(p[k], i, `polegar.${k}`, onde);
    for (const d of NOMES_DOS_DEDOS) {
      const dedo = mao[d];
      if (!ehObj(dedo)) {
        erro(`${onde}: dedo ${d} ausente`);
        continue;
      }
      for (const k of ['mcp', 'pip', 'dip', 'abd'] as const) {
        // dip: null = acoplado ao PIP (DIP = 2/3 PIP); o valor efetivo também precisa estar no limite
        const v = k === 'dip' && dedo.dip === null && num(dedo.pip) ? dedo.pip * lim.dip_acoplado : dedo[k];
        confere(v, limiteDoDedo(lim, d, k), `${d}.${k}`, onde);
      }
    }
  };
  /** Soma o `dflex` na mão (cópia): replica o motor, inclusive o DIP acoplado seguir o delta do PIP. */
  const comDelta = (mao: Obj, dflex: unknown): Obj => {
    const m = JSON.parse(JSON.stringify(mao)) as Obj;
    if (!ehObj(dflex)) return m;
    for (const [dedo, v] of Object.entries(dflex)) {
      const delta = Array.isArray(v) ? (v as unknown[]).map((x) => (num(x) ? x : 0)) : [];
      const alvo = m[dedo];
      if (dedo === 'polegar' && ehObj(alvo)) {
        ['cmc_flex', 'cmc_abd', 'mcp', 'ip', 'oposicao'].forEach((k, i) => {
          if (num(alvo[k])) alvo[k] += delta[i] || 0;
        });
      } else if (ehObj(alvo) && (NOMES_DOS_DEDOS as readonly string[]).includes(dedo)) {
        const acoplado = alvo.dip === null;
        if (acoplado && num(alvo.pip)) alvo.dip = alvo.pip * lim.dip_acoplado;
        ['mcp', 'pip', 'dip', 'abd'].forEach((k, i) => {
          if (num(alvo[k])) alvo[k] += delta[i] || 0;
        });
        if (acoplado && num(alvo.dip)) alvo.dip += (delta[1] || 0) * lim.dip_acoplado;
      } else erro(`dflex com dedo desconhecido: ${dedo}`);
    }
    return m;
  };

  if (!ehObj(dados)) return { ok: false, erros: [`${lingua}: dado não é um objeto`] };
  if (dados.esquema !== ESQUEMA_DO_ALFABETO) erro(`${lingua}: esquema inesperado: ${String(dados.esquema)}`);
  if (dados.lingua !== lingua) erro(`${lingua}: campo lingua = ${String(dados.lingua)}`);
  if (typeof dados.aviso !== 'string' || !/NÃO revisadas/.test(dados.aviso))
    erro(`${lingua}: o aviso de "NÃO revisadas por pessoas surdas" sumiu do arquivo`);
  const letras = ehObj(dados.letras) ? dados.letras : {};
  for (const c of LETRAS_EXIGIDAS[lingua]) if (!letras[c]) erro(`${lingua}: letra ${c} ausente`);
  for (const c of Object.keys(letras))
    if (!LETRAS_EXIGIDAS[lingua].includes(c)) erro(`${lingua}: letra inesperada ${c}`);

  for (const [c, bruta] of Object.entries(letras)) {
    const onde = `${lingua}.${c}`;
    if (!ehObj(bruta)) {
      erro(`${onde}: letra não é um objeto`);
      continue;
    }
    const L = bruta;
    if (typeof L.fidelidade !== 'string' || !FIDELIDADES.includes(L.fidelidade))
      erro(`${onde}: fidelidade inválida (${String(L.fidelidade)})`);
    if (typeof L.movimento !== 'boolean') erro(`${onde}: movimento deve ser booleano`);
    if (typeof L.obs !== 'string' || !L.obs.trim()) erro(`${onde}: obs vazia`);
    if (typeof L.referencia !== 'string' || !L.referencia.trim()) erro(`${onde}: referencia vazia`);
    confereMao(L.mao, onde);

    const o = L.orientacao;
    const dedos = ehObj(o) ? o.dedos : undefined;
    const palma = ehObj(o) ? o.palma : undefined;
    if (!vec3(dedos) || !vec3(palma)) erro(`${onde}: orientacao.dedos/palma devem ser vetores [x,y,z]`);
    else {
      const nf = Math.hypot(...dedos);
      const np = Math.hypot(...palma);
      if (nf < 0.5 || np < 0.5) erro(`${onde}: vetor de orientação quase nulo`);
      else {
        const cos = Math.abs(dedos.reduce((s, x, i) => s + x * palma[i], 0)) / (nf * np);
        if (cos > 0.3) erro(`${onde}: dedos e palma não são perpendiculares (|cos|=${cos.toFixed(2)} > 0,3)`);
      }
    }
    if (!vec3(L.posicao)) erro(`${onde}: posicao deve ser [x,y,z] em metros`);
    else {
      const [x, y, z] = L.posicao;
      if (Math.hypot(x, y, z) > ALCANCE_M)
        erro(`${onde}: posicao fora do alcance do braço (${Math.hypot(x, y, z).toFixed(2)} m)`);
      if (z < 0.1) erro(`${onde}: posicao.z=${z}: mão atrás ou colada ao corpo (espera-se z >= 0,1)`);
    }
    const g = ehObj(L.cotovelo) ? L.cotovelo.giro : undefined;
    if (!num(g) || g < lim.giro[0] || g > lim.giro[1]) erro(`${onde}: cotovelo.giro ausente ou fora de ${lim.giro}`);

    if (L.movimento === true) {
      if (!L.movimento_descricao) erro(`${onde}: movimento sem movimento_descricao`);
      if (!Array.isArray(L.caminho) || !L.caminho.length) erro(`${onde}: movimento sem caminho`);
      else {
        let ant = 0;
        for (const [i, w] of (L.caminho as unknown[]).entries()) {
          const ow = `${onde}.caminho[${i}]`;
          if (!ehObj(w)) {
            erro(`${ow}: ponto inválido`);
            continue;
          }
          if (!num(w.t) || w.t <= ant || w.t > 1) erro(`${ow}: t deve crescer em (0,1]`);
          else ant = w.t;
          if (w.dpos && (!vec3(w.dpos) || Math.hypot(...w.dpos) > 0.2)) erro(`${ow}: dpos inválido ou maior que 0,2 m`);
          if (w.rot && (!vec3(w.rot) || w.rot.some((a) => Math.abs(a) > 120)))
            erro(`${ow}: rot inválido (graus, |a| <= 120)`);
          if (ehObj(L.mao)) confereMao(comDelta(L.mao, w.dflex), `${ow}+dflex`);
        }
      }
    } else if (L.caminho || L.movimento_descricao) erro(`${onde}: tem caminho/descrição mas movimento=false`);
  }
  for (const c of MOVIMENTO_EXIGIDO[lingua]) {
    const L = letras[c];
    if (ehObj(L) && L.movimento !== true) erro(`${lingua}.${c}: deve estar marcada movimento: true`);
  }
  return { ok: erros.length === 0, erros };
}
