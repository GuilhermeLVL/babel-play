/**
 * O NÍVEL DE SERVIÇO NA TELA DE CAPTURA — "No aparelho / Precisão / Ao vivo" (porte de
 * `planos4.js:115-235` do protótipo `anuncios-no-gratis`; decisões em
 * `openspec/changes/planos-v3-e-rota-inteligente/design.md` §3, §4, §5 e §11).
 *
 * O PROTÓTIPO INVENTA O DADO (`PL.escolha`, `MINUTOS`, `nivelAgora`); AQUI O DADO É O DO APP:
 *
 *   - A ESCOLHA da pessoa é a preferência que já existia, "Qualidade da transcrição"
 *     (`SttQuality`, `gateway/sttRouter.ts`). Nada novo é gravado:
 *         automático      ↔ `auto`
 *         "No aparelho"   ↔ `accurate` (o melhor modelo local; `fast`, o modelo leve, também é local)
 *         "Precisão"      ↔ `cloud`    (a nuvem por trechos, com o modelo local de reserva)
 *         "Ao vivo"       ↔ nada: o transporte em fluxo não existe no servidor (`design.md` §11, item 12)
 *   - O NÍVEL EM USO sai do selo da fala (`seloDaFala.ts`), a mesma fonte de verdade da janela "Modelo
 *     no dispositivo": a tela nunca marca "No aparelho" se o selo diz que o áudio saiu.
 *   - O CADEADO é a capacidade do plano (`managedCloudStt`, `sttAoVivo`), nunca o nome dele.
 *   - AS HORAS são as de `GET /api/me/uso` (`porNivel`).
 *
 * A política de rota continua DESLIGADA (`politicaLigada` falso): escolher um nível só grava a
 * preferência, e quem decide a rota é o `routeStt` de sempre.
 *
 * PURO: sem DOM, sem relógio, sem estado global. As frases em português são as chaves do catálogo de
 * i18n; quem traduz é a tela.
 */
import { horasDeTranscricao, PLAN_MATRIX, type PlanoPago, PLANOS_PAGOS } from '../../core/planos';
import type { NivelDeServico } from '../../core/rota/politicaDeRota';
import type { SttQuality } from '../../gateway/sttRouter';
import type { UsoDoMes } from '../uso';
import type { SeloDaFala } from './seloDaFala';

/** `NIVEL_IDS`, `planos4.js:120`. */
export const NIVEL_IDS: readonly NivelDeServico[] = ['aparelho', 'precisao', 'aovivo'];

/** `NIVEIS`, `planos4.js:115-119`: o nome, a frase curta (o `title` e o aviso) e a longa (a folha do cadeado). */
export const NIVEIS: Record<NivelDeServico, { nome: string; curto: string; longo: string }> = {
  aparelho: {
    nome: 'No aparelho',
    curto: 'Roda aqui. Grátis, sem limite, funciona sem internet.',
    longo: 'O modelo roda no seu aparelho. É grátis, não tem limite, funciona sem internet e o áudio não sai daqui.',
  },
  precisao: {
    nome: 'Precisão',
    curto: 'Nuvem por trechos. Erra menos.',
    longo:
      'Cada trecho de fala vai para um servidor que erra menos, sobretudo em português e em áudio com barulho. O texto chega logo depois de cada frase.',
  },
  aovivo: {
    nome: 'Ao vivo',
    curto: 'Nuvem com texto durante a fala.',
    longo:
      'O texto aparece enquanto a pessoa ainda está falando. É o nível para conversa, viagem, reunião e aula ao vivo.',
  },
};

/**
 * O TRANSPORTE AO VIVO EXISTE? Não: o servidor só transcreve por trechos (`politicaDeRota.ts`,
 * "O fluxo… HOJE ele não existe"). Enquanto isto for falso, "Ao vivo" tem cadeado para TODO plano,
 * inclusive o que declara `sttAoVivo`. Quando o transporte entrar, isto passa a ler a flag
 * `stt_ao_vivo` e o nível ganha uma preferência para gravar.
 */
export const TRANSPORTE_AO_VIVO_EXISTE = false;

