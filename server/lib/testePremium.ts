/**
 * O TESTE DE 14 DIAS DO PREMIUM, SEM CARTÃO (C6 da change `planos-v2`; padrão do dono: começa com UM
 * toque, nunca cobra sozinho).
 *
 * O QUE ELE É: 14 dias com os entitlements do Premium (`resolverPlano`, em `entitlements.ts`), sem
 * cartão, sem Asaas, sem renovação. No fim a conta volta ao Grátis sozinha — não há o que cancelar.
 * Na admissão da nuvem o teste é GRÁTIS (`planoDeAdmissao(..., teste = true)`): a capacidade de quem
 * paga não encolhe por causa de quem está testando.
 *
 * UM POR PESSOA, E NÃO POR CONTA. A conta tem a linha dela (`testes_premium`), que sai com a exclusão;
 * a PESSOA tem a marca (`marcas_de_teste`): o HMAC do e-mail normalizado com a chave de hash do
 * servidor. A marca não tem `user_id` e sobrevive à exclusão — apagar a conta e criar outra com o
 * mesmo e-mail não renova o teste. O e-mail em si nunca é guardado nem logado: vira HMAC na hora.
 *
 * O MENOR (perfil protegido) não inicia sozinho: o RESPONSÁVEL vinculado ativa pela conta dele, com o
 * mesmo `paraUsuario` do checkout. A marca, então, é a do e-mail do responsável — noutro espaço
 * (`responsavel`), para não gastar o teste da própria conta dele: um teste por responsável para as
 * contas vinculadas a ele (o e-mail do menor não chega ao servidor nesse pedido).
 *
 * RETENÇÃO DA MARCA: 730 dias, com poda diária (`agendarPodaDasMarcasDeTeste`). Depois disso a mesma
 * pessoa pode testar de novo — dois anos cobrem o abuso que a marca existe para impedir, e guardar
 * mais seria guardar sem finalidade (LGPD art. 15). Documentado em `docs/lgpd/ropa.csv` (T12).
 *
 * Trocar a `SECRET_KEY` do servidor troca a chave do HMAC: as marcas antigas deixam de casar e o
 * teste fica disponível de novo para todo mundo. É o preço aceito de não guardar o e-mail.
 */
import { createHmac } from 'node:crypto'

import { DIAS_DO_TESTE_PREMIUM } from '../../src/core/planos'
import { type TestePremium, testesPremiumRepo } from '../db/repositories/testesPremium'
import type { UserId } from './authContext'
import { log } from './logger'

const DIA_MS = 86_400_000

/** Quanto tempo a marca do e-mail fica guardada depois do início do teste. */
export const DIAS_DE_RETENCAO_DA_MARCA = 730

export const DURACAO_DO_TESTE_MS = DIAS_DO_TESTE_PREMIUM * DIA_MS

/** De onde vem o e-mail da marca: a própria conta, ou o responsável que ativou para o menor. */
export type OrigemDaMarca = 'conta' | 'responsavel'

const DOMINIOS_DO_GMAIL = new Set(['gmail.com', 'googlemail.com'])

/**
 * O E-MAIL COMO UMA PESSOA SÓ. Sem isto, `Fulano@Gmail.com`, `fulano+teste@gmail.com` e
 * `fu.la.no@googlemail.com` — a MESMA caixa de entrada — seriam três testes. Caixa baixa e espaços
 * fora sempre; a etiqueta `+…` sai em qualquer domínio (é o jeito mais comum de "criar outro e-mail"
 * sem criar); os pontos só saem no Gmail, onde o provedor os ignora — noutros domínios o ponto pode
 * ser outra pessoa. `null` = não parece e-mail.
 */
export function normalizarEmailDaMarca(email: string): string | null {
  const e = email.trim().toLowerCase()
  const arroba = e.lastIndexOf('@')
  if (arroba <= 0 || arroba === e.length - 1) return null
  let local = e.slice(0, arroba)
  let dominio = e.slice(arroba + 1)
  const mais = local.indexOf('+')
  if (mais > 0) local = local.slice(0, mais)
  if (DOMINIOS_DO_GMAIL.has(dominio)) {
    local = local.replaceAll('.', '')
    dominio = 'gmail.com'
  }
  return local ? `${local}@${dominio}` : null
}

let chaveDeHash: string | null = null
async function chave(): Promise<string> {
  // Import tardio, como em `convidado.ts`: carregar este módulo não decide quando a chave é lida.
  chaveDeHash ??= (await import('../crypto')).CHAVE_DE_HASH
  return chaveDeHash
}

