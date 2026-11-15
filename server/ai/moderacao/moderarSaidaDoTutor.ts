/**
 * A MODERAÇÃO DA SAÍDA DO TUTOR PARA PERFIL PROTEGIDO (change `filtro-tutor-menores`, decisão do dono de 15/11/2026).
 *
 * O tutor já recebe a instrução de segurança de menores (`INSTRUCAO_DE_SEGURANCA_PARA_MENORES`), mas instrução é
 * persuasão: o modelo pode não obedecer, e um histórico de pares assinados (`assinaturaDoTutor.ts`) ainda monta um
 * many-shot. Esta é a guarda que não depende de o modelo obedecer: o texto do modelo é conferido ANTES de sair do
 * servidor, e o que cai numa categoria barrada é trocado por uma frase fixa (`src/lib/ichat/respostaFiltrada.ts`).
 *
 * A INTERFACE É A DO MODERADOR, NÃO A DO FILTRO. `ModeradorDeSaida` recebe o texto e o perfil e devolve `{ ok }` ou
 * `{ ok: false, motivo }` — pode ser síncrono ou não. Hoje só existe o filtro LOCAL (`filtroLocalParaMenores`, opção B:
 * determinístico, custo zero, nenhuma chamada paga). A moderação por IA (opção C) entra depois como OUTRO moderador
 * encadeado aqui (`moderarSaidaDoTutor`), sem mudar quem chama.
 *
 * Adulto declarado (e o self-host, onde `ehMenor` é sempre falso) passa direto: `perfil.protegido` falso não confere nada.
 */
import { type CategoriaDeBloqueio, DOMINIOS_PERMITIDOS, LISTAS_PARA_MENORES, REDES_SOCIAIS } from './listasParaMenores'

export type { CategoriaDeBloqueio } from './listasParaMenores'

/** Quem recebe a resposta. `protegido` = menor de 18 ou idade não declarada (`ehMenor`, `server/lib/idade.ts`). */
export interface PerfilDaModeracao {
  protegido: boolean
}

/** O veredito. `motivo` é rótulo fixo: pode ir ao log e à métrica; o texto nunca vai. */
export type VeredictoDeModeracao = { ok: true } | { ok: false; motivo: CategoriaDeBloqueio }

export type ModeradorDeSaida = (
  texto: string,
  perfil: PerfilDaModeracao,
) => VeredictoDeModeracao | Promise<VeredictoDeModeracao>

const LIBERADO: VeredictoDeModeracao = { ok: true }

/* ─────────────────────────────── normalização ─────────────────────────────── */

/** Caracteres invisíveis que separam letras sem parecer ("p", U+200B, "orn"). */
const INVISIVEIS = new RegExp(
  `[${[0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff].map((c) => String.fromCharCode(c)).join('')}]`,
  'g',
)

/** Minúsculo, sem acento, sem invisível. Compatibilidade (NFKD) também desfaz letra de largura cheia e ligadura. */
function base(texto: string): string {
  return texto.normalize('NFKD').replace(/\p{M}/gu, '').replace(INVISIVEIS, '').toLowerCase()
}

const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  $: 's',
  '@': 'a',
  '!': 'i',
}

/**
 * O texto que as listas leem: leetspeak desfeito só DENTRO de palavra que tem letra (o "10" de "top 10" fica), `!` e `@`
 * só antes de letra ("olá!" não vira "olai"), pontuação vira espaço (o `?` fica: dado pessoal exige pergunta), letras
 * soltas espaçadas juntam ("s e x o", "p.o.r.n") e 3+ letras repetidas viram uma ("porrrn"). Espaço nas pontas para o
 * `\b` da primeira e da última palavra.
 */
export function normalizar(texto: string): string {
  let s = base(texto)
  s = s.replace(/\S+/g, (palavra) =>
    /[a-z]/.test(palavra) ? palavra.replace(/[013457$]|[@!](?=[a-z])/g, (c) => LEET[c] ?? c) : palavra,
  )
  s = s.replace(/[^a-z0-9?]+/g, ' ')
  s = s.replace(/\?/g, ' ? ').replace(/ +/g, ' ')
  s = s.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ''))
  s = s.replace(/([a-z])\1{2,}/g, '$1')
  return ` ${s.trim()} `
}

