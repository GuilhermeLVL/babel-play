import '../styles/cobertura.css';

import { FLAG_ESTUDO_PALAVRAS_V2 } from '../core/planos';
import { useCoberturaDoConteudo } from '../hooks/useCoberturaDoConteudo';
import { useFlag } from '../lib/flags';
import { t, tp } from '../lib/i18n';
import { nomeDoRotulo } from './views/leituraAtiva/rotulos';

/**
 * QUANTO DESTE CONTEÚDO VOCÊ JÁ SABE (spec `cobertura-em-sessoes-e-livros`): a linha da cobertura da Leitura ativa
 * ("Você já sabe 96% deste texto · cerca de 12 palavras novas") para a sessão e o capítulo do livro.
 *
 * O nível vem POR EXTENSO ("Bom desafio"), nunca só pela cor. Sem número honesto (sem conta, poucas sessões, idioma
 * sem espaço entre palavras, pouco texto) não renderiza nada. Mostra o que há; não cobra tempo nem pede meta.
 */
export default function CoberturaDoConteudo({
  trechos,
  idioma,
  tipo,
}: {
  /** O texto no idioma do conteúdo, em trechos (falas, parágrafos). `null` enquanto não carregou. */
  trechos: readonly string[] | null;
  idioma: string | null | undefined;
  tipo: 'sessao' | 'capitulo';
}) {
  const c = useCoberturaDoConteudo(trechos, idioma);
  /* Flag `estudo_palavras_v2` (modelo-do-aluno 4.2): "você conhece X% das palavras", nunca "você entende X%": a conta mede palavras
     que a pessoa já guardou, não compreensão. */
  const palavras = useFlag(FLAG_ESTUDO_PALAVRAS_V2);
  if (!c) return null;
  const { cobertura, rotulo } = c;
  const novas = cobertura.amostra ? 0 : cobertura.desconhecidas.length;
  return (
    <p className="cobertura" data-testid="cobertura-do-conteudo" data-rotulo={rotulo} data-tipo={tipo}>
      <span>
        {palavras
          ? tipo === 'sessao'
            ? t('Você conhece {n}% das palavras desta sessão', { n: cobertura.porcentagem })
            : t('Você conhece {n}% das palavras deste capítulo', { n: cobertura.porcentagem })
          : tipo === 'sessao'
            ? t('Você já sabe {n}% desta sessão', { n: cobertura.porcentagem })
            : t('Você já sabe {n}% deste capítulo', { n: cobertura.porcentagem })}
      </span>
      <span className="cobertura-rotulo">{nomeDoRotulo(rotulo)}</span>
      {novas > 0 && <span>{tp(novas, 'cerca de {n} palavra nova', 'cerca de {n} palavras novas')}</span>}
    </p>
  );
}
