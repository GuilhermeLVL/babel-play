/**
 * AS TRAVAS DE BOOT — o que antes abortava de dentro do `server.ts`.
 *
 * `validarBoot()` só CONFERE e devolve os achados; quem decide encerrar o processo é o `server.ts`
 * (no Node, `process.exit(1)` para todo achado `aborta`). Assim a mesma conferência serve a um
 * runtime em que não há processo para encerrar (o Worker da Fase 2).
 *
 * `relatarConfiguracao()` é a conferência que NÃO derruba: escreve no log o que falta e os avisos.
 */
import { avisoDeIaSemReserva } from '../ai/provedores'
import { avisosDoRegistroDeIa, erroDoRegistroDeIa } from '../ai/registroDeProvedores'
import { obterChave } from '../crypto'
import { erroDeAuthEmProducao, mecanismoDe } from '../lib/auth'
import {
  avisoDeConviteSemEmail,
  erroDeAsaasSandboxEmProducao,
  erroDeMetricasEmProducao,
  erroDeTrustProxyEmProducao,
  verificarConfiguracaoNoBoot,
} from '../lib/config'
import { erroDeMultiReplica } from '../lib/diretorios'
import { log } from '../lib/logger'
import { armazenamentoDeMidia } from '../routes/sessions'

export interface Achado {
  /** `aborta`: o processo não pode subir assim. `avisa`: sobe, e o texto vai para o stderr. */
  nivel: 'aborta' | 'avisa'
  texto: string
  /** Evento a registrar com `log('error')` antes de abortar (o formato que o coletor de logs procura). */
  evento?: string
}

export function validarBoot(): Achado[] {
  const achados: Achado[] = []
  /*
   * MULTI-REPLICA PRECISA SER DECLARADA, E COERENTE (auditoria de 2026-09-07, achado A34).
   *
   * O servidor guarda arquivo de audio no disco local. Com duas instancias atras de um balanceador
   * e sem armazenamento compartilhado, o audio gravado por uma NAO existe na outra: o mesmo pedido
   * responde 200 ou 404 conforme quem atendeu — medido, com a mensagem "arquivo ausente". Isso nao
   * da para descobrir sozinho (o processo nao sabe quantas replicas existem), entao quem opera
   * declara `REPLICAS` e o boot verifica a coerencia. Falha DURA: subir assim e servir dados que
   * somem de forma intermitente, que e pior que nao subir.
   */
  const incoerencia = erroDeMultiReplica()
  if (incoerencia) achados.push({ nivel: 'aborta', texto: incoerencia })
  /* GAP-003 (auditoria 2026-09-13): em produção, auth desligada é fail-open — aborta o boot em vez
     de só avisar (o warning permanece, no `server.ts`, para o caso legítimo self-host/local). */
  const authInsegura = erroDeAuthEmProducao()
  if (authInsegura) achados.push({ nivel: 'aborta', texto: authInsegura })
  /* GAP-004: em produção, quantos proxies há na frente é decisão declarada — errar para qualquer
     lado desliga o limitador por IP em silêncio (ver `erroDeTrustProxyEmProducao`). */
  const proxyIndeclarado = erroDeTrustProxyEmProducao()
  if (proxyIndeclarado) achados.push({ nivel: 'aborta', texto: proxyIndeclarado })
  /* GAP-013 (auditoria 2026-09-13): em produção, /metrics ligado sem token é scrape aberto. */
  const metricasInseguras = erroDeMetricasEmProducao()
  if (metricasInseguras) achados.push({ nivel: 'aborta', texto: metricasInseguras })
  /* Correção de alto valor 3 (auditoria de 15/10/2026): o sandbox do Asaas em produção, sem o
     `ASAAS_SANDBOX=1` que só o staging declara, é Premium de graça com o cartão de teste. Aborta como
     as travas acima; o `evento` deixa o `log('error')` no formato que o coletor de logs procura. */
  const sandboxEmProducao = erroDeAsaasSandboxEmProducao()
  if (sandboxEmProducao) {
    achados.push({ nivel: 'aborta', texto: sandboxEmProducao, evento: 'asaas_sandbox_em_producao' })
  }
  /* B1 da Fase B: o registro de provedores de IA (`IA_PROVEDORES`) inválido — Gemini, OpenRouter sem
     retenção zero, provedor sem `retencao: "zdr"` em produção, segredo no JSON. Em produção o boot
     ABORTA, como as travas acima: subir recusando a nuvem em silêncio é descobrir no primeiro
     assinante. Fora de produção a nuvem fica FECHADA (nenhuma perna) e o motivo vai para o log. */
  const registroDeIaInvalido = erroDoRegistroDeIa()
  if (registroDeIaInvalido) {
    achados.push(
      process.env.NODE_ENV === 'production'
        ? { nivel: 'aborta', texto: registroDeIaInvalido }
        : { nivel: 'avisa', texto: `[ia] ${registroDeIaInvalido} — a IA de nuvem fica DESLIGADA até corrigir.` },
    )
  }
  /* O QUE ANTES ABORTAVA NO IMPORT e hoje é preguiçoso (Fase 2, boot preguiçoso): a chave de segredos
     (`SECRET_KEY` ausente em produção) e o armazenamento de mídia (teto do R2 inválido). Criados aqui,
     no boot, a falha continua derrubando o processo na subida, e não no primeiro segredo ou upload. */
  for (const preparar of [obterChave, armazenamentoDeMidia]) {
    try {
      preparar()
    } catch (err) {
      achados.push({ nivel: 'aborta', texto: String((err as Error)?.message ?? err) })
    }
  }
  return achados
}

