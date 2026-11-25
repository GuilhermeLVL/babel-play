import { useEffect, useState } from 'react';

import type { CelulaDeLatencia, LatenciaPublicada } from '../../../core/latencia/agregarLatencia';
import { celulasOk } from '../../../core/latencia/contratoDaLatencia';
import { type LatenciaDoDono } from '../../../core/latencia/latenciaDoDono';
import { FLAG_LATENCIA_PUBLICADA } from '../../../core/planos';
import { latenciaPublicadaLigada, lerLatenciaDoDono, lerLatenciaPublicada } from '../../../data/rotas/latencia';
import { useFlag } from '../../../lib/flags';
import { t } from '../../../lib/i18n';
import { Aviso, Botao, Secao, Tabela } from './pecas';

/**
 * O PAINEL DO DONO DA LATÊNCIA (openspec `latencia-publicada-por-aparelho`, tarefa 2.4): p50, p75, taxa de falha e `n` por
 * célula classe x idioma; o p95 só com 1.000 falas ou mais ("amostra pequena" abaixo disso); e o tempo de carga do modelo por
 * fase (download, compilação, aquecimento). A regra de `insuficiente` vale aqui como no público.
 *
 * De onde vêm os dados: a visão do dono (`latencia-dono.json`, privada, `VITE_LATENCIA_DONO_URL`) traz p95 e carga; sem ela, o
 * painel cai no arquivo público (sem p95 nem carga, e o aviso diz isso). Sem a flag `latencia_publicada`, não renderiza.
 */

const CLASSES: Record<string, () => string> = {
  quest: () => t('Óculos Quest'),
  'celular-fraco': () => t('Celular mais simples'),
  'celular-bom': () => t('Celular bom'),
  'desktop-sem-gpu': () => t('Computador sem placa de vídeo dedicada'),
  'desktop-com-gpu': () => t('Computador com placa de vídeo dedicada'),
  outro: () => t('Outro aparelho'),
};
const nomeDaClasse = (c: string): string => CLASSES[c]?.() ?? c;
const nomeDoIdioma = (i: string): string => (i === 'todos' ? t('Todos') : i === 'outro' ? t('Outro') : i.toUpperCase());

const ms = (v: number | undefined): string => (v === undefined ? '—' : v > 10000 ? t('mais de 10 s') : `${v} ms`);
const pct = (v: number | undefined): string => (v === undefined ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

type Fase = 'download' | 'compilacao' | 'aquecimento';
const nomeDaFase = (f: Fase): string =>
  f === 'download' ? t('Download') : f === 'compilacao' ? t('Compilação') : t('Aquecimento');

/** A parte pura do painel (os testes a usam com um `latencia.json` fixo). */
export function PainelDeLatenciaView({
  publico,
  dono,
  aoAtualizar,
}: {
  publico: LatenciaPublicada | null;
  dono: LatenciaDoDono | null;
  aoAtualizar?: () => void;
}) {
  const base = dono ?? publico;
  return (
    <Secao
      titulo={t('Latência da legenda por aparelho')}
      sub={
        base
          ? t('Dados de {dia}, janela de {dias} dias. {ok} das 15 células com amostra suficiente (200 falas).', {
              dia: base.geradoEm,
              dias: base.janelaDias,
              ok: celulasOk(base),
            })
          : undefined
      }
      acoes={aoAtualizar ? <Botao aoClicar={aoAtualizar}>{t('Atualizar')}</Botao> : undefined}
    >
      {!base ? (
        <Aviso
          icone={null}
          titulo={t('Ainda sem agregado publicado')}
          explicacao={t(
            'O arquivo de latência ainda não existe, está velho ou fora do contrato. Rode o agregador em modo de teste (publicar-latencia --dry-run).',
          )}
        />
      ) : (
        <>
          {!dono && (
            <p className="ad-nota" data-testid="sem-visao-do-dono">
              {t(
                'Sem a visão do dono: o p95 e a carga do modelo por fase só aparecem com o arquivo privado configurado.',
              )}
            </p>
          )}
          <Tabela
            rotulo={t('Latência por classe de aparelho e idioma')}
            colunas={[t('Aparelho'), t('Idioma'), t('Falas'), t('Mediana'), t('p75'), t('p95'), t('Falhas')]}
          >
            {base.celulas.map((c: CelulaDeLatencia & { p95Ms?: number }) => (
              <tr key={`${c.classe}|${c.idioma}`}>
                <td data-rotulo={t('Aparelho')}>{nomeDaClasse(c.classe)}</td>
                <td data-rotulo={t('Idioma')}>{nomeDoIdioma(c.idioma)}</td>
                <td data-rotulo={t('Falas')}>{c.n}</td>
                {c.estado === 'ok' ? (
                  <>
                    <td data-rotulo={t('Mediana')}>{ms(c.p50Ms)}</td>
                    <td data-rotulo={t('p75')}>{ms(c.p75Ms)}</td>
                    <td data-rotulo={t('p95')}>{c.p95Ms !== undefined ? ms(c.p95Ms) : t('amostra pequena')}</td>
                    <td data-rotulo={t('Falhas')}>{pct(c.falha)}</td>
                  </>
                ) : (
                  <td colSpan={4} data-rotulo={t('Mediana')}>
                    {t('insuficiente')}
                  </td>
                )}
              </tr>
            ))}
          </Tabela>
          {dono && (
            <Tabela
              rotulo={t('Carga do modelo por fase')}
              colunas={[t('Aparelho'), t('Modelo'), t('Fase'), t('Cargas'), t('Mediana'), t('p75')]}
            >
              {dono.cargas.map((c) => (
                <tr key={`${c.classe}|${c.modelo}|${c.fase}`}>
                  <td data-rotulo={t('Aparelho')}>{nomeDaClasse(c.classe)}</td>
                  <td data-rotulo={t('Modelo')}>{c.modelo}</td>
                  <td data-rotulo={t('Fase')}>{nomeDaFase(c.fase)}</td>
                  <td data-rotulo={t('Cargas')}>{c.n}</td>
                  {c.estado === 'ok' ? (
                    <>
                      <td data-rotulo={t('Mediana')}>{ms(c.p50Ms)}</td>
                      <td data-rotulo={t('p75')}>{ms(c.p75Ms)}</td>
                    </>
                  ) : (
                    <td colSpan={2} data-rotulo={t('Mediana')}>
                      {t('insuficiente')}
                    </td>
                  )}
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}
    </Secao>
  );
}

/** O painel do admin: sem a flag `latencia_publicada`, nada (e nenhuma requisição). */
export default function SecaoDeLatencia() {
  const ligada = useFlag(FLAG_LATENCIA_PUBLICADA);
  if (!ligada) return null;
  return <SecaoLigada />;
}

function SecaoLigada() {
  const [publico, setPublico] = useState<LatenciaPublicada | null>(null);
  const [dono, setDono] = useState<LatenciaDoDono | null>(null);
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    if (!latenciaPublicadaLigada()) return;
    let vivo = true;
    void Promise.all([lerLatenciaDoDono(), lerLatenciaPublicada()]).then(([d, p]) => {
      if (!vivo) return;
      setDono(d);
      setPublico(p);
    });
    return () => {
      vivo = false;
    };
  }, [rodada]);

  return <PainelDeLatenciaView publico={publico} dono={dono} aoAtualizar={() => setRodada((r) => r + 1)} />;
}
