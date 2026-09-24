/**
 * IDADE E PERFIL PROTEGIDO (Fase 4 do plano de lançamento) — ECA Digital (Lei 15.211/2025) e LGPD
 * art. 14.
 *
 * O app é aberto a todos, inclusive menores. Este módulo é a ÚNICA régua do servidor para:
 *  - a FAIXA etária, derivada da data de nascimento declarada (`idades_declaradas`): `menor-12`,
 *    `12-15`, `16-17`, `adulto`. Derivada e nunca guardada, porque muda com o tempo;
 *  - o PERFIL PROTEGIDO: todo menor de 18 — e quem ainda não declarou a data (configuração mais
 *    protetiva por padrão, ECA Digital) — fica sem ranking público, sem pressão de ofensiva, sem
 *    compra com dinheiro e com a IA sob instrução de segurança;
 *  - a CONTA RESTRITA: menor de 16 sem vínculo aceito com o responsável (art. 24), ou menor de 12
 *    sem o consentimento específico (LGPD art. 14 §1º), fica SEM NUVEM — as rotas de dados
 *    respondem 403 `responsavel_pendente` e o cliente cai no modo local.
 *
 * SELF-HOST (AUTH_REQUIRED desligado) não tem idade: é o computador do próprio dono, sem conta e
 * sem venda. Tudo aqui responde "adulto, liberado" nesse modo.
 *
 * O QUE AINDA É AUTODECLARAÇÃO: a data vem do próprio usuário. A aferição de idade além disso
 * depende de regulamentação da ANPD e de parecer jurídico — o ponto de encaixe está em
 * `afericaoDeIdade.ts`, marcado como pendente.
 */
import type { NextFunction, Request, Response } from 'express'

import { idadesRepo } from '../db/repositories/idades'
import { vinculosRepo } from '../db/repositories/vinculos'
import { aferidorAtual, type ConfiancaDaIdade } from './afericaoDeIdade'
import { authRequired } from './auth'
import type { UserId } from './authContext'
import { responderErro } from './respostaDeErro'

export type FaixaEtaria = 'menor-12' | '12-15' | '16-17' | 'adulto'

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Valida uma data de nascimento `AAAA-MM-DD`: data real do calendário, não no futuro e com no
 * máximo 120 anos. Devolve a data normalizada ou `null`.
 */
export function validarNascimento(bruto: unknown, agora = Date.now()): string | null {
  if (typeof bruto !== 'string') return null
  const m = ISO.exec(bruto.trim())
  if (!m) return null
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const data = new Date(Date.UTC(a, mes - 1, d))
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d) return null
  if (data.getTime() > agora) return null
  const idade = idadeEm(`${m[1]}-${m[2]}-${m[3]}`, agora)
  if (idade === null || idade > 120) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** Anos completos em `agora` (calendário de Brasília, UTC−3). */
export function idadeEm(nascimento: string, agora = Date.now()): number | null {
  const m = ISO.exec(nascimento)
  if (!m) return null
  const hoje = new Date(agora - 3 * 3_600_000)
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let anos = hoje.getUTCFullYear() - a
  const antesDoAniversario = hoje.getUTCMonth() + 1 < mes || (hoje.getUTCMonth() + 1 === mes && hoje.getUTCDate() < d)
  if (antesDoAniversario) anos -= 1
  return anos
}

export function faixaEtaria(nascimento: string | null | undefined, agora = Date.now()): FaixaEtaria | null {
  if (!nascimento) return null
  const anos = idadeEm(nascimento, agora)
  if (anos === null) return null
  if (anos < 12) return 'menor-12'
  if (anos < 16) return '12-15'
  if (anos < 18) return '16-17'
  return 'adulto'
}

export interface EstadoDeProtecao {
  nascimentoInformado: boolean
  /** De onde vem a idade. Hoje sempre `autodeclarada` (aferição pendente de regulamentação). */
  confianca: ConfiancaDaIdade
  faixa: FaixaEtaria | null
  /** Perfil protegido: menor de 18 OU idade ainda não declarada. */
  protegido: boolean
  /** Menor de 16: a conta precisa estar vinculada a um responsável (ECA Digital art. 24). */
  exigeResponsavel: boolean
  /** Menor de 12: o vínculo exige o consentimento específico (LGPD art. 14 §1º). */
  exigeConsentimentoEspecifico: boolean
  vinculo: {
    estado: 'nenhum' | 'convidado' | 'aceito'
    emailMascarado?: string
    expiraEm?: number
    responsavel?: string | null
  }
  /** Sem nuvem até o responsável aceitar (e consentir, abaixo de 12). */
  restrita: boolean
}

const LIBERADO: EstadoDeProtecao = Object.freeze({
  nascimentoInformado: true,
  confianca: 'autodeclarada',
  faixa: 'adulto',
  protegido: false,
  exigeResponsavel: false,
  exigeConsentimentoEspecifico: false,
  vinculo: { estado: 'nenhum' },
  restrita: false,
}) as EstadoDeProtecao

/** `ma***@exemplo.com` — o menor vê para quem foi o convite sem a tela expor o e-mail inteiro. */
export function mascararEmail(email: string): string {
  const [nome, dominio] = email.split('@')
  if (!dominio) return '***'
  return `${nome.slice(0, 2)}***@${dominio}`
}