/* ---- A escolha (a preferência que já existia) ------------------------------------------------- */

/** `PL.escolha` do protótipo (`planos4.js:126`), lida da preferência real. */
export type EscolhaDeNivel = 'auto' | 'aparelho' | 'precisao';

export function escolhaDaPreferencia(q: SttQuality): EscolhaDeNivel {
  if (q === 'cloud') return 'precisao';
  return q === 'fast' || q === 'accurate' ? 'aparelho' : 'auto';
}

/** A preferência que um nível grava. "Ao vivo" não grava nada (não entra aqui). */
export function qualidadeDoNivel(n: 'aparelho' | 'precisao', atual: SttQuality): SttQuality {
  if (n === 'precisao') return 'cloud';
  // Quem já escolheu um modelo local (o leve ou o melhor) fica com o que escolheu.
  return atual === 'fast' || atual === 'accurate' ? atual : 'accurate';
}

/* ---- O seletor: o que é oferecido e o que tem cadeado ----------------------------------------- */

export interface NivelNaTela {
  nivel: NivelDeServico;
  /** O plano não tem (ou, no "Ao vivo", o transporte ainda não existe). */
  tranca: boolean;
}

export interface ContextoDosNiveis {
  /** As capacidades do plano (`getEntitlements()`), nunca o nome dele. */
  capacidades: { managedCloudStt: boolean; sttAoVivo: boolean };
  /** Perfil protegido: os níveis que enviam áudio NÃO são oferecidos (spec `transparencia-da-fala`). */
  protegido: boolean;
  /** Não há plano a assinar (a edição estática): nível com cadeado seria uma porta para lugar nenhum. */
  semPlanos: boolean;
  transporteAoVivo?: boolean;
}

/** `noPlano()` + `etiquetaDoNivel()` de `planos4.js:154, 213-218`, com as capacidades reais. */
export function niveisDaTela(c: ContextoDosNiveis): NivelNaTela[] {
  const aoVivo = c.capacidades.sttAoVivo && (c.transporteAoVivo ?? TRANSPORTE_AO_VIVO_EXISTE);
  const todos: NivelNaTela[] = [
    { nivel: 'aparelho', tranca: false },
    { nivel: 'precisao', tranca: !c.capacidades.managedCloudStt },
    { nivel: 'aovivo', tranca: !aoVivo },
  ];
  if (c.protegido) return todos.filter((n) => n.nivel === 'aparelho');
  return c.semPlanos ? todos.filter((n) => !n.tranca) : todos;
}

/** O nível EM USO, pelo selo: a nuvem do Babel é "Precisão"; o aparelho e o navegador, "No aparelho". */
export function nivelDoSelo(selo: SeloDaFala | null): NivelDeServico | null {
  if (!selo) return null;
  return selo.onde === 'nuvem' ? 'precisao' : 'aparelho';
}

/* ---- A marca ---------------------------------------------------------------------------------- */

export type IconeDaMarca = 'cpu' | 'smartphone' | 'server' | 'wifi-off';

export interface MarcaDoSelo {
  icone: IconeDaMarca;
  /** `data-tom` de `.pl-onde`: '' (aparelho), 'nuvem' ou 'alerta'. */
  tom: '' | 'nuvem' | 'alerta';
}

/**
 * O ícone e o tom da marca (`marcaDeOnde()`, `planos4.js:193-204`). O TEXTO não sai daqui: é o do selo
 * (`textoDoSelo`). Sem internet, o ícone avisa; com as horas esgotadas ou uma rota que mudou sozinha,
 * o tom é de alerta.
 */
export function marcaDoSelo(selo: SeloDaFala, o: { semRede: boolean; horasAcabaram: boolean }): MarcaDoSelo {
  if (o.semRede) return { icone: 'wifi-off', tom: 'alerta' };
  const icone: IconeDaMarca = selo.onde === 'nuvem' ? 'server' : selo.onde === 'navegador' ? 'smartphone' : 'cpu';
  if (o.horasAcabaram || selo.mudou) return { icone, tom: 'alerta' };
  return { icone, tom: selo.onde === 'nuvem' ? 'nuvem' : '' };
}

