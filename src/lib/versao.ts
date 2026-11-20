/**
 * A VERSÃO DESTE BUNDLE, e a conferência com a do servidor (P0-7b, auditoria de prontidão).
 *
 * `__APP_VERSION__` é trocado pela string no build (`define` do `vite.config.ts`); a regra que a
 * monta — `0.1.0` ou `0.1.0+<sha7>` — é a de `server/lib/versao.ts`, a mesma do servidor.
 *
 * POR QUE CONFERIR. Uma aba aberta antes de um deploy segue rodando o bundle velho contra o
 * servidor novo: rotas que mudaram de forma, chunks que o deploy apagou. Toda resposta `/api` traz
 * `x-babel-versao`; quando ela difere da versão do bundle, o `apiFetch` (`src/data/funil.ts`) chama
 * a conferência, que dispara o aviso UMA vez — não uma por requisição, que viraria ruído. O aviso
 * é discreto e não bloqueia (`src/lib/avisoDeNovaVersao.ts`): quem está no meio de um exercício
 * termina e atualiza quando quiser.
 */
import { avisarNovaVersao } from './avisoDeNovaVersao';

declare const __APP_VERSION__: string | undefined;

/** A versão embutida no build. Vazia fora do Vite (testes, ferramentas) — e aí nada é comparado. */
export const VERSAO_DO_APP: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

/** Nome do cabeçalho que o servidor manda em toda resposta `/api` (`server/lib/versao.ts`). */
export const CABECALHO_DA_VERSAO = 'x-babel-versao';

/**
 * As duas versões são a mesma? Iguais byte a byte, ou com a mesma base quando um dos lados não
 * traz o sha (`0.1.0` × `0.1.0+0b82814`): sem o metadado de um lado não há como dizer que o deploy
 * mudou, e acusar diferença era o aviso de "nova versão" em toda página do staging.
 */
function mesmaVersao(a: string, b: string): boolean {
  if (a === b) return true;
  const [baseA, shaA] = a.split('+', 2);
  const [baseB, shaB] = b.split('+', 2);
  return (!shaA || !shaB) && baseA === baseB;
}

/**
 * Uma conferência com memória: devolve `true` só na PRIMEIRA vez em que o servidor responde com
 * versão diferente da do bundle. Sem cabeçalho (resposta do servidor em memória, servidor antigo,
 * proxy que o removeu) não conclui nada.
 */
export function criarConferenciaDeVersao(
  doBundle: string,
  aoDetectar: (versaoDoServidor: string) => void,
): (doServidor: string | null) => boolean {
  let avisou = false;
  return (doServidor) => {
    if (avisou || !doBundle || !doServidor || mesmaVersao(doBundle, doServidor)) return false;
    avisou = true;
    aoDetectar(doServidor);
    return true;
  };
}

/** A conferência do app — a que o `apiFetch` usa. */
export const conferirVersaoDoServidor = criarConferenciaDeVersao(VERSAO_DO_APP, avisarNovaVersao);
