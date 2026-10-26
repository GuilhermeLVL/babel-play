import { Sparkles } from 'lucide-react';

import { NIVEIS_CEFR } from '../../../../core/assistente/palavrasAcimaDoNivel';
import type { CefrLevel } from '../../../../core/learning/contract';
import { mudarAjustesDoAssistente, useAjustesDoAssistente } from '../../../../lib/assistente/ajustesDoAssistente';
import { t } from '../../../../lib/i18n';
import { CampoLinha, Interruptor } from '../../vocab/Dialogo';
import { useNuvemDoAssistente } from './useAssistenteAoVivo';

/**
 * "ASSISTENTE AO VIVO" nos Ajustes da captura (Fase C2): o que aparece na legenda flutuante. As palavras acima do nível
 * são locais e valem em todo plano; expressões, termos e a correção da fala só aparecem quando existem para a conta
 * (flag `assistente_ao_vivo` e plano) — escondidos, sem convite (decisão do dono). A correção nasce desligada.
 */
export default function AjustesDoAssistente() {
  const aj = useAjustesDoAssistente();
  const nuvem = useNuvemDoAssistente();
  return (
    <section data-testid="ajustes-do-assistente">
      <h3 className="h-op">
        <Sparkles aria-hidden /> {t('Assistente ao vivo')}
      </h3>
      <CampoLinha
        rotulo={t('Palavras acima do meu nível')}
        desc={t('Um sublinhado discreto nas palavras mais difíceis da legenda. Funciona no aparelho, sem internet.')}
      >
        <Interruptor
          ligado={aj.niveis}
          rotulo={t('Palavras acima do meu nível')}
          aoTrocar={() => mudarAjustesDoAssistente({ niveis: !aj.niveis })}
        />
      </CampoLinha>
      {aj.niveis && (
        <CampoLinha rotulo={t('Meu nível')} desc={t('As palavras acima dele ganham o sublinhado.')}>
          <select
            className="campo"
            id="assistente-nivel"
            aria-label={t('Meu nível')}
            value={aj.nivel}
            onChange={(e) => mudarAjustesDoAssistente({ nivel: e.target.value as CefrLevel })}
          >
            {NIVEIS_CEFR.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </CampoLinha>
      )}
      {nuvem && (
        <>
          <CampoLinha
            rotulo={t('Expressões e gírias')}
            desc={t('Marca na legenda a expressão que não é a soma das palavras. O sentido aparece ao tocar.')}
          >
            <Interruptor
              ligado={aj.expressoes}
              rotulo={t('Expressões e gírias')}
              aoTrocar={() => mudarAjustesDoAssistente({ expressoes: !aj.expressoes })}
            />
          </CampoLinha>
          <CampoLinha rotulo={t('Termos e siglas')} desc={t('Explica em uma linha a sigla ou o termo de trabalho.')}>
            <Interruptor
              ligado={aj.termos}
              rotulo={t('Termos e siglas')}
              aoTrocar={() => mudarAjustesDoAssistente({ termos: !aj.termos })}
            />
          </CampoLinha>
          <CampoLinha
            rotulo={t('Correção da minha fala')}
            desc={t('Quando você fala no idioma que aprende, sugere um jeito mais natural, com calma.')}
          >
            <Interruptor
              ligado={aj.correcao}
              rotulo={t('Correção da minha fala')}
              aoTrocar={() => mudarAjustesDoAssistente({ correcao: !aj.correcao })}
            />
          </CampoLinha>
        </>
      )}
      <CampoLinha
        rotulo={t('Etiquetas de palavras')}
        desc={t('Um tom nas palavras que você já guardou e nas que está aprendendo, na legenda e na Biblioteca.')}
      >
        <Interruptor
          ligado={aj.etiquetas}
          rotulo={t('Etiquetas de palavras')}
          aoTrocar={() => mudarAjustesDoAssistente({ etiquetas: !aj.etiquetas })}
        />
      </CampoLinha>
      {aj.etiquetas && (
        <CampoLinha
          rotulo={t('Marcar palavras novas para você')}
          desc={t(
            'Um ponto na palavra que ainda não apareceu nas suas sessões. Precisa da conta e de algumas sessões no idioma.',
          )}
        >
          <Interruptor
            ligado={aj.etiquetaNova}
            rotulo={t('Marcar palavras novas para você')}
            aoTrocar={() => mudarAjustesDoAssistente({ etiquetaNova: !aj.etiquetaNova })}
          />
        </CampoLinha>
      )}
      <CampoLinha
        rotulo={t('Abrir na aba Assistente')}
        desc={t('A janela flutuante abre direto nos destaques da sessão.')}
      >
        <Interruptor
          ligado={aj.abrirNaAba}
          rotulo={t('Abrir na aba Assistente')}
          aoTrocar={() => mudarAjustesDoAssistente({ abrirNaAba: !aj.abrirNaAba })}
        />
      </CampoLinha>
    </section>
  );
}
