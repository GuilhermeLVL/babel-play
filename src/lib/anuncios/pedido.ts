/// <reference types="vite/client" />

/**
 * O PEDIDO DE ANÚNCIO — junta o que a política pura precisa saber (`core/anuncios/politicaDeAnuncio`).
 *
 * A política não lê nada sozinha; quem lê é este arquivo, e só de CACHES SÍNCRONOS que o app já mantém:
 * a flag (`flagsCache`), o plano e a data da conta (`getEntitlements()`), o perfil (`perfilProtegido()`),
 * o aparelho (`noHeadset()`), a rede (`navigator.onLine`), a edição (`edicaoEstatica()`), a tela (a captura, a rodada, a rota) e o
 * consentimento (`lerPreferencias()`). NADA AQUI PEDE REDE.
 *
 * O MODO DE DEMONSTRAÇÃO (`demonstracaoDeAnuncios()`, R38): no build com `VITE_ANUNCIOS_DEMONSTRACAO=1` (o
 * staging) ou, num servidor de desenvolvimento, com `localStorage['babel.px.anunciosDeProva'] = '1'`, a flag, o
 * consentimento e a idade da conta são tratados como DADOS, para o dono ver os lugares sem ligar nada
 * no banco e sem esperar três dias. O PLANO continua valendo: o servidor local é `selfhost` (sem
 * anúncios), então para ver é preciso também `localStorage['babel.px.planoDeProva'] = 'free'` (a mesma
 * chave da bancada dos Planos). O premiado para o perfil protegido, headset, edição estática e tela ocupada
 * continuam negando na demonstração. Fora do desenvolvimento a chave não é lida; sem a variável, o build não tem demonstração.
 * As trocas valem SÓ com o provedor de demonstração registrado (`demonstracaoAtiva()`): com o provedor REAL (flag
 * ligada e `VITE_ANUNCIOS_ORIGEM` no mesmo build), a flag, o consentimento e os três dias da conta valem de verdade.
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
import { provedorDeAnuncios } from './provedor';

/** A mesma chave que a bancada dos Planos documenta (`lib/polimento/planos.ts`). */
const CHAVE_DA_DEMONSTRACAO = 'babel.px.anunciosDeProva';
const CHAVE_DO_ULTIMO_INTERSTICIAL = 'babel.anuncios.ultimoIntersticial';

/**
 * A demonstração está pedida? No build com `VITE_ANUNCIOS_DEMONSTRACAO=1`, sempre (sem `localStorage`); em
 * desenvolvimento, pela chave. No build de produção (sem a variável) é sempre `false`.
 */
export function demonstracaoDeAnuncios(): boolean {
  /* A variável, LITERAL: o Vite a troca pelo valor no build (o staging a define; produção, não). */
  if (import.meta.env.VITE_ANUNCIOS_DEMONSTRACAO === '1') return true;
  /* O cast é o padrão da casa (`lib/liberacaoDev.ts`): o tsconfig do servidor não carrega os tipos do Vite. */
  if (!(import.meta as unknown as { env?: Record<string, unknown> }).env?.DEV) return false;
  try {
    return localStorage.getItem(CHAVE_DA_DEMONSTRACAO) === '1';
  } catch {
    return false;
  }
}

/**
 * A demonstração está pedida E é ela quem desenha? Só então a flag, o consentimento e a idade da conta viram dados.
 * Com o provedor real registrado, nada disso é trocado: o consentimento e a regra dos três dias valem.
 */
export function demonstracaoAtiva(): boolean {
  return demonstracaoDeAnuncios() && provedorDeAnuncios()?.id === 'demonstracao';
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

/* Quem grava esta chave é `EspacoDeAnuncio`, quando o intersticial aparece (`components/anuncios/Intersticial.tsx`). A
   memória da página cobre o navegador sem storage: ali o intervalo vale enquanto a página estiver aberta. */
let ultimoNaMemoria: number | null = null;

function ultimoIntersticial(): number | null {
  let guardado: number | null = null;
  try {
    const n = Number(localStorage.getItem(CHAVE_DO_ULTIMO_INTERSTICIAL));
    guardado = Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    /* sem storage: fica a memória */
  }
  return guardado ?? ultimoNaMemoria;
}

/** Um intersticial foi mostrado agora: o próximo só depois do intervalo (`INTERVALO_DO_INTERSTICIAL_MS`). */
export function marcarIntersticial(agora: number = Date.now()): void {
  try {
    localStorage.setItem(CHAVE_DO_ULTIMO_INTERSTICIAL, String(agora));
  } catch {
    ultimoNaMemoria = agora; /* sem storage: fica a memória da página */
  }
}

/** O pedido completo para `podeMostrar`, com o estado de AGORA. */
export function montarPedidoDeAnuncio(
  espaco: EspacoDeAnuncio | string,
  formato: FormatoDeAnuncio | string,
): PedidoDeAnuncio {
  const agora = Date.now();
  const demonstracao = demonstracaoAtiva();
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
