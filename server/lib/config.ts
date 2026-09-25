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
  { sufixo: 'MONTHLY_LLM_TOKENS', paraQue: 'teto mensal de tokens (entrada + saída) do LLM de nuvem do plano' },
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
    nome: 'AI_BUDGET_USD_MONTH',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'teto de gasto ESTIMADO com IA de nuvem no mês, em US$ (server/lib/orcamentoDeIa.ts). A 80% sai o evento ia_orcamento_alerta_80; a 100% a nuvem desliga até o mês virar. Ausente: US$ 20 no modo público, sem teto no self-host. 0 desliga a nuvem',
  },
  {
    nome: 'AI_ENABLED',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave de emergência: 0 desliga TODA IA de nuvem na hora (tradução, transcrição, tutor) e o app segue com os modelos locais. Ausente ou 1: ligada',
  },
  {
    nome: 'AI_PRECOS_MODELOS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'JSON com o preço por modelo que o orçamento usa: {"modelo": {"entrada": US$/1M, "saida": US$/1M}} para LLM e {"modelo": {"hora": US$}} para STT. Sobrepõe a tabela oficial embutida',
  },
  {
    nome: 'APP_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'endereço público do app (https://…) para montar links absolutos, como o do convite ao responsável; sem ela o link sai relativo e só serve na tela',
  },
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
    nome: 'AUDIO_RETENCAO_DIAS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'dias que o áudio gravado de uma sessão fica guardado (disco ou S3/R2) antes da limpeza diária apagar o arquivo e devolver a cota; sem ela, 90. `0` guarda para sempre (server/lib/retencaoDeAudio.ts)',
  },
  {
    nome: 'AUTH_REQUIRED',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: '1 liga o modo público, 0 desliga; sem valor, liga só em produção',
  },
  {
    nome: 'BACKUP_DIARIO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      '1 liga o snapshot diário do banco (VACUUM INTO + integrity_check + gzip) enviado ao R2 em `backups/diario/AAAA-MM-DD.db.gz` (server/operacao/snapshot.ts). Exige as `S3_*`',
  },
  {
    nome: 'BACKUP_HEARTBEAT_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'URL chamada (GET) só depois de um snapshot diário enviado E conferido — o heartbeat do UptimeRobot alerta quando ela deixa de ser chamada',
  },
  {
    nome: 'BACKUP_HORA_UTC',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'hora UTC (0–23) do snapshot diário; sem ela, 6 (03h em Brasília, o vale do tráfego)',
  },
  {
    nome: 'BACKUP_S3_BUCKET',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'bucket dos snapshots diários; sem ela, o mesmo `S3_BUCKET` da mídia. Um bucket próprio deixa a regra de retenção (30 dias) separada da mídia',
  },
  {
    nome: 'CHECKOUT_ENABLED',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave de emergência da VENDA: `0` fecha assinar e comprar (503 com mensagem clara); quem já paga continua com o plano. Ausente = ligada',
  },
  {
    nome: 'CLUSTER_WORKERS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'nº de processos do cluster; sem ela, processo único (ver F6-01)',
  },
  {
    nome: 'CONVITE_LINK_NA_TELA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      '`1` devolve o link do convite ao responsável na resposta (desenvolvimento/testes, e o self-host sem Resend). Ausente = ligado fora de produção, desligado em produção',
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
    nome: 'EMAIL_REMETENTE',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'remetente do e-mail do convite ao responsável, no formato `Babel Play <nao-responda@dominio>`; o domínio precisa estar verificado no Resend (SPF/DKIM). Só vale junto com `RESEND_API_KEY`',
  },
  {
    nome: 'ERROS_DIR',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'diário de erros em disco (F5-04)',
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
    paraQue:
      'endereço do Ollama local (só self-host: com AUTH_REQUIRED o tutor não tenta o Ollama); sem ela, http://localhost:11434/v1',
  },
  {
    nome: 'OPENROUTER_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'atalho da RESERVA do LLM: base do OpenRouter e o modelo de LLM_RESERVA_MODEL (ou o padrão). As três LLM_RESERVA_* completas vencem o atalho',
  },
  {
    nome: 'ORIGEM_SEGREDO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'segredo que o Cloudflare injeta no cabeçalho `x-origem-segredo` (Transform Rule). Definido, requisição sem ele é recusada com 403 — fecha o acesso direto a `<app>.fly.dev`, que pularia o WAF e forjaria o `X-Forwarded-For`. `/api/health` e `/api/ready` ficam de fora (as sondas do Fly não passam pelo Cloudflare)',
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
    nome: 'RESEND_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave do Resend (só permissão de envio) para o e-mail do convite ao responsável. Sem ela (ou sem `EMAIL_REMETENTE`) o convite só é registrado no log: em produção com AUTH_REQUIRED=1 nenhum menor de 16 consegue liberar a conta, e o boot avisa',
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
    nome: 'SELF_HOST',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      '1 declara a instalação pessoal sem login: só com ela o build de produção sobe com AUTH_REQUIRED=0 (GAP-003 recusa o AUTH_REQUIRED=0 esquecido sozinho)',
  },
  {
    nome: 'SENTRY_DSN',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'DSN do Sentry do SERVIDOR. Definido, todo `log(error)` já saneado (allowlist + redação) vira evento — inclusive os erros do navegador que chegam por /api/erros-do-cliente. Sem e-mail, IP, prompt ou transcrição, por construção (server/lib/sentry.ts)',
  },
  {
    nome: 'SENTRY_ENVIRONMENT',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'ambiente no Sentry (production, staging); sem ela, o NODE_ENV',
  },
  {
    nome: 'SENTRY_RELEASE',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'versão no Sentry; o Dockerfile a preenche com o commit da imagem (build arg VERSAO)',
  },
  {
    nome: 'SIGNUP_ENABLED',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave de emergência do CADASTRO: `0` recusa contas novas (403 `cadastro_fechado`) e esconde "Criar conta"; quem já tem conta segue. Desligue também o cadastro no painel do Supabase. Ausente = ligada',
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
      'em quantos saltos de proxy reverso confiar para resolver `req.ip` (`1`, `true`, `false`, `loopback` ou lista de sub-redes). OBRIGATÓRIA com NODE_ENV=production — o boot aborta sem ela (GAP-004); Cloudflare → Fly.io são 2 saltos. Ausente fora de produção, o Express não confia em `X-Forwarded-For` — atrás de proxy isso faz TODA origem virar a mesma chave do limitador e da trava do ranking; ligada sem proxy à frente, o cliente escolhe a própria chave e o limitador deixa de existir',
  },
  /* As três `VITE_*` abaixo são de BUILD (o Vite as embute no bundle). O servidor as lê só para a
     CSP enxergar os mesmos hosts que o bundle chama; o `Dockerfile` as repete como `ENV` do runtime. */
  {
    nome: 'VITE_SELF_HOST_MODELS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'de onde o navegador baixa os pesos dos modelos locais: `1` = mesmo domínio (`/models`), uma URL = o bucket R2 público. A CSP libera a origem da URL em `connect-src`',
  },
  {
    nome: 'VITE_SENTRY_DSN',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'DSN do Sentry do NAVEGADOR; a CSP libera o host de ingestão dele em `connect-src`',
  },
  {
    nome: 'VITE_SUPABASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'projeto Supabase do login no navegador; a CSP libera a origem dele em `connect-src`',
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
 * GAP-013 (auditoria 2026-09-13): em produção, `/metrics` ligado SEM token é scrape aberto — expõe
 * rota, volume e taxa de erro do servidor a qualquer um. Fora de produção (self-host, rede interna
 * fechada) exigir token é fricção sem ameaça. Retorna a mensagem de aborto de boot, ou `null` se ok.
 */
export function erroDeMetricasEmProducao(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV === 'production' && metricasHabilitadas(env) && !tokenDeMetricas(env)) {
    return 'METRICS_ENABLED=1 em produção exige METRICS_TOKEN: recusando expor /metrics sem autenticação.'
  }
  return null
}

