import '../../../../styles/questSessao.css';

import { ArrowLeft, ArrowLeftRight, Check, Download, FileAudio, FileText, Youtube } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { t, tp } from '../../../../lib/i18n';
import type { Recording } from '../../../../types';
import { Dialogo, fecharDialogoDe } from '../../../ui';

/** Uma aba da sessão, como a tela de sempre já as monta (`abasDaSessao` em `Analysis.tsx`). */
interface AbaDaSessao {
  id: string;
  rotulo: string;
  icone: ReactNode;
  contagem?: number;
}

const iconeDoTipo = (tipo: Recording['type']) =>
  tipo === 'video' ? Youtube : tipo === 'document' ? FileText : FileAudio;

/** "Sessão de áudio · 38:10": o tipo da mídia e a duração (documento não tem duração). */
function sobrancelhaDa(gravacao: Recording): string {
  if (gravacao.type === 'document') return t('Sessão de documento · texto');
  return gravacao.type === 'video'
    ? t('Sessão de vídeo · {duracao}', { duracao: gravacao.durationStr })
    : t('Sessão de áudio · {duracao}', { duracao: gravacao.durationStr });
}

/**
 * A SESSÃO GRAVADA NO META QUEST — a casca: cabeçalho, abas e o painel da aba aberta.
 *
 * O desenho é o das telas aprovadas (Início, Biblioteca): voltar antes do título, as ações à direita
 * como pílulas, as abas numa fileira e o conteúdo embaixo. "Alternar de sessão" deixa de ser uma
 * caixa de seleção pequena e vira uma lista no centro, uma gravação por linha de 72 px.
 *
 * Só apresentação: a `Analysis` continua dona do estado e entrega aqui o que já calcula.
 */
export default function SessaoDoQuest({
  gravacao,
  gravacoes,
  abas,
  abaAtiva,
  aoTrocarAba,
  aoVoltar,
  aoTrocarSessao,
  aoExportar,
  aviso,
  children,
}: {
  gravacao: Recording;
  /** Todas as gravações, para "Trocar de sessão". */
  gravacoes: readonly Recording[];
  abas: readonly AbaDaSessao[];
  abaAtiva: string;
  aoTrocarAba: (id: string) => void;
  /** Volta para a Biblioteca. */
  aoVoltar: () => void;
  aoTrocarSessao: (id: string) => void;
  aoExportar: () => void;
  /** O aviso de nuvem sem consentimento (some sozinho quando não se aplica). */
  aviso?: ReactNode;
  children: ReactNode;
}) {
  const [trocando, setTrocando] = useState(false);
  const Icone = iconeDoTipo(gravacao.type);

  return (
    <div className="q-palco qs" data-testid="sessao-do-quest">
      <header className="q-cab">
        <button type="button" className="q-ctl q-voltar" aria-label={t('Voltar para a Biblioteca')} onClick={aoVoltar}>
          <ArrowLeft aria-hidden />
        </button>
        <div className="qs-titulo">
          <p className="q-sobre">
            <Icone aria-hidden /> {sobrancelhaDa(gravacao)}
          </p>
          <h1>{gravacao.title}</h1>
          <p className="qs-sub">{t('Análise do texto, prática ativa e exercícios criados a partir desta mídia.')}</p>
        </div>
        {gravacoes.length > 1 && (
          <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setTrocando(true)}>
            <ArrowLeftRight aria-hidden /> {t('Trocar de sessão')}
          </button>
        )}
        <button type="button" className="q-ctl" aria-haspopup="dialog" onClick={aoExportar}>
          <Download aria-hidden /> {t('Exportar')}
        </button>
      </header>

      {aviso}

      <div className="q-abas qs-abas" role="tablist" aria-label={t('O que fazer com esta sessão')}>
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`aba-${aba.id}`}
            className="q-aba"
            aria-selected={aba.id === abaAtiva}
            aria-controls={`painel-${aba.id}`}
            onClick={() => aoTrocarAba(aba.id)}
          >
            {aba.icone}
            {aba.rotulo}
            {aba.contagem != null && <span className="n">{aba.contagem}</span>}
          </button>
        ))}
      </div>

      <div className="qs-painel" role="tabpanel" id={`painel-${abaAtiva}`} aria-labelledby={`aba-${abaAtiva}`}>
        {children}
      </div>

      {trocando && (
        <Dialogo
          icone={ArrowLeftRight}
          titulo={t('Trocar de sessão')}
          sub={tp(gravacoes.length, '{n} gravação', '{n} gravações')}
          aoFechar={() => setTrocando(false)}
        >
          <div className="dlg-corpo qs-miolo q-lista" role="group" aria-label={t('Gravações')}>
            {gravacoes.map((g) => {
              const IconeDaLinha = iconeDoTipo(g.type);
              const aberta = g.id === gravacao.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className="q-linha"
                  aria-pressed={aberta}
                  onClick={(e) => {
                    fecharDialogoDe(e.currentTarget);
                    if (!aberta) aoTrocarSessao(g.id);
                  }}
                >
                  <span className="q-ic">
                    <IconeDaLinha aria-hidden />
                  </span>
                  <span>
                    <b>{g.title}</b>
                    <small>{[g.date, g.type === 'document' ? '' : g.durationStr].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="q-fim">
                    {aberta ? (
                      <>
                        <Check aria-hidden /> {t('Aberta')}
                      </>
                    ) : (
                      t('Abrir')
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Dialogo>
      )}
    </div>
  );
}
