/**
 * OS CANDIDATOS A TERMO TÉCNICO OU SIGLA — a detecção LOCAL do recurso 3 do assistente ao vivo (spec
 * `docs/specs/2026-10-25-assistente-ao-vivo.md`). A tela só chama a nuvem (`POST /api/ai/assistente/termos`) quando a
 * linha tem candidato, e guarda a explicação por termo: "KPI" explicado uma vez não é pedido de novo na sessão.
 *
 * O que é candidato aqui: a SIGLA em caixa alta, de 2 a 6 caracteres, com letras e talvez dígitos ou `&` ("KPI",
 * "B2B", "R&D", "KPIs"). Termo técnico em minúsculas ("churn", "bandwidth") não tem regra local confiável: a tela pode
 * pedir a nuvem sem `termos`, e o modelo escolhe até 2 na linha.
 *
 * O que NÃO é candidato: palavras comuns que aparecem em caixa alta ("I", "OK", "TV" é sigla mas todo mundo sabe…), e a
 * linha INTEIRA em caixa alta (é grito ou título, não sigla).
 */

/** Siglas que todo aprendiz já conhece, ou palavras comuns em caixa alta: não vale uma chamada. */
const CONHECIDAS = new Set(['I', 'OK', 'TV', 'A', 'AM', 'PM', 'USA', 'UK', 'EU', 'ID', 'OMG', 'LOL', 'VS']);

/** 2–6 caracteres, começando por letra maiúscula, só maiúsculas/dígitos/`&`, com um `s` minúsculo opcional no fim. */
const SIGLA = /(?<![\p{L}\p{N}])[A-Z][A-Z0-9&]{1,5}s?(?![\p{L}\p{N}])/gu;

export const MAX_CANDIDATOS_A_TERMO = 3;

/** As siglas candidatas da linha, na ordem em que aparecem, sem repetir, até 3. */
export function candidatosATermo(linha: string): string[] {
  if (!linha) return [];
  const letras = linha.replace(/[^\p{L}]/gu, '');
  /* Linha toda em caixa alta: grito ou título. */
  if (letras.length >= 8 && letras === letras.toUpperCase()) return [];
  const vistos: string[] = [];
  for (const m of linha.matchAll(SIGLA)) {
    const termo = m[0];
    const semPlural = termo.endsWith('s') ? termo.slice(0, -1) : termo;
    if (!/[A-Z].*[A-Z0-9&]/.test(semPlural)) continue;
    if (CONHECIDAS.has(semPlural) || vistos.includes(termo)) continue;
    vistos.push(termo);
    if (vistos.length >= MAX_CANDIDATOS_A_TERMO) break;
  }
  return vistos;
}
