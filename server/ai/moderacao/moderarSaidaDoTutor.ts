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

/** Tira o trecho CITADO (como o tutor marca o idioma estudado): `**…**`, `__…__`, aspas retas/curvas/angulares e crase. */
function semCitacoes(texto: string): string {
  return texto
    .replace(/\*\*[^*]{1,300}\*\*/g, ' ')
    .replace(/__[^_]{1,300}__/g, ' ')
    .replace(/"[^"\n]{1,300}"/g, ' ')
    .replace(/“[^”\n]{1,300}”/g, ' ')
    .replace(/«[^»\n]{1,300}»/g, ' ')
    .replace(/`[^`\n]{1,300}`/g, ' ')
}

/* ─────────────────────── contato: link, e-mail, telefone, @ ─────────────────────── */

const URL_EXPLICITA = /\b(?:https?:\/\/|www\.)\S+/
/* Domínio solto ("meusite.com", "chat.gg/abc"). Só os TLDs que aparecem em convite; "Node.js" e "e.g." passam. Lido no
   texto com a caixa ORIGINAL e com o TLD minúsculo: "fim.Com isso" (ponto sem espaço antes de "Com") não é domínio. */
const DOMINIO =
  /\b((?:[A-Za-z0-9-]+\.)+(?:com|net|org|br|io|me|gg|ly|app|xyz|info|tk|co|tv|link|site|online|chat))\b(?![A-Za-z0-9-])/g
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/
const ARROBA = /(?:^|[^a-z0-9_.])@[a-z0-9_.]{3,}/
/* Candidato a telefone: um dígito, de 7 a 18 de dígito/espaço/parêntese/ponto/hífen, um dígito. A contagem decide. */
const CANDIDATO_A_TELEFONE = /\+?\(?\d[\d\s().-]{7,18}\d/g
/* "1.000.000.000" é número escrito, não telefone. */
const MILHAR = /^\d{1,3}(?:\.\d{3})+$/

function pareceTelefone(trecho: string): boolean {
  const digitos = trecho.replace(/\D/g, '')
  if (digitos.length < 9 || digitos.length > 15) return false
  if (MILHAR.test(trecho.trim())) return false
  // Sequência de dígitos soltos ("1 2 3 4 5 6 7 8 9" numa aula de números) não é telefone: exige um grupo de 3+.
  return /\d{3}/.test(trecho)
}

/** Link, e-mail, telefone ou `@perfil` de rede. Lê o texto ANTES do leetspeak, que estragaria dígito e `@`. */
function detectarContato(texto: string): boolean {
  const s = base(texto)
  if (URL_EXPLICITA.test(s) || EMAIL.test(s)) return true
  for (const m of texto.normalize('NFKD').replace(INVISIVEIS, '').matchAll(DOMINIO)) {
    const dominio = m[1].toLowerCase()
    if (!DOMINIOS_PERMITIDOS.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return true
  }
  for (const m of s.matchAll(CANDIDATO_A_TELEFONE)) if (pareceTelefone(m[0])) return true
  // O `@palavra` sozinho é ficha do iChat; com o nome de uma rede no texto, é perfil.
  return ARROBA.test(s) && REDES_SOCIAIS.test(normalizar(texto))
}

/* ─────────────────────────────── os moderadores ─────────────────────────────── */

/** O FILTRO LOCAL (opção B): determinístico, sem rede, sem custo. Só confere perfil protegido. */
export const filtroLocalParaMenores: ModeradorDeSaida = (texto, perfil) => {
  if (!perfil.protegido || !texto) return LIBERADO
  if (detectarContato(texto)) return { ok: false, motivo: 'contato_externo' }
  const completo = normalizar(texto)
  let citado: string | null = null
  for (const lista of LISTAS_PARA_MENORES) {
    const alvo = lista.ignoraCitacao ? (citado ??= normalizar(semCitacoes(texto))) : completo
    if (lista.padroes.some((p) => p.test(alvo))) return { ok: false, motivo: lista.categoria }
  }
  return LIBERADO
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
