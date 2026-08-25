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
import { registrarFalhaDeBoot } from './bootStatus'
import { log } from './logger'
import { authRequired } from './auth'

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
export const VARIAVEIS: readonly VariavelDeclarada[] = [
  { nome: 'AUDIO_DIR', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'diretório do áudio de sessão; sem ela, `data/audio` local — o que prende o arquivo ao disco da réplica' },
  { nome: 'AUTH_REQUIRED', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: '1 liga o modo público, 0 desliga; sem valor, liga só em produção' },
  { nome: 'CLUSTER_WORKERS', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'nº de processos do cluster; sem ela, processo único (ver F6-01)' },
  { nome: 'CROSS_ORIGIN_ISOLATION', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'habilita COOP/COEP, necessário para SharedArrayBuffer na inferência local' },
  { nome: 'DATABASE_URL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'URL do libsql; sem ela, arquivo local em DATA_DIR' },
  { nome: 'DATABASE_AUTH_TOKEN', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'token do banco libsql REMOTO (Turso); ignorado com arquivo local' },
  { nome: 'DATA_DIR', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'raiz dos dados persistentes' },
  { nome: 'ERROS_DIR', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'diário de erros em disco (F5-04)' },
  { nome: 'GEMINI_API_KEY', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'LLM de nuvem via Google; ausente, a cadeia cai para o próximo binding' },
  { nome: 'GROQ_API_KEY', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'STT e MT de nuvem via Groq; ausente, as rotas respondem 501' },
  { nome: 'GROQ_BASE_URL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'endpoint alternativo compatível com a API da Groq' },
  { nome: 'GROQ_LLM_MODEL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'modelo de LLM na Groq' },
  { nome: 'GROQ_MODEL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'modelo de STT na Groq' },
  { nome: 'HOST', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'interface de escuta' },
  { nome: 'LOCAL_OWNER_ID', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'id do dono no modo self-host' },
  { nome: 'MIGRATIONS_DIR', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'diretório das migrações do Drizzle' },
  { nome: 'NODE_ENV', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'production liga CSP, exige auth por padrão e muda o pipeline do Vite' },
  { nome: 'OLLAMA_MODEL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'modelo do Ollama local' },
  { nome: 'PORT', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'porta de escuta' },
  { nome: 'PRO_MONTHLY_MANAGED_CALLS', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'cota mensal de chamadas gerenciadas do plano Pro' },
  { nome: 'SECRET_KEY', exigencia: 'producao', criticidade: 'impede-servico', paraQue: 'cifra os segredos de credencial de IA guardados no banco (server/crypto.ts)' },
  { nome: 'STORAGE_RECONCILE_HOURS', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'intervalo da reconciliação oportunista de armazenamento' },
  { nome: 'STT_API_KEY', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'STT de nuvem alternativo ao Groq' },
  { nome: 'STT_BASE_URL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'endpoint do STT alternativo' },
  { nome: 'STT_MODEL', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'modelo do STT alternativo' },
  { nome: 'SUPABASE_JWT_SECRET', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'fallback HS256 do verificador de JWT. ATENÇÃO: tem PRECEDÊNCIA sobre o JWKS assimétrico (medido em F15-01)' },
  { nome: 'SUPABASE_SERVICE_ROLE_KEY', exigencia: 'modo-publico', criticidade: 'degrada-capacidade', paraQue: 'Admin API do Supabase para desfazer o vínculo de login na exclusão de conta (LGPD art. 18, VI)' },
  { nome: 'SUPABASE_URL', exigencia: 'modo-publico', criticidade: 'impede-servico', paraQue: 'origem do JWKS e base da Admin API; também é o que faz o `iss` do JWT ser exigido' },
  { nome: 'YTDLP_PATH', exigencia: 'opcional', criticidade: 'degrada-capacidade', paraQue: 'binário do yt-dlp para importação do YouTube; ausente, a capacidade se declara indisponível' },
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
  const exigidas = VARIAVEIS
    .filter((v) => v.exigencia === 'sempre'
      || (v.exigencia === 'modo-publico' && modoPublico)
      || (v.exigencia === 'producao' && producao))
    .filter((v) => !preenchida(v.nome))
  const faltando = exigidas.map((v) => v.nome).sort()
  const faltandoCriticas = exigidas.filter((v) => v.criticidade === 'impede-servico').map((v) => v.nome).sort()
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

/* ─────────────── as duas leituras que estavam dentro de handler ─────────────── */

/**
 * A nuvem de STT está configurada? Lido por `GET /api/ai/stt/available`, que existe para o
 * roteador decidir sem gastar chamada de API.
 */
export function sttDeNuvemConfigurado(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GROQ_API_KEY || env.STT_API_KEY)
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
