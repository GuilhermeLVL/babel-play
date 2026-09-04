/**
 * VAZAMENTO DA CAIXA DE SOM NO MICROFONE — cenário "conversa" (sistema em um idioma, você em outro).
 *
 * Sem fone de ouvido, o áudio da chamada sai pelos alto-falantes e entra pelo mic. O Whisper do
 * mic recebe dica `pt` e decodifica inglês como um português inventado, atribuído a "você". O
 * cancelamento de eco do navegador só remove o que o PRÓPRIO navegador toca; loopback/aba
 * compartilhada não conta.
 *
 * Critério (puro, testado): o texto do mic é detectado no idioma do SISTEMA (não no seu) E o
 * trecho do mic se sobrepõe majoritariamente a uma fala do sistema. Os dois juntos — um só não
 * basta: você pode falar inglês de propósito (sem sobreposição), e pode falar português por cima
 * dos outros (idioma certo).
 */

export interface Intervalo { inicioMs: number; fimMs: number }

export interface EntradaVazamento {
  /** Idioma detectado no texto do mic (ISO-639-1) ou null quando o detector não soube. */
  idiomaDetectado: string | null
  /** Idioma que VOCÊ declarou falar. */
  idiomaDoMic: string
  /** Idioma do áudio do sistema (o que os outros falam). */
  idiomaDoSistema: string
  /** Janela do enunciado do mic. */
  mic: Intervalo
  /** Falas do sistema recentes (qualquer ordem; uma em curso pode ter `fimMs` = agora). */
  falasDoSistema: ReadonlyArray<Intervalo>
}

export const FRACAO_MINIMA_DE_SOBREPOSICAO = 0.6

const base = (l: string | null | undefined) => (l ?? '').split('-')[0].toLowerCase()

/** Milissegundos de `a` cobertos pela união de `outros` (sem contar duas vezes). */
export function sobreposicaoMs(a: Intervalo, outros: ReadonlyArray<Intervalo>): number {
  const recortes = outros
    .map((o) => ({ inicioMs: Math.max(a.inicioMs, o.inicioMs), fimMs: Math.min(a.fimMs, o.fimMs) }))
    .filter((r) => r.fimMs > r.inicioMs)
    .sort((x, y) => x.inicioMs - y.inicioMs)
  let total = 0
  let cursor = -Infinity
  for (const r of recortes) {
    const ini = Math.max(r.inicioMs, cursor)
    if (r.fimMs > ini) { total += r.fimMs - ini; cursor = r.fimMs }
  }
  return total
}

export type VeredictoVazamento = 'vazamento' | 'fala-propria'

export function classificarVazamento(e: EntradaVazamento): { veredicto: VeredictoVazamento; fracao: number } {
  const dur = Math.max(1, e.mic.fimMs - e.mic.inicioMs)
  const fracao = Math.min(1, sobreposicaoMs(e.mic, e.falasDoSistema) / dur)
  const det = base(e.idiomaDetectado)
  const mic = base(e.idiomaDoMic)
  const sis = base(e.idiomaDoSistema)
  if (!det || !sis || sis === mic) return { veredicto: 'fala-propria', fracao }
  const soaComoOsOutros = det === sis && det !== mic
  return { veredicto: soaComoOsOutros && fracao >= FRACAO_MINIMA_DE_SOBREPOSICAO ? 'vazamento' : 'fala-propria', fracao }
}
