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
import { FRANQUIA_DE_ALIVIO, PLAN_MATRIX } from '../../src/core/planos'
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
 * codigo aceita todos os planos, entao quem definisse `FREE_STORAGE_MB` teria o valor honrado
 * sem que ele constasse em lugar nenhum. Gerando a partir de `PLAN_MATRIX`, um plano novo declara
 * as suas variaveis no mesmo commit em que nasce.
 *
 * MATRIZ V2 (ADR 0011): com o Essencial e o Pro fora da matriz, as `ESSENCIAL_*`/`PRO_*` deixam de
 * ser lidas — quem as tinha no deploy passa o valor para a `PREMIUM_*` correspondente. Nao ha leitura
 * de compatibilidade de proposito: o teto do Premium e outro numero (40 h, o empate de custo), e
 * herdar em silencio as 15 h do Essencial ou as 20 h do Pro seria vender "sem limite no dia a dia"
 * com o teto de um plano que nao existe mais.
 */
const SUFIXOS_POR_PLANO: ReadonlyArray<{ sufixo: string; paraQue: string }> = [
  { sufixo: 'STORAGE_MB', paraQue: 'teto de armazenamento do plano, em MB (override da PLAN_MATRIX)' },
  { sufixo: 'MONTHLY_MANAGED_CALLS', paraQue: 'cota mensal de chamadas gerenciadas do plano (default da PLAN_MATRIX)' },
  { sufixo: 'MONTHLY_STT_SECONDS', paraQue: 'teto mensal de segundos de STT do plano' },
  { sufixo: 'MONTHLY_LLM_TOKENS', paraQue: 'teto mensal de tokens (entrada + saída) do LLM de nuvem do plano' },
  /* O USO JUSTO DO DIA (matriz v2, ADR 0011): o teto por dia LOCAL da pessoa. Só vale para plano com
     teto diário na matriz (hoje, o Premium); nos outros o dia não é contado e a variável não tem efeito. */
  {
    sufixo: 'DAILY_STT_SECONDS',
    paraQue: 'teto DIÁRIO (dia local) de segundos de STT de nuvem do plano — o uso justo',
  },
  { sufixo: 'DAILY_LLM_TOKENS', paraQue: 'teto DIÁRIO (dia local) de tokens do LLM de nuvem do plano — o uso justo' },
]

/* O `convidado` (Fase 7) não está na matriz de assinatura, mas as cotas dele passam pelas MESMAS
   funções (`usageQuota.ts`/`storageQuota.ts`), que montam `CONVIDADO_*` em tempo de execução. */
export const VARIAVEIS_POR_PLANO: readonly VariavelDeclarada[] = [...Object.keys(PLAN_MATRIX), 'convidado'].flatMap(
  (plano) =>
    SUFIXOS_POR_PLANO.map(({ sufixo, paraQue }) => ({
      nome: `${plano.toUpperCase()}_${sufixo}`,
      exigencia: 'opcional' as const,
      criticidade: 'degrada-capacidade' as const,
      paraQue: `${paraQue} — plano ${plano}`,
    })),
)

/**
 * As variáveis de CHAVE e de CONTA que o registro de provedores lê por nome montado
 * (`env[provedor.chave]`, `server/ai/registroDeProvedores.ts`). Como as por plano, a varredura do
 * inventário não as enxerga — o registro diz o nome em JSON —, então elas são nomeadas aqui. As
 * outras chaves de IA (`GROQ_API_KEY`, `OPENROUTER_API_KEY`…) têm leitura literal no legado.
 */
export const VARIAVEIS_DE_CHAVE_DE_IA: readonly string[] = [
  'CEREBRAS_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'DEEPINFRA_API_KEY',
]

