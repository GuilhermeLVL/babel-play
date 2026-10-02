import '../../../../styles/questAjustes.css';

import { Check, ChevronDown, Languages, Sparkles } from 'lucide-react';

import { t } from '../../../../lib/i18n';
import { LangFlag } from '../../../LangFlag';
import { Dialogo, fecharDialogoDe } from '../../../ui';

export interface OpcaoDeIdioma {
  key: string;
  label: string;
  code?: string;
  isAuto?: boolean;
}

/**
 * O SELETOR DE IDIOMA NO HEADSET — a apresentação de `LangPicker` com as telas novas do Quest.
 *
 * A lista de sempre abre colada no gatilho, com linhas de 30 px e a busca já em foco: no headset o
 * raio não acerta linha tão baixa, e o foco na busca sobe o teclado do sistema por cima da lista.
 * Aqui o gatilho é um alvo de 60 px e a lista abre num diálogo no centro, em colunas de alvos de
 * 60 px; a busca está lá, e o teclado só sobe quando a pessoa a toca.
 *
 * Só apresentação: o estado (aberto, busca, opções filtradas, escolha) é o de `LangPicker`.
 */
export default function SeletorDeIdiomaDoQuest({
  id,
  ariaLabel,
  block,
  accent,
  auto,
  value,
  rotuloEscolhido,
  chaveEscolhida,
  aberto,
  aoAbrir,
  aoFechar,
  busca,
  aoBuscar,
  opcoes,
  aoEscolher,
  className = '',
}: {
  id?: string;
  ariaLabel?: string;
  block: boolean;
  accent: boolean;
  auto: boolean;
  value: string;
  rotuloEscolhido: string;
  chaveEscolhida: string;
  aberto: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  busca: string;
  aoBuscar: (texto: string) => void;
  opcoes: readonly OpcaoDeIdioma[];
  aoEscolher: (opcao: OpcaoDeIdioma) => void;
  className?: string;
}) {
  const titulo = ariaLabel || t('Escolher o idioma');
  return (
    <>
      <button
        type="button"
        id={id}
        className={`q-seletor${block ? ' bloco' : ''}${accent ? ' acento' : ''} ${className}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`${titulo}: ${rotuloEscolhido}`}
        onClick={aoAbrir}
      >
        <span className="q-seletor-valor">
          {auto ? <Sparkles aria-hidden /> : <LangFlag code={value} className="q-bandeira" />}
          <span>{rotuloEscolhido}</span>
        </span>
        <ChevronDown aria-hidden />
      </button>

      {aberto && (
        <Dialogo icone={Languages} titulo={titulo} largura="largo" aoFechar={aoFechar}>
          <div className="dlg-corpo q-seletor-corpo">
            <label className="q-campo">
              <span>{t('Buscar idioma')}</span>
              <input
                type="search"
                value={busca}
                onChange={(e) => aoBuscar(e.target.value)}
                placeholder={t('Ex.: japonês, english, fr')}
                autoComplete="off"
              />
            </label>
            {opcoes.length === 0 ? (
              <p className="q-aju-nota" role="status">
                {t('Nenhum idioma encontrado.')}
              </p>
            ) : (
              <div className="q-seletor-lista" role="listbox" aria-label={titulo}>
                {opcoes.map((o) => {
                  const escolhida = o.key === chaveEscolhida;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="option"
                      className="q-opcao"
                      aria-selected={escolhida}
                      onClick={(e) => {
                        aoEscolher(o);
                        // Fechar pelo próprio `<dialog>` devolve o foco ao gatilho.
                        fecharDialogoDe(e.currentTarget);
                      }}
                    >
                      {o.isAuto ? <Sparkles aria-hidden /> : <LangFlag code={o.code ?? ''} className="q-bandeira" />}
                      <span>{o.label}</span>
                      {escolhida && <Check aria-hidden className="q-opcao-ok" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Dialogo>
      )}
    </>
  );
}
