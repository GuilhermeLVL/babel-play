/**
 * ARQUIVOS DA RECEITA NO APARELHO (Estúdio): baixar e ler um `.json` LOCAL. Nada daqui usa rede.
 *
 *  · `baixarReceita` cria um Blob e o link de download (`blob:`, só deste documento);
 *  · `lerArquivoDeReceita` confere o tamanho ANTES de ler o arquivo, passa o texto por `importarReceita` (core) e, se a
 *    base é `importado`, confere no IndexedDB se o modelo existe aqui: se não existir, devolve o aviso
 *    `modelo_ausente` ("modelo não encontrado neste aparelho") e a receita segue valendo.
 */
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import {
  type AvisoDaImportacao,
  exportarReceita,
  importarReceita,
  LIMITES_DO_ARQUIVO,
} from '../../core/avatar/receitaArquivo';
import { lerModeloImportado } from './armazem';

export type AvisoDoArquivo = AvisoDaImportacao | { codigo: 'modelo_ausente' };

export type ResultadoDoArquivo =
  | { ok: true; receita: ReceitaDeAvatar; avisos: AvisoDoArquivo[] }
  | { ok: false; erros: string[] };

const slug = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

export const nomeDoArquivoDaReceita = (r: ReceitaDeAvatar): string => `avatar-${slug(r.meta.nome) || 'meu'}.frasy.json`;

/** Baixa a receita como `.json` (local). Devolve o texto gravado, para teste e para o aviso da tela. */
export function baixarReceita(receita: ReceitaDeAvatar): string {
  const texto = exportarReceita(receita);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoArquivoDaReceita(receita);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return texto;
}

export async function lerArquivoDeReceita(arquivo: File | Blob): Promise<ResultadoDoArquivo> {
  if (arquivo.size > LIMITES_DO_ARQUIVO.bytes)
    return { ok: false, erros: ['arquivo: grande demais para uma receita (máximo 16 KB)'] };
  let texto: string;
  try {
    texto = await arquivo.text();
  } catch {
    return { ok: false, erros: ['arquivo: ilegível'] };
  }
  const r = importarReceita(texto);
  if ('erros' in r) return r;
  const avisos: AvisoDoArquivo[] = [...r.avisos];
  if (r.receita.base.origem === 'importado') {
    let existe: boolean;
    try {
      existe = (await lerModeloImportado(r.receita.base.id)) !== null;
    } catch {
      existe = false;
    }
    if (!existe) avisos.push({ codigo: 'modelo_ausente' });
  }
  return { ok: true, receita: r.receita, avisos };
}
