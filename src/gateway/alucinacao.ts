/**
 * FILTRO DE ALUCINAÇÃO — o que o Whisper "inventa" em silêncio, música e ruído.
 *
 * O modelo foi treinado em legendas da internet; sem fala de verdade ele completa com o que mais
 * viu: créditos de legenda, agradecimentos, reticências, uma palavra repetida. Nada disto é
 * plausível como fala capturada de um vídeo ou chamada, e cada item abaixo apareceu em uso real.
 * A lista é curta e nomeada de propósito: filtro genérico "por probabilidade" esconderia fala
 * legítima; este só corta o que sabidamente não é.
 *
 * Também corta texto longo demais para a duração do áudio e o mesmo token repetido (o "no no no
 * no" do decode greedy). O teto de palavras/segundo é POR IDIOMA: 6/s foi calibrado em inglês;
 * português falado rápido chega perto disso legitimamente, então fora do EN o teto é 8/s.
 */
const FRASES_ALUCINADAS: RegExp[] = [
  /legendas? (pela|da) comunidade/i,
  /amara\.org/i,
  /^(obrigad[oa] por assistir|thanks? (you )?for watching|thank you\.?$|gracias por ver)/i,
  /^(subtitles?|sous-titres|subt[ií]tulos|untertitel) (by|par|de|von)/i,
  /^(inscreva-se|se inscreva|subscribe|like and subscribe)/i,
  /^\W*$/,                       // só pontuação / reticências
]
/* Token solto clássico do silêncio — SÓ quando a dica de idioma é inglês (ou desconhecida). Em
   português "Ah." e "Hum." são respostas legítimas curtas, e um "so" isolado não aparece. */
const TOKEN_SOLTO_EN = /^(you|so|hmm|uh|um|ah)\W*$/i

import { baseLang } from '@core/texto/idioma'

/** Palavras por segundo acima do qual não é fala humana, por idioma da dica. */
export function tetoDePalavrasPorSegundo(lang?: string): number {
  const l = baseLang(lang)
  return !l || l === 'en' ? 6 : 8
}

/** Tokens/segundo para o teto dinâmico de geração: PT/ES/… tokenizam pior que EN no vocabulário do Whisper. */
export function tokensPorSegundo(lang?: string): number {
  const l = baseLang(lang)
  return !l || l === 'en' ? 15 : 22
}

export function filtrarAlucinacao(texto: string, audioSec: number, lang?: string): string {
  const t = texto.trim()
  if (!t) return ''
  if (FRASES_ALUCINADAS.some((r) => r.test(t))) return ''
  const l = baseLang(lang)
  if ((!l || l === 'en') && TOKEN_SOLTO_EN.test(t)) return ''
  const palavras = t.split(/\s+/)
  if (audioSec > 0 && palavras.length / audioSec > tetoDePalavrasPorSegundo(lang)) return ''  // rápido demais para fala
  if (palavras.length >= 4 && new Set(palavras.map((p) => p.toLowerCase())).size === 1) return ''  // "no no no no"
  return t
}
