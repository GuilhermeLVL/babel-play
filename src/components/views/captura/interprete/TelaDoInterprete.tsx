import '../../../../styles/telaDoInterprete.css';

import { ArrowLeftRight, Check, CircleHelp, Download, Languages, Loader2 } from 'lucide-react';

import type { LinhaDoPreparo } from '../../../../lib/captura/situacaoDoInterprete';
import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import { LangFlag } from '../../../LangFlag';
import { CabecalhoDeTela } from '../../../ui';

const ICONE_DO_ESTADO = { pronto: Check, baixa: Download, escolhe: CircleHelp } as const;

/**
 * A TELA PRÓPRIA DO INTÉRPRETE — o item "Intérprete" do menu (relato do dono no celular, 2026-09-30:
 * ele não achava como chegar ao modo, e não via o que estava sendo preparado). É o que a pessoa vê
 * ANTES da conversa: os dois idiomas (o seu e o da outra pessoa), o preparo dos dois lados (a voz e a
 * tradução, nos dois idiomas e nos dois sentidos) e um botão grande, "Começar conversa". A conversa em
 * si é a tela dividida (`ModoInterprete`), que abre por cima.
 *
 * Só apresentação: os idiomas, o preparo e o início (a mesma folha do Iniciar, se houver o que decidir)
 * continuam em `LiveCapture`. A escolha de idiomas é a que a captura já tem (`IdiomasDaSessao`).
 */
export default function TelaDoInterprete({
  meu,
  outro,
  linhas,
  possivel,
  abrindo,
  aoMudarIdiomas,
  aoTrocar,
  aoComecar,
}: {
  /** O idioma de quem segura o aparelho (BCP-47). */
  meu: string;
  /** O idioma da outra pessoa (BCP-47). */
  outro: string;
  linhas: LinhaDoPreparo[];
  /** Os dois idiomas são diferentes: há conversa a ter. */
  possivel: boolean;
  /** O microfone está abrindo (a permissão, o modelo): o botão espera. */
  abrindo: boolean;
  aoMudarIdiomas: () => void;
  /** Troca os dois idiomas de lugar. */
  aoTrocar: () => void;
  aoComecar: () => void;
}) {
  return (
    <div className="tela entra tdi" data-testid="tela-do-interprete">
      <CabecalhoDeTela
        icone={Languages}
        sobrancelha={t('Conversa frente a frente')}
        titulo={t('Intérprete')}
        sub={t('Duas pessoas, dois idiomas, um aparelho. Cada um fala na sua vez e a tradução é lida em voz alta.')}
      />

      <section className="cartao tdi-idiomas" aria-label={t('Idiomas da conversa')} data-testid="idiomas-do-interprete">
        <button type="button" className="tdi-lado" onClick={aoMudarIdiomas}>
          <small>{t('Eu falo')}</small>
          <b>
            <LangFlag code={meu} />
            <span>{langLabel(meu)}</span>
          </b>
        </button>
        <button type="button" className="tdi-troca" onClick={aoTrocar} aria-label={t('Trocar os idiomas')}>
          <ArrowLeftRight aria-hidden />
        </button>
        <button type="button" className="tdi-lado" onClick={aoMudarIdiomas}>
          <small>{t('A outra pessoa fala')}</small>
          <b>
            <LangFlag code={outro} />
            <span>{langLabel(outro)}</span>
          </b>
        </button>
      </section>

      <section className="cartao tdi-preparo">
        <h2>{t('Antes de começar')}</h2>
        <ul className="tdi-linhas" role="list" aria-label={t('Preparo da conversa')}>
          {linhas.map((l) => {
            const Icone = ICONE_DO_ESTADO[l.estado];
            return (
              <li key={l.id} className="tdi-linha" data-estado={l.estado}>
                <Icone aria-hidden />
                <div>
                  <b>{l.rotulo}</b>
                  <span>{l.detalhe}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {!possivel && (
        <div className="aviso-info warn" role="alert">
          <span>{t('Escolha dois idiomas diferentes para começar a conversa.')}</span>
        </div>
      )}

      <button
        type="button"
        className="btn btn-solid grande tdi-comecar"
        onClick={aoComecar}
        disabled={!possivel || abrindo}
        data-testid="comecar-conversa"
        data-sfx="none"
      >
        {abrindo ? <Loader2 aria-hidden className="animate-spin" /> : <Languages aria-hidden />}
        {abrindo ? t('Abrindo o microfone…') : t('Começar conversa')}
      </button>
    </div>
  );
}