/* ─────────────────────── contato: link, e-mail, telefone, @ ─────────────────────── */

const URL_EXPLICITA = /\b(?:https?:\/\/|www\.)\S+/
/* Domínio solto ("meusite.com", "chat.gg/abc"). Só os TLDs que aparecem em convite; "Node.js" e "e.g." passam. Lido no
   texto com a caixa ORIGINAL e com o TLD minúsculo: "fim.Com isso" (ponto sem espaço antes de "Com") não é domínio. */
const DOMINIO =
  /\b((?:[A-Za-z0-9-]+\.)+(?:com|net|org|br|io|me|gg|ly|app|xyz|info|tk|co|tv|link|site|online|chat))\b(?![A-Za-z0-9-])/g
/* O lookbehind ancora o começo do e-mail: sem ele, cada posição da parte local recomeçava a busca. */
const EMAIL = /(?<![a-z0-9._%+-])[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/g
const ARROBA = /(?:^|[^a-z0-9_.])@[a-z0-9_.]{3,}/
/* Candidato a telefone: um dígito, de 6 a 18 de dígito/espaço/parêntese/ponto/hífen, um dígito. O FORMATO decide. */
const CANDIDATO_A_TELEFONE = /\+?\(?\d[\d\s().-]{6,18}\d/g
/* "1.000.000.000" é número escrito, não telefone. */
const MILHAR = /^\d{1,3}(?:\.\d{3})+$/

const permitido = (dominio: string): boolean =>
  DOMINIOS_PERMITIDOS.some((d) => dominio === d || dominio.endsWith(`.${d}`))

const ehAno = (g: string): boolean => /^(?:19|20)\d\d$/.test(g)

/**
 * Grupos SÓ separados por espaço com desenho de telefone: o último com 4 dígitos, o penúltimo com 3 a 5 (número local:
 * 4+4, 5+4, 3+3+4) e os da frente com 1 a 3 (país e DDD: 2+4+4, 2+5+4, 2+2+5+4), 8 a 13 dígitos no total. Fora, o que é
 * claramente aula de número: contagem de um dígito ("1 2 3 4"), centenas redondas ("100 200 300") e lista de anos
 * ("1999 2000 2001").
 */
function gruposDeTelefone(t: string): boolean {
  const grupos = t.split(/\s+/)
  if (grupos.length < 2 || grupos.length > 5 || grupos.some((g) => !/^\d+$/.test(g))) return false
  const total = grupos.join('').length
  if (total < 8 || total > 13) return false
  if (grupos.every((g) => g.length === 1)) return false
  if (grupos.every((g) => g.length >= 3 && g.endsWith('00'))) return false
  if (grupos.every(ehAno)) return false
  const n = grupos.length
  if (grupos[n - 1].length !== 4 || grupos[n - 2].length < 3 || grupos[n - 2].length > 5) return false
  return grupos.slice(0, n - 2).every((g) => g.length >= 1 && g.length <= 3)
}

/**
 * Tem FORMATO de telefone: 8+ dígitos colados; 8 a 15 dígitos com `+` de país, DDD entre parênteses ou hífen/ponto entre
 * grupos (menos "1999-2000", intervalo de anos); ou grupos separados por espaço no desenho de telefone
 * (`gruposDeTelefone`). Um telefone real e bem escrito ("(11) 98765-4321") continua barrado para menor mesmo numa frase
 * de aula ("My phone number is…"): o filtro não sabe se o número é de exemplo, e contato é o que mais importa segurar.
 */
function pareceTelefone(trecho: string): boolean {
  const t = trecho.trim()
  const digitos = t.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 15) return false
  if (MILHAR.test(t)) return false
  if (/\d{8,}/.test(t)) return true
  if (t.startsWith('+') || /\(\d{2,3}\)/.test(t)) return true
  if (/\d[-.]\d/.test(t)) {
    const partes = t.split(/[-.\s]+/)
    return !(partes.length === 2 && partes.every(ehAno))
  }
  return gruposDeTelefone(t)
}

/** Link, e-mail, telefone ou `@perfil` de rede. Lê o texto ANTES do leetspeak, que estragaria dígito e `@`. */
function detectarContato(texto: string): boolean {
  const s = base(texto)
  if (URL_EXPLICITA.test(s)) return true
  for (const m of s.matchAll(EMAIL)) if (!permitido(m[1])) return true
  for (const m of texto.normalize('NFKD').replace(INVISIVEIS, '').matchAll(DOMINIO)) {
    if (!permitido(m[1].toLowerCase())) return true
  }
  for (const m of s.matchAll(CANDIDATO_A_TELEFONE)) if (pareceTelefone(m[0])) return true
  // O `@palavra` sozinho é ficha do iChat; com o nome de uma rede no texto, é perfil.
  return ARROBA.test(s) && REDES_SOCIAIS.test(normalizar(texto))
}

/* ─────────────────────────────── os moderadores ─────────────────────────────── */

/**
 * Teto do texto conferido. A resposta do tutor tem no máximo ~900 tokens (`funcoesDeIa.ts`), longe disto; acima, as
 * expressões de domínio e e-mail ficam caras (busca quadrática), então o texto grande demais é barrado sem conferir.
 */
export const TETO_DO_TEXTO_MODERADO = 20_000

/** O FILTRO LOCAL (opção B): determinístico, sem rede, sem custo. Só confere perfil protegido. */
export const filtroLocalParaMenores: ModeradorDeSaida = (texto, perfil) => {
  if (!perfil.protegido || !texto) return LIBERADO
  if (texto.length > TETO_DO_TEXTO_MODERADO) return { ok: false, motivo: 'texto_longo' }
  if (detectarContato(texto)) return { ok: false, motivo: 'contato_externo' }
  const completo = normalizar(texto)
  let citavel: string | null = null
  for (const lista of LISTAS_PARA_MENORES) {
    const alvo = lista.ignoraCitacao ? (citavel ??= alvoSemCitacao(texto)) : completo
    if (lista.padroes.some((p) => p.test(alvo))) return { ok: false, motivo: lista.categoria }
  }
  return LIBERADO
}

/* ─────────────────────────── a citação de aula ─────────────────────────── */

/**
 * Os trechos CITADOS (como o tutor marca o idioma estudado): `**…**`, `__…__`, aspas duplas retas/curvas/angulares,
 * crase e aspas SIMPLES retas/curvas. A aspa simples também é apóstrofo ("What's", "it’s"), então ela só abre depois de
 * espaço/início/parêntese e só fecha antes de espaço/pontuação/fim. O conteúdo vem num dos grupos.
 */
const CITACAO =
  /\*\*([^*]{1,300})\*\*|__([^_]{1,300})__|"([^"\n]{1,300})"|“([^”\n]{1,300})”|«([^»\n]{1,300})»|`([^`\n]{1,300})`|(?<=^|[\s(])'([^\n]{1,300}?)'(?=[\s.,;:!?)]|$)|(?<=^|[\s(])‘([^\n]{1,300}?)’(?=[\s.,;:!?)]|$)/g

