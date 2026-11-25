/**
 * PERFIS DE MAPEAMENTO, SÓ NO APARELHO. Quem corrigiu os campos de um tipo de nota uma vez não precisa corrigir de novo:
 * guardamos `hash da estrutura -> papel de cada campo`. Nada de conteúdo de nota, nada de nome de baralho, nada no
 * servidor, nada na conta (decisão do dono, 25/11: retenção zero, coerente com a leitura do `.apkg` no navegador).
 *
 * `localStorage` pode faltar ou lançar (janela privada, dados bloqueados, prévia): toda leitura e escrita é em
 * `try/catch`, e sem o armazenamento o app só volta ao palpite automático. Apagar os dados do navegador apaga os perfis.
 */
import { PAPEIS_NA_IMPORTACAO, type PapelNaImportacao } from '../../core/anki';

export const CHAVE_DOS_PERFIS = 'frasy.anki.perfis.v1';
/** Teto de perfis guardados: os mais recentes ficam. */
export const MAXIMO_DE_PERFIS = 50;

export type PerfisDeMapeamento = Record<string, PapelNaImportacao[]>;

interface Guardado {
  papeis: PapelNaImportacao[];
  em: number;
}

function lerGuardados(): Record<string, Guardado> {
  try {
    const bruto = globalThis.localStorage?.getItem(CHAVE_DOS_PERFIS);
    if (!bruto) return {};
    const dado = JSON.parse(bruto) as unknown;
    if (!dado || typeof dado !== 'object' || Array.isArray(dado)) return {};
    const limpo: Record<string, Guardado> = {};
    for (const [hash, g] of Object.entries(dado as Record<string, unknown>)) {
      const papeis = (g as Guardado | undefined)?.papeis;
      const valido =
        /^[0-9a-f]{16}$/.test(hash) &&
        Array.isArray(papeis) &&
        papeis.length > 0 &&
        papeis.length <= 200 &&
        papeis.every((p) => PAPEIS_NA_IMPORTACAO.includes(p));
      if (valido) limpo[hash] = { papeis, em: Number((g as Guardado).em) || 0 };
    }
    return limpo;
  } catch {
    return {};
  }
}

function gravar(guardados: Record<string, Guardado>): void {
  try {
    globalThis.localStorage?.setItem(CHAVE_DOS_PERFIS, JSON.stringify(guardados));
  } catch {
    /* sem armazenamento, sem perfil: o palpite automático segue valendo */
  }
}

/** Os perfis válidos deste aparelho, por hash de estrutura. */
export function lerPerfis(): PerfisDeMapeamento {
  return Object.fromEntries(Object.entries(lerGuardados()).map(([hash, g]) => [hash, g.papeis]));
}

/** Lembra o mapeamento que a pessoa confirmou para esta estrutura. */
export function salvarPerfil(hash: string, papeis: PapelNaImportacao[], agora = Date.now()): void {
  const guardados = lerGuardados();
  guardados[hash] = { papeis, em: agora };
  const recentes = Object.entries(guardados)
    .sort((a, b) => b[1].em - a[1].em)
    .slice(0, MAXIMO_DE_PERFIS);
  gravar(Object.fromEntries(recentes));
}

/** Esquece o perfil de uma estrutura: a próxima importação volta ao palpite automático. */
export function esquecerPerfil(hash: string): void {
  const guardados = lerGuardados();
  if (!(hash in guardados)) return;
  delete guardados[hash];
  gravar(guardados);
}