export function relatarConfiguracao(): void {
  /*
   * CONFERÊNCIA DA CONFIGURAÇÃO — achado F14-02.
   *
   * Roda ANTES do banco de propósito: é a checagem mais barata que existe e a que evita o pior
   * modo de falha do modo público — subir "saudável" sem `SUPABASE_SERVICE_ROLE_KEY` e só
   * descobrir no meio de uma exclusão de conta que o vínculo de login não pode ser desfeito.
   *
   * NÃO derruba o processo. Uma réplica que não sobe não diz nada a ninguém e o orquestrador só vê
   * reinício em laço; registrando, `/api/health` responde `degraded` com o NOME do passo, que é o
   * que uma probe enxerga. Mesma decisão do P2-5.
   */
  const configuracao = verificarConfiguracaoNoBoot()
  /*
   * DIZER qual mecanismo autentica — achado F15-01 (fechado em 2026-08-26: o JWKS assimetrico
   * tem precedencia; o segredo compartilhado so vale sem SUPABASE_URL). Se as duas variaveis
   * existem, o segredo esta presente e INERTE — e o operador precisa saber, porque segredo
   * inerte em .env e material de vazamento sem funcao.
   */
  if (configuracao.modoPublico) {
    const mecanismo = mecanismoDe()
    console.log(`[auth] verificacao de token por: ${mecanismo}`)
    if (mecanismo === 'jwks-assimetrico' && process.env.SUPABASE_JWT_SECRET) {
      console.warn(
        '[auth] AVISO: SUPABASE_JWT_SECRET esta definido mas NAO e usado — com SUPABASE_URL a verificacao e pelo JWKS assimetrico. Remova o segredo do ambiente.',
      )
    }
  }
  if (configuracao.ok) {
    const aviso = configuracao.faltando.length
      ? ` (${configuracao.faltando.length} de capacidade ausente(s): ${configuracao.faltando.join(', ')})`
      : ''
    console.log(
      `[config] ${configuracao.declaradas} variáveis declaradas; nenhuma CRÍTICA ausente (modo ${configuracao.modoPublico ? 'público' : 'self-host'})${aviso}.`,
    )
  } else {
    console.error(
      `[config] CRÍTICAS ausentes no modo ${configuracao.modoPublico ? 'público' : 'self-host'}: ${configuracao.faltandoCriticas.join(', ')} — /api/health responderá degraded.`,
    )
  }
  /* O convite ao responsável (Fase 4): em produção, sem o Resend, nenhum menor de 16 libera a conta.
     AVISA e segue — o resto do app serve, e quem abre só para adultos pode subir assim. */
  const conviteSemEmail = avisoDeConviteSemEmail()
  if (conviteSemEmail) console.warn(`[convite] AVISO: ${conviteSemEmail}`)
  /* ADR 0008: produção sem reserva de IA avisa no boot — e o aviso vai ao Sentry (`AVISOS_QUE_ALERTAM`),
     porque a reserva fora do ar só aparece de outro jeito no dia em que o primário cair. */
  const semReserva = avisoDeIaSemReserva()
  if (semReserva) log('warn', { event: 'ia_sem_reserva', error: semReserva })
  /* O legado sem retenção zero declarada (base fora da Groq/OpenRouter) avisa em produção — recusar
     mudaria o comportamento de quem já opera assim; o `IA_PROVEDORES` é onde a recusa vale. */
  for (const aviso of avisosDoRegistroDeIa()) log('warn', { event: 'ia_provedor_sem_zdr', error: aviso })
}
