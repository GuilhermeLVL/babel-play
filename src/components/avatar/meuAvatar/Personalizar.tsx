import { Check, RotateCcw, Undo2 } from 'lucide-react';
import { useId } from 'react';

import type { SuporteDaPaleta } from '../../../core/avatar/aparencia';
import { type CampoDaPaleta, CAMPOS_DA_PALETA, PALETA } from '../../../core/avatar/paleta';
import { type ChaveDeAjuste, FAIXAS_DE_AJUSTE, type ReceitaDeAvatar } from '../../../core/avatar/receita';
import { t } from '../../../lib/i18n';
import { nomeDaCor, ROTULO_DO_CAMPO } from './nomesDeCor';

const ROTULO_DO_AJUSTE: Record<ChaveDeAjuste, () => string> = {
  altura: () => t('Altura'),
  largura: () => t('Largura'),
  escala: () => t('Tamanho'),
};

interface Props {
  receita: ReceitaDeAvatar;
  suporte: SuporteDaPaleta;
  podeDesfazer: boolean;
  noPadrao: boolean;
  aoPaleta: (campo: CampoDaPaleta, id: string) => void;
  aoAjuste: (chave: ChaveDeAjuste, valor: number) => void;
  aoNome: (nome: string) => void;
  aoDesfazer: () => void;
  aoRestaurar: () => void;
}

/**
 * PERSONALIZAR: tons de pele, cabelo e olhos (só onde o modelo permite; senão o controle some e a tela diz por
 * quê), altura, largura e tamanho, prévia imediata, "Desfazer" e "Restaurar padrão". Cada tom tem NOME escrito e
 * o escolhido leva borda grossa e visto: nada depende só de cor.
 */
export default function Personalizar({
  receita,
  suporte,
  podeDesfazer,
  noPadrao,
  aoPaleta,
  aoAjuste,
  aoNome,
  aoDesfazer,
  aoRestaurar,
}: Props) {
  const id = useId();
  const campos = CAMPOS_DA_PALETA.filter((c) => suporte[c]);
  return (
    <div className="av-tela" data-testid="avatar-personalizar">
      <section className="q-secao">
        <header>
          <div>
            <h3>{t('Cores')}</h3>
            <p>{t('Escolha pelo nome. A prévia muda na hora.')}</p>
          </div>
        </header>
        {campos.length === 0 ? (
          <p className="qc-nota" data-testid="avatar-sem-paleta">
            {t('Este modelo tem cores fixas. Você ainda pode ajustar tamanho, altura e largura.')}
          </p>
        ) : (
          campos.map((campo) => {
            const atual = receita.paleta[campo];
            return (
              <div key={campo} className="q-cartao" role="radiogroup" aria-labelledby={`${id}-${campo}`}>
                <h4 id={`${id}-${campo}`} style={{ margin: 0, font: '800 18px/1.2 var(--font-display, inherit)' }}>
                  {ROTULO_DO_CAMPO[campo]()}
                </h4>
                <div className="av-paleta">
                  {PALETA[campo].map((cor) => (
                    <button
                      key={cor.id}
                      type="button"
                      role="radio"
                      aria-checked={atual === cor.id}
                      aria-label={nomeDaCor(campo, cor.id)}
                      title={nomeDaCor(campo, cor.id)}
                      data-cor={`${campo}:${cor.id}`}
                      className={`av-cor${cor.hex ? '' : ' av-original'}`}
                      style={cor.hex ? ({ '--av-cor': cor.hex } as React.CSSProperties) : undefined}
                      onClick={() => aoPaleta(campo, cor.id)}
                    >
                      {atual === cor.id && <Check aria-hidden />}
                    </button>
                  ))}
                </div>
                <p className="av-nome-da-cor" aria-live="polite">
                  {t('Escolhido: {cor}', { cor: nomeDaCor(campo, atual) })}
                </p>
              </div>
            );
          })
        )}
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h3>{t('Tamanho e proporção')}</h3>
            <p>{t('Dá para ajustar até 30% para mais ou para menos.')}</p>
          </div>
        </header>
        <div className="q-cartao">
          {(Object.keys(FAIXAS_DE_AJUSTE) as ChaveDeAjuste[]).map((chave) => {
            const { min, max } = FAIXAS_DE_AJUSTE[chave];
            const valor = receita.ajustes[chave] ?? 1;
            return (
              <div key={chave} className="av-ajuste">
                <label htmlFor={`${id}-${chave}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{ROTULO_DO_AJUSTE[chave]()}</span>
                  <output htmlFor={`${id}-${chave}`}>{Math.round(valor * 100)}%</output>
                </label>
                <input
                  id={`${id}-${chave}`}
                  type="range"
                  min={min}
                  max={max}
                  step={0.01}
                  value={valor}
                  data-ajuste={chave}
                  onChange={(e) => aoAjuste(chave, Number(e.target.value))}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="q-secao">
        <div className="q-cartao">
          <div className="q-campo">
            <label htmlFor={`${id}-nome`}>{t('Nome do avatar (opcional)')}</label>
            <input
              id={`${id}-nome`}
              value={receita.meta.nome}
              maxLength={40}
              onChange={(e) => aoNome(e.target.value)}
              placeholder={t('Como você quer chamá-lo')}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="av-acoes">
          <button type="button" className="q-ctl" disabled={!podeDesfazer} onClick={aoDesfazer}>
            <Undo2 aria-hidden /> {t('Desfazer')}
          </button>
          <button type="button" className="q-ctl" disabled={noPadrao} onClick={aoRestaurar}>
            <RotateCcw aria-hidden /> {t('Restaurar padrão')}
          </button>
        </div>
      </section>
    </div>
  );
}
