/**
 * O CORTE DE DOMÍNIO — retenção a partir da qual o app diz "isto está sustentado".
 *
 * É o mesmo corte de `etapas.ts` (`CORTE_DE_FEITA`) e de `nivelSugerido`. Não é cópia: é acordo.
 * Mora num módulo sem dependências para quem só precisa do número (a pele de cartão, no arranque)
 * não carregar a wordlist de `fluencia.ts`, que o reexporta.
 */
export const RETENCAO_DE_DOMINIO = 0.8;
