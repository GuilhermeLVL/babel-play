import '../../../../styles/questAjustes.css';

import { AlertTriangle, Moon, Sun, Vibrate } from 'lucide-react';
import { Suspense, useState } from 'react';

import {
  guardarVibracaoDoQuest,
  useVibracaoDoQuest,
  VIBRACOES_DO_QUEST,
} from '../../../../lib/dispositivo/preferenciasDoQuest';
import type { ProvaDeVibracao } from '../../../../lib/dispositivo/respostaAoApontar';
import {
  definirDesenhoNovoNoComputador,
  noComputador,
  noHeadset,
  useQuestNovo,
} from '../../../../lib/dispositivo/telaNovaDoQuest';
import { idiomasAbaixoDoPiso, t } from '../../../../lib/i18n';
import { irPara } from '../../../../lib/irPara';
import { idiomasDaInterfaceOferecidos, type LangConfig } from '../../../../lib/langConfig';
import { baseLang, langLabelNaUI } from '../../../../lib/languages';
import { lazyComRecarga } from '../../../../lib/lazyComRecarga';
import { perfilProtegido } from '../../../../lib/protecaoDoMenor';
import AiEnginePanel from '../../../AiEnginePanel';
import LangPicker from '../../../LangPicker';
import type { FontScale } from '../../../shell/ControlCluster';
import { PainelDeAba } from '../../../ui';
import LangAudit from '../../LangAudit';
import AbaConta from '../AbaConta';
import AbaNotificacoes from '../AbaNotificacoes';
import AbaPrivacidade from '../AbaPrivacidade';
import AbasDoQuest, { type AbaDoQuest } from './AbasDoQuest';
import { provarComSom, rotuloDaVibracao, textoDaProva } from './vibracao';

const PainelDaNuance = lazyComRecarga(() => import('../PainelDaNuance'));

/**
 * AJUSTES NO META QUEST — a mesma tela de `Settings.tsx`, no desenho do headset.
 *
 * As mesmas seis abas, na mesma ordem. Cada ajuste é uma linha (`.q-ajuste`) com o nome e a explicação
 * à esquerda e UM controle grande à direita: interruptor, escolha entre poucos ou botão. Nada abre por
 * hover; o que pede uma lista (idiomas) ou um formulário (a chave, a senha) abre num diálogo no centro.
 *
 * Só apresentação: o estado, a gravação e a confirmação com o servidor continuam em `Settings.tsx`, que
 * passa por props o que já calcula. As abas grandes (`AbaNotificacoes`, `AbaPrivacidade`, `AbaConta`,
 * `AiEnginePanel`, `PainelDaNuance`, `LangAudit`) são as de sempre: cada uma tem o próprio ramo do
 * headset, com o mesmo estado.
 *
 * NOVO, e só aqui: "Vibração ao apontar" (o controle pulsa quando o raio chega a um alvo). É do
 * APARELHO: só o headset a mostra (`noHeadset()`).
 *
 * NO COMPUTADOR este desenho é uma escolha da pessoa: a aba Aparência traz "Desenho novo", o mesmo
 * interruptor da tela de sempre, para voltar a ela quando quiser.
 */
