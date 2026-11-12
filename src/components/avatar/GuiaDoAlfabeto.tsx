import '../../styles/guiaDoAlfabeto.css';
import '../../styles/letrasDoPalco.css';

import { Download, Flag, Trash2, X } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  instanteDaPose,
  proximaTecla,
  teclaDoTeclado,
  teclasDoAlfabeto,
} from '../../core/avatar/sinais/guiaDoAlfabeto';
import {
  adicionarMarcacao,
  estaMarcada,
  exportarMarcacoes,
  lerMarcacoes,
  type MarcacaoDePose,
  removerMarcacao,
} from '../../core/avatar/sinais/marcacoesLocais';
import { letrasDoPalco } from '../../core/avatar/sinais/soletracaoDoInterprete';
import { soletrar } from '../../core/avatar/sinais/soletrar';
import type { Lingua } from '../../core/avatar/sinais/tipos';
import { carregarSinais, type DadosDeSinais } from '../../data/avatar/sinais/carregar';
import { usePreferenciasDosAvatares } from '../../lib/avatar/preferenciasDoInterprete';
import { t } from '../../lib/i18n';
import { useReceitaDoDono } from './AvatarDaConversa';
import AvatarSinalizante, { type AtualDoSinalizante } from './AvatarSinalizante';
import AvisosDaSoletracao from './AvisosDaSoletracao';

const CHAVE_DAS_MARCACOES = 'frasy.avatar.sinais.marcacoes';
const TETO_DA_PALAVRA_MS = 30_000;

function lerLista(): MarcacaoDePose[] {
  try {
    return lerMarcacoes(localStorage.getItem(CHAVE_DAS_MARCACOES));
  } catch {
    return [];
  }
}
function guardarLista(l: readonly MarcacaoDePose[]): void {
  try {
    localStorage.setItem(CHAVE_DAS_MARCACOES, JSON.stringify(l));
  } catch {
    /* sem armazenamento: a lista vale até recarregar */
  }
}

const FORMA_AUTOAVALIADA: Record<string, () => string> = {
  alta: () => t('Forma autoavaliada: alta. Não é validação de pessoas surdas.'),
  media: () => t('Forma autoavaliada: média. Não é validação de pessoas surdas.'),
  baixa: () => t('Forma autoavaliada: baixa. Não é validação de pessoas surdas.'),
};

/** Quantas colunas a grade tem agora (medido pelos botões que ficam na mesma linha do primeiro). */
function colunasDaGrade(grade: HTMLElement | null): number {
  const filhos = grade ? [...grade.querySelectorAll<HTMLElement>('button')] : [];
  const primeiro = filhos[0];
  if (!primeiro) return 1;
  return Math.max(1, filhos.filter((b) => b.offsetTop === primeiro.offsetTop).length);
}

/**
 * GUIA "ALFABETO MANUAL" (Libras e ASL, letras e 0 a 9): a grade das letras, o teclado, a pose grande da letra escolhida
 * pelo avatar-intérprete, o campo "Soletrar uma palavra" e a lista local de poses marcadas como incorretas (exportável
 * em JSON, sem servidor) para levar à revisão por pessoas surdas.
 *
 * É SOLETRAÇÃO do alfabeto manual, NÃO tradução. As poses são de DEMONSTRAÇÃO, NÃO revisadas por pessoas surdas: os dois
 * avisos fixos ficam sempre à vista. Quem monta decide as flags (`avatar_3d` + `avatar_sinais`).
 */
