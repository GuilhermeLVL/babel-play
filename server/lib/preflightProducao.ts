/**
 * PREFLIGHT DE PRODUÇÃO — confere um arquivo de variáveis ANTES do deploy, só pelos NOMES.
 *
 * Quem usa é `scripts/preflight-producao.mjs` (`npm run preflight -- <arquivo>`). Aqui fica a regra,
 * pura, para o teste exercitá-la sem arquivo nem processo.
 *
 * NÃO COPIA REGRA DO SERVIDOR: as travas de boot (`erroDeAuthEmProducao`, `erroDeTrustProxyEmProducao`,
 * `erroDeMetricasEmProducao`, `erroDoRegistroDeIa`) e o inventário (`conferirConfiguracao`) são as
 * MESMAS funções que o `server.ts` chama, recebendo o objeto de variáveis lido do arquivo. Uma regra
 * nova no servidor passa a valer aqui sem mexer neste arquivo.
 *
 * NUNCA devolve um valor: cada achado carrega o NOME da variável e um texto fixo. O tamanho de um
 * segredo também não sai daqui (só "curto demais"), para a saída poder ir para o chat sem vazar nada.
 *
 * Os três níveis:
 *  - BLOQUEIA: o boot aborta, ou o serviço sobe quebrado/inseguro — não suba assim;
 *  - AVISA: sobe, mas uma capacidade fica desligada (ou há uma suspeita a conferir);
 *  - OK: conferido.
 */
import { parse } from 'dotenv'

import { erroDoRegistroDeIa } from '../ai/registroDeProvedores'
import { authRequired, erroDeAuthEmProducao } from './auth'
import {
  cadastroLigado,
  checkoutLigado,
  conferirConfiguracao,
  erroDeMetricasEmProducao,
  erroDeTrustProxyEmProducao,
} from './config'

export type Nivel = 'BLOQUEIA' | 'AVISA' | 'OK'

export interface Achado {
  nivel: Nivel
  /** O(s) nome(s) da variável. Nunca o valor. */
  nome: string
  texto: string
}

export const TAMANHO_MINIMO_DA_SECRET_KEY = 32
const TAMANHO_MINIMO_DO_SEGREDO_DE_ORIGEM = 32

/** O conteúdo de um arquivo `.env` → objeto. Mesmo parser do dotenv que o servidor usa. */
export function lerVariaveis(conteudo: string): Record<string, string> {
  return parse(conteudo)
}

/** Valor com cara de modelo não preenchido (o que veio copiado de um `.env.example`). */
const CARA_DE_EXEMPLO = /troque-|exemplo|example|changeme|change-me|xxxx|coloque-|preencha/i

const preenchida = (env: NodeJS.ProcessEnv, nome: string): boolean => (env[nome] ?? '').trim().length > 0

/** Todas as variáveis do grupo preenchidas, nenhuma, ou parte? */
function estadoDoGrupo(env: NodeJS.ProcessEnv, nomes: readonly string[]): 'completo' | 'vazio' | 'parcial' {
  const n = nomes.filter((x) => preenchida(env, x)).length
  return n === nomes.length ? 'completo' : n === 0 ? 'vazio' : 'parcial'
}

const faltam = (env: NodeJS.ProcessEnv, nomes: readonly string[]): string =>
  nomes.filter((x) => !preenchida(env, x)).join(', ')

function ehHttps(valor: string | undefined): boolean {
  return /^https:\/\/[^\s/]+/i.test((valor ?? '').trim())
}

