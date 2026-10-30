import '../../styles/vlibras.css';

import { HandHelping, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { mensagemDeInicio, mensagemDeTexto } from '../../core/libras/vlibras';
import { t } from '../../lib/i18n';
import { criarPonteDoVLibras, enviarParaAPonte, ouvirAPonte, useVLibras } from '../../lib/libras/vlibras';

export type OndeApareceOVLibras = 'interprete' | 'legendar' | 'livro';

/** O aviso FIXO do piloto: sempre à vista enquanto o VLibras está em uso. Nunca "tradução oficial", nunca "nosso". */
export const AVISO_DO_VLIBRAS = () =>
  t('Sinais de apoio via VLibras (serviço do governo federal). Não substitui intérprete de Libras.');

/**
 * A TELA DE CONSENTIMENTO do piloto VLibras: o que é, para onde vai o texto, o analytics do terceiro, o limite. Nada do
 * VLibras é carregado antes do "Aceitar e ativar". `Esc` e "Agora não" fecham sem carregar nada.
 */
function TelaDeConsentimento({ aoAceitar, aoRecusar }: { aoAceitar: () => void; aoRecusar: () => void }) {
  const aceitar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    aceitar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoRecusar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoRecusar]);
  return createPortal(
    <div className="vlb-fundo" data-testid="vlibras-consentimento-fundo">
      <div
        className="vlb-tela"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vlb-titulo"
        data-testid="vlibras-consentimento"
      >
        <h2 id="vlb-titulo">{t('Sinais de apoio com o VLibras')}</h2>
        <p className="vlb-origem">{t('VLibras · governo federal')}</p>
        <ul>
          <li>
            {t('O VLibras é um serviço EXTERNO do governo federal. Não é do Frasy e não é uma tradução oficial.')}
          </li>
          <li>
            {t(
              'Ao ativar, o Frasy abre o VLibras (vlibras.gov.br) numa janela isolada do app. O trecho que você enviar é mandado a um serviço do governo federal para virar sinais, e o endereço de internet do seu aparelho chega a ele.',
            )}
          </li>
          <li>
            {t(
              'O widget pode pedir licença para coletar dados de uso (analytics do próprio VLibras). O Frasy bloqueia a biblioteca de analytics, mas a pergunta pode aparecer.',
            )}
          </li>
          <li>{t('Só para maiores de 18 anos. Você pode desativar quando quiser, em Perfil.')}</li>
        </ul>
        <p className="vlb-aviso" data-testid="vlibras-aviso-na-tela">
          {AVISO_DO_VLIBRAS()}
        </p>
        <div className="vlb-acoes">
          <button
            ref={aceitar}
            type="button"
            className="vlb-btn vlb-pri"
            onClick={aoAceitar}
            data-testid="vlibras-aceitar"
          >
            {t('Aceitar e ativar')}
          </button>
          <button type="button" className="vlb-btn" onClick={aoRecusar} data-testid="vlibras-agora-nao">
            {t('Agora não')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** O trecho que a pessoa selecionou na tela (aparado e no teto), ou `null`. Nunca mais do que ela escolheu. */
function trechoSelecionado(): string | null {
  const bruto = typeof window === 'undefined' ? '' : (window.getSelection()?.toString() ?? '');
  return mensagemDeTexto(bruto) ? bruto : null;
}

/**
 * O PAINEL DO VLIBRAS: a origem e o aviso fixo à vista, e a PONTE, o iframe de origem opaca onde o widget do governo roda.
 * O app só manda `iniciar` e o trecho que a pessoa escolheu enviar; o widget traduz DENTRO da ponte.
 */
function PainelDoVLibras({
  flag,
  trechoInicial,
  aoFechar,
  aoDesativar,
}: {
  flag: boolean;
  trechoInicial: string | null;
  aoFechar: () => void;
  aoDesativar: () => void;
}) {
  const lugar = useRef<HTMLDivElement>(null);
  const ponte = useRef<HTMLIFrameElement | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const inicial = useRef(trechoInicial);

  useEffect(() => {
    const f = criarPonteDoVLibras(flag);
    if (!f || !lugar.current) {
      setEstado('erro');
      return;
    }
    ponte.current = f;
    lugar.current.appendChild(f);
    const parar = ouvirAPonte(f, (tipo) => {
      if (tipo === 'pronta') enviarParaAPonte(f, flag, mensagemDeInicio());
      else if (tipo === 'erro') setEstado('erro');
      else {
        setEstado('pronto');
        const m = mensagemDeTexto(inicial.current);
        if (m) enviarParaAPonte(f, flag, m);
      }
    });
    return () => {
      parar();
      f.remove();
      ponte.current = null;
    };
  }, [flag]);

  const enviarSelecao = () => {
    const m = mensagemDeTexto(trechoSelecionado());
    if (m) enviarParaAPonte(ponte.current, flag, m);
  };
  return createPortal(
    <aside className="vlb-painel" role="complementary" aria-label={t('VLibras')} data-testid="vlibras-aviso">
      <div className="vlb-faixa-txt">
        <strong data-testid="vlibras-origem">{t('VLibras · governo federal')}</strong>
        <span data-testid="vlibras-aviso-fixo">{AVISO_DO_VLIBRAS()}</span>
        <span>
          {t('Selecione um trecho do texto da tela e toque em "Enviar o trecho selecionado" para ver os sinais.')}
        </span>
      </div>
      <div className="vlb-acoes">
        <button
          type="button"
          className="vlb-btn"
          // Não tira a seleção do texto ao tocar (no Safari o toque num botão a desfaz).
          onPointerDown={(e) => e.preventDefault()}
          onClick={enviarSelecao}
          data-testid="vlibras-enviar-selecao"
        >
          {t('Enviar o trecho selecionado')}
        </button>
        <button type="button" className="vlb-btn" onClick={aoDesativar} data-testid="vlibras-desativar">
          {t('Desativar')}
        </button>
        <button
          type="button"
          className="vlb-btn vlb-so-icone"
          aria-label={t('Fechar o VLibras')}
          onClick={aoFechar}
          data-testid="vlibras-fechar-aviso"
        >
          <X aria-hidden />
        </button>
      </div>
      {estado === 'carregando' && (
        <p role="status" className="vlb-estado" data-testid="vlibras-carregando">
          {t('Carregando o VLibras…')}
        </p>
      )}
      {estado === 'erro' && (
        <p role="status" className="vlb-estado" data-testid="vlibras-falhou">
          {t('Não consegui abrir o VLibras agora. Tente de novo em instantes.')}
        </p>
      )}
      <div ref={lugar} className="vlb-ponte" data-testid="vlibras-ponte" />
    </aside>,
    document.body,
  );
}

/**
 * O BOTÃO "SINAIS DE APOIO (VLIBRAS)": o mesmo no Intérprete, na Legendar e no leitor de livros (ícone + rótulo, alvo de
 * 44 px). Atrás do portão: sem a flag `libras_vlibras` ou sem adulto confirmado NADA aparece, e a tela é a de antes. Sem
 * aceite, abre a tela de consentimento; com aceite, abre o painel com a ponte do widget do governo federal. `texto` é
 * o trecho que a tela já tem (o leitor: a seleção do livro); sem ele vale a seleção feita na página.
 * A soletração própria e o guia do alfabeto não dependem disto.
 */
export default function SinaisDeApoio({
  onde,
  classe = '',
  texto = null,
}: {
  onde: OndeApareceOVLibras;
  classe?: string;
  texto?: string | null;
}) {
  const vl = useVLibras();
  const [consentindo, setConsentindo] = useState(false);
  const [painel, setPainel] = useState(false);
  const trecho = useRef<string | null>(null);
  if (!vl.disponivel) return null;

  const abrir = () => {
    trecho.current = texto || trechoSelecionado();
    setPainel(true);
  };
  const aoTocar = () => {
    if (!vl.aceitou) setConsentindo(true);
    else if (painel) setPainel(false);
    else abrir();
  };
  return (
    <>
      <button
        type="button"
        className={classe || 'vlb-btn'}
        aria-haspopup={vl.aceitou ? undefined : 'dialog'}
        aria-pressed={vl.aceitou ? painel : undefined}
        // Não tira a seleção do texto ao tocar (no Safari o toque num botão a desfaz).
        onPointerDown={(e) => e.preventDefault()}
        data-testid={`sinais-de-apoio-${onde}`}
        onClick={aoTocar}
      >
        <HandHelping aria-hidden />
        <span className="int-modo-visivel">{t('Sinais de apoio (VLibras)')}</span>
      </button>
      {consentindo && (
        <TelaDeConsentimento
          aoRecusar={() => setConsentindo(false)}
          aoAceitar={() => {
            const guardou = vl.aceitar();
            setConsentindo(false);
            if (guardou) abrir();
          }}
        />
      )}
      {vl.aceitou && painel && (
        <PainelDoVLibras
          flag={vl.flag}
          trechoInicial={trecho.current}
          aoFechar={() => setPainel(false)}
          aoDesativar={() => {
            vl.revogar();
            setPainel(false);
          }}
        />
      )}
    </>
  );
}

/**
 * A REVOGAÇÃO em Perfil: aparece só para adulto com a flag ligada e o aceite dado. Tira o widget da página, apaga o
 * aceite e o que o widget guardou neste aparelho.
 */
export function AjusteDoVLibras() {
  const vl = useVLibras();
  if (!vl.disponivel || !vl.aceitou) return null;
  return (
    <section className="vlb-ajuste" aria-labelledby="vlb-ajuste-titulo" data-testid="vlibras-ajuste">
      <h3 id="vlb-ajuste-titulo">{t('Sinais de apoio (VLibras)')}</h3>
      <p>
        {t(
          'Você ativou o VLibras, um serviço externo do governo federal. Desative para apagar o aceite neste aparelho.',
        )}
      </p>
      <button type="button" className="vlb-btn" onClick={vl.revogar} data-testid="vlibras-revogar">
        {t('Desativar o VLibras')}
      </button>
    </section>
  );
}