/** Marcas de TRADUÇÃO ou de USO, de qualquer lado da citação: "X significa **Y**", "**Y** means X", "para perguntar…". */
const MARCA_DE_AULA =
  /\b(?:significa|quer dizer|se diz|se traduz|traduz-se|means|translates|se dice|quiere decir|para perguntar|para pedir|to ask)\b/
/** Depois da citação, "=" ou "→" seguido da tradução: "**ingredient** = ingrediente". Antes dela não conta. */
const TRADUCAO_DEPOIS = /^\s*(?:=|→|->)\s*[a-z]/
/** Quanto do texto em volta conta como "junto da citação": até 40 caracteres, sem atravessar fim de frase. */
const VIZINHANCA = 40
/** Entre duas citações de uma LISTA de frases ("**Where do you live?**, **How old are you?**"). */
const ENTRE_ITENS_DE_LISTA = /^\s*(?:[,;]|e|ou|and|or|y|o)?\s*$/
/** Segunda pessoa em português: dirigida a quem lê, não frase de outro idioma sendo ensinada. */
const SEGUNDA_PESSOA_PT = /\b(?:voce|vc|seu|sua|seus|suas|teu|tua|te|me passa|me manda|me envia)\b/

interface Citacao {
  inicio: number
  fim: number
  conteudo: string
}

