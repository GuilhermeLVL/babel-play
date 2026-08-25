/**
 * A TRADUÇÃO SAIU NO IDIOMA QUE FOI PEDIDO?
 *
 * Ninguém estava perguntando isso, e o resultado apareceu na tela de um usuário:
 *
 *     original:  ¿Dónde estoy? Espérate, vamos a abrir.        (espanhol)
 *     pedido:    português
 *     exibido:   Kde jsem? Počkej, půjdeme otevřít.            (TCHECO)
 *
 * O detalhe que torna o caso instrutivo: a frase tcheca é uma tradução CORRETA do espanhol.
 * O tradutor entendeu tudo e respondeu no idioma errado. Nenhum erro foi lançado, nenhum
 * disjuntor abriu, e o texto foi para a tela como se fosse a resposta.
 *
 * O caminho: dos quatro tradutores, só o `server-llm-mt` aceita origem vazia — e no ambiente
 * local ele é um LLM pequeno via Ollama. Modelo pequeno com prompt curto erra o idioma-alvo com
 * frequência, especialmente entre línguas que ele viu pouco. Quando os outros três estão
 * indisponíveis, ele é o único de pé, e o que ele devolver vai para a tela sem conferência.
 *
 * Esta é a conferência. Duas rejeições, e ambas seguem a doutrina do produto — melhor não
 * mostrar tradução do que mostrar uma tradução falsa:
 *
 *  · IDIOMA ERRADO — pediu `pt`, veio `cs`. Não é tradução, é outra coisa.
 *  · NÃO TRADUZIU — a saída continua no idioma de ENTRADA. Alguns tradutores devolvem o texto
 *    intacto quando não sabem o par; exibir isso faz o produto parecer quebrado e o usuário
 *    achar que o idioma foi identificado errado.
 *
 * A rejeição é LANÇADA para o gateway, não engolida: assim o adaptador ruim conta como falha,
 * o disjuntor dele abre, e a cascata tenta o próximo tradutor. Um provedor que responde no
 * idioma errado é um provedor com defeito, e o sistema já sabe lidar com defeito.
 *
 * PRUDÊNCIA CONTRA FALSO POSITIVO: detecção erra em texto curto, e derrubar tradução boa é pior
 * que deixar passar uma ruim. Só rejeitamos com detecção CONFIANTE e texto longo o bastante.
 */

export interface DeteccaoDeSaida {
  lang: string
  /** 0..1 — confiança do detector. */
  confidence: number
}

/**
 * União DISCRIMINADA pelo `ok`. Os dois lados declaram todos os campos (opcionais no ramo
 * feliz) porque, sem isso, `if (!v.ok)` não estreitava o tipo em consumidores que guardam o
 * veredicto numa variável antes de testar — e o TypeScript recusava o acesso a `motivo`.
 */
export type VeredictoDaTraducao =
  | { ok: true; motivo?: undefined; detectado?: undefined; esperado?: undefined }
  | { ok: false; motivo: 'idioma-errado' | 'nao-traduziu'; detectado: string; esperado: string }

/**
 * Abaixo disto a detecção de idioma é ruído: "Vale", "Yeah.", "好" não têm sinal suficiente.
 * Medido no caso real — as falas problemáticas tinham 30+ caracteres.
 */
export const MINIMO_DE_CARACTERES = 24

/** Só rejeitamos quando o detector está confiante. Abaixo disso, damos o benefício da dúvida. */
export const MINIMO_DE_CONFIANCA = 0.7

const base = (l: string) => (l || '').trim().toLowerCase().split('-')[0]

/**
 * A CONFERÊNCIA VALE A PENA NESTE CASO?
 *
 * `validarTraducao` aprova de saída tudo que é curto demais ou não tem alvo declarado — mas o
 * chamador já tinha PAGADO a detecção de idioma para chegar até ela. Numa legenda ao vivo a maioria
 * das falas é curta ("Vale", "Sí, claro"), então era uma detecção desperdiçada por tradução, dentro
 * do caminho que o usuário está esperando ver na tela.
 *
 * Perguntar isto ANTES evita a detecção nos casos em que o veredicto já é conhecido. A regra mora
 * aqui, junto do que a usa, para as duas não saírem de sincronia.
 */
export function precisaConferir(traduzido: string, esperado: string): boolean {
  return !!base(esperado) && (traduzido || '').trim().length >= MINIMO_DE_CARACTERES
}

/**
 * @param traduzido  o que o tradutor devolveu
 * @param esperado   o idioma que foi PEDIDO
 * @param origem     o idioma do texto original, quando conhecido (para pegar "não traduziu")
 * @param deteccao   resultado do detector sobre `traduzido` — `null` = não sabemos, aceita
 */
export function validarTraducao(
  traduzido: string,
  esperado: string,
  origem: string | null,
  deteccao: DeteccaoDeSaida | null,
): VeredictoDaTraducao {
  const texto = (traduzido || '').trim()
  const alvo = base(esperado)

  // Sem alvo declarado não há o que conferir; e texto curto não sustenta detecção.
  if (!precisaConferir(texto, esperado)) return { ok: true }
  if (!deteccao || !deteccao.lang) return { ok: true }
  if (deteccao.confidence < MINIMO_DE_CONFIANCA) return { ok: true }

  const detectado = base(deteccao.lang)
  if (!detectado || detectado === alvo) return { ok: true }

  // Saída no idioma de ENTRADA: o tradutor devolveu o texto sem traduzir.
  const de = base(origem || '')
  if (de && detectado === de) {
    return { ok: false, motivo: 'nao-traduziu', detectado, esperado: alvo }
  }
  // Saída num terceiro idioma: foi o caso do tcheco.
  return { ok: false, motivo: 'idioma-errado', detectado, esperado: alvo }
}

/**
 * Mensagem de erro para o gateway — precisa dizer o suficiente para depurar pelo log.
 * Aceita a união inteira em vez de `Extract<…, {ok:false}>`: o estreitamento por `if (!v.ok)`
 * não sobrevive à passagem por parâmetro em todos os call sites, e um tipo que obriga o
 * chamador a fazer ginástica é um tipo mal desenhado.
 */
export function explicarRejeicao(v: VeredictoDaTraducao, adaptador: string): string {
  if (v.ok) return ''
  return v.motivo === 'nao-traduziu'
    ? `${adaptador} devolveu o texto SEM traduzir (continua em ${v.detectado}, pedimos ${v.esperado})`
    : `${adaptador} respondeu em ${v.detectado} quando pedimos ${v.esperado}`
}
