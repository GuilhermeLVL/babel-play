/**
 * INVENTÁRIO DE CONFIGURAÇÃO (achado F14-02).
 *
 * Antes deste arquivo não existia lugar algum que respondesse "quais variáveis este servidor
 * exige". As 27 variáveis viviam espalhadas em `process.env.X` pelo código, e duas delas eram
 * resolvidas DENTRO de handlers de rota — inclusive a `SUPABASE_SERVICE_ROLE_KEY`, que contorna
 * toda a autorização do Supabase.
 *
 * O custo disso não é estético. Uma variável ausente não impedia o servidor de subir: ela virava
 * falha no meio de uma operação, na rota que a lia. Para a service role key isso significa a
 * exclusão de conta (LGPD art. 18, VI) descobrir, já em curso, que não consegue desfazer o vínculo
 * de login — que é exatamente o caminho de F9-01.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO
 *
 * Ele NÃO centraliza as 27 leituras. A maioria delas já está no padrão certo — `const` de módulo,
 * resolvida uma vez no carregamento (`AUDIO_DIR` em `routes/sessions.ts` é o exemplo). Reescrever
 * tudo para passar por aqui seria churn com risco de regressão e sem defeito correspondente.
 *
 * O que ele faz é o que faltava: DECLARAR o contrato, CONFERIR no boot, e servir as duas leituras
 * que estavam dentro de handler.
 */
import { PLAN_MATRIX } from '../../src/core/planos'
import { authRequired } from './auth'
import { registrarFalhaDeBoot } from './bootStatus'
import { log } from './logger'

/** Quando uma variável é obrigatória. */
type Exigencia =
  /** sem ela o servidor não funciona, em nenhum modo */
  | 'sempre'
  /** só no modo público (AUTH_REQUIRED): self-host não tem provedor de identidade */
  | 'modo-publico'
  /**
   * exigida sempre que NODE_ENV=production, independente do modo de auth.
   *
   * A distinção não é teórica: `SECRET_KEY` estava classificada como `modo-publico` e a sonda de
   * cabeçalhos, que sobe o build com NODE_ENV=production e AUTH_REQUIRED=0, encontrou o servidor
   * ABORTANDO no boot por falta dela. O inventário dizia "opcional neste modo" enquanto o código
   * dizia "sem ela eu não subo". Exercitar encontrou a divergência; ler não teria.
   */
  | 'producao'
  /** habilita uma capacidade; ausente, a capacidade se declara indisponível */
  | 'opcional'

/**
 * O que acontece quando a variável exigida falta.
 *
 * A distinção nasceu de um defeito MEU, pego ao exercitar: a primeira versão registrava falha de
 * boot para qualquer variável ausente, e `/api/health` passava a responder 503. Efeito medido — o
 * container do `docker-compose.yml` ficou **unhealthy** por falta de `SUPABASE_SERVICE_ROLE_KEY`,
 * que não está no `.env.docker`. Um orquestrador teria tirado do ar um serviço que funciona, por
 * causa de UMA capacidade degradada (o desvínculo de login na exclusão de conta).
 *
 * É a armadilha que a metodologia chama de gate que nasce vermelho: alguém o desliga, e aí ninguém
 * mais vê nada.
 */
type Criticidade =
  /** sem ela o serviço não atende corretamente — vira falha de boot e `/api/health` degrada */
  | 'impede-servico'
  /** sem ela uma capacidade específica se declara indisponível — aviso no log, saúde intacta */
  | 'degrada-capacidade'

export interface VariavelDeclarada {
  nome: string
  exigencia: Exigencia
  criticidade: Criticidade
  paraQue: string
}

/**
 * O contrato. Ordem alfabética para o diff ser legível.
 *
 * `modo-publico` é o grupo que importa: são as variáveis sem as quais o SaaS sobe parecendo
 * saudável e falha no primeiro request que precisa delas.
 */