export default function GuiaDoAlfabeto({
  aoFechar,
  alfabetoInicial = 'libras',
}: {
  aoFechar: () => void;
  alfabetoInicial?: Lingua;
}) {
  const receita = useReceitaDoDono('outro');
  const [prefs, guardar] = usePreferenciasDosAvatares();
  const [alfabeto, setAlfabeto] = useState<Lingua>(alfabetoInicial);
  const [dados, setDados] = useState<DadosDeSinais | null>(null);
  const [letra, setLetra] = useState('A');
  const [rascunho, setRascunho] = useState('');
  const [palavra, setPalavra] = useState<{ texto: string; vez: number } | null>(null);
  const [atual, setAtual] = useState<AtualDoSinalizante | null>(null);
  const [marcadas, setMarcadas] = useState<MarcacaoDePose[]>(lerLista);
  const [aviso, setAviso] = useState<string | null>(null);
  const grade = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  useEffect(() => {
    let vivo = true;
    setDados(null);
    void carregarSinais(alfabeto).then(
      (d) => vivo && setDados(d),
      () => vivo && setAviso(t('Não deu para carregar o alfabeto agora. Tente de novo.')),
    );
    return () => {
      vivo = false;
    };
  }, [alfabeto]);

  const teclas = useMemo(() => (dados ? teclasDoAlfabeto(dados.alfabeto) : []), [dados]);
  const letraValida = teclas.includes(letra) ? letra : (teclas[0] ?? 'A');
  const dadosDaLetra = dados?.alfabeto.letras[letraValida];

  // a pose parada da letra: o instante em que a mão já chegou à forma
  const tempoDaPose = useMemo(() => {
    if (!dados || !teclas.includes(letraValida)) return 0;
    return instanteDaPose(
      soletrar(letraValida, dados.alfabeto, {
        limites: dados.limites,
        espelhar: prefs.espelhar,
        soletrarUmaLetra: true,
      }),
    );
  }, [dados, letraValida, prefs.espelhar, teclas]);

  // foco entra no guia e volta a quem abriu
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>('[data-guia-primeiro]')?.focus();
    return () => antes?.focus?.();
  }, []);

  const escolher = useCallback((k: string, foco = false) => {
    setLetra(k);
    setPalavra(null);
    setAtual(null);
    setAviso(null);
    if (foco) grade.current?.querySelector<HTMLElement>(`[data-letra="${k}"]`)?.focus();
  }, []);

  const noTeclado = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      aoFecharRef.current();
      return;
    }
    if (e.key === 'Tab') {
      const alcancaveis = [
        ...e.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      const primeiro = alcancaveis[0];
      const ultimo = alcancaveis[alcancaveis.length - 1];
      if (!primeiro || !ultimo) return;
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === primeiro || !e.currentTarget.contains(ativo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (ativo === ultimo || !e.currentTarget.contains(ativo))) {
        e.preventDefault();
        primeiro.focus();
      }
      return;
    }
    // digitar uma letra (ou algarismo) escolhe a pose, desde que o foco não esteja num campo de texto
    const alvo = e.target as HTMLElement;
    if (alvo instanceof HTMLInputElement && alvo.type === 'text') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = teclaDoTeclado(e.key, teclas);
    if (k) {
      e.preventDefault();
      escolher(k, true);
    }
  };

  const naGrade = (e: KeyboardEvent<HTMLButtonElement>, k: string) => {
    const mapa: Record<string, Parameters<typeof proximaTecla>[2]> = {
      ArrowRight: 'direita',
      ArrowLeft: 'esquerda',
      ArrowDown: 'baixo',
      ArrowUp: 'cima',
      Home: 'inicio',
      End: 'fim',
    };
    const direcao = mapa[e.key];
    if (!direcao) return;
    e.preventDefault();
    escolher(proximaTecla(teclas, k, direcao, colunasDaGrade(grade.current)), true);
  };

  const soletrarPalavra = () => {
    const texto = rascunho.trim();
    if (!texto) return;
    setAtual(null);
    setAviso(null);
    setPalavra((p) => ({ texto, vez: (p?.vez ?? 0) + 1 }));
  };

  const marcada = estaMarcada(marcadas, alfabeto, letraValida);
  const alternarMarca = () => {
    const nova = marcada
      ? removerMarcacao(marcadas, alfabeto, letraValida)
      : adicionarMarcacao(marcadas, { alfabeto, letra: letraValida, espelhada: prefs.espelhar, em: Date.now() });
    setMarcadas(nova);
    guardarLista(nova);
    setAviso(
      marcada
        ? t('Marca da letra {letra} removida.', { letra: letraValida })
        : t('Letra {letra} marcada como incorreta, só neste aparelho.', { letra: letraValida }),
    );
  };
  const exportar = () => {
    try {
      const json = exportarMarcacoes(marcadas, new Date().toISOString());
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'frasy-poses-marcadas.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setAviso(t('Lista exportada: {n} poses.', { n: marcadas.length }));
    } catch {
      setAviso(t('Não deu para exportar a lista neste aparelho.'));
    }
  };
  const limpar = () => {
    setMarcadas([]);
    guardarLista([]);
    setAviso(t('Lista apagada.'));
  };

  const tocandoPalavra = palavra !== null;
  const letrasDaPalavra = atual && atual.palavra ? letrasDoPalco(atual.letras, atual.indice) : [];

  return (
    <div className="ga-fundo" data-testid="guia-fundo">
      <div
        ref={caixa}
        className="ga-caixa"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ga-titulo"
        data-testid="guia-alfabeto"
        data-alfabeto={alfabeto}
        onKeyDown={noTeclado}
      >
        <header className="ga-topo">
          <h2 id="ga-titulo">{t('Alfabeto manual')}</h2>
          <button
            type="button"
            className="ga-btn ga-icone"
            onClick={aoFechar}
            aria-label={t('Fechar o guia')}
            data-testid="guia-fechar"
          >
            <X aria-hidden />
          </button>
        </header>
        <AvisosDaSoletracao />
        <p className="ga-nota">
          {t(
            'Soletração, não tradução. Escolha uma letra ou um número para ver a forma da mão. Dá para digitar a letra.',
          )}
        </p>

        <div className="ga-controles">
          <div role="radiogroup" aria-label={t('Alfabeto manual')} className="ga-radios">
            {(['libras', 'asl'] as const).map((a, i) => (
              <label key={a} className="ga-opcao">
                <input
                  type="radio"
                  name="guia-alfabeto"
                  checked={alfabeto === a}
                  onChange={() => {
                    setAlfabeto(a);
                    setPalavra(null);
                  }}
                  data-testid={`guia-alfabeto-${a}`}
                  {...(i === 0 ? { 'data-guia-primeiro': '' } : {})}
                />
                <span>{a === 'libras' ? t('Libras') : t('ASL')}</span>
              </label>
            ))}
          </div>
          <label className="ga-opcao">
            <input
              type="checkbox"
              checked={prefs.espelhar}
              onChange={(e) => guardar({ espelhar: e.target.checked })}
              data-testid="guia-espelhar"
            />
            <span>{t('Mão esquerda (espelhar, para canhotos)')}</span>
          </label>
        </div>

        <div className="ga-corpo">
          <section className="ga-palco" aria-label={t('Pose da mão')} data-testid="guia-palco">
            <div className="ga-quadro">
              {receita && dados ? (
                <AvatarSinalizante
                  texto={tocandoPalavra ? palavra.texto : letraValida}
                  alfabeto={alfabeto}
                  receita={receita}
                  tier="fraco"
                  camera="maos"
                  espelhar={prefs.espelhar}
                  tamanho={300}
                  semLegenda
                  avisosPorFora
                  soletrarUmaLetra
                  compacto={false}
                  velocidade={1}
                  {...(tocandoPalavra
                    ? {
                        repetir: palavra.vez,
                        tetoMs: TETO_DA_PALAVRA_MS,
                        aoAtual: setAtual,
                        aoFim: () => setPalavra(null),
                      }
                    : { pausado: true, tempoFixoMs: tempoDaPose })}
                />
              ) : (
                <p className="ga-carregando" role="status">
                  {t('Carregando as mãos…')}
                </p>
              )}
            </div>
            <p className="ga-letra-atual" data-testid="guia-letra-atual">
              <strong aria-hidden="true">{tocandoPalavra ? (atual?.letra ?? '') : letraValida}</strong>
              <span>
                {tocandoPalavra
                  ? t('Soletrando “{palavra}”', { palavra: palavra.texto })
                  : alfabeto === 'libras'
                    ? t('Letra {letra} em Libras', { letra: letraValida })
                    : t('Letra {letra} em ASL', { letra: letraValida })}
              </span>
            </p>
            {tocandoPalavra && letrasDaPalavra.length > 0 && (
              <ol className="letras-palco" data-testid="guia-letras" aria-hidden="true">
                {letrasDaPalavra.map((l, i) => (
                  <li key={`${i}-${l.letra}`} data-estado={l.estado} data-letra={l.letra}>
                    {l.letra}
                  </li>
                ))}
              </ol>
            )}
            {!tocandoPalavra && dadosDaLetra && (
              <p className="ga-detalhe">
                {dadosDaLetra.movimento ? `${t('Letra com movimento: aproximada.')} ` : ''}
                {(FORMA_AUTOAVALIADA[dadosDaLetra.fidelidade] ?? FORMA_AUTOAVALIADA.baixa)!()}
              </p>
            )}
            <button
              type="button"
              className="ga-btn"
              aria-pressed={marcada}
              onClick={alternarMarca}
              disabled={tocandoPalavra}
              data-testid="guia-marcar"
            >
              <Flag aria-hidden />
              {marcada ? t('Desmarcar esta pose') : t('Marcar esta pose como incorreta')}
            </button>
          </section>

          <div className="ga-lado">
            <div
              ref={grade}
              className="ga-grade"
              role="group"
              aria-label={t('Letras e números')}
              data-testid="guia-grade"
            >
              {teclas.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="ga-tecla"
                  data-letra={k}
                  aria-pressed={!tocandoPalavra && k === letraValida}
                  aria-label={/\d/.test(k) ? t('Número {n}', { n: k }) : t('Letra {letra}', { letra: k })}
                  tabIndex={k === letraValida ? 0 : -1}
                  data-marcada={estaMarcada(marcadas, alfabeto, k) ? '' : undefined}
                  onClick={() => escolher(k)}
                  onKeyDown={(e) => naGrade(e, k)}
                  data-testid={`guia-tecla-${k}`}
                >
                  {k}
                </button>
              ))}
            </div>

            <form
              className="ga-palavra"
              onSubmit={(e) => {
                e.preventDefault();
                soletrarPalavra();
              }}
            >
              <label htmlFor="ga-palavra-campo">{t('Soletrar uma palavra')}</label>
              <div className="ga-palavra-linha">
                <input
                  id="ga-palavra-campo"
                  type="text"
                  value={rascunho}
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setRascunho(e.target.value)}
                  data-testid="guia-palavra-campo"
                />
                <button
                  type="submit"
                  className="ga-btn"
                  disabled={!rascunho.trim()}
                  data-testid="guia-palavra-soletrar"
                >
                  {t('Soletrar')}
                </button>
              </div>
            </form>
          </div>
        </div>

        <section className="ga-revisao" aria-label={t('Poses marcadas como incorretas')}>
          <p className="ga-nota" data-testid="guia-marcadas-resumo">
            {marcadas.length === 0
              ? t('Nenhuma pose marcada. A lista fica só neste aparelho e nada é enviado.')
              : t(
                  'Poses marcadas: {n}. A lista fica só neste aparelho; exporte o arquivo para levar a quem revisa as poses.',
                  { n: marcadas.length },
                )}
          </p>
          <div className="ga-acoes">
            <button
              type="button"
              className="ga-btn"
              onClick={exportar}
              disabled={marcadas.length === 0}
              data-testid="guia-exportar"
            >
              <Download aria-hidden />
              {t('Exportar lista (JSON)')}
            </button>
            <button
              type="button"
              className="ga-btn"
              onClick={limpar}
              disabled={marcadas.length === 0}
              data-testid="guia-limpar"
            >
              <Trash2 aria-hidden />
              {t('Apagar a lista')}
            </button>
          </div>
        </section>

        {/* Só a palavra, nunca letra por letra; e os avisos de ação (marcou, exportou). */}
        <p className="sr-only" aria-live="polite" data-testid="guia-anuncio">
          {aviso ?? (tocandoPalavra ? t('Soletrando {palavra}', { palavra: palavra.texto }) : '')}
        </p>
        {aviso && (
          <p className="ga-aviso" aria-hidden="true" data-testid="guia-aviso">
            {aviso}
          </p>
        )}
      </div>
    </div>
  );
}
