/**
 * BACKUP DA ESTANTE: o formato do `estante.json` e a validação PURA de um backup que chega de fora. O arquivo é
 * um `.zip` com `estante.json` e os arquivos dos livros trazidos em `livros/`. A restauração NUNCA confia no
 * conteúdo: confere versão, formato, tipos, tamanhos e caminhos aqui, e depois cada livro passa pelos mesmos
 * filtros de uma importação nova (`lerArquivoTrazido`). Nada do arquivo é executado.
 */
import { type AnotacaoDeLeitura, validarAnotacao } from '../leitura/anotacao';
import type { PosicaoDeLeitura } from '../leitura/posicao';
import type { FormatoTrazido } from './formatos';
import type { StatusDeLeitura } from './meusLivros';
import { caminhoSeguroNoZip } from './zipSeguro';

export const FORMATO_DO_BACKUP = 'frasy-estante';
export const VERSAO_DO_BACKUP = 1;
export const NOME_DO_JSON = 'estante.json';
export const TETO_DO_BACKUP = {
  livros: 200,
  anotacoes: 50_000,
  bytesDoJson: 32 * 1024 * 1024,
  bytesDoZip: 300 * 1024 * 1024,
} as const;

const FORMATOS: readonly FormatoTrazido[] = ['epub', 'pdf', 'mobi', 'fb2', 'cbz', 'docx', 'txt', 'html', 'md'];
const STATUS: readonly StatusDeLeitura[] = ['quero-ler', 'lendo', 'lido'];

export interface LivroNoBackup {
  id: string;
  titulo: string;
  autor?: string;
  idioma?: string;
  formato: FormatoTrazido;
  status: StatusDeLeitura;
  etiquetas: string[];
  adicionadoEm: number;
  abertoEm?: number;
  nomeDoArquivo: string;
  /** Caminho do arquivo dentro do zip (`livros/<n>.<ext>`). */
  arquivo: string;
  posicao?: PosicaoDeLeitura;
  /** A capa escolhida pela pessoa (imagem em `capas/`), quando o armazém tiver. */
  capa?: string;
}

export interface EstanteNoBackup {
  formato: typeof FORMATO_DO_BACKUP;
  versao: number;
  criadoEm: number;
  livros: LivroNoBackup[];
  anotacoes: AnotacaoDeLeitura[];
}

export type ErroDeBackup = 'invalido' | 'versao-desconhecida' | 'grande';

export interface ResultadoDaLeituraDoBackup {
  ok: boolean;
  estante: EstanteNoBackup | null;
  erro: ErroDeBackup | null;
}

const falha = (erro: ErroDeBackup): ResultadoDaLeituraDoBackup => ({ ok: false, estante: null, erro });
const ehObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const ehNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const ehTexto = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
// eslint-disable-next-line no-control-regex
const semControle = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

function validarPosicao(x: unknown, livroId: string): PosicaoDeLeitura | undefined {
  if (!ehObj(x) || !ehNum(x.secao) || !ehNum(x.fracao) || !ehNum(x.atualizadaEm)) return undefined;
  const cfi = typeof x.cfi === 'string' && /^epubcfi\(.+\)$/.test(x.cfi) && x.cfi.length <= 1000 ? x.cfi : '';
  if (!cfi && !(x.secao > 0)) return undefined;
  return {
    livroId,
    cfi,
    secao: Math.max(0, Math.floor(x.secao)),
    fracao: Math.min(1, Math.max(0, x.fracao)),
    ...(typeof x.capitulo === 'string' ? { capitulo: semControle(x.capitulo).slice(0, 300) } : {}),
    atualizadaEm: x.atualizadaEm,
  };
}

