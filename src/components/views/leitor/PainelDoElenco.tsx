import { Volume2 } from 'lucide-react';
import { useId } from 'react';

import { t } from '../../../lib/i18n';
import type { ElencoDoLivro } from './useElencoDoLivro';

/**
 * O PAINEL DO ELENCO (M5, flag `avatar_elenco`): quem lê o quê. Liga/desliga a narração com personagens (desligado =
 * uma voz só, como sempre) e deixa trocar a voz de cada personagem. Teclado e leitor de tela: interruptor nativo,
 * um `select` rotulado por personagem e um resumo em texto (`role="status"`) que não depende de cor nem de avatar.
 */
export default function PainelDoElenco({
  elenco,
  vozDoNarrador,
  nuvem,
}: {
  elenco: ElencoDoLivro;
  /** O nome da voz do narrador (a que a pessoa escolheu), para o resumo; vazio = a automática. */
  vozDoNarrador: string;
  /** A voz natural da nuvem está em uso: ela não troca de voz por personagem, só de ritmo. */
  nuvem: boolean;
}) {
  const id = useId();
  if (!elenco.disponivel) return null;
  const { personagens, vozes, distribuicao, gostos } = elenco;
  const semFicha = personagens.length === 0;
  const semVozes = vozes.length === 0;
  const resumo = !elenco.ligado
    ? t('Elenco desligado: uma voz só lê o livro inteiro.')
    : semFicha
      ? t('Este livro não tem personagens listadas: só o narrador lê, com o ritmo seguindo a emoção.')
      : nuvem
        ? t('Voz natural em uso: as personagens usam o mesmo timbre, e só o ritmo muda com a emoção.')
        : semVozes
          ? t('Não há outras vozes neste aparelho: o narrador lê as falas das personagens.')
          : t('Elenco ligado. Personagens com voz própria: {n}.', { n: personagens.length });
  return (
    <section className="leitor-grupo leitor-elenco" data-testid="painel-elenco" aria-labelledby={`${id}-titulo`}>
      <h3 className="leitor-legenda" id={`${id}-titulo`}>
        {t('Elenco do livro')}
      </h3>
      <label className="leitor-alternar">
        <input
          type="checkbox"
          role="switch"
          checked={elenco.ligado}
          data-testid="elenco-ligar"
          onChange={(e) => elenco.ligar(e.target.checked)}
        />
        <span>{t('Dar uma voz a cada personagem')}</span>
      </label>
      <p className="leitor-apoio" role="status" data-testid="elenco-resumo">
        {resumo}
      </p>
      {semFicha && elenco.fichaPronta && (
        <p className="leitor-apoio" data-testid="elenco-so-narrador">
          {elenco.livroProprio
            ? t('Só há o narrador neste livro: livros que você traz não têm lista de personagens.')
            : t('Só há o narrador neste livro: ele ainda não tem lista de personagens.')}
        </p>
      )}
      {elenco.ligado && !semFicha && !nuvem && !semVozes && (
        <ul className="leitor-elenco-lista" aria-label={t('Voz de cada personagem')}>
          <li className="leitor-elenco-linha">
            <span>{t('Narrador')}</span>
            <span className="leitor-apoio">{vozDoNarrador || t('Voz automática')}</span>
          </li>
          {personagens.map((nome, i) => {
            const campo = `${id}-p${i}`;
            const atual = gostos[nome] ?? distribuicao?.personagens[nome] ?? '';
            return (
              <li key={nome} className="leitor-elenco-linha">
                <label htmlFor={campo} className="leitor-elenco-nome">
                  {nome}
                </label>
                <select
                  id={campo}
                  value={atual}
                  data-testid={`elenco-voz-${i}`}
                  onChange={(e) => elenco.escolherVoz(nome, e.target.value)}
                >
                  {vozes.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="leitor-botao leitor-elenco-testar"
                  data-testid={`elenco-testar-${i}`}
                  aria-label={t('Experimentar a voz de {nome}', { nome })}
                  onClick={() => elenco.experimentar(nome, atual)}
                >
                  <Volume2 aria-hidden />
                  <span>{t('Experimentar')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {elenco.ligado && (
        <label className="leitor-alternar">
          <input
            type="checkbox"
            checked={elenco.avatar}
            data-testid="elenco-avatar"
            onChange={(e) => elenco.mostrarAvatar(e.target.checked)}
          />
          <span>{t('Um rosto diferente para cada personagem (com o avatar ligado)')}</span>
        </label>
      )}
      {elenco.ligado && distribuicao && distribuicao.repetidas.length > 0 && !nuvem && (
        <p className="leitor-apoio" data-testid="elenco-repetidas">
          {t('Faltam vozes para todas: algumas personagens dividem a mesma voz.')}
        </p>
      )}
    </section>
  );
}
