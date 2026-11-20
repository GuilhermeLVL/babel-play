/**
 * OS GUIAS DO SITE PÚBLICO — `content/guias/<slug>.md`, com frontmatter:
 *
 *   titulo, descricao, slug, publicado (AAAA-MM-DD), revisado (true/false), palavrasChave (lista)
 *
 * SÓ `revisado: true` É PUBLICADO (decisão do dono, 25/10/2026): o rascunho fica no repositório e não
 * entra no build nem no sitemap. Um guia revisado com frontmatter quebrado DERRUBA o build (o dono
 * aprovou algo que não vai ao ar: melhor saber agora); um rascunho quebrado só é ignorado. Pasta
 * ausente = zero guias, e o build segue.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { lerFrontmatter, markdownParaHtml } from './markdown';

export interface Guia {
  titulo: string;
  descricao: string;
  slug: string;
  /** AAAA-MM-DD */
  publicado: string;
  palavrasChave: string[];
  /** O corpo já em HTML (escapado e sem HTML cru). */
  html: string;
  /** Palavras do corpo (para o tempo de leitura). */
  palavras: number;
}

export interface LeituraDosGuias {
  publicados: Guia[];
  /** Rascunhos (`revisado` diferente de `true`) e o motivo de cada um ficar fora. */
  ignorados: { arquivo: string; motivo: string }[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Os problemas do frontmatter de um guia (lista vazia = válido). */
function problemas(d: Record<string, unknown>): string[] {
  const p: string[] = [];
  if (!texto(d.titulo)) p.push('sem titulo');
  if (!texto(d.descricao)) p.push('sem descricao');
  if (!SLUG.test(texto(d.slug))) p.push('slug inválido (minúsculas, números e hífens)');
  if (!DATA.test(texto(d.publicado)) || Number.isNaN(Date.parse(texto(d.publicado))))
    p.push('publicado não é AAAA-MM-DD');
  return p;
}

/** Lê e valida os guias da pasta. Ordem: mais recente primeiro (empate: título). */
export function lerGuias(pasta: string): LeituraDosGuias {
  const leitura: LeituraDosGuias = { publicados: [], ignorados: [] };
  if (!existsSync(pasta)) return leitura;
  const slugs = new Set<string>();
  for (const arquivo of readdirSync(pasta)
    .filter((n) => n.endsWith('.md'))
    .sort()) {
    const { dados, corpo, temFrontmatter } = lerFrontmatter(readFileSync(path.join(pasta, arquivo), 'utf8'));
    if (!temFrontmatter) {
      leitura.ignorados.push({ arquivo, motivo: 'sem frontmatter (não é guia)' });
      continue;
    }
    if (dados.revisado !== true) {
      leitura.ignorados.push({ arquivo, motivo: 'revisado não é true (rascunho)' });
      continue;
    }
    const erros = problemas(dados);
    if (erros.length) throw new Error(`guia revisado com frontmatter inválido: ${arquivo}: ${erros.join('; ')}`);
    const slug = texto(dados.slug);
    if (slugs.has(slug)) throw new Error(`dois guias revisados com o mesmo slug: ${slug}`);
    slugs.add(slug);
    const chaves = dados.palavrasChave;
    leitura.publicados.push({
      titulo: texto(dados.titulo),
      descricao: texto(dados.descricao),
      slug,
      publicado: texto(dados.publicado),
      palavrasChave: Array.isArray(chaves) ? chaves.map((c) => c.trim()).filter(Boolean) : [],
      html: markdownParaHtml(corpo),
      palavras: corpo.split(/\s+/).filter(Boolean).length,
    });
  }
  leitura.publicados.sort((a, b) => b.publicado.localeCompare(a.publicado) || a.titulo.localeCompare(b.titulo));
  return leitura;
}