/** Valida o `estante.json` já lido. Qualquer coisa fora do contrato derruba o backup inteiro (falha fechada). */
export function validarEstante(bruto: unknown): ResultadoDaLeituraDoBackup {
  if (!ehObj(bruto) || bruto.formato !== FORMATO_DO_BACKUP || !ehNum(bruto.versao)) return falha('invalido');
  if (bruto.versao !== VERSAO_DO_BACKUP) return falha('versao-desconhecida');
  if (!ehNum(bruto.criadoEm) || !Array.isArray(bruto.livros) || !Array.isArray(bruto.anotacoes)) {
    return falha('invalido');
  }
  if (bruto.livros.length > TETO_DO_BACKUP.livros || bruto.anotacoes.length > TETO_DO_BACKUP.anotacoes) {
    return falha('grande');
  }
  const ids = new Set<string>();
  const caminhos = new Set<string>();
  const livros: LivroNoBackup[] = [];
  for (const l of bruto.livros as unknown[]) {
    if (!ehObj(l)) return falha('invalido');
    if (typeof l.id !== 'string' || !/^meu-[A-Za-z0-9-]{1,40}$/.test(l.id) || ids.has(l.id)) return falha('invalido');
    if (!ehTexto(l.titulo, 300) || !semControle(l.titulo)) return falha('invalido');
    if (!FORMATOS.includes(l.formato as FormatoTrazido)) return falha('invalido');
    if (!STATUS.includes(l.status as StatusDeLeitura)) return falha('invalido');
    if (!ehNum(l.adicionadoEm) || (l.abertoEm != null && !ehNum(l.abertoEm))) return falha('invalido');
    if (!ehTexto(l.nomeDoArquivo, 300)) return falha('invalido');
    if (typeof l.arquivo !== 'string' || !l.arquivo.startsWith('livros/') || !caminhoSeguroNoZip(l.arquivo)) {
      return falha('invalido');
    }
    if (caminhos.has(l.arquivo)) return falha('invalido');
    if (l.autor != null && !ehTexto(l.autor, 300)) return falha('invalido');
    if (l.idioma != null && !ehTexto(l.idioma, 20)) return falha('invalido');
    const etiquetas = Array.isArray(l.etiquetas) ? l.etiquetas : [];
    if (etiquetas.length > 50 || etiquetas.some((e) => !ehTexto(e, 60))) return falha('invalido');
    if (l.capa != null && (typeof l.capa !== 'string' || !l.capa.startsWith('capas/') || !caminhoSeguroNoZip(l.capa))) {
      return falha('invalido');
    }
    ids.add(l.id);
    caminhos.add(l.arquivo);
    livros.push({
      id: l.id,
      titulo: semControle(l.titulo),
      ...(typeof l.autor === 'string' ? { autor: semControle(l.autor) } : {}),
      ...(typeof l.idioma === 'string' ? { idioma: semControle(l.idioma) } : {}),
      formato: l.formato as FormatoTrazido,
      status: l.status as StatusDeLeitura,
      etiquetas: etiquetas.map((e) => semControle(e as string)).filter(Boolean),
      adicionadoEm: l.adicionadoEm,
      ...(ehNum(l.abertoEm) ? { abertoEm: l.abertoEm } : {}),
      nomeDoArquivo: semControle(l.nomeDoArquivo) || 'livro',
      arquivo: l.arquivo,
      ...(validarPosicao(l.posicao, l.id) ? { posicao: validarPosicao(l.posicao, l.id) } : {}),
      ...(typeof l.capa === 'string' ? { capa: l.capa } : {}),
    });
  }
  const anotacoes: AnotacaoDeLeitura[] = [];
  for (const a of bruto.anotacoes as unknown[]) {
    const r = validarAnotacao(a, { agora: Date.now() });
    /* Anotação sem livro neste backup, ou inválida, fica de fora (não derruba o resto). */
    if (r.ok && ids.has(r.anotacao.livroId)) anotacoes.push(r.anotacao);
  }
  return {
    ok: true,
    estante: { formato: FORMATO_DO_BACKUP, versao: VERSAO_DO_BACKUP, criadoEm: bruto.criadoEm, livros, anotacoes },
    erro: null,
  };
}

/** Os livros do backup que já existem na estante (mesmo id): a pessoa escolhe manter ou substituir. */
export function conflitosDoBackup(estante: EstanteNoBackup, idsExistentes: Iterable<string>): LivroNoBackup[] {
  const tem = new Set(idsExistentes);
  return estante.livros.filter((l) => tem.has(l.id));
}