/** A marca do teste: HMAC-SHA256 (hex) do e-mail normalizado, com versão e origem no texto. */
export async function marcaDoTeste(email: string, origem: OrigemDaMarca): Promise<string | null> {
  const normal = normalizarEmailDaMarca(email)
  if (!normal) return null
  return createHmac('sha256', await chave())
    .update(`babel-play:teste-premium:v1:${origem}:${normal}`)
    .digest('hex')
}

/** O teste vale AGORA? (Começou e ainda não terminou.) */
export function testeAtivo(t: TestePremium | null, agora = Date.now()): t is TestePremium {
  return !!t && t.iniciadoEm <= agora && agora < t.terminaEm
}

/** O teste ATIVO da conta, ou `null` (nunca testou, ou já venceu). */
export async function testeAtivoDe(userId: UserId, agora = Date.now()): Promise<TestePremium | null> {
  const t = await testesPremiumRepo.doUsuario(userId)
  return testeAtivo(t, agora) ? t : null
}

/** Por que a conta não pode começar o teste agora. */
export type MotivoSemTeste =
  | 'selfhost'
  | 'convidado'
  | 'idade_nao_informada'
  | 'perfil_protegido'
  | 'ja_assinante'
  | 'sem_email'
  | 'marca_usada'

/** O que a tela de Planos (C7) precisa saber do teste desta conta. */
export type SituacaoDoTeste =
  | { estado: 'disponivel'; dias: number }
  | { estado: 'ativo' | 'usado'; dias: number; iniciadoEm: number; terminaEm: number }
  | { estado: 'indisponivel'; dias: number; motivo: MotivoSemTeste }

/**
 * A SITUAÇÃO DO TESTE para a própria conta — a mesma régua que `POST /api/billing/teste` aplica, na
 * mesma ordem, para a tela não oferecer o que o servidor recusaria. `jaAssinou`: a conta tem (ou teve)
 * o Premium pago; `idade`: o que `ehAdultoDeclarado` respondeu.
 */
export async function situacaoDoTeste(
  userId: UserId,
  ctx: { email: string | null; jaAssinou: boolean; idade: { adulto: boolean; informado: boolean } },
  agora = Date.now(),
): Promise<SituacaoDoTeste> {
  const dias = DIAS_DO_TESTE_PREMIUM
  const t = await testesPremiumRepo.doUsuario(userId)
  if (t)
    return { estado: testeAtivo(t, agora) ? 'ativo' : 'usado', dias, iniciadoEm: t.iniciadoEm, terminaEm: t.terminaEm }
  const semTeste = (motivo: MotivoSemTeste): SituacaoDoTeste => ({ estado: 'indisponivel', dias, motivo })
  if (ctx.jaAssinou) return semTeste('ja_assinante')
  if (!ctx.idade.informado) return semTeste('idade_nao_informada')
  if (!ctx.idade.adulto) return semTeste('perfil_protegido')
  const marca = ctx.email ? await marcaDoTeste(ctx.email, 'conta') : null
  if (!marca) return semTeste('sem_email')
  if (await testesPremiumRepo.marcaExiste(marca)) return semTeste('marca_usada')
  return { estado: 'disponivel', dias }
}

/** A retenção: apaga as marcas com mais de `DIAS_DE_RETENCAO_DA_MARCA` dias. Devolve quantas saíram. */
export async function podarMarcasDeTeste(agora = Date.now()): Promise<number> {
  return testesPremiumRepo.podarMarcas(agora - DIAS_DE_RETENCAO_DA_MARCA * DIA_MS)
}

/**
 * Liga a poda diária — o mesmo padrão da limpeza de convidados e da poda do cache de tradução: no
 * processo que prepara os dados, temporizador com `unref()`, primeira passada minutos depois do boot.
 * Devolve como desligar.
 */
export function agendarPodaDasMarcasDeTeste(o: { atrasoInicialMs?: number; intervaloMs?: number } = {}): () => void {
  let relogio: NodeJS.Timeout | undefined
  const rodar = async () => {
    try {
      const n = await podarMarcasDeTeste()
      if (n > 0) log('info', { event: 'teste_premium_marcas_podadas', total: n })
    } catch (err) {
      log('error', { event: 'teste_premium_poda_erro', error: String(err).slice(0, 160) })
    }
  }
  const armar = (ms: number) => {
    relogio = setTimeout(() => {
      void rodar().finally(() => armar(o.intervaloMs ?? DIA_MS))
    }, ms)
    relogio.unref?.()
  }
  armar(o.atrasoInicialMs ?? 13 * 60_000)
  return () => {
    if (relogio) clearTimeout(relogio)
  }
}
