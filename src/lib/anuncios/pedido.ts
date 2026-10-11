/**
 * O PEDIDO DE ANÚNCIO — junta o que a política pura precisa saber (`core/anuncios/politicaDeAnuncio`).
 *
 * A política não lê nada sozinha; quem lê é este arquivo, e só de CACHES SÍNCRONOS que o app já mantém:
 * a flag (`flagsCache`), o plano e a data da conta (`getEntitlements()`), o perfil (`perfilProtegido()`),
 * o aparelho (`noHeadset()`), a rede (`navigator.onLine`), a edição (`edicaoEstatica()`), a tela (a captura, a rodada, a rota) e o
 * consentimento (`lerPreferencias()`). NADA AQUI PEDE REDE.
 *
 * O MODO DE DEMONSTRAÇÃO, SÓ EM DESENVOLVIMENTO (`demonstracaoDeAnuncios()`): com
 * `localStorage['babel.px.anunciosDeProva'] = '1'` num servidor de desenvolvimento, a flag, o
 * consentimento e a idade da conta são tratados como DADOS, para o dono ver os lugares sem ligar nada
 * no banco e sem esperar três dias. O PLANO continua valendo: o servidor local é `selfhost` (sem
 * anúncios), então para ver é preciso também `localStorage['babel.px.planoDeProva'] = 'free'` (a mesma
 * chave da bancada dos Planos). Perfil protegido, headset, edição estática e tela ocupada continuam
 * negando na demonstração. Fora do desenvolvimento a chave não é lida.
 */
import {
  type EspacoDeAnuncio,
  FLAG_ANUNCIOS,
  type FormatoDeAnuncio,
  IDADE_MINIMA_DA_CONTA_MS,
  type PedidoDeAnuncio,
  type TelaDoAnuncio,
} from '../../core/anuncios/politicaDeAnuncio';
import { PLAN_MATRIX } from '../../core/planos';
import { noHeadset } from '../dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../edicaoEstatica';
import { getEntitlements } from '../entitlements';
import { flagLigada } from '../flagsCache';
import { provaDosPlanos } from '../polimento/planos';
import { lerPreferencias } from '../preferencias';
import { perfilProtegido } from '../protecaoDoMenor';
import { urlParaEstado } from '../rotas';
import { capturaAtiva } from '../sessaoDeCaptura';

/** A mesma chave que a bancada dos Planos documenta (`lib/polimento/planos.ts`). */
const CHAVE_DA_DEMONSTRACAO = 'babel.px.anunciosDeProva';
const CHAVE_DO_ULTIMO_INTERSTICIAL = 'babel.anuncios.ultimoIntersticial';

/** A demonstração está pedida? Só em desenvolvimento; no build de produção é sempre `false`. */
export function demonstracaoDeAnuncios(): boolean {
  /* O cast é o padrão da casa (`lib/liberacaoDev.ts`): o tsconfig do servidor não carrega os tipos do Vite. */
  if (!(import.meta as unknown as { env?: Record<string, unknown> }).env?.DEV) return false;
  try {
    return localStorage.getItem(CHAVE_DA_DEMONSTRACAO) === '1';
  } catch {
    return false;
  }
}

/** O que a tela está fazendo agora, lido na hora de decidir. */
function telaDoAnuncio(): TelaDoAnuncio {
  const temDocumento = typeof document !== 'undefined';
  return {
    capturaAtiva: capturaAtiva(),
    /* O Intérprete é uma rota do app (`/interprete`): aberto, não há anúncio, nem premiado. */
    interpreteAberto: typeof window !== 'undefined' && urlParaEstado(window.location.pathname).view === 'interprete',
    /* A mesma marca que as ofertas e o modal de recompensa leem (`Play.tsx`). */
    rodadaEmAndamento: temDocumento && document.body.hasAttribute('data-jogo-ativo'),
  };
}

/* Nenhum intersticial está encaixado nesta etapa: quem grava esta chave é o espaço dele, quando existir. */
function ultimoIntersticial(): number | null {
  try {
    const n = Number(localStorage.getItem(CHAVE_DO_ULTIMO_INTERSTICIAL));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** O pedido completo para `podeMostrar`, com o estado de AGORA. */
export function montarPedidoDeAnuncio(
  espaco: EspacoDeAnuncio | string,
  formato: FormatoDeAnuncio | string,
): PedidoDeAnuncio {
  const agora = Date.now();
  const demonstracao = demonstracaoDeAnuncios();
  const e = getEntitlements();
  /* Na bancada (só em desenvolvimento) a tela pode ser vista como o Grátis a vê: `planoDeProva`. */
  const prova = provaDosPlanos();
  const semAnuncios = prova.plano ? PLAN_MATRIX[prova.plano].entitlements.semAnuncios : e.semAnuncios;
  const emTeste = prova.plano ? prova.teste : !!e.teste;
  return {
    espaco,
    formato,
    flagLigada: demonstracao || flagLigada(FLAG_ANUNCIOS),
    semAnuncios,
    emTeste,
    perfilProtegido: perfilProtegido(),
    noHeadset: noHeadset(),
    semRede: typeof navigator !== 'undefined' && navigator.onLine === false,
    edicaoEstatica: edicaoEstatica(),
    tela: telaDoAnuncio(),
    contaCriadaEm: demonstracao ? agora - IDADE_MINIMA_DA_CONTA_MS : (e.contaCriadaEm ?? null),
    consentimento: demonstracao || lerPreferencias().consentimentos.anuncios,
    ultimoIntersticialEm: ultimoIntersticial(),
    agora,
  };
}
