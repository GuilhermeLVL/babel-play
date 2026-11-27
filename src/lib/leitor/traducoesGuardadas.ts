/**
 * AS TRADUÇÕES JÁ FEITAS NO LEITOR, guardadas SÓ NESTE APARELHO (openspec `leitura-assistida`, fatia B): servem para
 * exportar os grifos com a tradução sem pedir tudo de novo. Nada sobe ao servidor (retenção zero); com o armazenamento
 * bloqueado, simplesmente não guarda. Pequeno de propósito: no máximo 200 trechos por livro, cada um com teto de tamanho.
 */
import { chaveDoTrecho, type TraducoesDosTrechos } from '../../core/leitura/exportar';

const MAX_TRECHOS = 200;
const MAX_CARACTERES = 1500;
const chaveDoLivro = (livroId: string) => `leitor:traducoes:${livroId}`;

export function lerTraducoesGuardadas(livroId: string): TraducoesDosTrechos {
  try {
    const bruto = localStorage.getItem(chaveDoLivro(livroId));
    const o = bruto ? (JSON.parse(bruto) as unknown) : null;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const saida: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && v) saida[k] = v;
    return saida;
  } catch {
    return {};
  }
}

/** Soma uma tradução; passando de {@link MAX_TRECHOS}, os mais antigos saem primeiro. */
export function guardarTraducao(livroId: string, texto: string, traducao: string): void {
  const chave = chaveDoTrecho(texto);
  if (!chave || !traducao || chave.length > MAX_CARACTERES || traducao.length > MAX_CARACTERES) return;
  try {
    const atual = { ...lerTraducoesGuardadas(livroId) };
    delete atual[chave]; // regravar põe no fim (o mais novo)
    atual[chave] = traducao;
    const chaves = Object.keys(atual);
    for (const k of chaves.slice(0, Math.max(0, chaves.length - MAX_TRECHOS))) delete atual[k];
    localStorage.setItem(chaveDoLivro(livroId), JSON.stringify(atual));
  } catch {
    /* sem armazenamento: a exportação sai só com o original */
  }
}