export const VARIAVEIS: readonly VariavelDeclarada[] = [
  ...VARIAVEIS_POR_PLANO,
  {
    nome: 'AI_BUDGET_USD_DAY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'teto de gasto ESTIMADO com IA de nuvem no DIA (UTC), em US$ — a mesma lógica do mensal: a 80% sai ia_orcamento_diario_alerta_80, a 100% a nuvem fecha até 00:00 UTC. Existe para um laço de cliente ou uma chave vazada não queimarem o mês inteiro numa tarde. Ausente: sem teto diário (só o mensal). 0 desliga a nuvem',
  },
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
      'JSON com o preço que o orçamento usa, por "fornecedor:modelo" (ex.: "deepinfra:openai/gpt-oss-120b") ou só por "modelo": {"entrada": US$/1M, "entradaEmCache": US$/1M, "saida": US$/1M} para LLM e {"hora": US$, "minimoFaturadoS": s} para STT. Sobrepõe a tabela oficial embutida; o preço declarado no IA_PROVEDORES vence os dois',
  },
  {
    nome: 'AI_USUARIO_ALERTA_FATOR',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'gasto anômalo por usuário: alerta (ia_gasto_anomalo_usuario, id pseudonimizado) quando o gasto de IA de um usuário NO DIA passa de N vezes a mediana dos usuários que gastaram hoje. Padrão 10. Só vale com pelo menos 5 usuários no dia — com menos, a mediana não diz nada',
  },
  {
    nome: 'AI_USUARIO_ALERTA_USD_DIA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'gasto anômalo por usuário: teto ABSOLUTO em US$ por usuário por dia acima do qual sai o alerta ia_gasto_anomalo_usuario (não bloqueia — quem bloqueia é a cota do plano). Padrão US$ 0,50 (um Essencial típico gasta ~US$ 0,03/dia)',
  },
  {
    nome: 'ALIVIO_POOL_USD_DIA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'pool DIÁRIO da nuvem de alívio do Grátis (A10), em US$, somando todas as contas. Só BAIXA o pool: ele nunca passa de 20% do orçamento diário (AI_BUDGET_USD_DAY, ou AI_BUDGET_USD_MONTH ÷ 30), a reserva de 80% de quem paga. Ausente: os 20%',
  },
  {
    nome: 'ALIVIO_TETO_USD_MES',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'teto de gasto ESTIMADO por conta Grátis no mês com a nuvem de alívio (A10), em US$. Padrão US$ 0,13 (FRANQUIA_DE_ALIVIO em src/core/planos.ts: cobre as 3 h de transcrição). 0 fecha o alívio para todos',
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
    nome: 'CEREBRAS_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave da Cerebras, lida só quando um provedor de IA_PROVEDORES declara "chave": "CEREBRAS_API_KEY" (server/ai/registroDeProvedores.ts). Ausente, a perna não existe',
  },
  {
    nome: 'CHECKOUT_ENABLED',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave de emergência da VENDA: `0` fecha assinar e comprar (503 com mensagem clara); quem já paga continua com o plano. Ausente = ligada',
  },
  {
    nome: 'CLOUDFLARE_ACCOUNT_ID',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'conta da Cloudflare do Workers AI, lida quando um provedor de IA_PROVEDORES declara "conta": "CLOUDFLARE_ACCOUNT_ID" — entra na base (/accounts/<conta>/ai/v1; o STT usa a rota nativa /ai/run/<modelo>, com o áudio em base64 — B6). Ausente, a perna não existe',
  },
  {
    nome: 'CLOUDFLARE_API_TOKEN',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'token do Workers AI (só a permissão "Workers AI"), lido quando um provedor de IA_PROVEDORES declara "chave": "CLOUDFLARE_API_TOKEN". Ausente, a perna não existe',
  },
  {
    nome: 'CLUSTER_WORKERS',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'nº de processos do cluster; sem ela, processo único (ver F6-01)',
  },
  {
    nome: 'CONVIDADOS_POR_IP_DIA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'quantos convidados anônimos DISTINTOS podem estrear na nuvem pelo mesmo IP no mesmo dia; acima disso a nuvem responde 429 limite_de_convidados (Fase 7). Padrão 3',
  },
  {
    nome: 'CONVIDADO_IP_TUTOR_DIA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'teto diário de mensagens de tutor por IP pseudonimizado, somando todos os convidados daquele IP (Fase 7, server/lib/convidado.ts). Padrão 10',
  },
  {
    nome: 'CONVIDADO_IP_USD_DIA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'teto diário de gasto ESTIMADO de IA de nuvem, em US$, por IP pseudonimizado, somando todos os convidados daquele IP — limpar cookies ou criar outro anônimo não reseta (Fase 7). Padrão 0,04',
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
    paraQue:
      'isolamento de origem (SharedArrayBuffer → WASM com threads na inferência local), LIGADO por padrão: ausente ou `1` = COOP same-origin + COEP credentialless + Document-Isolation-Policy; `dip` = só o DIP (Chromium; para quando um iframe de terceiro não aceitar COEP); `0` desliga (server/http/isolamento.ts)',
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
    nome: 'DEEPINFRA_API_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave da DeepInfra, lida só quando um provedor de IA_PROVEDORES declara "chave": "DEEPINFRA_API_KEY" (server/ai/registroDeProvedores.ts). Ausente, a perna não existe',
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
    nome: 'GIT_SHA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'commit da versão do app (`0.1.0+<sha7>`, server/lib/versao.ts); o Dockerfile a preenche no build pelo arg VERSAO; ausente, vale SENTRY_RELEASE ou só a versão do package.json',
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
    nome: 'IA_ADMISSAO_LLM_RPD',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'admissão de IA (ADR 0007): teto de pedidos POR DIA a cada modelo de LLM da conta do app (server/ai/admissao.ts). Padrão 1000, o da camada atual da Groq para gpt-oss-120b. 0 = sem teto. Vale para a perna SEM "limites" no IA_PROVEDORES (o legado inteiro); com eles, os declarados (B4) — e isso vale para todas as IA_ADMISSAO_* de pedidos e tokens',
  },
  {
    nome: 'IA_ADMISSAO_LLM_RPM',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'admissão de IA: pedidos POR MINUTO a cada modelo de LLM (token bucket). Padrão 30 (Groq). 0 = sem teto',
  },
  {
    nome: 'IA_ADMISSAO_LLM_TPD',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'admissão de IA: tokens POR DIA a cada modelo de LLM (estimativa na entrada, acerto pelo uso real). Padrão 200000 (Groq). 0 = sem teto',
  },
  {
    nome: 'IA_ADMISSAO_RESERVA_PRO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'admissão de IA: fração do saldo de cada modelo reservada SÓ a quem paga (o Premium; o nome da variável é de antes da matriz v2) (0 a 0,9). Padrão 0,2 — quem não paga (convidado, Grátis, teste) usa até 50%, e o alívio do Grátis até 20% (ou menos, se a reserva passar disso)',
  },
  {
    nome: 'IA_ADMISSAO_STT_RPD',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'admissão de IA: pedidos de STT POR DIA a cada modelo. Padrão 2000 (Groq, whisper-large-v3-turbo). 0 = sem teto',
  },
  {
    nome: 'IA_ADMISSAO_STT_RPM',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'admissão de IA: pedidos de STT POR MINUTO a cada modelo (token bucket). Padrão 20 (Groq). 0 = sem teto',
  },
  {
    nome: 'IA_EM_VOO_LLM',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chamadas de tradução/tutor de nuvem EM VOO por usuário ao mesmo tempo; a seguinte recebe 429 nuvem_ocupada. Padrão 2',
  },
  {
    nome: 'IA_EM_VOO_STT',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chamadas de STT de nuvem EM VOO por usuário ao mesmo tempo; a seguinte recebe 429 nuvem_ocupada. Padrão 1',
  },
  {
    nome: 'IA_PROVEDORES',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'registro DECLARATIVO dos provedores de IA (JSON sem segredo, server/ai/registroDeProvedores.ts): formato, retenção, limites, modelos por função com preço, os NÍVEIS de cada modelo de tradução/tutor ("niveis": rapida/nuance/polimento — a nuance é de quem tem traducaoNuance, B3) e o NOME da variável da chave. A ordem é a da cascata. Gemini é recusado; OpenRouter exige roteamento com zdr e sem o Google; em produção todo provedor declara retencao "zdr" (senão o boot aborta). Ausente: o registro legado, derivado de LLM_*/GROQ_*/LLM_RESERVA_*/OPENROUTER_API_KEY/STT_*, com o comportamento de sempre',
  },
  {
    nome: 'IA_PROVEDORES_ARQUIVO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'o mesmo registro de IA_PROVEDORES, lido de um arquivo (caminho). Declarar as duas é ambíguo e é recusado',
  },
  {
    nome: 'LANGFUSE_AMOSTRAGEM',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'fração (0–1) das chamadas de IA BEM-SUCEDIDAS enviadas ao Langfuse; erros, fallbacks e 429 vão sempre. Padrão 0,1 em produção e 1 fora dela. O Langfuse cobra por unidade e sem amostragem custava mais que a IA (openspec/audits/2026-09-25-prontidao/fase3-custo.md)',
  },
  {
    nome: 'LANGFUSE_ARQUIVO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'caminho de um .jsonl que recebe a MESMA telemetria de IA (custo, latência, status por chamada) para análise local — funciona sem as chaves do Langfuse (server/lib/langfuse.ts)',
  },
  {
    nome: 'LANGFUSE_BASE_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'região do Langfuse; padrão https://cloud.langfuse.com (UE)',
  },
  {
    nome: 'LANGFUSE_CONTEUDO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      '1 inclui o texto de entrada/saída nas gerações — SÓ em desenvolvimento: com NODE_ENV=production é recusada (menores usam o app; LGPD art. 14)',
  },
  {
    nome: 'LANGFUSE_PUBLIC_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave pública do projeto Langfuse. Com LANGFUSE_SECRET_KEY, liga a telemetria PSEUDONIMIZADA de custo/latência de IA (sem texto do usuário). Sem as duas, nada sai',
  },
  {
    nome: 'LANGFUSE_SECRET_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue: 'chave secreta do projeto Langfuse (par da LANGFUSE_PUBLIC_KEY)',
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
      'modelo entregue a quem tem o entitlement `largerModels` (planos pro e selfhost). Ausente, todo plano recebe o mesmo modelo de `LLM_MODEL` — que era o comportamento antes da Fase 4, quando `largerModels` nao era lido por linha nenhuma do servidor. Só no registro LEGADO (sem IA_PROVEDORES): no declarado, o modelo de quem paga é o que declara "niveis": ["nuance"] (B3)',
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
    nome: 'METRICS_PORTA_INTERNA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'porta de um listener SÓ de métricas (`GET /metrics`, sem token), para o raspador gerenciado do Fly (`[metrics]` do fly.toml), que não manda `Authorization`. Definida, o `/metrics` SAI da porta pública. Só use numa porta que não esteja publicada (fora de `[http_service]`/`[[services]]`)',
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
  {
    nome: 'POOL_GRATUITO_FRACAO_RECEITA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'fração da receita líquida do mês (÷ 30) que vira o pool diário de IA de nuvem de convidado + free (Fase 7). Padrão 0,05',
  },
  {
    nome: 'POOL_GRATUITO_PISO_USD_DIA',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'piso do pool diário de IA de nuvem de convidado + free, em US$: pool = max(piso, fração da receita líquida ÷ 30). Esgotado, só o convidado/free cai no motor local (Fase 7). Padrão 0,50',
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
    nome: 'UPLOADS_GRANDES_POR_PROCESSO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'quantos corpos grandes (áudio da sessão, import Anki, documento) o processo recebe ao mesmo tempo (server/lib/corposGrandes.ts). O excedente recebe 429 `upload_ocupado` com Retry-After, antes de ler o corpo. Ausente ou inválido: 2 (dimensionado para a VM de 1 GB; ADR 0009)',
  },
  {
    nome: 'UPLOADS_GRANDES_POR_USUARIO',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'quantos corpos grandes o MESMO usuário pode ter em voo ao mesmo tempo (server/lib/corposGrandes.ts). Ausente ou inválido: 1',
  },
  {
    nome: 'VITE_BERGAMOT_MODELOS_URL',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'base de onde o navegador baixa os modelos do Bergamot (tradução pt→en no aparelho, A9b). Ausente: os modelos saem do PRÓPRIO domínio (o build os baixa com sha256 conferido). Com ela, a CSP libera a origem em `connect-src`',
  },
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
    nome: 'VITE_TURNSTILE_SITE_KEY',
    exigencia: 'opcional',
    criticidade: 'degrada-capacidade',
    paraQue:
      'chave PÚBLICA do Cloudflare Turnstile: o convidado passa pelo captcha antes de o Supabase criar o usuário anônimo (Fase 7). Com ela a CSP libera challenges.cloudflare.com; sem ela o captcha fica desligado',
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
  const porta = portaInternaDeMetricas(env)
  if (env.METRICS_PORTA_INTERNA?.trim() && porta === undefined) {
    return 'METRICS_PORTA_INTERNA não é uma porta válida (1–65535).'
  }
  if (porta !== undefined && String(porta) === (env.PORT?.trim() || '3000')) {
    /* A mesma porta do app seria justamente a porta PÚBLICA — o scrape sem token ficaria na internet. */
    return 'METRICS_PORTA_INTERNA não pode ser a mesma porta do app (PORT): o /metrics sem token ficaria público.'
  }
  /* Com a porta interna, o `/metrics` nem é montado na porta pública — o token deixa de ser a
     única barreira e passa a ser desnecessário (o raspador do Fly não o manda). */
  if (env.NODE_ENV === 'production' && metricasHabilitadas(env) && porta === undefined && !tokenDeMetricas(env)) {
    return 'METRICS_ENABLED=1 em produção exige METRICS_TOKEN (ou METRICS_PORTA_INTERNA): recusando expor /metrics sem autenticação.'
  }
  return null
}