export default function AjustesDoQuest({
  sobrancelha,
  titulo,
  abas,
  aba,
  aoTrocarAba,
  erro,
  idiomas,
  aoMudarIdioma,
  escuro,
  aoEscolherEscuro,
  tamanhos,
  fontScale,
  setFontScale,
  animationsEnabled,
  toggleAnimations,
  soundEnabled,
  toggleSound,
  performanceMode,
  togglePerformanceMode,
  perfilDeIa,
  aoMudarPerfilDeIa,
  perfisBloqueados,
  onReplayTour,
}: {
  sobrancelha: string;
  titulo: string;
  abas: readonly AbaDoQuest[];
  aba: string;
  aoTrocarAba: (id: string) => void;
  /** Erro REAL de gravação (idioma ou perfil de IA): fica à vista até a próxima tentativa. */
  erro: string | null;
  idiomas: LangConfig;
  aoMudarIdioma: (mudanca: Partial<LangConfig>) => void;
  escuro: boolean;
  aoEscolherEscuro: (escuro: boolean) => void;
  tamanhos: readonly (readonly [FontScale, string, string])[];
  fontScale: FontScale;
  setFontScale: (s: FontScale) => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  performanceMode: boolean;
  togglePerformanceMode: () => void;
  perfilDeIa: string;
  aoMudarPerfilDeIa: (id: string) => void;
  perfisBloqueados: string[];
  onReplayTour: () => void;
}) {
  const vibracao = useVibracaoDoQuest();
  const [prova, setProva] = useState<ProvaDeVibracao | null>(null);
  /* O aparelho não muda com a página aberta. No computador, esta tela só existe com o desenho novo
     ligado: é o que `useQuestNovo()` diz, e o interruptor acompanha a troca na hora. */
  const [headset] = useState(noHeadset);
  const [computador] = useState(noComputador);
  const desenhoNovo = useQuestNovo();
  const emAndamento = idiomasAbaixoDoPiso();

  return (
    <div className="q-palco q-aju" data-testid="ajustes-do-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{sobrancelha}</p>
          <h1>{titulo}</h1>
        </div>
      </header>

      <AbasDoQuest itens={abas} ativo={aba} aoTrocar={aoTrocarAba} rotuloDoGrupo={t('Seções dos ajustes')} />

      {erro && (
        <div className="q-aviso q-aju-alerta" role="status">
          <span>
            <AlertTriangle aria-hidden /> {erro}
          </span>
        </div>
      )}

      {/* ═════════════ IDIOMAS ═════════════ */}
      <PainelDeAba id="idiomas" ativo={aba} className="q-aju-painel">
        <section className="q-secao">
          <header>
            <div>
              <h2>{t('Os dois idiomas')}</h2>
            </div>
          </header>
          <div className="q-ajustes">
            <div className="q-ajuste">
              <div>
                <b>{t('Idioma que estou aprendendo')}</b>
                <small>
                  {t('O idioma do áudio ou texto estrangeiro. É o idioma das palavras que vão para o seu deck.')}
                </small>
              </div>
              <LangPicker
                id="settings-studying-lang"
                ariaLabel={t('Idioma que estou aprendendo')}
                block
                value={idiomas.studying}
                onPick={({ code }) => {
                  if (code) aoMudarIdioma({ studying: code });
                }}
              />
            </div>
            <div className="q-ajuste">
              <div>
                <b>{t('Meu idioma')}</b>
                <small>{t('O que você já fala: o do seu microfone e o das traduções que você lê.')}</small>
                {baseLang(idiomas.mine) === baseLang(idiomas.studying) && (
                  <small className="q-aju-atencao" role="status">
                    {t('Os dois idiomas são o mesmo, não há tradução a fazer, e os cartões ficarão sem verso.')}
                  </small>
                )}
              </div>
              <LangPicker
                id="settings-mine-lang"
                ariaLabel={t('Meu idioma')}
                block
                value={idiomas.mine}
                onPick={({ code }) => {
                  if (code) aoMudarIdioma({ mine: code });
                }}
              />
            </div>
            <div className="q-ajuste">
              <div>
                <b>{t('Idioma da interface')}</b>
                <small>{t('O idioma dos textos do app. Não muda o microfone nem a direção da tradução.')}</small>
                {emAndamento.length > 0 && (
                  <small>
                    {t('Traduções em andamento, ainda fora da lista: {langs}.', {
                      langs: emAndamento
                        .map((i) => `${langLabelNaUI(i.lang)} (${Math.round(i.cobertura * 100)}%)`)
                        .join(', '),
                    })}
                  </small>
                )}
              </div>
              <LangPicker
                id="settings-ui-lang"
                ariaLabel={t('Idioma da interface')}
                block
                somente={idiomasDaInterfaceOferecidos()}
                value={idiomas.daInterface}
                onPick={({ code }) => {
                  if (code) aoMudarIdioma({ daInterface: code });
                }}
              />
            </div>
          </div>
        </section>

        {/* O convite ao Premium é promocional: o perfil protegido não o recebe. */}
        <Suspense fallback={<div className="q-esqueleto" aria-hidden />}>
          <PainelDaNuance aoConhecer={perfilProtegido() ? undefined : () => irPara({ view: 'planos' })} />
        </Suspense>

        <LangAudit />
      </PainelDeAba>

      {/* ═════════════ APARÊNCIA ═════════════ */}
      <PainelDeAba id="aparencia" ativo={aba} className="q-aju-painel">
        <section className="q-secao">
          <header>
            <div>
              <h2>{t('Como o app se parece')}</h2>
            </div>
          </header>
          <div className="q-ajustes">
            <div className="q-ajuste">
              <div>
                <b>{t('Tema')}</b>
                <small>{t('Claro ou escuro. O tema de cores você troca em Personalizar.')}</small>
              </div>
              <div className="q-abas q-seg" role="group" aria-label={t('Tema')}>
                <button type="button" className="q-aba" aria-pressed={!escuro} onClick={() => aoEscolherEscuro(false)}>
                  <Sun aria-hidden /> {t('Claro')}
                </button>
                <button type="button" className="q-aba" aria-pressed={escuro} onClick={() => aoEscolherEscuro(true)}>
                  <Moon aria-hidden /> {t('Escuro')}
                </button>
              </div>
            </div>

            <div className="q-ajuste">
              <div>
                <b>{t('Tamanho do texto')}</b>
                <small>{t('Vale para o app inteiro.')}</small>
              </div>
              <div className="q-abas q-seg" role="group" aria-label={t('Tamanho do texto')}>
                {tamanhos.map(([id, rotulo, nome]) => (
                  <button
                    key={id}
                    type="button"
                    className="q-aba q-aju-letra"
                    aria-pressed={fontScale === id}
                    aria-label={t(nome)}
                    onClick={() => setFontScale(id)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="q-ajuste">
              <div>
                <b>{t('Reduzir movimento')}</b>
                <small>{t('Desliga partículas e animações.')}</small>
              </div>
              <button
                type="button"
                className="q-interruptor"
                role="switch"
                aria-checked={!animationsEnabled}
                aria-label={t('Reduzir movimento')}
                onClick={toggleAnimations}
              />
            </div>

            <div className="q-ajuste">
              <div>
                <b>{t('Sons')}</b>
                <small>{t('Efeitos sonoros dos jogos e das conquistas.')}</small>
              </div>
              <button
                type="button"
                className="q-interruptor"
                role="switch"
                aria-checked={soundEnabled}
                aria-label={t('Sons')}
                onClick={toggleSound}
              />
            </div>

            <div className="q-ajuste">
              <div>
                <b>{t('Modo desempenho')}</b>
                <small>
                  {t(
                    'Menos efeitos visuais. Liga sozinho no Meta Quest, em celulares mais simples e com "reduzir movimento" do sistema; a sua escolha aqui vale mais.',
                  )}
                </small>
              </div>
              <button
                type="button"
                className="q-interruptor"
                role="switch"
                aria-checked={performanceMode}
                aria-label={t('Modo desempenho')}
                onClick={togglePerformanceMode}
              />
            </div>

            {/* Só no computador: lá o desenho novo é escolha da pessoa (no headset a chave mora em
                `/diagnostico`). Desligar devolve a tela de sempre na hora, nesta mesma aba. */}
            {computador && (
              <div className="q-ajuste" data-testid="desenho-novo">
                <div>
                  <b>{t('Desenho novo')}</b>
                  <small>
                    {t('A interface limpa que nasceu no headset, agora no computador. Dá para voltar quando quiser.')}
                  </small>
                </div>
                <button
                  type="button"
                  className="q-interruptor"
                  role="switch"
                  aria-checked={desenhoNovo}
                  aria-label={t('Desenho novo')}
                  onClick={() => definirDesenhoNovoNoComputador(!desenhoNovo)}
                />
              </div>
            )}

            {/* Só no headset: o pulso do controle quando o raio chega a um alvo (`respostaAoApontar.ts`).
                Com mouse não há controle para vibrar, e a linha não aparece. */}
            {headset && (
              <div className="q-ajuste" data-testid="vibracao-ao-apontar">
                <div>
                  <b>{t('Vibração ao apontar')}</b>
                  <small>{t('O controle dá um pulso curto quando o raio chega a algo que dá para acionar.')}</small>
                  <small className="q-aju-prova" role="status" data-testid="prova-da-vibracao">
                    {vibracao === 'desligada'
                      ? t('Desligada: nada vibra nem soa ao apontar.')
                      : prova
                        ? textoDaProva(prova)
                        : t('Toque em Testar para sentir um pulso nesta intensidade.')}
                  </small>
                </div>
                <div className="q-abas q-seg" role="group" aria-label={t('Vibração ao apontar')}>
                  {VIBRACOES_DO_QUEST.map((nivel) => (
                    <button
                      key={nivel}
                      type="button"
                      className="q-aba"
                      aria-pressed={vibracao === nivel}
                      onClick={() => {
                        guardarVibracaoDoQuest(nivel);
                        setProva(null);
                      }}
                    >
                      {rotuloDaVibracao(nivel)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="q-ctl"
                  disabled={vibracao === 'desligada'}
                  onClick={() => vibracao !== 'desligada' && setProva(provarComSom(vibracao))}
                >
                  <Vibrate aria-hidden /> {t('Testar')}
                </button>
              </div>
            )}
          </div>
        </section>
      </PainelDeAba>

      {/* ═════════════ NOTIFICAÇÕES ═════════════ */}
      <PainelDeAba id="notificacoes" ativo={aba} className="q-aju-painel">
        <AbaNotificacoes />
      </PainelDeAba>

      {/* ═════════════ PROCESSAMENTO ═════════════ */}
      <PainelDeAba id="contas" ativo={aba} className="q-aju-painel">
        <AiEnginePanel activeId={perfilDeIa} onSelect={aoMudarPerfilDeIa} bloqueados={perfisBloqueados} />
      </PainelDeAba>

      {/* ═════════════ PRIVACIDADE ═════════════ */}
      <PainelDeAba id="privacidade" ativo={aba} className="q-aju-painel">
        <AbaPrivacidade />
      </PainelDeAba>

      {/* ═════════════ CONTA ═════════════ */}
      <PainelDeAba id="conta" ativo={aba} className="q-aju-painel">
        <AbaConta onReplayTour={onReplayTour} aoIrParaPrivacidade={() => aoTrocarAba('privacidade')} />
      </PainelDeAba>
    </div>
  );
}
