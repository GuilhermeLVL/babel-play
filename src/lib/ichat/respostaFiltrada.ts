/**
 * O QUE O TUTOR RESPONDE QUANDO O FILTRO DE SAÍDA BARRA A RESPOSTA DO MODELO (change `filtro-tutor-menores`).
 *
 * Isomórfico e sem import: o servidor (`server/ai/moderacao/moderarSaidaDoTutor.ts`) devolve uma destas frases no
 * lugar do texto do modelo, e a tela (`IChat.tsx`) a traduz com `t()` — o texto em português É a chave do
 * catálogo (`public/i18n/*.json`). Mudar a frase aqui tira a tradução: rode `npm run i18n:orfas`.
 *
 * Tom de ajuda, sem culpa nem sermão (skill `copy-br-etica`): diz o que o tutor faz e convida a seguir.
 */

/** A frase de toda categoria barrada, menos a de automutilação. */
export const RESPOSTA_FILTRADA_DO_TUTOR =
  'Vamos voltar ao idioma? Posso te ajudar com vocabulário, frases ou pronúncia.';

/**
 * Automutilação: quem perguntou pode estar passando por algo difícil, e "vamos voltar ao idioma" sozinho seria frio.
 * A mesma orientação da instrução de segurança de menores (`server/lib/idade.ts`): adulto de confiança e o CVV (188).
 */
export const RESPOSTA_FILTRADA_DE_CUIDADO =
  'Vamos voltar ao idioma? Se algo estiver pesado para você, converse com um adulto de confiança ou ligue 188 (CVV), a qualquer hora.';

/** As frases que o servidor pode mandar com `filtrada: true`. Fora delas, a tela usa a padrão. */
export const RESPOSTAS_FILTRADAS: readonly string[] = [RESPOSTA_FILTRADA_DO_TUTOR, RESPOSTA_FILTRADA_DE_CUIDADO];
