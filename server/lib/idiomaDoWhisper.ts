/**
 * O IDIOMA QUE O WHISPER JÁ SABIA — e que estávamos jogando fora.
 *
 * O Whisper identifica o idioma a partir do ÁUDIO, dentro do próprio decode: é a informação mais
 * confiável que existe no fio inteiro, porque vem do sinal e não de um palpite sobre o texto.
 * O proxy pedia `response_format: 'json'`, que devolve só `{ text }`, e o cliente reconstruía o
 * idioma passando o texto por um detector de palavras-função. Um espanhol curto ("Vale, vamos")
 * não tem sinal para esse detector — e foi assim que uma sessão inteira em espanhol apareceu com
 * a bandeira do inglês.
 *
 * `verbose_json` traz o campo `language` sem custo adicional de API. Só falta normalizar: a OpenAI
 * devolve o NOME em inglês ("spanish"), a Groq às vezes devolve o código ("es"), e há endpoints
 * compatíveis que devolvem BCP-47 ("es-ES"). Tudo vira ISO-639-1 aqui, ou string vazia quando não
 * reconhecemos — vazio significa "não sei", e quem chama volta ao detector de texto.
 */

/** Nomes em inglês → ISO-639-1, cobrindo os idiomas que o app oferece (`src/lib/languages.ts`). */
const NOMES: Record<string, string> = {
  portuguese: 'pt', english: 'en', spanish: 'es', castilian: 'es', french: 'fr', german: 'de',
  italian: 'it', dutch: 'nl', flemish: 'nl', russian: 'ru', polish: 'pl', ukrainian: 'uk',
  turkish: 'tr', swedish: 'sv', danish: 'da', norwegian: 'nb', 'norwegian nynorsk': 'nb',
  finnish: 'fi', czech: 'cs', greek: 'el', romanian: 'ro', moldavian: 'ro', hungarian: 'hu',
  japanese: 'ja', korean: 'ko', chinese: 'zh', mandarin: 'zh', hindi: 'hi', arabic: 'ar',
  hebrew: 'he', indonesian: 'id', vietnamese: 'vi', thai: 'th', catalan: 'ca', galician: 'gl',
}

/**
 * Normaliza o que o provedor devolveu no campo `language`.
 *
 * Devolve '' para entradas que não reconhecemos — inclusive `nn` (nynorsk) e afins, que não estão
 * na lista do app. Inventar um código aqui seria pior que admitir a ignorância: o perfil adaptativo
 * do cliente trata '' como "esta fala não votou", e segue com as outras.
 */
export function normalizarIdiomaDoWhisper(bruto: unknown): string {
  const s = String(bruto ?? '').trim().toLowerCase()
  if (!s) return ''
  // Já é código (aceita BCP-47: 'es-ES' → 'es').
  const base = s.split(/[-_]/)[0]
  if (/^[a-z]{2}$/.test(base)) return base
  return NOMES[s] ?? ''
}
