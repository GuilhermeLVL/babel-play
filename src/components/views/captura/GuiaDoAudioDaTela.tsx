import { t } from '../../../lib/i18n';

/**
 * GUIA DO COMPARTILHAMENTO SEM ÁUDIO — o caminho de volta, não só o aviso. Saiu do `LiveCapture.tsx`
 * para ganhar teste.
 *
 * `codigo` é o do erro da captura do sistema (`systemAudio.ts`): 'JANELA_SEM_AUDIO',
 * 'SEM_AUDIO_COMPARTILHADO', 'AUDIO_DA_TELA_INDISPONIVEL' ou 'NAVEGADOR_SEM_AUDIO_DA_TELA'.
 *
 * No navegador que NUNCA entrega o som da tela (Safari, Firefox), escolher de novo não muda nada: a
 * saída é o microfone. "Usar o microfone" (correção E do diagnóstico do Safari, 22/10/2026) liga o
 * microfone e começa a captura por ele; antes só havia "Entendi", e a pessoa tinha de achar o
 * interruptor do topo e tocar em Iniciar de novo.
 */
export default function GuiaDoAudioDaTela({
  codigo,
  podeUsarLoopback,
  aoFechar,
  aoUsarLoopback,
  aoEscolherDeNovo,
  aoUsarMicrofone,
}: {
  codigo: string;
  /** Há a rota do servidor local ou um dispositivo de loopback detectado. */
  podeUsarLoopback: boolean;
  aoFechar: () => void;
  aoUsarLoopback: () => void;
  aoEscolherDeNovo: () => void;
  aoUsarMicrofone: () => void;
}) {
  const semAudioNoNavegador = codigo === 'NAVEGADOR_SEM_AUDIO_DA_TELA';
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-label="Como compartilhar com áudio"
    >
      <div className="card-panel bg-surface w-full max-w-md p-6">
        <h2 className="font-display font-extrabold text-lg text-ink mb-2">
          {codigo === 'AUDIO_DA_TELA_INDISPONIVEL'
            ? 'O Windows não liberou o áudio'
            : semAudioNoNavegador
              ? 'Este navegador não captura o som da tela'
              : codigo === 'JANELA_SEM_AUDIO'
                ? 'A janela veio sem áudio'
                : 'Faltou marcar o áudio'}
        </h2>
        <div className="text-[13.5px] text-ink-muted leading-relaxed space-y-2">
          {codigo === 'AUDIO_DA_TELA_INDISPONIVEL' ? (
            <>
              <p>
                O Windows recusou o áudio desta janela/tela (acontece com a saída de som em 5.1/7.1). Dois caminhos
                funcionam:
              </p>
              <ol className="list-decimal ms-5 space-y-1">
                <li>
                  <b className="text-ink">Aba do Chrome</b>: escolha a aba e deixe &quot;Compartilhar áudio da
                  guia&quot; ligado;
                </li>
                <li>
                  <b className="text-ink">Dispositivo de loopback</b> (Stereo Mix / VB-Cable): pega Discord, jogos e o
                  computador inteiro.
                </li>
              </ol>
            </>
          ) : semAudioNoNavegador ? (
            <>
              <p>
                O Firefox e o Safari não entregam o som de uma aba ou tela, então marcar o áudio não resolve. Três
                caminhos funcionam:
              </p>
              <ol className="list-decimal ms-5 space-y-1">
                <li>
                  Abrir o Frasy no <b className="text-ink">Chrome ou no Edge</b>, que compartilham o som da aba e da
                  tela;
                </li>
                <li>
                  Usar o <b className="text-ink">microfone</b>, deixando o som do vídeo sair pelo alto-falante;
                </li>
                <li>
                  Instalar um <b className="text-ink">dispositivo de áudio virtual</b> (BlackHole no Mac, VB-Cable no
                  Windows), mandar o som do computador para ele e escolhê-lo como microfone aqui: o Frasy passa a ouvir
                  o computador direto, sem alto-falante.
                </li>
              </ol>
            </>
          ) : codigo === 'JANELA_SEM_AUDIO' ? (
            <>
              <p>A janela foi compartilhada sem o áudio. Para jogos e apps fora do navegador:</p>
              <ol className="list-decimal ms-5 space-y-1">
                <li>
                  Clique em <b className="text-ink">Escolher de novo</b>;
                </li>
                <li>
                  Escolha a janela (ou a <b className="text-ink">Tela inteira</b>);
                </li>
                <li>
                  Ative <b className="text-ink">&quot;Compartilhar áudio do sistema&quot;</b> (canto inferior).
                </li>
              </ol>
            </>
          ) : (
            <>
              <p>Você compartilhou, mas sem áudio. Repita a escolha e:</p>
              <ol className="list-decimal ms-5 space-y-1">
                <li>
                  Numa <b className="text-ink">aba</b>: marque "Compartilhar áudio da guia";
                </li>
                <li>
                  Na <b className="text-ink">Tela inteira</b>: marque "Também compartilhar o áudio do sistema".
                </li>
              </ol>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={aoFechar}
            className="px-4 py-2 rounded-xl border border-border-subtle text-[13px] font-bold text-ink-muted hover:text-ink cursor-pointer"
          >
            {semAudioNoNavegador ? 'Entendi' : 'Cancelar'}
          </button>
          {codigo === 'AUDIO_DA_TELA_INDISPONIVEL' && podeUsarLoopback && (
            <button
              onClick={aoUsarLoopback}
              className="px-4 py-2 rounded-xl border border-border-subtle text-[13px] font-bold text-ink hover:border-accent cursor-pointer"
            >
              Usar o loopback
            </button>
          )}
          {/* Neste navegador escolher de novo não muda nada: a saída que funciona é o microfone. */}
          {semAudioNoNavegador ? (
            <button
              onClick={aoUsarMicrofone}
              className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-ink text-white text-[13px] font-bold shadow-btn cursor-pointer"
            >
              {t('Usar o microfone')}
            </button>
          ) : (
            <button
              onClick={aoEscolherDeNovo}
              className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-ink text-white text-[13px] font-bold shadow-btn cursor-pointer"
            >
              {codigo === 'AUDIO_DA_TELA_INDISPONIVEL' ? 'Escolher a aba' : 'Escolher de novo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
