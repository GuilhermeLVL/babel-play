/**
 * RANKING GLOBAL — cliente.
 *
 * Fala DIRETO com `/api/rank/*` (Pages Function + D1), fora do funil `apiFetch`, de propósito:
 * o ranking é público e anônimo por design (apelido escolhido + pontos, nada mais), não depende
 * de identidade e precisa funcionar exatamente igual com e sem conta. No ambiente local (vite,
 * sem Functions) as chamadas falham e a UI mostra o estado "só na versão publicada" — nunca
 * dados inventados.
 */

export interface LinhaDoRanking {
  apelido: string;
  pontos: number;
  combo: number;
  quando: number;
}

const CHAVE_APELIDO = 'babel.apelido';
/** Espelho local do que já foi enviado, por jogo — evita reenvio de pontuação menor. */
const CHAVE_ENVIADO = 'babel.rank_enviado';

export function lerApelido(): string {
  try { return localStorage.getItem(CHAVE_APELIDO) ?? ''; } catch { return ''; }
}

export function salvarApelido(apelido: string): string {
  const limpo = sanearApelido(apelido);
  try { localStorage.setItem(CHAVE_APELIDO, limpo); } catch { /* sem storage */ }
  return limpo;
}

/** 3–20 caracteres, letras/números/espaço/_- (o servidor valida de novo — isto é só conforto). */
export function sanearApelido(bruto: string): string {
  return bruto.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
}

export function apelidoValido(apelido: string): boolean {
  const a = sanearApelido(apelido);
  return a.length >= 3 && a.length <= 20;
}

export function melhorEnviado(jogo: string): number {
  try { return (JSON.parse(localStorage.getItem(CHAVE_ENVIADO) || '{}') as Record<string, number>)[jogo] ?? 0; } catch { return 0; }
}

function marcarEnviado(jogo: string, pontos: number): void {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE_ENVIADO) || '{}') as Record<string, number>;
    m[jogo] = Math.max(m[jogo] ?? 0, pontos);
    localStorage.setItem(CHAVE_ENVIADO, JSON.stringify(m));
  } catch { /* sem storage */ }
}

export async function lerRanking(jogo: string, limite = 20): Promise<LinhaDoRanking[] | null> {
  try {
    const res = await fetch(`/api/rank/${encodeURIComponent(jogo)}?limite=${limite}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const dados = (await res.json()) as { linhas?: LinhaDoRanking[] };
    return Array.isArray(dados.linhas) ? dados.linhas : null;
  } catch {
    return null; // sem Function (ambiente local) ou offline
  }
}

export async function enviarParaRanking(jogo: string, pontos: number, combo: number): Promise<'ok' | 'indisponivel' | 'recusado'> {
  const apelido = lerApelido();
  if (!apelidoValido(apelido)) return 'recusado';
  try {
    const res = await fetch(`/api/rank/${encodeURIComponent(jogo)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apelido, pontos, combo }),
    });
    if (res.status === 429 || res.status === 400) return 'recusado';
    if (!res.ok) return 'indisponivel';
    marcarEnviado(jogo, pontos);
    return 'ok';
  } catch {
    return 'indisponivel';
  }
}
