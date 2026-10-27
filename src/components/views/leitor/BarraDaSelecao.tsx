import { BookA, Highlighter, Languages, Lightbulb, StickyNote, X } from 'lucide-react';
import { useState } from 'react';

import { type CorDeAnotacao, CORES_DE_ANOTACAO } from '../../../core/leitura/anotacao';
import { FLAG_IA_DE_ESTUDO } from '../../../core/planos';
import { useFlag } from '../../../lib/flags';
import { t } from '../../../lib/i18n';
import ExplicacaoDaFrase from '../captura/estudo/ExplicacaoDaFrase';

const NOME_DA_COR: Record<CorDeAnotacao, string> = {
  amarelo: 'amarelo',
  verde: 'verde',
  azul: 'azul',
  rosa: 'rosa',
  laranja: 'laranja',
};

export interface TrechoSelecionado {
  texto: string;
  /** A frase do trecho (o contexto da explicação). */
  frase: string;
  idioma: string;
}

/**
 * A BARRA DO TRECHO SELECIONADO: grifar (com a cor), anotar, traduzir e — atrás da flag `ia_de_estudo` e do
 * plano, decididos pelo servidor — explicar (IA01). Fica no pé do leitor, e não flutuando sobre o texto:
 * alcançável pelo teclado, sem cobrir a seleção no celular.
 */
export default function BarraDaSelecao({
  trecho,
  destino,
  traduzir,
  aoGrifar,
  aoAnotar,
  aoFechar,
  aoConhecerPlanos,
  aoVerPalavra,
}: {
  trecho: TrechoSelecionado;
  /** O idioma da tradução (o da pessoa). */
  destino: string;
  traduzir: (texto: string) => Promise<string | null>;
  aoGrifar: (cor: CorDeAnotacao) => void;
  aoAnotar: (nota: string) => void;
  aoFechar: () => void;
  aoConhecerPlanos?: () => void;
  /** O trecho é UMA palavra (o toque duplo, a seleção pelo teclado): abre a folha da palavra. */
  aoVerPalavra?: () => void;
}) {
  const [modo, setModo] = useState<'acoes' | 'nota' | 'traducao' | 'explicar'>('acoes');
  /* "Explicar" só aparece com a IA de estudo ligada; quem pode explicar (plano ou amostra) é o servidor. */
  const explicarLigado = useFlag(FLAG_IA_DE_ESTUDO);
  const [nota, setNota] = useState('');
  const [traducao, setTraducao] = useState<string | null | undefined>(undefined);

  const pedirTraducao = async () => {
    setModo('traducao');
    setTraducao(undefined);
    setTraducao(await traduzir(trecho.texto));
  };

  return (
    <section className="leitor-selecao" aria-label={t('Trecho selecionado')} data-testid="barra-da-selecao">
      <p className="leitor-selecao-trecho" lang={trecho.idioma || undefined}>
        “{trecho.texto.length > 160 ? `${trecho.texto.slice(0, 160)}…` : trecho.texto}”
      </p>
      {modo === 'acoes' && (
        <div className="leitor-acoes">
          <div className="leitor-cores" role="group" aria-label={t('Grifar com a cor')}>
            <Highlighter aria-hidden className="leitor-cores-icone" />
            {CORES_DE_ANOTACAO.map((cor) => (
              <button
                key={cor}
                type="button"
                className="leitor-cor leitor-alvo"
                data-cor={cor}
                aria-label={t('Grifar em {cor}', { cor: t(NOME_DA_COR[cor]) })}
                onClick={() => aoGrifar(cor)}
              />
            ))}
          </div>
          {aoVerPalavra && (
            <button type="button" className="btn btn-outline leitor-alvo" onClick={aoVerPalavra}>
              <BookA aria-hidden /> {t('Ver a palavra')}
            </button>
          )}
          <button type="button" className="btn btn-outline leitor-alvo" onClick={() => setModo('nota')}>
            <StickyNote aria-hidden /> {t('Nota')}
          </button>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={() => void pedirTraducao()}>
            <Languages aria-hidden /> {t('Traduzir')}
          </button>
          {explicarLigado && (
            <button type="button" className="btn btn-outline leitor-alvo" onClick={() => setModo('explicar')}>
              <Lightbulb aria-hidden /> {t('Explicar')}
            </button>
          )}
          <button type="button" className="btn btn-outline leitor-alvo" aria-label={t('Fechar')} onClick={aoFechar}>
            <X aria-hidden />
          </button>
        </div>
      )}
      {modo === 'nota' && (
        <form
          className="leitor-nota-form"
          onSubmit={(e) => {
            e.preventDefault();
            aoAnotar(nota.trim());
          }}
        >
          <label htmlFor="leitor-nota-nova" className="leitor-legenda">
            {t('Sua nota sobre o trecho')}
          </label>
          <textarea
            id="leitor-nota-nova"
            className="campo"
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            autoFocus
          />
          <div className="leitor-acoes">
            <button type="submit" className="btn btn-solid leitor-alvo">
              {t('Salvar nota')}
            </button>
            <button type="button" className="btn btn-outline leitor-alvo" onClick={() => setModo('acoes')}>
              {t('Voltar')}
            </button>
          </div>
        </form>
      )}
      {modo === 'traducao' && (
        <div className="leitor-traducao">
          <p role="status" lang={destino || undefined}>
            {traducao === undefined ? t('Traduzindo…') : traducao || t('Não deu para traduzir agora.')}
          </p>
          <div className="leitor-acoes">
            <button type="button" className="btn btn-outline leitor-alvo" onClick={() => setModo('acoes')}>
              {t('Voltar')}
            </button>
          </div>
        </div>
      )}
      {modo === 'explicar' && (
        <div className="leitor-explicar">
          <ExplicacaoDaFrase
            fala={{ texto: trecho.frase || trecho.texto, traducao: traducao || '', lang: trecho.idioma }}
            destino={destino}
            aoConhecer={aoConhecerPlanos}
          />
          <p className="leitor-apoio">
            {t('A explicação usa a IA de estudo do seu plano. Sem ela, grifar, anotar e traduzir seguem grátis.')}
          </p>
          <div className="leitor-acoes">
            <button type="button" className="btn btn-outline leitor-alvo" onClick={() => setModo('acoes')}>
              {t('Voltar')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