/**
 * GAP-004 (auditoria 2026-09-13): em produção, `TRUST_PROXY` precisa ser uma DECISÃO declarada.
 *
 * Os dois erros possíveis desligam proteção em silêncio, e nenhum falha alto: sem `TRUST_PROXY`
 * atrás de proxy, todo visitante vira o IP do proxy e divide um balde só do limitador (um atacante
 * esgota a cota do planeta inteiro); ligada sem proxy à frente, o cliente escolhe a própria chave.
 * Não há como o processo descobrir sozinho quantos saltos existem na frente dele — então, em
 * produção, ele se recusa a adivinhar. Quem roda exposto direto declara `TRUST_PROXY=false`.
 *
 * Devolve a mensagem de aborto de boot, ou `null` quando a postura foi declarada.
 */
export function erroDeTrustProxyEmProducao(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== 'production') return null
  if (env.TRUST_PROXY?.trim()) return null
  return (
    'TRUST_PROXY é obrigatória em produção (NODE_ENV=production): declare quantos proxies há na frente ' +
    '(ex.: 2 para Cloudflare → Fly.io, 1 para um Caddy/Nginx) ou TRUST_PROXY=false se o app recebe a ' +
    'conexão direto. Sem ela, o limitador por IP enxerga todo mundo como o proxy.'
  )
}

