/**
 * RANKING GLOBAL — cliente.
 *
 * Fala DIRETO com `/api/rank/*`, fora do funil `apiFetch`, de propósito: o ranking é público e
 * anônimo por design (apelido escolhido + pontos, nada mais), não depende de identidade e precisa
 * funcionar exatamente igual com e sem conta. O funil desvia para o servidor EM MEMÓRIA quando a
 * identidade é anônima, e aquele servidor não tem placar de ninguém além de quem joga nele.
 *
 * ATÉ 07/09 o outro lado era uma Pages Function do Cloudflare contra um banco D1 — e nunca foi
 * publicada, então o ranking nunca funcionou. Com a edição leve encerrada, a rota passou para o
 * servidor do próprio app (`server/routes/rank.ts`). ESTE ARQUIVO NÃO MUDOU UMA LINHA de chamada:
 * as URLs são as mesmas. Era o servidor do outro lado que não existia.
 *
 * Falha continua virando estado vazio na UI — nunca dados inventados.
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
    /* EXCEÇÃO DELIBERADA, suprimida na linha abaixo porque a regra não lê prosa. O funil `apiFetch`
       desvia para o servidor EM MEMÓRIA quando a identidade é anônima (`data/api.ts:25`), e esse
       servidor não tem placar de comunidade — passar por ele quebraria o ranking exatamente no
       modo para o qual ele foi feito. O ranking é público por design: sai apelido escolhido,
       pontos e combo, sem identidade, e só depois que o usuário escolhe um apelido. Ver o
       cabeçalho do módulo. */
    // ast-grep-ignore: fetch-fora-do-funil
    const res = await fetch(`/api/rank/${encodeURIComponent(jogo)}?limite=${limite}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const dados = (await res.json()) as { linhas?: LinhaDoRanking[] };
    return Array.isArray(dados.linhas) ? dados.linhas : null;
  } catch {
    return null; // servidor fora do ar ou offline
  }
}

export async function enviarParaRanking(jogo: string, pontos: number, combo: number): Promise<'ok' | 'indisponivel' | 'recusado'> {
  const apelido = lerApelido();
  if (!apelidoValido(apelido)) return 'recusado';
  try {
    // ast-grep-ignore: fetch-fora-do-funil — mesma exceção do `lerRanking` acima, documentada lá.
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