export async function estadoDeProtecao(userId: UserId, agora = Date.now()): Promise<EstadoDeProtecao> {
  if (!authRequired()) return LIBERADO
  const declarada = await idadesRepo.nascimento(userId)
  // A data passa pelo aferidor (hoje, a autodeclaração — ver afericaoDeIdade.ts, PENDENTE).
  const aferida = await aferidorAtual().aferir(userId, declarada)
  const faixa = faixaEtaria(aferida.nascimento, agora)
  const exigeResponsavel = faixa === 'menor-12' || faixa === '12-15'
  const exigeConsentimentoEspecifico = faixa === 'menor-12'

  let vinculo: EstadoDeProtecao['vinculo'] = { estado: 'nenhum' }
  let liberadoPeloResponsavel = false
  if (exigeResponsavel) {
    const aceito = await vinculosRepo.aceitoDoMenor(userId)
    if (aceito) {
      vinculo = { estado: 'aceito', responsavel: aceito.nomeDoResponsavel }
      liberadoPeloResponsavel = !exigeConsentimentoEspecifico || aceito.consentimentoEm != null
    } else {
      const pendente = await vinculosRepo.pendenteDoMenor(userId, agora)
      if (pendente)
        vinculo = {
          estado: 'convidado',
          emailMascarado: mascararEmail(pendente.emailDoResponsavel),
          expiraEm: pendente.expiraEm,
        }
    }
  }

  return {
    nascimentoInformado: !!declarada,
    confianca: aferida.confianca,
    faixa,
    protegido: faixa !== 'adulto',
    exigeResponsavel,
    exigeConsentimentoEspecifico,
    vinculo,
    restrita: exigeResponsavel && !liberadoPeloResponsavel,
  }
}

/**
 * O USUÁRIO É MENOR (ou ainda não disse a idade)? Para quem precisa de um sim/não — em especial a
 * rota de IA, que deve acrescentar `INSTRUCAO_DE_SEGURANCA_PARA_MENORES` ao prompt de sistema
 * quando isto for `true`. Idade não declarada conta como menor: a configuração mais protetiva é a
 * padrão (ECA Digital). Self-host: sempre `false`.
 */
export async function ehMenor(userId: UserId): Promise<boolean> {
  if (!authRequired()) return false
  return faixaEtaria(await idadesRepo.nascimento(userId)) !== 'adulto'
}

/** É adulto DECLARADO? (quem paga, quem aceita ser responsável, quem entra no ranking). */
export async function ehAdultoDeclarado(userId: UserId): Promise<{ adulto: boolean; informado: boolean }> {
  if (!authRequired()) return { adulto: true, informado: true }
  const nascimento = await idadesRepo.nascimento(userId)
  return { adulto: faixaEtaria(nascimento) === 'adulto', informado: !!nascimento }
}

/**
 * A INSTRUÇÃO DE SEGURANÇA que a IA recebe quando quem conversa é menor (ou não declarou a idade).
 * Quem a pluga é a rota de IA (outro dono): ver o relatório da Fase 4.
 */
export const INSTRUCAO_DE_SEGURANCA_PARA_MENORES = [
  'Quem está conversando pode ser criança ou adolescente. Regras obrigatórias:',
  '- Fale só de aprendizado de idiomas; recuse com gentileza qualquer outro assunto.',
  '- Nada de conteúdo sexual, violento, de drogas, álcool, apostas, automutilação ou ódio.',
  '- Não peça nem guarde dados pessoais (nome completo, endereço, escola, telefone, fotos, localização).',
  '- Não incentive encontros, contato fora do app nem segredos com adultos.',
  '- Não ofereça compras, assinaturas nem conteúdo pago.',
  '- Se a pessoa relatar risco, abuso ou sofrimento, oriente a procurar um adulto de confiança e o CVV (188) ou o Disque 100.',
].join('\n')

/**
 * MIDDLEWARE: só ADULTO DECLARADO passa — o ranking público (perfil protegido: menor, ou idade não
 * declarada, não aparece num placar público). Vem depois do auth.
 */
export function exigirAdultoDeclarado(req: Request, res: Response, next: NextFunction): void {
  if (!authRequired()) {
    next()
    return
  }
  ehAdultoDeclarado(req.userId)
    .then((q) => {
      if (!q.adulto) {
        responderErro(
          res,
          403,
          'o ranking público é só para contas de adultos; o seu recorde continua salvo aqui',
          'perfil_protegido',
        )
        return
      }
      next()
    })
    .catch(next)
}

/**
 * MIDDLEWARE: rotas de dados na nuvem só para conta liberada. Menor de 16 sem vínculo aceito (ou
 * menor de 12 sem consentimento específico) recebe 403 `responsavel_pendente` — o cliente
 * (`src/lib/protecaoDoMenor.ts`) já desvia essas chamadas para o modo local, então isto é a
 * defesa do lado do servidor, não a experiência.
 */
export function exigirContaLiberada(req: Request, res: Response, next: NextFunction): void {
  if (!authRequired()) {
    next()
    return
  }
  estadoDeProtecao(req.userId)
    .then((e) => {
      if (e.restrita) {
        responderErro(
          res,
          403,
          e.exigeConsentimentoEspecifico
            ? 'esta conta precisa do consentimento de um responsável para usar a nuvem'
            : 'esta conta precisa ser vinculada a um responsável para usar a nuvem',
          'responsavel_pendente',
        )
        return
      }
      next()
    })
    .catch(next)
}
