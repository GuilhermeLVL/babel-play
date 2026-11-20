import { ArrowLeft, BookOpenCheck, Languages, Lightbulb, MessageCircleQuestion, TextSelect } from 'lucide-react';
import type { ReactNode } from 'react';

import { type EstadoDaFerramenta, type FerramentaDeIa, FERRAMENTAS_DE_IA } from '../../../core/leitura/ferramentasDeIa';
import { t } from '../../../lib/i18n';
import { comoUsar, fraseDoMotivo, nomeDaFerramenta } from './ferramentasDeIaTextos';

export type AbaDeIa = 'lista' | 'parceiro' | 'capitulo';

const ICONE: Record<FerramentaDeIa, ReactNode> = {
  'traduzir-trecho': <TextSelect aria-hidden />,
  'traduzir-capitulo': <Languages aria-hidden />,
  explicar: <Lightbulb aria-hidden />,
  parceiro: <MessageCircleQuestion aria-hidden />,
};

/** O título do painel para cada aba (o cabeçalho do leitor o mostra). */
export function tituloDaAbaDeIa(aba: AbaDeIa): string {
  return aba === 'parceiro'
    ? t('Parceiro de leitura')
    : aba === 'capitulo'
      ? t('Traduzir este capítulo')
      : t('Ferramentas de IA');
}

/**
 * AS FERRAMENTAS DE IA DO LEITOR, SEMPRE À VISTA. Lista as quatro e diz, para cada uma, se dá para usar agora ou por
 * quê não — em vez de a ferramenta sumir. As que abrem um painel próprio (capítulo, parceiro) têm botão quando
 * disponíveis; as que dependem de um trecho selecionado (traduzir, explicar) dizem como usar. O link dos planos
 * só existe para quem pode comprar (nunca no perfil protegido) e é discreto: é a lista, não uma recusa.
 */
export default function PainelDeFerramentas({
  aba,
  aoMudarAba,
  estados,
  temSelecao,
  protegido,
  aoConhecerPlanos,
  parceiro,
  capitulo,
}: {
  aba: AbaDeIa;
  aoMudarAba: (a: AbaDeIa) => void;
  estados: Record<FerramentaDeIa, EstadoDaFerramenta>;
  temSelecao: boolean;
  protegido: boolean;
  aoConhecerPlanos?: () => void;
  parceiro: ReactNode;
  capitulo: ReactNode;
}) {
  if (aba !== 'lista') {
    return (
      <div data-testid={`ia-${aba}`}>
        <button
          type="button"
          className="btn btn-outline leitor-alvo leitor-ia-voltar"
          onClick={() => aoMudarAba('lista')}
        >
          <ArrowLeft aria-hidden /> {t('Todas as ferramentas')}
        </button>
        {aba === 'parceiro' ? parceiro : capitulo}
      </div>
    );
  }

  const abre: Partial<Record<FerramentaDeIa, AbaDeIa>> = { 'traduzir-capitulo': 'capitulo', parceiro: 'parceiro' };
  const mostraPlanos = !protegido && !!aoConhecerPlanos;

  return (
    <div data-testid="ia-lista">
      <p className="leitor-apoio">
        {t('O que o leitor faz por você. Traduzir roda no seu aparelho e é grátis.')}
        {temSelecao ? ' ' + t('Há um trecho selecionado: o parceiro e a explicação partem dele.') : ''}
      </p>
      <ul className="leitor-ia-lista">
        {FERRAMENTAS_DE_IA.map((f) => {
          const estado = estados[f];
          const motivo = fraseDoMotivo(estado);
          const alvo = abre[f];
          return (
            <li key={f} className="leitor-ia-item" data-ferramenta={f} data-disponivel={estado.disponivel}>
              <h3 className="leitor-subtitulo">
                {ICONE[f]} {nomeDaFerramenta(f)}
              </h3>
              <p className="leitor-apoio">{comoUsar(f)}</p>
              {!('motivo' in estado) ? (
                alvo ? (
                  <button type="button" className="btn btn-solid leitor-alvo" onClick={() => aoMudarAba(alvo)}>
                    <BookOpenCheck aria-hidden /> {t('Abrir')}
                  </button>
                ) : (
                  <p className="leitor-ia-pronto">{t('Pronto para usar.')}</p>
                )
              ) : (
                <>
                  <p className="leitor-ia-motivo" data-motivo={estado.motivo}>
                    {motivo}
                  </p>
                  {estado.motivo === 'plano' && mostraPlanos && (
                    <button type="button" className="leitor-ia-link" onClick={aoConhecerPlanos}>
                      {t('Conhecer os planos')}
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
