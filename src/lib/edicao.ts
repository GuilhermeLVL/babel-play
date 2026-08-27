/**
 * EDIÇÃO do build — `VITE_EDICAO=leve` é a versão hospedada da primeira onda pública:
 * sem conta (nada de login, convite, plano, migração), menu Início · Capturar · Jogar (+ Ajustes
 * reduzido), onboarding de uma tela, tudo persistido no navegador (IndexedDB) e NENHUMA
 * requisição a `/api`. O código de conta não é apagado — só não monta.
 *
 * Constante, não função: o Rollup elimina os ramos falsos, e o bundle leve não carrega Login,
 * Supabase nem os modais de conta.
 */
const env: Record<string, string | undefined> = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

// O CSS precisa saber da edicao (ex.: reserva do iChat so na completa). Marcado aqui, no load
// do modulo, para valer antes do primeiro paint — efeito React chegaria tarde.
if (typeof document !== 'undefined' && env.VITE_EDICAO === 'leve') {
  document.documentElement.setAttribute('data-edicao', 'leve');
}

export const EDICAO_LEVE: boolean = env.VITE_EDICAO === 'leve'
