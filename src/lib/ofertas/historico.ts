/**
 * A MEMÓRIA DAS OFERTAS NO APARELHO — o lado com storage do motor puro (`motor.ts`).
 *
 *   localStorage['babel.ofertas.historico']  exibições e dispensas por gatilho (8 dias), a última
 *                                            exibição global e o "não mostrar novamente" (permanente);
 *   sessionStorage['babel.ofertas.sessao']   a SESSÃO DE USO: quando começou e quantas ofertas
 *                                            promocionais já apareceram nela. Sobrevive a recarregar
 *                                            a aba e morre com ela, que é o que "sessão" quer dizer.
 *
 * Nada disto sai do aparelho. Sem storage (aba privada bloqueada), vale a memória do módulo: o teto
 * continua funcionando nesta aba, e o pior caso é a oferta voltar numa aba nova.
 */
import {
  comDispensa,
  comExibicao,
  comNaoMostrar,
  HISTORICO_VAZIO,
  type HistoricoDeOfertas,
  normalizarHistorico,
  type SessaoDeUso,
} from './motor';

const CHAVE_HISTORICO = 'babel.ofertas.historico';
const CHAVE_SESSAO = 'babel.ofertas.sessao';

let historicoEmMemoria: HistoricoDeOfertas | null = null;
let sessaoEmMemoria: SessaoDeUso | null = null;

export function lerHistorico(): HistoricoDeOfertas {
  try {
    const bruto = localStorage.getItem(CHAVE_HISTORICO);
    if (bruto) return normalizarHistorico(JSON.parse(bruto));
  } catch {
    /* cai na memória */
  }
  return historicoEmMemoria ?? { ...HISTORICO_VAZIO };
}

function gravarHistorico(h: HistoricoDeOfertas): void {
  historicoEmMemoria = h;
  try {
    localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(h));
  } catch {
    /* sem storage: fica a memória */
  }
}

export function lerSessao(agora = Date.now()): SessaoDeUso {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    if (bruto) {
      const s = JSON.parse(bruto) as Partial<SessaoDeUso>;
      if (typeof s.inicio === 'number' && typeof s.promocionais === 'number')
        return { inicio: s.inicio, promocionais: s.promocionais };
    }
  } catch {
    /* idem */
  }
  if (sessaoEmMemoria) return sessaoEmMemoria;
  const nova = { inicio: agora, promocionais: 0 };
  gravarSessao(nova);
  return nova;
}

function gravarSessao(s: SessaoDeUso): void {
  sessaoEmMemoria = s;
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
  } catch {
    /* idem */
  }
}

/** Marca o início da sessão de uso (o host chama ao montar; idempotente dentro da aba). */
export function iniciarSessaoDeUso(agora = Date.now()): SessaoDeUso {
  return lerSessao(agora);
}

export function registrarExibicao(id: string, promocional: boolean, agora = Date.now()): void {
  gravarHistorico(comExibicao(lerHistorico(), id, agora));
  if (promocional) {
    const s = lerSessao(agora);
    gravarSessao({ ...s, promocionais: s.promocionais + 1 });
  }
}

export function registrarDispensa(id: string, agora = Date.now()): void {
  gravarHistorico(comDispensa(lerHistorico(), id, agora));
}

export function registrarNaoMostrar(id: string): void {
  gravarHistorico(comNaoMostrar(lerHistorico(), id));
}

/** Só para testes. */
export function _esquecerOfertas(): void {
  historicoEmMemoria = null;
  sessaoEmMemoria = null;
  try {
    localStorage.removeItem(CHAVE_HISTORICO);
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* idem */
  }
}
