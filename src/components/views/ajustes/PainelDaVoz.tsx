import '../../../styles/questAjustes.css';
import '../../../styles/seletorDeVoz.css';

import { AudioLines, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { t } from '../../../lib/i18n';
import { baseLang, langLabelNaUI } from '../../../lib/languages';
import { nomeDaVozEmUso } from '../../../lib/voz/catalogoDeVozes';
import { useVozesPreferidas } from '../../../lib/voz/preferenciaDeVoz';
import { LangFlag } from '../../LangFlag';
import { Dialogo } from '../../ui';
import SeletorDeVoz from '../../voz/SeletorDeVoz';

/**
 * O PAINEL "VOZ" (Ajustes → Idiomas) — o lugar único onde se vê e se troca a voz de cada idioma.
 *
 * Uma linha por idioma que a pessoa usa: o que ela estuda, o dela, e qualquer outro para o qual já
 * escolheu uma voz (na Leitura ou no intérprete). O controle da linha mostra a voz em uso e abre o
 * seletor comum (`SeletorDeVoz`) num diálogo, como o seletor de idioma logo acima.
 *
 * A escolha é a do app inteiro: o narrador, o intérprete, o "Ouvir" de uma palavra e os jogos leem com ela.
 */
export default function PainelDaVoz({ estudando, meu }: { estudando: string; meu: string }) {
  const vozes = useVozesPreferidas();
  const [aberto, setAberto] = useState<string | null>(null);

  const papel: Record<string, string> = {};
  const idiomas: string[] = [];
  const entrar = (idioma: string, quem: string) => {
    const base = baseLang(idioma);
    if (!base || idiomas.includes(base)) return;
    idiomas.push(base);
    papel[base] = quem;
  };
  entrar(estudando, t('Idioma que estou aprendendo'));
  entrar(meu, t('Meu idioma'));
  for (const base of Object.keys(vozes).sort()) entrar(base, t('Você escolheu uma voz para este idioma.'));

  return (
    <section className="q-secao" data-testid="painel-da-voz">
      <header>
        <div>
          <h2>{t('Voz')}</h2>
          <p>{t('A voz que lê em cada idioma: no narrador, no intérprete, ao ouvir uma palavra e nos jogos.')}</p>
        </div>
      </header>
      <div className="q-ajustes">
        {idiomas.map((idioma) => {
          const nome = langLabelNaUI(idioma);
          const voz = nomeDaVozEmUso(idioma);
          return (
            <div key={idioma} className="q-ajuste" data-voz-idioma={idioma}>
              <div>
                <b>{nome}</b>
                <small>{papel[idioma]}</small>
              </div>
              <button
                type="button"
                className="q-seletor bloco voz-gatilho"
                aria-haspopup="dialog"
                aria-expanded={aberto === idioma}
                aria-label={t('Voz para {idioma}: {voz}', { idioma: nome, voz })}
                onClick={() => setAberto(idioma)}
              >
                <span className="q-seletor-valor">
                  <LangFlag code={idioma} className="q-bandeira" />
                  <span>{voz}</span>
                </span>
                <ChevronDown aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      {aberto && (
        <Dialogo
          icone={AudioLines}
          titulo={t('Voz para {idioma}', { idioma: langLabelNaUI(aberto) })}
          sub={t('Toque numa voz para escolher. O botão ao lado toca uma amostra.')}
          aoFechar={() => setAberto(null)}
        >
          <div className="dlg-corpo q-seletor-corpo">
            <SeletorDeVoz idioma={aberto} />
          </div>
        </Dialogo>
      )}
    </section>
  );
}