/**
 * AS VARIAVEIS POR PLANO SAO GERADAS, e nao escritas a mao (ADR 0005).
 *
 * `storageQuota.ts` e `usageQuota.ts` montam o nome em tempo de execucao
 * (`${plan.toUpperCase()}_STORAGE_MB`), e leitura montada e invisivel ao grep, ao inventario e a
 * regra `env-fora-de-config`. A lista trazia so `ESSENCIAL_*` e `PRO_*` escritas a mao — mas o
 * codigo aceita os QUATRO planos, entao quem definisse `FREE_STORAGE_MB` teria o valor honrado
 * sem que ele constasse em lugar nenhum. Gerando a partir de `PLAN_MATRIX`, um plano novo declara
 * as suas tres variaveis no mesmo commit em que nasce.
 */
const SUFIXOS_POR_PLANO: ReadonlyArray<{ sufixo: string; paraQue: string }> = [
  { sufixo: 'STORAGE_MB', paraQue: 'teto de armazenamento do plano, em MB (override da PLAN_MATRIX)' },
  { sufixo: 'MONTHLY_MANAGED_CALLS', paraQue: 'cota mensal de chamadas gerenciadas do plano (default da PLAN_MATRIX)' },
  { sufixo: 'MONTHLY_STT_SECONDS', paraQue: 'teto mensal de segundos de STT do plano' },
]

export const VARIAVEIS_POR_PLANO: readonly VariavelDeclarada[] = Object.keys(PLAN_MATRIX).flatMap((plano) =>
  SUFIXOS_POR_PLANO.map(({ sufixo, paraQue }) => ({
    nome: `${plano.toUpperCase()}_${sufixo}`,
    exigencia: 'opcional' as const,
    criticidade: 'degrada-capacidade' as const,
    paraQue: `${paraQue} — plano ${plano}`,
  })),
)

