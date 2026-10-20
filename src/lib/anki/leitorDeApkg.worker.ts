/**
 * WORKER DO LEITOR DE `.apkg`: descompactar e consultar um baralho de centenas de MB trava a thread
 * principal por segundos, então a leitura inteira roda aqui. Uma mensagem por arquivo:
 * recebe `{ arquivo }`, responde `progresso` quantas vezes for e, no fim, `ok` ou `erro` uma vez só.
 * Quem abre e encerra o worker é `lerBaralho.ts`.
 */
import type { LeituraAnki } from '../../core/anki';
import { lerApkg, type ProgressoDaLeitura } from './lerApkg';
import { abrirSqliteNoNavegador } from './sqlite';

export type MensagemParaOLeitor = { arquivo: Blob };

export type MensagemDoLeitor =
  | { tipo: 'progresso'; progresso: ProgressoDaLeitura }
  | { tipo: 'ok'; leitura: LeituraAnki }
  | { tipo: 'erro'; mensagem: string };

const responder = (mensagem: MensagemDoLeitor): void => (self as unknown as Worker).postMessage(mensagem);

self.onmessage = async (evento: MessageEvent<MensagemParaOLeitor>) => {
  try {
    const leitura = await lerApkg(evento.data.arquivo, {
      abrirSqlite: abrirSqliteNoNavegador,
      aoProgredir: (progresso) => responder({ tipo: 'progresso', progresso }),
    });
    responder({ tipo: 'ok', leitura });
  } catch (e) {
    responder({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
  }
};