/**
 * O segredo que o proxy da frente (Cloudflare) injeta em toda requisição, ou `undefined`.
 *
 * Existe porque `TRUST_PROXY` confia no `X-Forwarded-For` montado pela cadeia da frente — e quem
 * chega DIRETO no endereço do Fly (`<app>.fly.dev`), pulando o Cloudflare, monta o cabeçalho que
 * quiser. Com o segredo definido, requisição sem ele é recusada (ver `server/http/origemProtegida.ts`).
 */
export function segredoDeOrigem(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const bruto = env.ORIGEM_SEGREDO?.trim()
  return bruto ? bruto : undefined
}

/** Sentry do servidor: `null` sem `SENTRY_DSN`. O DSN é validado por quem monta o sink. */
export function configDoSentry(
  env: NodeJS.ProcessEnv = process.env,
): { dsn: string; ambiente?: string; release?: string } | null {
  const dsn = env.SENTRY_DSN?.trim()
  if (!dsn) return null
  return {
    dsn,
    ambiente: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || undefined,
    release: env.SENTRY_RELEASE?.trim() || undefined,
  }
}

/**
 * O snapshot diário está ligado? Devolve a hora UTC e o heartbeat, ou `null`.
 *
 * `'1'` exato, pelo mesmo motivo de `metricasHabilitadas`: `BACKUP_DIARIO=0` é como se DESLIGA.
 * Hora fora de 0–23 cai no padrão em vez de virar um temporizador de horas negativas.
 */
export function configDoBackupDiario(
  env: NodeJS.ProcessEnv = process.env,
): { horaUtc: number; heartbeatUrl?: string } | null {
  if (env.BACKUP_DIARIO !== '1') return null
  const hora = Number(env.BACKUP_HORA_UTC)
  const heartbeatUrl = env.BACKUP_HEARTBEAT_URL?.trim() || undefined
  return { horaUtc: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : 6, heartbeatUrl }
}

/**
 * Por quantos dias o áudio de sessão é guardado. Padrão 90; `0` = para sempre (a limpeza não liga).
 *
 * Valor inválido (negativo, fracionário, texto) cai no PADRÃO, e não em zero: um erro de digitação
 * não pode transformar uma política de retenção declarada na privacidade em "guardar para sempre".
 */
export const RETENCAO_DE_AUDIO_PADRAO_DIAS = 90

export function diasDeRetencaoDeAudio(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = env.AUDIO_RETENCAO_DIAS?.trim()
  if (bruto === undefined || bruto === '') return RETENCAO_DE_AUDIO_PADRAO_DIAS
  const n = Number(bruto)
  return Number.isInteger(n) && n >= 0 ? n : RETENCAO_DE_AUDIO_PADRAO_DIAS
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

/* ─────────────── IA de nuvem: chave de emergência, orçamento e preços (Fase 2 do lançamento) ─────────────── */

/**
 * A chave de emergência. `AI_ENABLED=0` (ou `false`/`off`) desliga TODA IA de nuvem na hora — as rotas
 * respondem 503 com o motivo e o cliente cai nos modelos locais. Ausente = ligada: desligar precisa
 * ser um ato, não o esquecimento de uma variável.
 */
export function iaDeNuvemLigada(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.AI_ENABLED?.trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off')
}

/**
 * O teto padrão do modo público quando `AI_BUDGET_USD_MONTH` não foi definido. Existe porque
 * "sem variável" não pode significar "sem teto" num serviço aberto (OWASP LLM10). US$ 20 cobre com
 * folga o lançamento em fatias (a conta de ~US$ 0,80/mês por assinante Essencial típico está em
 * `src/core/planos.ts`) e é pequeno o bastante para que um vazamento de chave não vire prejuízo.
 * O dono ajusta pela variável; o self-host não tem teto (a chave é dele).
 */
export const ORCAMENTO_PADRAO_USD = 20

export function orcamentoMensalDeIaUsd(
  env: NodeJS.ProcessEnv = process.env,
  modoPublico: boolean = authRequired(),
): number {
  const bruto = env.AI_BUDGET_USD_MONTH?.trim()
  if (bruto) {
    const n = Number(bruto.replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) return n
    log('warn', { event: 'config_orcamento_invalido', error: 'AI_BUDGET_USD_MONTH não é um número; usando o padrão' })
  }
  return modoPublico ? ORCAMENTO_PADRAO_USD : Infinity
}

export interface PrecoDeModelo {
  /** US$ por 1 milhão de tokens de entrada (LLM). */
  entrada?: number
  /** US$ por 1 milhão de tokens de saída (LLM). */
  saida?: number
  /** US$ por hora de áudio (STT). */
  hora?: number
}

/**
 * Os preços que o operador sobrepôs por env (`AI_PRECOS_MODELOS`, JSON). JSON inválido não derruba
 * nada: loga e fica com a tabela embutida — o orçamento continua valendo com os preços oficiais.
 */
export function precosDeModelosDoEnv(env: NodeJS.ProcessEnv = process.env): Record<string, PrecoDeModelo> {
  const bruto = env.AI_PRECOS_MODELOS?.trim()
  if (!bruto) return {}
  try {
    const obj = JSON.parse(bruto) as Record<string, PrecoDeModelo>
    const saida: Record<string, PrecoDeModelo> = {}
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
    for (const [modelo, p] of Object.entries(obj ?? {})) {
      if (!p || typeof p !== 'object') continue
      saida[modelo] = { entrada: num(p.entrada), saida: num(p.saida), hora: num(p.hora) }
    }
    return saida
  } catch {
    log('warn', {
      event: 'config_precos_invalidos',
      error: 'AI_PRECOS_MODELOS não é JSON válido; usando a tabela embutida',
    })
    return {}
  }
}

/* ─────────────── chaves de emergência e menores (Fases 3 e 4 do lançamento) ─────────────── */

/**
 * A VENDA está aberta? `CHECKOUT_ENABLED=0` (ou `false`) fecha assinar e comprar. Ausente = aberta:
 * é chave de EMERGÊNCIA, e nascer desligada seria um lançamento que não vende sem ninguém saber
 * por quê. Lida em tempo de chamada.
 */
export function checkoutLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CHECKOUT_ENABLED?.trim().toLowerCase()
  return !(v === '0' || v === 'false')
}