export const VARIAVEIS: readonly VariavelDeclarada[] = [
  ...VARIAVEIS_POR_PLANO,
  {
    nome: 'ARMAZENAMENTO_COMPARTILHADO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      '1 declara que as réplicas montam o MESMO volume; sem isso, REPLICAS>1 exige S3 (ver server/lib/diretorios.ts)',
  },
  {
    nome: 'ASAAS_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'cobrança no Asaas; ausente, as rotas de compra e assinatura respondem indisponível',
  },
  {
    nome: 'ASAAS_BASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'endpoint do Asaas (sandbox ou produção)',
  },
  {
    nome: 'ASAAS_WEBHOOK_TOKEN',
    exigencia: 'opcional',
    criticidade: 'impede-servico',
    paraQue: 'token que autentica o webhook do Asaas. Sem ele, qualquer um pode declarar um pagamento confirmado',
  },
  {
    nome: 'AUDIO_DIR',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'diretório do áudio de sessão; sem ela, `data/audio` local — o que prende o arquivo ao disco da réplica',
  },
  {
    nome: 'AUTH_REQUIRED',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: '1 liga o modo público, 0 desliga; sem valor, liga só em produção',
  },
  {
    nome: 'CLUSTER_WORKERS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'nº de processos do cluster; sem ela, processo único (ver F6-01)',
  },
  {
    nome: 'CROSS_ORIGIN_ISOLATION',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'habilita COOP/COEP, necessário para SharedArrayBuffer na inferência local',
  },
  {
    nome: 'DATABASE_AUTH_TOKEN',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'token do banco libsql REMOTO (Turso); ignorado com arquivo local',
  },
  {
    nome: 'DATABASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'URL do libsql; sem ela, arquivo local em DATA_DIR',
  },
  {
    nome: 'DATA_DIR',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'raiz dos dados persistentes',
  },
  {
    nome: 'DESLIGAMENTO_TIMEOUT_MS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'teto em ms para drenar as conexoes em curso no SIGTERM antes de sair com 1 (padrao 10.000, o mesmo prazo que o `docker stop` da antes do SIGKILL); ajuste quem roda com `docker stop -t` menor ou `terminationGracePeriodSeconds` diferente',
  },
  {
    nome: 'ERROS_DIR',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'diário de erros em disco (F5-04)',
  },
  {
    nome: 'GEMINI_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'LLM de nuvem via Google; ausente, a cadeia cai para o próximo binding',
  },
  {
    nome: 'GEMINI_MODEL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'modelo do Gemini; sem ela, gemini-2.0-flash',
  },
  {
    nome: 'GROQ_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'STT e MT de nuvem via Groq; ausente, as rotas respondem 501',
  },
  {
    nome: 'GROQ_BASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'endpoint alternativo compatível com a API da Groq',
  },
  {
    nome: 'GROQ_LLM_MODEL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'modelo de LLM na Groq',
  },
  { nome: 'GROQ_MODEL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'modelo de STT na Groq' },
  { nome: 'HOST', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'interface de escuta' },
  {
    nome: 'HOSTNAME',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'só diagnóstico: identifica a instância que registrou uma falha de boot',
  },
  {
    nome: 'LLM_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'chave do provedor de LLM (qualquer um OpenAI-compatible). Substitui GROQ_API_KEY, que segue válida',
  },
  {
    nome: 'LLM_BASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'endpoint do provedor de LLM; trocar de provedor é só mudar isto',
  },
  {
    nome: 'LLM_MODEL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'modelo de tradução/tutor no provedor escolhido',
  },
  {
    nome: 'LLM_MODEL_GRANDE',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'modelo entregue a quem tem o entitlement `largerModels` (planos pro e selfhost). Ausente, todo plano recebe o mesmo modelo de `LLM_MODEL` — que era o comportamento antes da Fase 4, quando `largerModels` nao era lido por linha nenhuma do servidor',
  },
  {
    nome: 'LLM_RESERVA_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'provedor de LLM de RESERVA, usado quando o principal falha',
  },
  {
    nome: 'LLM_RESERVA_BASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'endpoint do provedor de reserva',
  },
  {
    nome: 'LLM_RESERVA_MODEL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'modelo no provedor de reserva',
  },
  {
    nome: 'LOCAL_OWNER_ID',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'id do dono no modo self-host',
  },
  {
    nome: 'METRICS_ENABLED',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      '1 MONTA `GET /metrics` (Prometheus, na raiz — não confundir com `/api/metrics`, que é a rota de negócio). Ausente, a rota não existe e responde 404 como qualquer caminho desconhecido: um 403 confirmaria a existência do endpoint a quem sonda',
  },
  {
    nome: 'METRICS_TOKEN',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'segredo do `Authorization: Bearer` de `GET /metrics`. Ausente, o scrape é aberto — aceitável em rede interna fechada e no self-host, e NÃO em rede pública: o scrape descreve rotas, volume e taxa de erro do servidor inteiro',
  },
  {
    nome: 'MIGRATIONS_DIR',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'diretório das migrações do Drizzle',
  },
  {
    nome: 'NODE_ENV',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'production liga CSP, exige auth por padrão e muda o pipeline do Vite',
  },
  { nome: 'OLLAMA_MODEL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'modelo do Ollama local' },
  {
    nome: 'OLLAMA_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'endereço do Ollama local; sem ela, http://localhost:11434/v1',
  },
  { nome: 'PORT', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'porta de escuta' },
  {
    nome: 'REPLICAS',
    exigencia: 'opcional',
    criticidade: 'impede-servico',
    paraQue:
      'nº de instâncias independentes. Acima de 1 o boot EXIGE armazenamento compartilhado, senão o áudio some conforme a réplica',
  },
  {
    nome: 'S3_ACCESS_KEY_ID',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'credencial do armazenamento de objetos',
  },
  {
    nome: 'S3_BUCKET',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'bucket do áudio; é o que torna o áudio alcançável por mais de uma réplica',
  },
  {
    nome: 'S3_ENDPOINT',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'endpoint S3-compatível (R2, MinIO, S3)',
  },
  {
    nome: 'S3_REGION',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'região do bucket; sem ela, auto',
  },
  {
    nome: 'S3_SECRET_ACCESS_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'credencial do armazenamento de objetos',
  },
  {
    nome: 'SECRET_KEY',
    exigencia: 'producao',
    criticidade: 'impede-servico',
    paraQue: 'cifra os segredos de credencial de IA guardados no banco (server/crypto.ts)',
  },
  {
    nome: 'STORAGE_RECONCILE_HOURS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'intervalo da reconciliação oportunista de armazenamento',
  },
  {
    nome: 'STORAGE_RECONCILE_MODE',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'job tira a varredura de armazenamento do caminho de /api/me/entitlements; quem opera chama POST /api/admin/armazenamento/reconciliar',
  },
  {
    nome: 'STT_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'STT de nuvem alternativo ao Groq',
  },
  {
    nome: 'STT_BASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'endpoint do STT alternativo',
  },
  { nome: 'STT_MODEL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'modelo do STT alternativo' },
  {
    nome: 'SUPABASE_JWT_SECRET',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'fallback HS256 do verificador de JWT. ATENÇÃO: tem PRECEDÊNCIA sobre o JWKS assimétrico (medido em F15-01)',
  },
  {
    nome: 'SUPABASE_SERVICE_ROLE_KEY',
    exigencia: 'modo-publico',
    criticidade: 'degrada-capacidade',
    paraQue: 'Admin API do Supabase para desfazer o vínculo de login na exclusão de conta (LGPD art. 18, VI)',
  },
  {
    nome: 'SUPABASE_URL',
    exigencia: 'modo-publico',
    criticidade: 'impede-servico',
    paraQue: 'origem do JWKS e base da Admin API; também é o que faz o `iss` do JWT ser exigido',
  },
  {
    nome: 'TRUST_PROXY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'em quantos saltos de proxy reverso confiar para resolver `req.ip` (`1`, `true`, `false`, `loopback` ou lista de sub-redes). Ausente, o Express não confia em `X-Forwarded-For` — atrás de proxy isso faz TODA origem virar a mesma chave do limitador e da trava do ranking; ligada sem proxy à frente, o cliente escolhe a própria chave e o limitador deixa de existir',
  },
  {
    nome: 'YTDLP_PATH',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'binário do yt-dlp para importação do YouTube; ausente, a capacidade se declara indisponível',
  },
]

export interface ResultadoDaConferencia {
  ok: boolean
  modoPublico: boolean
  /** todas as exigidas que faltam, críticas ou não */
  faltando: string[]
  /** só as que impedem o serviço — é este subconjunto que degrada a saúde */
  faltandoCriticas: string[]
  declaradas: number
}

/**
 * Função PURA: recebe o ambiente, devolve o veredicto. Pura porque é o que a torna testável sem
 * subir servidor nem mexer em `process.env` global — a mutação de env entre casos é justamente o
 * que deixa teste instável (ver `tests/integration/audio-dir-config.test.ts`).
 */
export function conferirConfiguracao(
  env: NodeJS.ProcessEnv = process.env,
  modoPublico: boolean = authRequired(),
): ResultadoDaConferencia {
  const preenchida = (n: string) => typeof env[n] === 'string' && env[n]!.trim().length > 0
  const producao = env.NODE_ENV === 'production'
  const exigidas = VARIAVEIS.filter(
    (v) =>
      v.exigencia === 'sempre' ||
      (v.exigencia === 'modo-publico' && modoPublico) ||
      (v.exigencia === 'producao' && producao),
  ).filter((v) => !preenchida(v.nome))
  const faltando = exigidas.map((v) => v.nome).sort()
  const faltandoCriticas = exigidas
    .filter((v) => v.criticidade === 'impede-servico')
    .map((v) => v.nome)
    .sort()
  /* `ok` fala do SERVIÇO. Capacidade degradada aparece em `faltando`, não derruba a saúde. */
  return { ok: faltandoCriticas.length === 0, modoPublico, faltando, faltandoCriticas, declaradas: VARIAVEIS.length }
}

/**
 * Confere no BOOT e registra falha em vez de derrubar o processo.
 *
 * Derrubar seria pior: uma réplica que não sobe não diz nada a ninguém, e o orquestrador só vê
 * reinício em laço. Registrando, `/api/health` responde `degraded` com o NOME do passo, que é o
 * que uma probe consegue enxergar — mesma decisão do P2-5, e o motivo de `bootStatus` existir.
 *
 * O nome das variáveis ausentes vai para o log; a resposta pública só carrega o passo.
 */
export function verificarConfiguracaoNoBoot(): ResultadoDaConferencia {
  const r = conferirConfiguracao()
  if (!r.ok) {
    registrarFalhaDeBoot('configuracao', `variáveis CRÍTICAS ausentes: ${r.faltandoCriticas.join(', ')}`)
  } else if (r.faltando.length) {
    /* Visível, mas sem derrubar a saúde: são capacidades que se declaram indisponíveis sozinhas. */
    log('warn', { event: 'config_capacidade_degradada', error: `ausentes: ${r.faltando.join(', ')}` })
  }
  return r
}

/* ─────────────── as leituras que estavam dentro de handler ─────────────── */

/**
 * A CHAVE e o MODELO do Gemini — passaram por aqui na Fase 3 do saneamento.
 *
 * As duas eram lidas direto do `process.env` dentro do `server.ts`, onde nenhuma regra alcançava.
 * Quando `/api/gemini/chat` virou `server/routes/gemini.ts`, a regra `env-fora-de-config`
 * (`audit/rules/ast-grep/`) passou a alcançá-las — e está certa: uma variável lida no handler não
 * aparece em inventário nenhum, e as duas JÁ estão declaradas na lista acima. O valor não muda;
 * muda o lugar de onde ele é lido.
 */
export function chaveDoGemini(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GEMINI_API_KEY
}

/** O modelo do Gemini, ou `undefined` — o default (`MODELO_GEMINI_PADRAO`) é de quem chama. */
export function modeloDoGemini(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GEMINI_MODEL
}

/**
 * `GET /metrics` deve EXISTIR? (Fase 5.)
 *
 * A resposta decide MONTAGEM, não comportamento de handler — `server/http/app.ts` só registra a
 * rota quando isto é verdade. A diferença importa: uma rota montada que responde 403 confirma a
 * um estranho que o endpoint existe e que o servidor é instrumentado; uma rota não montada responde
 * o 404 de qualquer caminho inexistente e não conta nada.
 *
 * `'1'` exato, e não "qualquer valor verdadeiro": `METRICS_ENABLED=0` e `METRICS_ENABLED=false`
 * são as duas formas que um operador escreve quando quer DESLIGAR, e as duas são strings não
 * vazias — um teste de truthiness ligaria a rota justamente para quem pediu para desligá-la.
 */
export function metricasHabilitadas(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.METRICS_ENABLED === '1'
}

/**
 * O segredo do `Bearer` de `GET /metrics`, ou `undefined` quando não configurado.
 *
 * `undefined` (e não string vazia) porque quem chama precisa distinguir "sem token, scrape aberto"
 * de "token vazio" — o segundo, tratado como segredo, autenticaria qualquer requisição sem
 * `Authorization`. Espaço em volta é aparado: `METRICS_TOKEN=" abc "` no `.env` é erro de digitação,
 * e comparar com o espaço faria o scraper falhar com um 401 sem explicação.
 */
export function tokenDeMetricas(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const bruto = env.METRICS_TOKEN?.trim()
  return bruto ? bruto : undefined
}

/**
 * A nuvem de STT está configurada? Lido por `GET /api/ai/stt/available`, que existe para o
 * roteador decidir sem gastar chamada de API.
 */
export function sttDeNuvemConfigurado(env: NodeJS.ProcessEnv = process.env): boolean {
  // `LLM_API_KEY` entra aqui também: sem isto, quem configurasse só o nome novo veria a rota
  // `/api/ai/stt/available` responder "não configurado" com a chave presente — e a UI esconderia
  // uma capacidade que existe.
  return Boolean(env.LLM_API_KEY || env.GROQ_API_KEY || env.STT_API_KEY)
}

/**
 * Credenciais da Admin API do Supabase, ou `null` quando não configuradas.
 *
 * Devolver `null` em vez de string vazia é deliberado: quem chama é obrigado a tratar o caso, e a
 * exclusão de conta reporta o motivo ao titular em vez de seguir e falhar no `fetch`.
 */
export function adminDoSupabase(env: NodeJS.ProcessEnv = process.env): { base: string; chave: string } | null {
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '')
  const chave = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !chave) return null
  return { base, chave }
}