export function conferirProducao(arquivo: NodeJS.ProcessEnv): Achado[] {
  const achados: Achado[] = []
  const ok = (nome: string, texto: string) => achados.push({ nivel: 'OK', nome, texto })
  const avisa = (nome: string, texto: string) => achados.push({ nivel: 'AVISA', nome, texto })
  const bloqueia = (nome: string, texto: string) => achados.push({ nivel: 'BLOQUEIA', nome, texto })

  /* A imagem fixa NODE_ENV=production; se o arquivo não o declara, vale o que o servidor vai ver. */
  const declarouNodeEnv = preenchida(arquivo, 'NODE_ENV')
  if (declarouNodeEnv && arquivo.NODE_ENV!.trim() !== 'production') {
    bloqueia('NODE_ENV', 'o arquivo declara um NODE_ENV que não é "production": as travas de produção não valeriam')
  } else if (!declarouNodeEnv) {
    ok('NODE_ENV', 'ausente no arquivo: a imagem fixa production, e a conferência assume production')
  } else {
    ok('NODE_ENV', 'production')
  }
  const env: NodeJS.ProcessEnv = { ...arquivo, NODE_ENV: 'production' }

  /* ─────────── as travas do boot (as mesmas funções do servidor) ─────────── */
  const travas: Array<[nome: string, erro: string | null]> = [
    ['AUTH_REQUIRED', erroDeAuthEmProducao(env)],
    ['TRUST_PROXY', erroDeTrustProxyEmProducao(env)],
    ['METRICS_ENABLED', erroDeMetricasEmProducao(env)],
    ['IA_PROVEDORES', erroDoRegistroDeIa(env)],
  ]
  for (const [nome, erro] of travas) {
    // O texto do servidor descreve a regra, não o valor; o do registro de IA pode citar um trecho do
    // JSON, então ele NÃO é repetido aqui: manda ler o log do boot.
    if (!erro) {
      ok(nome, 'a trava do boot passa')
    } else if (nome === 'IA_PROVEDORES') {
      bloqueia(
        nome,
        'o registro de provedores de IA é inválido: o boot aborta em produção (rode o servidor para ler o motivo)',
      )
    } else {
      bloqueia(nome, `o boot aborta: ${erro}`)
    }
  }
  const modoPublico = authRequired(env)
  if (env.SELF_HOST === '1') {
    avisa('SELF_HOST', 'declara instalação pessoal sem login: isto não é o SaaS público')
  }

  /* ─────────── o inventário do servidor (exigidas por modo) ─────────── */
  const inventario = conferirConfiguracao(env, modoPublico)
  for (const nome of inventario.faltandoCriticas) {
    bloqueia(nome, 'obrigatória em produção e ausente')
  }
  // A service role key tem texto próprio mais abaixo (o que quebra é a exclusão de conta).
  const proprias = new Set([...inventario.faltandoCriticas, 'SUPABASE_SERVICE_ROLE_KEY'])
  for (const nome of inventario.faltando.filter((n) => !proprias.has(n))) {
    avisa(nome, 'exigida neste modo e ausente: a capacidade correspondente fica desligada')
  }

  /* ─────────── segredos ─────────── */
  if (preenchida(env, 'SECRET_KEY')) {
    if (env.SECRET_KEY!.trim().length < TAMANHO_MINIMO_DA_SECRET_KEY) {
      bloqueia('SECRET_KEY', `curta demais: use ${TAMANHO_MINIMO_DA_SECRET_KEY} caracteres aleatórios ou mais`)
    } else {
      ok('SECRET_KEY', 'presente e com o tamanho mínimo')
    }
  }
  if (!preenchida(env, 'ORIGEM_SEGREDO')) {
    avisa('ORIGEM_SEGREDO', 'ausente: quem chega direto no endereço do Fly pula a Cloudflare e escolhe o próprio IP')
  } else if (env.ORIGEM_SEGREDO!.trim().length < TAMANHO_MINIMO_DO_SEGREDO_DE_ORIGEM) {
    avisa('ORIGEM_SEGREDO', 'curto demais: use 32 caracteres aleatórios ou mais')
  } else {
    ok('ORIGEM_SEGREDO', 'presente')
  }

  /* ─────────── login (Supabase) ─────────── */
  if (preenchida(env, 'SUPABASE_URL') && !ehHttps(env.SUPABASE_URL)) {
    avisa('SUPABASE_URL', 'não começa com https://')
  }
  if (!preenchida(env, 'SUPABASE_SERVICE_ROLE_KEY') && modoPublico) {
    avisa(
      'SUPABASE_SERVICE_ROLE_KEY',
      'ausente: excluir a conta apaga os dados mas NÃO desfaz o login (LGPD art. 18, VI) — resolva antes de abrir o cadastro',
    )
  }
  for (const [nome, o_que] of [
    ['VITE_SUPABASE_URL', 'o navegador não consegue fazer login e a CSP não libera o Supabase'],
    ['VITE_SUPABASE_ANON_KEY', 'o navegador não consegue fazer login'],
    ['VITE_TURNSTILE_SITE_KEY', 'o captcha do convidado fica desligado'],
  ] as const) {
    if (!preenchida(env, nome)) avisa(nome, `ausente: ${o_que}`)
    else ok(nome, 'presente')
  }
  if (
    preenchida(env, 'SUPABASE_URL') &&
    preenchida(env, 'VITE_SUPABASE_URL') &&
    env.SUPABASE_URL!.trim().replace(/\/+$/, '') !== env.VITE_SUPABASE_URL!.trim().replace(/\/+$/, '')
  ) {
    bloqueia(
      'SUPABASE_URL, VITE_SUPABASE_URL',
      'apontam para projetos diferentes: o navegador entraria num projeto e o servidor validaria o token em outro',
    )
  }

  /* ─────────── cobrança (Asaas) ─────────── */
  const chaveDoAsaas = preenchida(env, 'ASAAS_API_KEY')
  if (!chaveDoAsaas) {
    avisa('ASAAS_API_KEY', 'ausente: assinar e comprar respondem "indisponível"')
  } else {
    ok('ASAAS_API_KEY', 'presente')
  }
  if (!preenchida(env, 'ASAAS_WEBHOOK_TOKEN')) {
    if (chaveDoAsaas) {
      bloqueia(
        'ASAAS_WEBHOOK_TOKEN',
        'ausente com a cobrança ligada: o webhook responde 501 e NENHUM pagamento é confirmado — o cliente paga e não recebe o plano',
      )
    } else {
      avisa('ASAAS_WEBHOOK_TOKEN', 'ausente: sem ele o webhook do Asaas fica desligado (501)')
    }
  } else {
    ok('ASAAS_WEBHOOK_TOKEN', 'presente')
  }
  if (!preenchida(env, 'ASAAS_BASE_URL')) {
    avisa('ASAAS_BASE_URL', 'ausente: o servidor usa o SANDBOX por padrão — sandbox em produção?')
  } else if (/sandbox/i.test(env.ASAAS_BASE_URL!)) {
    avisa(
      'ASAAS_BASE_URL',
      'aponta para o SANDBOX com NODE_ENV=production: sandbox em produção? (certo no staging, errado na venda real)',
    )
  } else {
    ok('ASAAS_BASE_URL', 'aponta para o ambiente de produção do Asaas')
  }
  if (chaveDoAsaas && preenchida(env, 'ASAAS_BASE_URL')) {
    // Chaves do Asaas: `$aact_hmlg_…` é do sandbox, `$aact_prod_…` é da produção.
    const chave = env.ASAAS_API_KEY!
    const baseSandbox = /sandbox/i.test(env.ASAAS_BASE_URL!)
    if (/hmlg/i.test(chave) && !baseSandbox) {
      bloqueia(
        'ASAAS_API_KEY, ASAAS_BASE_URL',
        'a chave parece ser do SANDBOX e o endereço é o da produção: a cobrança falharia',
      )
    } else if (/aact_prod/i.test(chave) && baseSandbox) {
      bloqueia(
        'ASAAS_API_KEY, ASAAS_BASE_URL',
        'a chave parece ser da PRODUÇÃO e o endereço é o do sandbox: a cobrança falharia',
      )
    }
  }

  /* ─────────── as portas de emergência: cadastro e venda ─────────── */
  for (const [nome, aberto] of [
    ['SIGNUP_ENABLED', cadastroLigado(env)],
    ['CHECKOUT_ENABLED', checkoutLigado(env)],
  ] as const) {
    if (aberto) {
      avisa(
        nome,
        'ABERTO (ausente ou diferente de 0): para o primeiro deploy o plano é FECHADO — defina =0 até as conferências passarem',
      )
    } else {
      ok(nome, 'FECHADO (=0), como no primeiro deploy')
    }
  }

  /* ─────────── mídia e backup ─────────── */
  const s3 = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
  const estadoS3 = estadoDoGrupo(env, s3)
  if (estadoS3 === 'completo') ok('S3_*', 'as quatro presentes (áudio e backups fora do disco da máquina)')
  else if (estadoS3 === 'vazio') {
    avisa('S3_*', 'ausentes: o áudio fica no disco da máquina e some junto com ela; sem R2 não há backup diário')
  } else avisa('S3_*', `incompletas (faltam: ${faltam(env, s3)}): o S3 não liga e cai no disco local`)
  if (env.BACKUP_DIARIO === '1') {
    if (estadoS3 !== 'completo')
      avisa('BACKUP_DIARIO', 'ligado, mas sem as S3_* completas: o snapshot não tem para onde ir')
    else ok('BACKUP_DIARIO', 'ligado')
    if (!preenchida(env, 'BACKUP_HEARTBEAT_URL')) {
      avisa('BACKUP_HEARTBEAT_URL', 'ausente: nada alerta se o snapshot diário parar de acontecer')
    }
  } else {
    avisa('BACKUP_DIARIO', 'desligado (diferente de 1): sem snapshot diário do banco')
  }
  const litestream = [
    'LITESTREAM_BUCKET',
    'LITESTREAM_ENDPOINT',
    'LITESTREAM_ACCESS_KEY_ID',
    'LITESTREAM_SECRET_ACCESS_KEY',
  ] as const
  const estadoLs = estadoDoGrupo(env, litestream)
  if (estadoLs === 'completo') ok('LITESTREAM_*', 'as quatro presentes (réplica contínua do banco)')
  else if (estadoLs === 'vazio') avisa('LITESTREAM_*', 'ausentes: sem a réplica contínua do banco')
  else avisa('LITESTREAM_*', `incompletas (faltam: ${faltam(env, litestream)}): a réplica contínua não liga`)

  /* ─────────── IA de nuvem ─────────── */
  const temRegistro = preenchida(env, 'IA_PROVEDORES') || preenchida(env, 'IA_PROVEDORES_ARQUIVO')
  const llm = ['LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL'] as const
  const estadoLlm = estadoDoGrupo(env, llm)
  if (estadoLlm === 'completo') ok('LLM_*', 'principal configurado')
  else if (estadoLlm === 'parcial') avisa('LLM_*', `incompleto (faltam: ${faltam(env, llm)}): o principal não liga`)
  else if (!temRegistro && !preenchida(env, 'GROQ_API_KEY')) {
    avisa('LLM_*', 'ausentes (e sem IA_PROVEDORES): o tutor e a tradução de nuvem ficam desligados')
  }
  const reserva = ['LLM_RESERVA_API_KEY', 'LLM_RESERVA_BASE_URL', 'LLM_RESERVA_MODEL'] as const
  const estadoRes = estadoDoGrupo(env, reserva)
  if (estadoRes === 'completo') ok('LLM_RESERVA_*', 'reserva configurada')
  else if (estadoRes === 'parcial')
    avisa('LLM_RESERVA_*', `incompleta (faltam: ${faltam(env, reserva)}): a reserva não liga`)
  else if (!temRegistro) avisa('LLM_RESERVA_*', 'ausentes: sem reserva se o provedor principal cair')
  if (!temRegistro && !preenchida(env, 'GROQ_API_KEY') && !preenchida(env, 'STT_API_KEY')) {
    avisa('GROQ_API_KEY, STT_API_KEY', 'ausentes (e sem IA_PROVEDORES): a transcrição de nuvem responde 501')
  }
  for (const nome of ['AI_BUDGET_USD_MONTH', 'AI_BUDGET_USD_DAY'] as const) {
    const bruto = (env[nome] ?? '').trim()
    if (!bruto) {
      avisa(
        nome,
        nome === 'AI_BUDGET_USD_MONTH'
          ? 'ausente: vale o padrão de US$ 20 por mês no modo público — declare o seu teto'
          : 'ausente: sem teto diário (só o mensal) — um laço de cliente queima o mês numa tarde',
      )
    } else if (!Number.isFinite(Number(bruto)) || Number(bruto) < 0) {
      avisa(nome, 'não é um número válido (US$, zero ou mais)')
    } else if (Number(bruto) === 0) {
      avisa(nome, 'é 0: a IA de nuvem fica DESLIGADA')
    } else {
      ok(nome, 'definido')
    }
  }

  /* ─────────── e-mail, observabilidade, endereço ─────────── */
  if (!preenchida(env, 'RESEND_API_KEY') || !preenchida(env, 'EMAIL_REMETENTE')) {
    avisa(
      'RESEND_API_KEY, EMAIL_REMETENTE',
      `faltam: ${faltam(env, ['RESEND_API_KEY', 'EMAIL_REMETENTE'])} — o convite ao responsável não sai por e-mail: nenhum menor de 16 anos consegue liberar a conta`,
    )
  } else if (!env.EMAIL_REMETENTE!.includes('@')) {
    avisa('EMAIL_REMETENTE', 'sem "@": o formato é `Babel Play <nao-responda@dominio>`')
  } else {
    ok('RESEND_API_KEY, EMAIL_REMETENTE', 'presentes')
  }
  if (!preenchida(env, 'SENTRY_DSN')) avisa('SENTRY_DSN', 'ausente: erros do servidor não chegam a lugar nenhum')
  else ok('SENTRY_DSN', 'presente')
  if (!preenchida(env, 'APP_URL')) {
    avisa('APP_URL', 'ausente: o link do convite ao responsável sai relativo e só serve na tela')
  } else if (/\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(env.APP_URL!)) {
    bloqueia('APP_URL', 'aponta para o próprio computador: o link do convite quebraria para todo mundo')
  } else if (!ehHttps(env.APP_URL)) {
    avisa('APP_URL', 'não começa com https://')
  } else {
    ok('APP_URL', 'presente, em https')
  }

  /* ─────────── valores com cara de exemplo (qualquer variável do arquivo) ─────────── */
  const exemplos = Object.keys(arquivo)
    .filter((n) => preenchida(arquivo, n) && CARA_DE_EXEMPLO.test(arquivo[n]!))
    .sort()
  if (exemplos.length) {
    bloqueia(
      exemplos.join(', '),
      'valor com cara de exemplo (troque-…, exemplo, changeme…): foi copiado do modelo e não preenchido',
    )
  }

  return achados
}

/** Quantos achados há de cada nível, e se pode subir. */
export function resumir(achados: Achado[]): { bloqueia: number; avisa: number; ok: number; podeSubir: boolean } {
  const n = (nivel: Nivel) => achados.filter((a) => a.nivel === nivel).length
  return { bloqueia: n('BLOQUEIA'), avisa: n('AVISA'), ok: n('OK'), podeSubir: n('BLOQUEIA') === 0 }
}