/** O CADASTRO de contas novas está aberto? `SIGNUP_ENABLED=0` fecha. Ausente = aberto. */
export function cadastroLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SIGNUP_ENABLED?.trim().toLowerCase()
  return !(v === '0' || v === 'false')
}

/** O endereço público do app, sem barra final, ou `null`. */
export function lerAppUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env.APP_URL?.trim()
  return v ? v.replace(/\/+$/, '') : null
}

/**
 * O link do convite ao responsável pode voltar na resposta? Sem envio de e-mail (dev, testes,
 * self-host sem Resend), é o único jeito de exercitar o fluxo. Em PRODUÇÃO só com
 * `CONVITE_LINK_NA_TELA=1` explícito: mostrar o link ao próprio menor deixaria ele mesmo "aceitar"
 * com outra conta.
 */
export function linkNaTelaLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CONVITE_LINK_NA_TELA?.trim()
  if (v === '1') return true
  if (v === '0') return false
  return env.NODE_ENV !== 'production'
}

/**
 * O envio do convite ao responsável pelo Resend: a chave e o remetente, ou `null` quando falta
 * qualquer um dos dois. Os dois juntos porque um sem o outro não envia nada — a chave sem
 * remetente é recusada pelo Resend (422) e o remetente sem chave nem chega a sair.
 */
export function configDoResend(env: NodeJS.ProcessEnv = process.env): { chave: string; remetente: string } | null {
  const chave = env.RESEND_API_KEY?.trim()
  const remetente = env.EMAIL_REMETENTE?.trim()
  if (!chave || !remetente) return null
  return { chave, remetente }
}

/**
 * Em produção, no modo público, sem o Resend: o convite ao responsável não sai, e nenhum menor de
 * 16 anos consegue liberar a nuvem. AVISO e não aborto: o resto do app serve normalmente, e quem
 * lança só para adultos pode subir assim de propósito. Fora de produção o link aparece na tela
 * (`linkNaTelaLigado`), e no self-host não existe menor com conta.
 */
export function avisoDeConviteSemEmail(
  env: NodeJS.ProcessEnv = process.env,
  modoPublico: boolean = authRequired(),
): string | null {
  if (env.NODE_ENV !== 'production' || !modoPublico || configDoResend(env)) return null
  return (
    'RESEND_API_KEY e EMAIL_REMETENTE ausentes: o convite ao responsável NÃO sai por e-mail, e nenhuma ' +
    'conta de menor de 16 anos consegue liberar a nuvem. Configure o Resend (docs/LANCAMENTO.md §4) ' +
    'antes de abrir o app a menores.'
  )
}