/* ---- As horas de nuvem do mês ------------------------------------------------------------------ */

/** `horas()` de `planos4.js:139-143`: "6 h 30", "5 h", "40 min". Recebe MINUTOS. */
export function horas(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${String(m).padStart(2, '0')}` : h ? `${h} h` : `${m} min`;
}

export interface Medidor {
  nivel: 'precisao' | 'aovivo';
  /** Em minutos, como no protótipo. */
  usado: number;
  total: number;
  resta: number;
  /** 0 a 100. */
  pct: number;
  acabou: boolean;
}

/**
 * `medidores()` de `planos4.js:145-152`, com o que o servidor contou (`porNivel` de `/api/me/uso`).
 * Só entra o nível que TEM teto maior que zero: sem nuvem no plano não há medidor, e sem teto
 * (self-host) não há o que medir. Servidor anterior (sem `porNivel`): os trechos saem do contador de
 * sempre.
 */
export function medidoresDoUso(uso: UsoDoMes | null): Medidor[] {
  if (!uso) return [];
  const trechos = uso.porNivel?.trechos ?? {
    ...uso.segundosDeAudio,
    restante: uso.segundosDeAudio.teto === null ? null : uso.segundosDeAudio.teto - uso.segundosDeAudio.usado,
  };
  const um = (nivel: Medidor['nivel'], c: { usado: number; teto: number | null } | undefined): Medidor[] => {
    if (!c || c.teto === null || c.teto <= 0) return [];
    const total = Math.round(c.teto / 60);
    const usado = Math.min(total, Math.round(Math.max(0, c.usado) / 60));
    const acabou = c.usado >= c.teto;
    return [
      {
        nivel,
        usado: acabou ? total : usado,
        total,
        resta: acabou ? 0 : total - usado,
        pct: acabou ? 100 : Math.round((usado / total) * 100),
        acabou,
      },
    ];
  };
  return [...um('precisao', trechos), ...um('aovivo', uso.porNivel?.aovivo)];
}

/* ---- A folha do cadeado: qual plano abre o nível ----------------------------------------------- */

const temONivel = (p: PlanoPago, n: 'precisao' | 'aovivo'): boolean =>
  n === 'precisao' ? PLAN_MATRIX[p].entitlements.managedCloudStt : PLAN_MATRIX[p].entitlements.sttAoVivo;

export interface QuemTemONivel {
  plano: PlanoPago;
  /** Horas por mês NESTE nível, da matriz. `null` = sem teto. */
  horasNoMes: number | null;
  aVenda: boolean;
}

/**
 * Os planos pagos que TÊM o nível, do mais barato ao mais caro (`NIVEIS[n].plano` e a frase "Quem
 * tem" de `planos4.js:340`, com as horas e a venda de verdade). No "Precisão", quem já vende um plano
 * com nuvem não precisa ouvir falar do que está fora de venda; no "Ao vivo", o único plano que o tem
 * aparece mesmo fora de venda, dito como tal.
 */
export function quemTemONivel(n: 'precisao' | 'aovivo', aVenda: readonly PlanoPago[]): QuemTemONivel[] {
  const todos = PLANOS_PAGOS.filter((p) => temONivel(p, n)).map((plano) => {
    const s = n === 'precisao' ? null : PLAN_MATRIX[plano].quotas.sttAoVivoSegundosMes;
    return {
      plano,
      horasNoMes: n === 'precisao' ? horasDeTranscricao(plano) : s === null ? null : Math.round((s / 3600) * 10) / 10,
      aVenda: aVenda.includes(plano),
    };
  });
  const vendidos = todos.filter((p) => p.aVenda);
  // Horas iguais às do plano de baixo não são novidade: "No Essencial são 5 h. No Premium, 20 h."
  const lista = (vendidos.length ? vendidos : todos.slice(0, 1)).filter(
    (p, i, l) => i === 0 || p.horasNoMes !== l[i - 1].horasNoMes,
  );
  return lista.slice(0, 2);
}