/**
 * A porta do listener SÓ de métricas, ou `undefined` (Fase 5 de prontidão, 25/09/2026).
 *
 * POR QUE EXISTE. O Fly raspa o `[metrics]` do `fly.toml` a cada 15 s com o Prometheus gerenciado
 * dele, e a documentação (fly.io/docs/monitoring/metrics, consultada em 25/09/2026) não oferece
 * NENHUM campo de autenticação: só `port` e `path`. Com o `/metrics` na porta pública, isso
 * obrigaria a escolher entre scrape aberto na internet (GAP-013) e nenhum scrape. A saída é a que a
 * própria doc sugere: uma porta que o Fly raspa por dentro da VM e que NÃO está publicada — o proxy
 * do Fly só encaminha as portas de `[http_service]`/`[[services]]`, então esta não tem rota de fora.
 * O token continua valendo para quem raspa pela porta pública (self-host com agente próprio).
 */
export function portaInternaDeMetricas(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const bruto = env.METRICS_PORTA_INTERNA?.trim()
  if (!bruto) return undefined
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined
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

/** O modelo de STT gerenciado quando `STT_MODEL` não diz outro (medido: docs/auditoria/eval/bancada-2026-09.md). */
export const MODELO_STT_PADRAO = 'whisper-large-v3-turbo'
const BASE_DA_GROQ = 'https://api.groq.com/openai/v1'

/** O STT gerenciado — a chave do DONO — como o ambiente o configura. */
export interface ConfigDoSttGerenciado {
  secret: string
  baseUrl: string
  model: string
  /** O NOME da variável de onde a chave saiu — o registro de provedores (B1) guarda nomes, nunca valores. */
  chave: 'GROQ_API_KEY' | 'STT_API_KEY' | 'LLM_API_KEY'
}

/**
 * UMA FONTE SÓ PARA O STT GERENCIADO (B0 da Fase B, 29/09/2026).
 *
 * Havia duas leituras do mesmo fato, e elas discordavam. `GET /api/ai/stt/available` perguntava
 * `LLM_API_KEY || GROQ_API_KEY || STT_API_KEY`; a porta da transcrição (`sttProxy.ts`) perguntava
 * `GROQ_API_KEY ?? STT_API_KEY`. Os dois casos em que isso mordia são os de verdade:
 *
 *   - o `.env.production.example` configura SÓ `LLM_API_KEY`, com a base da Groq. A disponibilidade
 *     dizia 200, o roteador do cliente mandava o áudio para a nuvem — e toda transcrição voltava
 *     501. O STT de nuvem de produção estava desligado sem ninguém saber;
 *   - `GROQ_API_KEY=` vazia (é assim que os testes e muito `.env` "desligam" a variável, porque o
 *     dotenv repõe a apagada) com `STT_API_KEY` definida: o `??` tomava a string vazia como chave.
 *
 * A REGRA, agora escrita num lugar: as chaves próprias do STT, na precedência de sempre
 * (`GROQ_*` antes de `STT_*`, vazia conta como ausente); sem elas, a chave do LLM — MAS SÓ quando o
 * LLM é a Groq, que é o que o `.env.production.example` descreve. A chave de um LLM em outro
 * provedor não anuncia STT: aquele endereço não tem Whisper garantido, e anunciar uma capacidade que
 * responde 404 é o mesmo defeito do 200/501 com outra cara. O teste que prende a regra é
 * `tests/integration/stt-disponivel-coerente.test.ts`.
 */
export function sttGerenciadoDoEnv(env: NodeJS.ProcessEnv = process.env): ConfigDoSttGerenciado | null {
  /* Leitura por NOME literal (`env.X`), e não por `env[nome]`: é o que o inventário enxerga
     (`tests/integration/config-inventario.test.ts`). Vazia ou só espaço conta como ausente. */
  const semBarra = (u: string) => u.replace(/\/+$/, '')
  const model = env.STT_MODEL?.trim() || MODELO_STT_PADRAO
  const doGroq = env.GROQ_API_KEY?.trim()
  const propria = doGroq || env.STT_API_KEY?.trim()
  if (propria) {
    return {
      secret: propria,
      baseUrl: semBarra(env.GROQ_BASE_URL?.trim() || env.STT_BASE_URL?.trim() || BASE_DA_GROQ),
      model,
      chave: doGroq ? 'GROQ_API_KEY' : 'STT_API_KEY',
    }
  }
  const doLlm = env.LLM_API_KEY?.trim()
  if (!doLlm) return null
  /* A mesma base que `server/ai/provedores.ts` usa para o LLM primário com essa chave. */
  const base = semBarra(env.LLM_BASE_URL?.trim() || env.GROQ_BASE_URL?.trim() || BASE_DA_GROQ)
  let host: string
  try {
    host = new URL(base).hostname.toLowerCase()
  } catch {
    return null
  }
  return host === 'api.groq.com' ? { secret: doLlm, baseUrl: base, model, chave: 'LLM_API_KEY' } : null
}

/*
 * `sttDeNuvemConfigurado` — a pergunta de `GET /api/ai/stt/available` — mora em
 * `server/ai/registroDeProvedores.ts` desde o B1: com `IA_PROVEDORES` o STT pode vir do registro
 * declarado, e a resposta tem de ser a mesma que a porta da transcrição recebe. No legado ela é
 * exatamente `sttGerenciadoDoEnv(env) !== null`.
 */

/* ─────────────── admissão de IA ao vivo (ADR 0007) ─────────────── */

/** Limites de UM modelo na conta do app. `0` numa dimensão = sem teto nela. */
export interface LimitesDeModelo {
  /** pedidos por minuto — a capacidade do token bucket */
  rpm: number
  /** pedidos por dia (UTC) */
  rpd: number
  /** tokens por dia (UTC); o STT não conta tokens e fica em 0 */
  tpd: number
}

export interface ConfigDeAdmissao {
  stt: LimitesDeModelo
  llm: LimitesDeModelo
  /** fração do saldo que só quem PAGA alcança (`IA_ADMISSAO_RESERVA_PRO`; o nome da env é de antes
   da matriz v2 e fica — renomear variável de operação apagaria em silêncio um valor já configurado) */
  reservaDosPagantes: number
  emVooStt: number
  emVooLlm: number
}

/** Inteiro >= 0 da variável; ausente ou inválido cai no padrão (erro de digitação não abre a porta). */
function inteiroNaoNegativo(bruto: string | undefined, padrao: number): number {
  const t = bruto?.trim()
  if (!t) return padrao
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : padrao
}

/**
 * Os limites da admissão. Os PADRÕES são os da camada atual da Groq, medidos na página oficial de
 * limites em 25/09/2026 (console.groq.com/docs/rate-limits): whisper-large-v3-turbo 20 RPM e 2K
 * RPD; gpt-oss-120b 30 RPM, 1K RPD e 200K TPD. O limite é da ORGANIZAÇÃO no provedor, e não de
 * cada usuário do app — é por isso que o bucket é do processo inteiro.
 */
export function configDeAdmissao(env: NodeJS.ProcessEnv = process.env): ConfigDeAdmissao {
  const reservaBruta = Number(env.IA_ADMISSAO_RESERVA_PRO?.trim().replace(',', '.'))
  const reservaDosPagantes =
    env.IA_ADMISSAO_RESERVA_PRO?.trim() && Number.isFinite(reservaBruta) && reservaBruta >= 0 && reservaBruta <= 0.9
      ? reservaBruta
      : 0.2
  return {
    stt: {
      rpm: inteiroNaoNegativo(env.IA_ADMISSAO_STT_RPM, 20),
      rpd: inteiroNaoNegativo(env.IA_ADMISSAO_STT_RPD, 2000),
      tpd: 0,
    },
    llm: {
      rpm: inteiroNaoNegativo(env.IA_ADMISSAO_LLM_RPM, 30),
      rpd: inteiroNaoNegativo(env.IA_ADMISSAO_LLM_RPD, 1000),
      tpd: inteiroNaoNegativo(env.IA_ADMISSAO_LLM_TPD, 200_000),
    },
    reservaDosPagantes,
    /* Piso 1: `0` em voo recusaria toda chamada, e quem quer desligar a nuvem tem `AI_ENABLED=0`. */
    emVooStt: Math.max(1, inteiroNaoNegativo(env.IA_EM_VOO_STT, 1)),
    emVooLlm: Math.max(1, inteiroNaoNegativo(env.IA_EM_VOO_LLM, 2)),
  }
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

/**
 * O teto DIÁRIO (UTC) de gasto estimado com IA, em US$. Ausente = `Infinity` (só o mensal vale):
 * ligar um teto novo por padrão mudaria o comportamento de quem já opera com o mensal. Em produção o
 * `.env.production.example` traz um valor (≈ mensal ÷ 10), que é o que impede um laço de cliente ou
 * uma chave vazada de queimar o mês numa tarde.
 */
export function orcamentoDiarioDeIaUsd(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = env.AI_BUDGET_USD_DAY?.trim()
  if (!bruto) return Infinity
  const n = Number(bruto.replace(',', '.'))
  if (Number.isFinite(n) && n >= 0) return n
  log('warn', { event: 'config_orcamento_invalido', error: 'AI_BUDGET_USD_DAY não é um número; sem teto diário' })
  return Infinity
}

/** Os limiares do alerta de gasto anômalo por usuário (`server/lib/gastoAnomalo.ts`). */
export interface LimiaresDeGastoPorUsuario {
  /** US$ por usuário por dia acima dos quais sai o alerta, independentemente da mediana. */
  tetoUsdDia: number
  /** Múltiplo da mediana do dia acima do qual sai o alerta. */
  fatorDaMediana: number
  /** Abaixo deste número de usuários no dia, a regra da mediana não vale. */
  minimoDeUsuarios: number
}

export const ALERTA_USUARIO_PADRAO_USD_DIA = 0.5
export const ALERTA_USUARIO_PADRAO_FATOR = 10

export function limiaresDeGastoPorUsuario(env: NodeJS.ProcessEnv = process.env): LimiaresDeGastoPorUsuario {
  const numero = (bruto: string | undefined, padrao: number) => {
    const n = Number(bruto?.trim().replace(',', '.'))
    return bruto?.trim() && Number.isFinite(n) && n > 0 ? n : padrao
  }
  return {
    tetoUsdDia: numero(env.AI_USUARIO_ALERTA_USD_DIA, ALERTA_USUARIO_PADRAO_USD_DIA),
    fatorDaMediana: numero(env.AI_USUARIO_ALERTA_FATOR, ALERTA_USUARIO_PADRAO_FATOR),
    minimoDeUsuarios: 5,
  }
}

export interface PrecoDeModelo {
  /** US$ por 1 milhão de tokens de entrada (LLM). */
  entrada?: number
  /**
   * US$ por 1 milhão de tokens de entrada servidos do CACHE de prompt do provedor (a Groq cobra 50%
   * da entrada nos gpt-oss — console.groq.com/docs/prompt-caching). Ausente: o preço da entrada.
   */
  entradaEmCache?: number
  /** US$ por 1 milhão de tokens de saída (LLM). */
  saida?: number
  /** US$ por hora de áudio (STT) — o custo é por segundo, `segundos × hora / 3600`. */
  hora?: number
  /** Segundos faturados no mínimo POR PEDIDO de STT (a Groq cobra 10). Ausente: 10, o conservador. */
  minimoFaturadoS?: number
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
      saida[modelo] = {
        entrada: num(p.entrada),
        entradaEmCache: num(p.entradaEmCache),
        saida: num(p.saida),
        hora: num(p.hora),
        minimoFaturadoS: num(p.minimoFaturadoS),
      }
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

/* ─────────────── Modo convidado (Fase 7): antiabuso e pool gratuito ─────────────── */

function numeroDoEnv(bruto: string | undefined, padrao: number, evento: string): number {
  const t = bruto?.trim()
  if (!t) return padrao
  const n = Number(t.replace(',', '.'))
  if (Number.isFinite(n) && n >= 0) return n
  log('warn', { event: evento, error: 'valor não numérico; usando o padrão' })
  return padrao
}

/** Os limites antiabuso do convidado com nuvem (`server/lib/convidado.ts`). */
export function limitesAntiabusoDoConvidado(env: NodeJS.ProcessEnv = process.env): {
  convidadosPorIpDia: number
  ipUsdDia: number
  ipTutorDia: number
} {
  return {
    convidadosPorIpDia: Math.floor(numeroDoEnv(env.CONVIDADOS_POR_IP_DIA, 3, 'config_convidados_por_ip_invalido')),
    ipUsdDia: numeroDoEnv(env.CONVIDADO_IP_USD_DIA, 0.04, 'config_convidado_ip_usd_invalido'),
    ipTutorDia: Math.floor(numeroDoEnv(env.CONVIDADO_IP_TUTOR_DIA, 10, 'config_convidado_ip_tutor_invalido')),
  }
}

/** O pool diário de IA gratuita (convidado + free): `max(piso, fração × receita líquida do mês ÷ 30)`. */
export function parametrosDoPoolGratuito(env: NodeJS.ProcessEnv = process.env): {
  pisoUsdDia: number
  fracaoDaReceita: number
} {
  return {
    pisoUsdDia: numeroDoEnv(env.POOL_GRATUITO_PISO_USD_DIA, 0.5, 'config_pool_piso_invalido'),
    fracaoDaReceita: Math.min(1, numeroDoEnv(env.POOL_GRATUITO_FRACAO_RECEITA, 0.05, 'config_pool_fracao_invalida')),
  }
}

/* ─────────────── Nuvem de alívio do Grátis (A10) ─────────────── */

/**
 * Os parâmetros da nuvem de alívio (`server/lib/nuvemDeAlivio.ts`). Os segundos, tokens e chamadas
 * da franquia vêm da matriz (`FRANQUIA_DE_ALIVIO`): são a PROMESSA que a tela escreve ("3 h") e
 * mudam por código. O dinheiro é do operador: o teto por conta (`ALIVIO_TETO_USD_MES`) e o pool do
 * dia (`ALIVIO_POOL_USD_DIA`, `null` = os 20% do orçamento diário — ver `poolDoAlivioUsd`).
 */
export function parametrosDoAlivio(env: NodeJS.ProcessEnv = process.env): {
  tetoUsdMes: number
  poolUsdDia: number | null
} {
  const pool = env.ALIVIO_POOL_USD_DIA?.trim()
  return {
    tetoUsdMes: numeroDoEnv(env.ALIVIO_TETO_USD_MES, FRANQUIA_DE_ALIVIO.tetoUsdMes, 'config_alivio_teto_invalido'),
    poolUsdDia: pool ? numeroDoEnv(pool, 0, 'config_alivio_pool_invalido') : null,
  }
}

/**
 * O modelo do STT gerenciado (a chave do dono) — o mesmo padrão de `server/ai/sttProxy.ts`. A nuvem
 * de alívio precisa dele para converter o dólar que sobra em "restam X" de transcrição.
 */
export function modeloDoSttGerenciado(env: NodeJS.ProcessEnv = process.env): string {
  return env.STT_MODEL || 'whisper-large-v3-turbo'
}
