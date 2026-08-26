/**
 * FILTRO DE ALUCINAÇÃO — o que o Whisper "inventa" em silêncio, música e ruído.
 *
 * O modelo foi treinado em legendas da internet; sem fala de verdade ele completa com o que mais
 * viu: créditos de legenda, agradecimentos, reticências, uma palavra repetida. Nada disto é
 * plausível como fala capturada de um vídeo ou chamada, e cada item abaixo apareceu em uso real.
 * A lista é curta e nomeada de propósito: filtro genérico "por probabilidade" esconderia fala
 * legítima; este só corta o que sabidamente não é.
 *
 * Também corta texto longo demais para a duração do áudio (>6 palavras/s não é fala humana) e
 * o mesmo token repetido (o "no no no no" do decode greedy).
 */
const FRASES_ALUCINADAS: RegExp[] = [
  /legendas? (pela|da) comunidade/i,
  /amara\.org/i,
  /^(obrigad[oa] por assistir|thanks? (you )?for watching|thank you\.?$|gracias por ver)/i,
  /^(subtitles?|sous-titres|subt[ií]tulos|untertitel) (by|par|de|von)/i,
  /^(inscreva-se|se inscreva|subscribe|like and subscribe)/i,
  /^\W*$/,                       // só pontuação / reticências
  /^(you|so|hmm|uh|um|ah)\W*$/i,  // token solto clássico do silêncio
]
export function filtrarAlucinacao(texto: string, audioSec: number): string {
  const t = texto.trim()
  if (!t) return ''
  if (FRASES_ALUCINADAS.some((r) => r.test(t))) return ''
  const palavras = t.split(/\s+/)
  if (audioSec > 0 && palavras.length / audioSec > 6) return ''          // rápido demais para fala
  if (palavras.length >= 4 && new Set(palavras.map((p) => p.toLowerCase())).size === 1) return ''  // "no no no no"
  return t
}
