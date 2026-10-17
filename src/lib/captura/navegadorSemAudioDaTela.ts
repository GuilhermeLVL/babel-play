/**
 * O NAVEGADOR QUE NUNCA ENTREGA O SOM DA TELA OU DA ABA. `getDisplayMedia` existe no Firefox e no Safari,
 * mas a faixa de áudio não vem: repetir "marque o áudio da aba" (instrução do Chrome e do Edge) deixa a
 * pessoa num ciclo sem saída. Quando o compartilhamento volta sem áudio, quem chama usa isto para dizer a
 * verdade (use o Chrome/Edge, ou o microfone) em vez de mandar escolher de novo.
 *
 * Pelo user agent, porque não há como perguntar ao navegador "você entrega áudio da aba?" antes de
 * compartilhar. Chrome, Edge, Opera e os baseados em Chromium também dizem "Safari/", então o Safari é
 * "Safari/" SEM nenhum deles.
 */
export function navegadorSemAudioDaTela(userAgent: string): boolean {
  const ua = userAgent ?? '';
  if (/Firefox\/|FxiOS/.test(ua)) return true;
  return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS|Edg\/|EdgA|EdgiOS|OPR\/|Android/.test(ua);
}
