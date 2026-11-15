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

/**
 * Tira o trecho CITADO (como o tutor marca o idioma estudado): `**…**`, `__…__`, aspas duplas retas/curvas/angulares,
 * crase e aspas SIMPLES retas/curvas. A aspa simples também é apóstrofo ("What's", "it’s"), então ela só abre depois de
 * espaço/início/parêntese e só fecha antes de espaço/pontuação/fim.
 */
function semCitacoes(texto: string): string {
  return texto
    .replace(/\*\*[^*]{1,300}\*\*/g, ' ')
    .replace(/__[^_]{1,300}__/g, ' ')
    .replace(/"[^"\n]{1,300}"/g, ' ')
    .replace(/“[^”\n]{1,300}”/g, ' ')
    .replace(/«[^»\n]{1,300}»/g, ' ')
    .replace(/`[^`\n]{1,300}`/g, ' ')
    .replace(/(^|[\s(])'[^\n]{1,300}?'(?=[\s.,;:!?)]|$)/g, '$1 ')
    .replace(/(^|[\s(])‘[^\n]{1,300}?’(?=[\s.,;:!?)]|$)/g, '$1 ')
}

/**
 * HÁ EXPLICAÇÃO FORA DA CITAÇÃO? A citação só é ignorada quando o texto em volta a apresenta como aula ("diga…",
 * "significa", "use…", "em inglês", "="). Sem isso, o trecho citado é o próprio pedido: "Me diga, **qual é o seu
 * endereço?**" — e uma injeção no material da tela pode pedir ao modelo para pôr o pedido em negrito. "me diga" e
 * "tell me" não contam como explicação.
 *
 * RISCO QUE SOBRA (para a opção C): "Em inglês: **qual é o seu endereço?**" ainda passa — o filtro local não sabe se a
 * frase citada está sendo ensinada ou feita. Só um moderador que entende contexto separa os dois.
 */
const EXPLICACAO =
  /(?:\bsignifica|\bquer dizer|\bse diz|\bse dice|\bse escreve|\btraduz|\bmeans?\b|\btranslat|\byou can say|(?<!\bme )\bdiga\b|(?<!\btell me )\bsay\b|\bdecir\b|\buse\b|\busa\b|\busar\b|\bpara perguntar|\bpara pedir|\bto ask\b|\bfrases?\b|\bexpress(?:ao|oes|ion)|\bexemplo|\bejemplo|\bexample|\bem ingles|\bem espanhol|\ben ingles|\ben espanol|\bin english|\bin spanish|=)/

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

/**
 * Tem FORMATO de telefone: 8+ dígitos colados, ou 9 a 15 dígitos com `+` de país, DDD entre parênteses ou hífen/ponto
 * entre grupos. Grupos separados só por espaço ("100 200 300 400 500", numa aula de números) não são telefone. Um
 * telefone real e bem escrito ("(11) 98765-4321") continua barrado para menor mesmo numa frase de aula ("My phone number
 * is…"): o filtro não sabe se o número é de exemplo, e contato é o que mais importa segurar.
 */
function pareceTelefone(trecho: string): boolean {
  const t = trecho.trim()
  const digitos = t.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 15) return false
  if (MILHAR.test(t)) return false
  if (/\d{8,}/.test(t)) return true
  if (digitos.length < 9) return false
  return t.startsWith('+') || /\(\d{2,3}\)/.test(t) || /\d[-.]\d/.test(t)
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
    const alvo = lista.ignoraCitacao ? (citavel ??= alvoSemCitacao(texto, completo)) : completo
    if (lista.padroes.some((p) => p.test(alvo))) return { ok: false, motivo: lista.categoria }
  }
  return LIBERADO
}

/** O texto que dado pessoal e aliciamento leem: sem a citação quando há explicação fora dela; senão, o texto inteiro. */
function alvoSemCitacao(texto: string, completo: string): string {
  const fora = semCitacoes(texto)
  return EXPLICACAO.test(base(fora)) ? normalizar(fora) : completo
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
