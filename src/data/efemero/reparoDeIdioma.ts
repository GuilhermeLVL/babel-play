/**
 * REPARO LOCAL DO IDIOMA (modo sem conta / edição estática) — aplica o plano de
 * `@core/texto/reparoDeIdioma` ao IndexedDB, uma vez por carregamento, antes da primeira leitura
 * de sessões ou cartões.
 *
 * A edição estática é onde o dono usa o app: tudo mora neste navegador, então é AQUI que as sessões
 * gravadas antes da correção (fala em português etiquetada `en`, cartões com o idioma do seletor)
 * precisam ser consertadas. Idempotente: com os dados já coerentes, o plano sai vazio e nada é
 * escrito.
 *
 * O cartão reetiquetado ganha a chave de dedup do idioma NOVO (`pt|palavra`). Se já existe outro
 * cartão com essa chave (a mesma palavra fichada de novo depois da correção), o antigo fica como
 * está — juntar dois cartões seria decidir qual histórico de revisão vale, e reparo não apaga nada.
 */
import { chaveDedup } from '@core/texto/palavra';
import { planejarReparoDeIdioma, planoVazio } from '@core/texto/reparoDeIdioma';

import { abrirStore } from './store';

export interface ResultadoDoReparo {
  falas: number;
  cartoes: number;
  sessoes: number;
  /** Cartões que não mudaram porque a chave nova já pertence a outro cartão. */
  conflitos: number;
}

export async function repararIdiomasLocais(): Promise<ResultadoDoReparo> {
  const db = await abrirStore();
  const [sessoes, falas, cartoes] = await Promise.all([db.getAll('sessoes'), db.getAll('falas'), db.getAll('cartoes')]);
  const plano = planejarReparoDeIdioma({ sessoes, falas, cartoes });
  const resultado: ResultadoDoReparo = { falas: 0, cartoes: 0, sessoes: 0, conflitos: 0 };
  if (planoVazio(plano)) return resultado;

  const tx = db.transaction(['sessoes', 'falas', 'cartoes'], 'readwrite');
  const agora = Date.now();
  for (const t of plano.falas) {
    const f = await tx.objectStore('falas').get(t.id);
    if (!f) continue;
    await tx.objectStore('falas').put({ ...f, sourceLang: t.para });
    resultado.falas++;
  }
  for (const t of plano.sessoes) {
    const s = await tx.objectStore('sessoes').get(t.id);
    if (!s) continue;
    await tx.objectStore('sessoes').put({ ...s, sourceLang: t.sourcePara, targetLang: t.targetPara, updatedAt: agora });
    resultado.sessoes++;
  }
  const porChave = tx.objectStore('cartoes').index('porNormKey');
  for (const t of plano.cartoes) {
    const c = await tx.objectStore('cartoes').get(t.id);
    if (!c) continue;
    const normKey = chaveDedup(c.word, t.srcPara);
    const dono = await porChave.get(normKey);
    if (dono && dono.id !== c.id) {
      resultado.conflitos++;
      continue;
    }
    await tx.objectStore('cartoes').put({ ...c, srcLang: t.srcPara, tgtLang: t.tgtPara, normKey });
    resultado.cartoes++;
  }
  await tx.done;
  console.info('[reparo de idioma] local:', resultado);
  return resultado;
}

let emCurso: Promise<ResultadoDoReparo | null> | null = null;

/**
 * Roda o reparo UMA vez por carregamento da página. Falha não bloqueia a leitura: o reparo é uma
 * melhoria dos dados, não condição para mostrá-los.
 */
export function garantirReparoDeIdiomas(): Promise<ResultadoDoReparo | null> {
  emCurso ??= repararIdiomasLocais().catch((e: unknown) => {
    console.warn('[reparo de idioma] falhou, os dados seguem como estavam:', e);
    return null;
  });
  return emCurso;
}

/** Só para testes: esquece que o reparo já rodou. */
export function esquecerReparoDeIdiomas(): void {
  emCurso = null;
}
