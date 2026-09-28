import { Cpu, Download, Mic, Zap } from 'lucide-react';
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
 * PACOTE DO NAVEGADOR (estágio 4): quando o navegador instala o reconhecimento NO aparelho
 * (`available()` = 'downloadable'), o "Privado" deixa de ser o nosso modelo e passa a ser o do próprio
 * navegador — grátis, nada sai, e em geral bem menor. É o caminho recomendado (selo), sem vir marcado;
 * o nosso Whisper fica dito como a reserva, com o tamanho, se a instalação falhar.
 *
 * Fechar sem escolher (Esc, "Agora não") chama `aoFechar`: o mic segue no aparelho NESTA vez e a
 * pergunta volta na próxima. "Continuar" chama `aoEscolher`, e quem chama tira o diálogo da tela
 * (sair do DOM fecha o modal). Quem guarda a resposta é a tela (`guardarEscolhaDoMic`).
 *
 * A FOLHA DO INÍCIO (`inicio`, relato do dono no celular, 2026-09-28): a mesma pergunta, ANTES de a
 * sessão existir e junto com a confirmação do download (`inicioDaCaptura.ts`). A linha de baixo diz
 * o que a opção marcada baixa AGORA (o Rápido não baixa nada para a sua voz; o Privado, o nosso
 * modelo), o botão vira "Iniciar" ou "Baixar e iniciar", e "Agora não" CANCELA o início — nunca
 * escolhe o Privado calado. `aparelhoLento`: o nosso modelo quase não acompanha a fala aqui (celular,
 * WASM em 1 thread no iPhone), e a opção diz isso.
 */
export default function EscolhaDoMicrofone({
  mb,
  pacoteDoNavegador = false,
  aoEscolher,
  aoFechar,
  inicio,
}: {
  /** O download do "Privado" (o modelo que a rota do STT escolheria para a sua voz); `null` = não se sabe. */
  mb: number | null;
  /** O "Privado" será o reconhecimento do próprio navegador (pacote a instalar no clique). */
  pacoteDoNavegador?: boolean;
  aoEscolher: (escolha: EscolhaDoMic) => void;
  /** Fechou sem escolher. */
  aoFechar: () => void;
  /** A folha do início: o que cada opção baixa agora (MB) e se o nosso modelo atrasa neste aparelho. */
  inicio?: { mbSePrivado: number; mbSeRapido: number; aparelhoLento: boolean };
}) {
  const [escolha, setEscolha] = useState<EscolhaDoMic | null>(null);
  const mbAgora = !inicio || !escolha ? 0 : escolha === 'rapido' ? inicio.mbSeRapido : inicio.mbSePrivado;

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
              {pacoteDoNavegador && (
                <span className="badge" style={{ marginLeft: 6 }}>
                  {t('Recomendado')}
                </span>
              )}
            </h3>
            {pacoteDoNavegador ? (
              <p>
                {t('Usa o reconhecimento do próprio navegador, sem enviar o áudio. O pacote de idioma baixa agora, uma vez só.')}{' '}
                {mb
                  ? t('Se ele não instalar, usa o nosso modelo, de cerca de {mb} MB.', { mb })
                  : t('Se ele não instalar, usa o nosso modelo de transcrição.')}
              </p>
            ) : (
              <p>
                {mb
                  ? t('A transcrição roda neste aparelho. Baixa um modelo de cerca de {mb} MB, uma vez só.', { mb })
                  : t('A transcrição roda neste aparelho. Baixa um modelo de transcrição, uma vez só.')}{' '}
                {inicio?.aparelhoLento
                  ? t('Neste aparelho, a legenda pode atrasar alguns segundos.')
                  : t('Em aparelhos mais fracos, pode errar mais em português.')}
              </p>
            )}
          </span>
        </button>
        {inicio && escolha && (
          <p className="mut" data-testid="download-da-escolha" style={{ fontSize: 12.5 }}>
            {mbAgora > 0
              ? t('Para começar, baixa cerca de {mb} MB, uma vez só.', { mb: mbAgora })
              : t('Nada a baixar para começar.')}
          </p>
        )}
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
          {inicio && mbAgora > 0 && <Download aria-hidden />}
          {!inicio ? t('Continuar') : mbAgora > 0 ? t('Baixar e iniciar') : t('Iniciar')}
        </button>
      </div>
    </Dialogo>
  );
}
