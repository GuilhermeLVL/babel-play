import {
  ExternalLink,
  Info,
  Keyboard,
  LogOut,
  Mic,
  Moon,
  Pause,
  Pencil,
  Repeat,
  SlidersHorizontal,
} from 'lucide-react';
import { useRef } from 'react';

import { t } from '../../../../lib/i18n';
import FolhaDeBaixo from '../../captura/celular/FolhaDeBaixo';
import { CabecalhoDaFolha, Interruptor } from './pecas';

/**
 * A FOLHA DO "…" — porte de `ctMaisAcoes()` (`cartoes2.js:508-557`): o que saiu da tela mora aqui, com
 * hierarquia. Os três mais usados são os maiores.
 *
 * O QUE MUDOU POR SER O APP: "Bandeira" e "Perguntar ao tutor" não existem (o cartão não tem campo de
 * bandeira e o tutor não abre com uma palavra); o terceiro botão grande é "Suspender", que existe.
 * Cada ação fecha a folha e roda 240 ms depois, como no protótipo (`cartoes2.js:554-555`).
 */
export default function FolhaDoMais({
  palavra,
  idioma,
  glosa,
  outraFrase,
  dizer,
  guardarVoz,
  atalhos,
  aoEditar,
  aoAdiar,
  aoSuspender,
  aoInfo,
  aoAbrirSessao,
  aoOutraFrase,
  aoMinhaVoz,
  aoTrocarDizer,
  aoTrocarGuardarVoz,
  aoAjustes,
  aoAtalhos,
  aoEncerrar,
  aoFechar,
}: {
  palavra: string;
  idioma: string;
  /** A tradução, quando a resposta já está à vista; senão a folha não a entrega. */
  glosa?: string;
  /** "2 de 3", quando o cartão tem outra frase. */
  outraFrase?: string;
  dizer: boolean;
  guardarVoz: boolean;
  /** Há teclado físico: o botão "Atalhos" aparece. */
  atalhos: boolean;
  aoEditar: () => void;
  aoAdiar: () => void;
  aoSuspender: () => void;
  aoInfo: () => void;
  aoAbrirSessao?: () => void;
  aoOutraFrase?: () => void;
  aoMinhaVoz?: () => void;
  aoTrocarDizer: (ligado: boolean) => void;
  aoTrocarGuardarVoz: (ligado: boolean) => void;
  aoAjustes: () => void;
  aoAtalhos: () => void;
  aoEncerrar: () => void;
  aoFechar: () => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  const fazer = (acao: () => void) => () => {
    depois.current = acao;
    folha.current?.close();
  };
  return (
    <FolhaDeBaixo
      titulo={t('Ações do cartão e ajustes da revisão')}
      doPrototipo
      classe="cx-folha cx-folha-acoes"
      refDaFolha={folha}
      aoFechar={() => {
        const acao = depois.current;
        depois.current = null;
        aoFechar();
        if (acao) window.setTimeout(acao, 240);
      }}
    >
      <CabecalhoDaFolha aoFechar={() => folha.current?.close()}>
        <p className="folha-pal" lang={idioma}>
          {palavra}
        </p>
        <p className="folha-glosa">{glosa || t('Ações deste cartão')}</p>
      </CabecalhoDaFolha>
      <div className="cx-tres">
        <button type="button" className="cx-grande" onClick={fazer(aoEditar)}>
          <Pencil aria-hidden />
          <b>{t('Editar')}</b>
          <small>{t('palavra, frase, tradução')}</small>
        </button>
        <button type="button" className="cx-grande" onClick={fazer(aoAdiar)}>
          <Moon aria-hidden />
          <b>{t('Deixar para amanhã')}</b>
          <small>{t('sem contar como erro')}</small>
        </button>
        <button type="button" className="cx-grande" onClick={fazer(aoSuspender)}>
          <Pause aria-hidden />
          <b>{t('Suspender')}</b>
          <small>{t('sai da revisão até você reativar')}</small>
        </button>
      </div>
      <div className="folha-grade cx-menores">
        <button type="button" className="folha-acao" onClick={fazer(aoInfo)}>
          <Info aria-hidden /> {t('Informações e histórico')}
        </button>
        <button
          type="button"
          className="folha-acao"
          disabled={!aoAbrirSessao}
          onClick={aoAbrirSessao && fazer(aoAbrirSessao)}
        >
          <ExternalLink aria-hidden /> {t('Abrir na sessão')}
        </button>
        <button type="button" className="folha-acao" disabled={!aoOutraFrase} onClick={aoOutraFrase && fazer(aoOutraFrase)}>
          <Repeat aria-hidden /> {outraFrase ? t('Outra frase · {qual}', { qual: outraFrase }) : t('Outra frase')}
        </button>
        <button type="button" className="folha-acao" disabled={!aoMinhaVoz} onClick={aoMinhaVoz && fazer(aoMinhaVoz)}>
          <Mic aria-hidden /> {t('Minha voz')}
        </button>
      </div>
      <p className="folha-rotulo">{t('Nesta revisão')}</p>
      <Interruptor
        titulo={t('Dizer antes de virar')}
        texto={t('Em parte dos cartões, um convite para dizer em voz alta. Sem gravar e sem nota.')}
        ligado={dizer}
        aoTrocar={aoTrocarDizer}
      />
      <Interruptor
        titulo={t('Guardar minha voz no cartão')}
        texto={t('Fica só neste aparelho; você apaga quando quiser.')}
        ligado={guardarVoz}
        aoTrocar={aoTrocarGuardarVoz}
      />
      <div className="cx-folha-pe">
        <button type="button" className="q-ctl" onClick={fazer(aoAjustes)}>
          <SlidersHorizontal aria-hidden /> {t('Ajustes da memória')}
        </button>
        {atalhos && (
          <button type="button" className="q-ctl" data-precisa="teclado" onClick={fazer(aoAtalhos)}>
            <Keyboard aria-hidden /> {t('Atalhos')}
          </button>
        )}
        <button type="button" className="q-ctl cx-encerrar" onClick={fazer(aoEncerrar)}>
          <LogOut aria-hidden /> {t('Encerrar a revisão')}
        </button>
      </div>
    </FolhaDeBaixo>
  );
}
