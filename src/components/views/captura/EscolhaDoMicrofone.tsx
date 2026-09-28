import { Cpu, Mic, Zap } from 'lucide-react';
import { useState } from 'react';

import type { EscolhaDoMic } from '../../../lib/captura/motorDoMicrofone';
import { t } from '../../../lib/i18n';
import { Dialogo, fecharDialogoDe, IconeEmBloco } from '../../ui';

/**
 * "RÁPIDO" OU "PRIVADO" — a pergunta do microfone na PRIMEIRA vez em que o navegador não reconhece a
 * voz no aparelho (decisão do dono, opção b, 2026-09-28; quando perguntar: `precisaPerguntarMotorDoMic`).
 *
 * O desenho é o de "Onde as contas rodam" (`AiEnginePanel`): dois `.cartao.opcao` com o rádio, o
 * ícone em bloco, o título com o selo e o texto. As duas opções dizem o custo de cada uma, sem
 * empurrar para nenhuma: "Rápido" diz PARA QUEM o áudio vai (o fornecedor do navegador — é isso que
 * a pessoa autoriza, e o registro datado guarda); "Privado" diz o tamanho do download e que pode errar
 * mais em português em aparelho fraco. Nenhuma vem marcada: consentimento é ato, não padrão.
 *
 * Fechar sem escolher (Esc, "Agora não") chama `aoFechar`: o mic segue no aparelho NESTA vez e a
 * pergunta volta na próxima. "Continuar" chama `aoEscolher`, e quem chama tira o diálogo da tela
 * (sair do DOM fecha o modal). Quem guarda a resposta é a tela (`guardarEscolhaDoMic`).
 */
export default function EscolhaDoMicrofone({
  mb,
  aoEscolher,
  aoFechar,
}: {
  /** O download do "Privado" (o modelo que a rota do STT escolheria para a sua voz); `null` = não se sabe. */
  mb: number | null;
  aoEscolher: (escolha: EscolhaDoMic) => void;
  /** Fechou sem escolher. */
  aoFechar: () => void;
}) {
  const [escolha, setEscolha] = useState<EscolhaDoMic | null>(null);

  return (
    <Dialogo
      icone={Mic}
      titulo={t('Como transcrever a sua voz?')}
      sub={t('Você escolhe uma vez. Dá para mudar depois em Dispositivos e modelos de IA.')}
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha" data-testid="escolha-do-microfone">
        <button
          type="button"
          className={`cartao opcao ${escolha === 'rapido' ? 'sel' : ''}`}
          aria-pressed={escolha === 'rapido'}
          onClick={() => setEscolha('rapido')}
        >
          <span className="radio" aria-hidden="true" />
          <IconeEmBloco icone={Zap} />
          <span style={{ flex: 1 }}>
            <h3>
              {t('Rápido')}{' '}
              <span className="badge" style={{ marginLeft: 6 }}>
                {t('Sem download')}
              </span>
            </h3>
            <p>
              {t(
                'Usa o reconhecimento de voz do navegador. O áudio da sua voz vai para os servidores do Google (Chrome, Android), da Microsoft (Edge) ou da Apple (Safari).',
              )}
            </p>
          </span>
        </button>
        <button
          type="button"
          className={`cartao opcao ${escolha === 'privado' ? 'sel' : ''}`}
          aria-pressed={escolha === 'privado'}
          onClick={() => setEscolha('privado')}
        >
          <span className="radio" aria-hidden="true" />
          <IconeEmBloco icone={Cpu} />
          <span style={{ flex: 1 }}>
            <h3>
              {t('Privado')}{' '}
              <span className="badge ok" style={{ marginLeft: 6 }}>
                {t('Não sai do aparelho')}
              </span>
            </h3>
            <p>
              {mb
                ? t('A transcrição roda neste aparelho. Baixa um modelo de cerca de {mb} MB, uma vez só.', { mb })
                : t('A transcrição roda neste aparelho. Baixa um modelo de transcrição, uma vez só.')}{' '}
              {t('Em aparelhos mais fracos, pode errar mais em português.')}
            </p>
          </span>
        </button>
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          {t('Agora não')}
        </button>
        <button
          type="button"
          className="btn btn-solid"
          disabled={!escolha}
          onClick={() => escolha && aoEscolher(escolha)}
        >
          {t('Continuar')}
        </button>
      </div>
    </Dialogo>
  );
}
