/**
 * FALHAS DE PREPARO EM PORTUGUÊS, COM A AÇÃO CERTA (change `modelos-confiaveis-e-offline`, DISP-03/04).
 *
 * A auditoria de disponibilidade (17/11/2026) viu na tela de produção "Failed to fetch", "Worker error",
 * "Can't create a session. ERROR_CODE: 7" e a instrução de rodar "npm install". Este módulo é o mapa
 * único: a falha vira uma CLASSE (lista fechada, a mesma que o contador anônimo envia), e a classe vira
 * `{ texto, acao }` em pt-BR. A tela passa `texto` e `acao.rotulo` pelo `t()`; nada daqui é exibido cru.
 *
 * Puro (sem React, sem rede, sem DOM): o servidor importa `TIPOS_DE_FALHA` para validar o contador.
 */

/** As classes de falha de preparo. É também o enum do contador anônimo (`/api/erros-do-cliente/falha`). */
export const TIPOS_DE_FALHA = [
  'download-interrompido',
  'modelo-corrompido',
  'sem-internet',
  'worker-indisponivel',
  'detector-de-fala',
  'compartilhamento-negado',
] as const;

export type TipoDeFalha = (typeof TIPOS_DE_FALHA)[number];
export type ClasseDeFalha = TipoDeFalha | 'desconhecida';

export type TipoDeAcao = 'baixar-de-novo' | 'tentar-de-novo' | 'recarregar' | 'escolher-de-novo';

export interface MensagemDeFalha {
  texto: string;
  acao: { tipo: TipoDeAcao; rotulo: string };
}

const ACOES: Record<TipoDeAcao, string> = {
  'baixar-de-novo': 'Baixar de novo',
  'tentar-de-novo': 'Tentar de novo',
  recarregar: 'Recarregar',
  'escolher-de-novo': 'Escolher de novo',
};

const MAPA: Record<ClasseDeFalha, { texto: string; acao: TipoDeAcao }> = {
  'download-interrompido': { texto: 'A conexão caiu enquanto baixávamos o modelo.', acao: 'baixar-de-novo' },
  'modelo-corrompido': { texto: 'O modelo baixado veio com defeito. Já apagamos a cópia.', acao: 'baixar-de-novo' },
  'sem-internet': {
    texto: 'Sem internet. Para legendar sem rede, abra a legenda uma vez com internet.',
    acao: 'tentar-de-novo',
  },
  'worker-indisponivel': { texto: 'Não deu para iniciar a legenda neste navegador agora.', acao: 'recarregar' },
  'detector-de-fala': { texto: 'Não deu para carregar o detector de fala.', acao: 'tentar-de-novo' },
  'compartilhamento-negado': {
    texto: 'Para legendar, escolha uma aba e marque “Compartilhar áudio”.',
    acao: 'escolher-de-novo',
  },
  desconhecida: { texto: 'Algo deu errado ao preparar a legenda.', acao: 'tentar-de-novo' },
};

export function mensagemDeFalha(classe: ClasseDeFalha): MensagemDeFalha {
  const m = MAPA[classe] ?? MAPA.desconhecida;
  return { texto: m.texto, acao: { tipo: m.acao, rotulo: ACOES[m.acao] } };
}

/**
 * Falha do `fetch` em cada navegador (WebKit `Load failed`, Chromium `Failed to fetch`, Firefox
 * `NetworkError…`) e o 404 da transformers.js (`Could not locate file`). Fonte única: o
 * `gateway/erroDeRede.ts` usa este mesmo padrão.
 */
export const PADROES_DE_REDE =
  /load failed|failed to fetch|networkerror|network error|network connection was lost|access control|could not locate file|err_(internet|network|connection|name_not_resolved)/i;

/** A sessão do ONNX não abriu: arquivo truncado ou corrompido (protobuf), ou o runtime recusou o grafo. */
const PADROES_DE_SESSAO =
  /protobuf|error_code|can't create a session|cannot create a session|failed to load model|deserialize|invalid model|invalid protobuf/i;

const PADROES_DE_WORKER = /worker error|failed to load worker|worker script|failed to construct 'worker'/i;

const PADROES_DO_VAD = /detector de fala|silero|\bvad\b/i;

const PADROES_DE_NEGADO = /notallowederror|permission denied|compartilhamento cancelado|permissão negada/i;