/**
 * A citação é de AULA quando está junto de uma marca de tradução/uso (no mesmo trecho de frase, até `VIZINHANCA`) ou
 * quando é item de uma lista de frases — e, na lista, só se não é português em segunda pessoa (aí ela fala com quem lê).
 * "Me diga, **qual é o seu endereço?**", "Use a frase **…** comigo" e "Em inglês: **send me your address**" NÃO são
 * aula: o trecho citado é avaliado como o resto do texto.
 */
function ehCitacaoDeAula(b: string, c: Citacao, anterior: Citacao | undefined, proxima: Citacao | undefined): boolean {
  const antes = b
    .slice(Math.max(0, c.inicio - VIZINHANCA), c.inicio)
    .split(/[.!?\n]/)
    .pop()!
  const depois = b.slice(c.fim, c.fim + VIZINHANCA).split(/[.!?\n]/)[0]
  if (MARCA_DE_AULA.test(antes) || MARCA_DE_AULA.test(depois) || TRADUCAO_DEPOIS.test(depois)) return true
  const naLista =
    (anterior && ENTRE_ITENS_DE_LISTA.test(b.slice(anterior.fim, c.inicio))) ||
    (proxima && ENTRE_ITENS_DE_LISTA.test(b.slice(c.fim, proxima.inicio)))
  return Boolean(naLista) && !SEGUNDA_PESSOA_PT.test(c.conteudo)
}

/**
 * O texto que dado pessoal e aliciamento leem: sem as citações de AULA (`ehCitacaoDeAula`); toda outra citação fica e é
 * avaliada. RISCO QUE SOBRA (para a opção C): uma injeção que monte a moldura completa de tradução em volta do pedido
 * ("**What is your address?** significa…") ainda passa — o filtro local não sabe se a frase está sendo ensinada ou feita.
 */
function alvoSemCitacao(texto: string): string {
  const b = base(texto)
  const citacoes: Citacao[] = [...b.matchAll(CITACAO)].map((m) => ({
    inicio: m.index,
    fim: m.index + m[0].length,
    conteudo: m.slice(1).find((g) => g !== undefined) ?? '',
  }))
  let fora = ''
  let cursor = 0
  citacoes.forEach((c, i) => {
    if (!ehCitacaoDeAula(b, c, citacoes[i - 1], citacoes[i + 1])) return
    fora += `${b.slice(cursor, c.inicio)} `
    cursor = c.fim
  })
  return normalizar(fora + b.slice(cursor))
}

/**
 * A cadeia de moderadores, em ordem: o primeiro que barra decide. Hoje, só o filtro local. A opção C (moderação por IA)
 * entra aqui, DEPOIS do local (o barato decide primeiro e poupa a chamada), e só para `perfil.protegido`.
 */
const MODERADORES: readonly ModeradorDeSaida[] = [filtroLocalParaMenores]

/** Confere a saída do tutor para quem recebe. Adulto: `{ ok: true }` sem olhar o texto. */
export async function moderarSaidaDoTutor(texto: string, perfil: PerfilDaModeracao): Promise<VeredictoDeModeracao> {
  if (!perfil.protegido) return LIBERADO
  for (const moderar of MODERADORES) {
    const v = await moderar(texto, perfil)
    if (v.ok === false) return v
  }
  return LIBERADO
}
