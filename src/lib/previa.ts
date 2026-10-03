/// <reference types="vite/client" />

/**
 * A PRÉVIA DAS TELAS — PROVISÓRIA (pedido e autorização do dono, 02/10/2026).
 *
 * A edição estática (a única produção de hoje) não tem conta nem servidor, e por isso esconde
 * Biblioteca, Sessão, Revisão, Vocabulário, Perfil, Planos, checkout e as ofertas. O dono precisa VER
 * essas telas no aparelho para validar o desenho antes de a versão completa existir.
 *
 * Com a prévia LIGADA neste navegador (o interruptor fica em `/diagnostico`, ou `?previa=1` na URL):
 *   · as telas que pedem conta montam, com os dados guardados só neste navegador (o mesmo servidor em
 *     memória de sempre: nenhum dado de outra pessoa existe aqui para ser exposto);
 *   · Planos, checkout, assinatura e consumo respondem com DADOS DE EXEMPLO
 *     (`data/efemero/rotas/previa.ts`): nada é cobrado, nenhuma conta é criada, nada sai do aparelho;
 *   · as ofertas e a vitrine das telas sem rota (login, avisos) ficam alcançáveis.
 *
 * DESLIGADA DE FÁBRICA: o visitante comum continua vendo a edição de demonstração de sempre. Só existe
 * na edição estática; no app com servidor esta função responde sempre `false`, e lá quem decide o que
 * cada conta vê continua sendo o servidor.
 *
 * PARA TIRAR: apagar este arquivo e seguir os erros de compilação. Cada ponto que pergunta
 * `previaLigada()` volta a ser o `edicaoEstatica()` que era.
 *
 * FOLHA: não importa nada do app (a identidade e o servidor em memória perguntam daqui sem ciclo).
 */
export const CHAVE_DA_PREVIA = 'babel.previa.telas';
/** O plano que a prévia finge ter: muda o que Planos, a assinatura e as ofertas mostram. */
export const CHAVE_DO_PLANO_DA_PREVIA = 'babel.previa.plano';
export type PlanoDaPrevia = 'free' | 'premium';

const estatica = (): boolean => import.meta.env?.VITE_EDICAO_ESTATICA === '1';

/* `?previa=1` liga e `?previa=0` desliga, uma vez, na carga da página (o headset não tem console). */
if (typeof window !== 'undefined' && estatica()) {
  try {
    const pedido = new URLSearchParams(window.location.search).get('previa');
    if (pedido === '1') window.localStorage.setItem(CHAVE_DA_PREVIA, '1');
    else if (pedido === '0') window.localStorage.removeItem(CHAVE_DA_PREVIA);
  } catch {
    /* sem armazenamento: a prévia fica desligada */
  }
}

export function previaLigada(): boolean {
  if (!estatica()) return false;
  try {
    return globalThis.localStorage?.getItem(CHAVE_DA_PREVIA) === '1';
  } catch {
    return false;
  }
}

/** Liga ou desliga. A identidade é decidida na carga do app: quem chama recarrega a página depois. */
export function definirPrevia(ligada: boolean): void {
  try {
    if (ligada) localStorage.setItem(CHAVE_DA_PREVIA, '1');
    else localStorage.removeItem(CHAVE_DA_PREVIA);
  } catch {
    /* sem armazenamento: nada a guardar */
  }
}

export function planoDaPrevia(): PlanoDaPrevia {
  try {
    return globalThis.localStorage?.getItem(CHAVE_DO_PLANO_DA_PREVIA) === 'premium' ? 'premium' : 'free';
  } catch {
    return 'free';
  }
}

export function definirPlanoDaPrevia(plano: PlanoDaPrevia): void {
  try {
    localStorage.setItem(CHAVE_DO_PLANO_DA_PREVIA, plano);
  } catch {
    /* sem armazenamento */
  }
}