/**
 * A MARCA DE FALHA: o worker já sabe a classe (ele viu o cache recusar o arquivo, ou a cura falhar) e a
 * mensagem atravessa `postMessage` como texto. `[falha:<classe>]` no começo é o que o classificador lê
 * primeiro.
 */
const MARCA = /^\[falha:([a-z-]+)\]\s*/;

export function comMarcaDeFalha(tipo: TipoDeFalha, detalhe: string): string {
  return `[falha:${tipo}] ${detalhe.replace(MARCA, '')}`;
}

function textoDe(erro: unknown): { nome: string; mensagem: string } {
  if (erro instanceof Error) return { nome: erro.name ?? '', mensagem: erro.message ?? '' };
  if (typeof erro === 'string') return { nome: '', mensagem: erro };
  if (erro && typeof erro === 'object' && 'message' in erro)
    return {
      nome: String((erro as { name?: unknown }).name ?? ''),
      mensagem: String((erro as { message: unknown }).message),
    };
  return { nome: '', mensagem: '' };
}

/**
 * Qual falha foi? A ordem importa: a marca do worker vence; a permissão negada não depende da rede; a
 * sessão ONNX vem antes da rede (a mensagem do ORT às vezes cita "fetch"); sem rede, toda falha de
 * download é "sem internet".
 */
export function classificarFalha(erro: unknown, contexto: { online?: boolean } = {}): ClasseDeFalha {
  const { nome, mensagem } = textoDe(erro);
  const marca = MARCA.exec(mensagem);
  if (marca && (TIPOS_DE_FALHA as readonly string[]).includes(marca[1])) return marca[1] as TipoDeFalha;
  if (nome === 'NotAllowedError' || PADROES_DE_NEGADO.test(mensagem)) return 'compartilhamento-negado';
  if (PADROES_DE_SESSAO.test(mensagem)) return 'modelo-corrompido';
  if (PADROES_DO_VAD.test(mensagem)) return 'detector-de-fala';
  if (PADROES_DE_WORKER.test(mensagem)) return contexto.online === false ? 'sem-internet' : 'worker-indisponivel';
  if (PADROES_DE_REDE.test(mensagem) || (nome === 'TypeError' && /fetch/i.test(mensagem)))
    return contexto.online === false ? 'sem-internet' : 'download-interrompido';
  if (contexto.online === false) return 'sem-internet';
  return 'desconhecida';
}

/** Classifica e devolve a mensagem, com a classe junto (a tela conta e escolhe a ação por ela). */
export function mensagemDaFalha(
  erro: unknown,
  contexto: { online?: boolean } = {},
): MensagemDeFalha & { tipo: ClasseDeFalha } {
  const tipo = classificarFalha(erro, contexto);
  return { tipo, ...mensagemDeFalha(tipo) };
}

/**
 * O DETALHE TÉCNICO ("rode npm install", a mensagem crua do runtime) só existe onde quem lê é quem
 * instalou o app: em dev e no self-host (build sem login, `VITE_AUTH_REQUIRED≠1`). Em produção, nunca.
 */
export function mostraDetalheTecnico(env: { DEV?: boolean; VITE_AUTH_REQUIRED?: unknown } | undefined): boolean {
  if (!env) return false;
  return env.DEV === true || String(env.VITE_AUTH_REQUIRED ?? '') !== '1';
}

/** O erro do VAD que não subiu (`systemAudio.ts`): a instrução de instalação só onde ela faz sentido. */
export function erroDoDetectorDeFala(tecnico: boolean): string {
  if (!tecnico) return comMarcaDeFalha('detector-de-fala', 'O detector de fala não pôde ser carregado.');
  return comMarcaDeFalha(
    'detector-de-fala',
    'O detector de fala não pôde ser carregado, então a captura não começou. Os arquivos dele ' +
      '(silero_vad_legacy.onnx e ort-wasm) não estão sendo servidos pelo app. Recarregue a página; ' +
      'se continuar, quem instalou o app precisa rodar "npm install" (que os copia para public/).',
  );
}

/** A mensagem sem a marca `[falha:…]` (o detalhe técnico, mostrado só em dev e self-host). */
export function semMarcaDeFalha(mensagem: string): string {
  return mensagem.replace(MARCA, '');
}
