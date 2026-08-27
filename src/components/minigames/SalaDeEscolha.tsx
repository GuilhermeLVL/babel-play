import { useEffect, useRef, useState } from 'react';
import { X, Play as IconePlay, Mic, GraduationCap } from 'lucide-react';
import { Segmentado } from '../ui';
import LangPicker from '../LangPicker';
import { langLabelPt } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import type { EscolhaDaPratica, OrigemDaPratica, EscopoDeGravacoes, CefrLevel } from '@core';

/**
 * A SALA DE ESCOLHA — o que você vai jogar, decidido antes de a tela encher de cartas.
 *
 * O DEFEITO QUE ELA CONSERTA. A escolha de fonte vivia num `<details>` recolhido, cujo resumo era
 * "Praticar · Minhas palavras · ajustar" em texto pequeno. Ninguém abria. Quem abria encontrava um
 * seletor de idioma, três botões de fonte e um chevron que revelava uma lista de gravações
 * renderizada FORA do próprio `<details>` — que continuava na tela depois de fechá-lo. E a opção
 * "Trilha" simplesmente não aparecia quando o idioma praticado não era inglês, sem dizer por quê.
 *
 * AQUI A ESCOLHA É A PRIMEIRA COISA QUE ACONTECE, e é binária: as palavras vêm das SUAS GRAVAÇÕES
 * ou da TRILHA. Nada de três fontes em que uma continha a outra — `cartoesDaFonte` agora
 * particiona o baralho de verdade, então a pergunta tem duas respostas exclusivas.
 *
 * UM CLIQUE, NÃO UM FORMULÁRIO. Ela abre com a última escolha já marcada e o foco no botão de
 * jogar: quem não quer mudar nada aperta Enter. Isso é o que permite que ela apareça a cada
 * entrada sem virar pedágio.
 *
 * A TRILHA APARECE SEMPRE, desabilitada com o motivo quando não existe lista para o idioma. Foi
 * exatamente escondê-la que produziu o relato "faltou a parte de dar trilha aqui".
 *
 * `z-[45]`: acima do dock (30) e da camada de pontuação (40); abaixo da ficha "como se joga" (90),
 * do tour (95) e dos avisos (100). Ela nunca coexiste com uma partida — ver o orçamento de camadas
 * documentado em `Play.tsx`.
 */

export interface IdiomaOferecido {
  lang: string;
  total: number;
  jogaveis: number;
}

export interface GravacaoOferecida {
  id: string;
  title: string;
  audioUrl?: string;
}

interface SalaProps {
  escolhaAtual: EscolhaDaPratica;
  idiomas: IdiomaOferecido[];
  gravacoes: GravacaoOferecida[];
  /**
   * A trilha DO IDIOMA CONSULTADO — função, e não valor pronto.
   *
   * Precisa ser função porque a sala pergunta pelo idioma SELECIONADO nela, que ainda não foi
   * aplicado. Com um valor calculado a partir do idioma vigente, escolher "inglês" na sala deixava
   * a Trilha bloqueada dizendo "ainda não existe trilha em português" — o idioma da frase era o
   * antigo, e a pessoa via a opção recusar exatamente o que ela acabou de pedir.
   */
  trilhaDe: (lang: string) => { niveis: CefrLevel[]; total: number };
  ageProfile: AgeProfileType;
  aoConfirmar: (e: EscolhaDaPratica) => void;
  aoFechar: () => void;
}

export default function SalaDeEscolha({
  escolhaAtual, idiomas, gravacoes, trilhaDe, ageProfile, aoConfirmar, aoFechar,
}: SalaProps) {
  const [lang, setLang] = useState(escolhaAtual.lang);
  const [origem, setOrigem] = useState<OrigemDaPratica>(escolhaAtual.origem);
  const [escopo, setEscopo] = useState<EscopoDeGravacoes>(escolhaAtual.escopo);
  const [sessionId, setSessionId] = useState(escolhaAtual.sessionId);
  const [nivel, setNivel] = useState<CefrLevel | undefined>(escolhaAtual.nivel);
  const [trocandoIdioma, setTrocandoIdioma] = useState(false);

  const botaoJogar = useRef<HTMLButtonElement | null>(null);
  const dialogo = useRef<HTMLDivElement | null>(null);

  // Sempre sobre o idioma SELECIONADO — ver o docblock de `trilhaDe`.
  const { niveis: niveisDaTrilha, total: totalDaTrilha } = trilhaDe(lang);
  const temTrilha = niveisDaTrilha.length > 0;

  /**
   * O IDIOMA CHEGA DEPOIS — a sala abre antes de o servidor responder.
   *
   * `fonte.lang` nasce vazio e só é preenchido quando `fetchLangConfig` + `fetchSettings` voltam.
   * Como a sala é montada fora da cascata de carregamento (de propósito: esperar o baralho faria a
   * tela saltar logo na entrada), ela abriria com idioma vazio — e aí nenhum idioma casaria,
   * "Minhas gravações" mostraria 0 e o rodapé anunciaria "não tem palavras prontas" sobre um
   * baralho cheio. Foi o que aconteceu na primeira medição.
   *
   * A sincronia só acontece enquanto o valor local está VAZIO. Depois disso a sala é dona do seu
   * estado: uma prop que chegasse atrasada não pode desfazer o idioma que a pessoa acabou de
   * escolher.
   */
  useEffect(() => {
    if (!lang && escolhaAtual.lang) setLang(escolhaAtual.lang);
  }, [escolhaAtual.lang, lang]);

  /* Trocar de idioma pode tirar a trilha do mapa (só existe lista para inglês). Voltar para as
     gravações é melhor que deixar selecionada uma fonte que acabou de deixar de existir. */
  useEffect(() => {
    if (origem === 'trilha' && !temTrilha) setOrigem('gravacoes');
  }, [temTrilha, origem]);

  /**
   * Foco inicial no botão que a maioria vai apertar. `preventScroll` não é detalhe: sem ele o
   * navegador rola o diálogo para dentro da vista e esconde as linhas de cima — o mesmo cuidado
   * está documentado em `ComoSeJoga`.
   */
  useEffect(() => {
    botaoJogar.current?.focus({ preventScroll: true });
  }, []);

  // Esc fecha. Sem isto, um diálogo que aparece a cada entrada vira armadilha para quem usa teclado.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  /**
   * Armadilha de foco. `ComoSeJoga` não tem, e passa — é uma ficha de leitura. Esta sala tem seis
   * grupos de controle e decide o que a próxima rodada vai ser: tabular para fora dela deixaria a
   * pessoa mexendo na tela de trás sem ver o que está tocando.
   */
  function aoTabular(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focaveis = dialogo.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focaveis?.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  }

  const doIdioma = idiomas.find(i => i.lang === lang);
  /* O número do rodapé é o que a escolha ATUAL oferece — não um total genérico. É a única forma de
     a pessoa perceber, antes de confirmar, que escolheu um recorte vazio. */
  const quantasPromete = origem === 'trilha' ? totalDaTrilha : (doIdioma?.jogaveis ?? 0);

  const gravacaoEscolhida = gravacoes.find(g => g.id === sessionId);

  function confirmar() {
    aoConfirmar({ origem, escopo, lang, sessionId, nivel });
  }

  return (
    /* ANCORADA NO TOPO, e não centrada. A sala abre na primeira pintura e cresce três vezes
       enquanto os dados chegam (chips de idioma com o baralho, lista de gravações com as sessões,
       rodapé com o idioma). Centrada, cada crescimento empurrava METADE dele para cima e movia
       tudo o que já estava pintado, medido em CLS 0,364 no Jogar (achado F0-02). Presa no topo,
       o crescimento só desce o que vem abaixo dele. */
    <div
      className="fixed inset-0 z-[45] flex items-start justify-center p-4 pt-[6vh] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sala-titulo"
        onKeyDown={aoTabular}
        className="w-full max-w-xl card-panel bg-surface shadow-card max-h-[86vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200"
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-border-subtle">
          <div className="min-w-0">
            <p className="label-mono text-accent-ink">Antes de jogar</p>
            <h2 id="sala-titulo" className="font-display font-black text-xl text-ink tracking-tight">
              {ageProfile === 'kids' ? 'Com o que você quer jogar?' : 'O que você vai praticar'}
            </h2>
          </div>
          <button
            onClick={aoFechar}
            className="shrink-0 p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover cursor-pointer"
            aria-label="Fechar sem mudar nada"
            title="Fechar sem mudar nada"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-5">

          {/* ── IDIOMA ──────────────────────────────────────────────────────────────────────
              A contagem é de palavras JOGÁVEIS, não do que está guardado. Antes dava para
              escolher um idioma com centenas de cartões e cair numa tela sem jogo nenhum,
              porque nenhum deles tinha tradução. */}
          <section>
            <p className="label-mono mb-2">Idioma</p>
            {/* A altura de UMA fileira de pílulas fica reservada: os chips só existem depois de
                `fetchDeck` voltar, e sem a reserva a chegada deles empurrava o resto do diálogo. */}
            <div className="min-h-[30px]">
            {idiomas.length > 0 ? (
              <Segmentado
                rotuloDoGrupo="Idioma que você vai praticar"
                valor={[lang]}
                aoTrocar={(l) => { setLang(l); setNivel(undefined); }}
                opcoes={idiomas.map(i => ({
                  id: i.lang,
                  rotulo: langLabelPt(i.lang),
                  contagem: i.jogaveis,
                  dica: `${i.jogaveis} prontas para jogo de par, de ${i.total} no idioma`,
                  motivoBloqueio: i.jogaveis === 0
                    ? `você tem ${i.total} palavras neste idioma, mas nenhuma com tradução, sem ela os jogos de par não montam`
                    : undefined,
                }))}
              />
            ) : (
              <p className="text-[13px] text-ink-muted">Ainda não há palavras no seu caderno.</p>
            )}
            </div>

            {/* A saída para quem quer um idioma que o baralho ainda não tem. Sem ela, a lista
                fechada viraria uma prisão para quem está começando. */}
            <button
              onClick={() => setTrocandoIdioma(v => !v)}
              className="text-[12px] text-ink-muted hover:text-accent-ink underline decoration-dotted underline-offset-4 mt-2 cursor-pointer min-h-6 inline-flex items-center"
            >
              {trocandoIdioma ? 'esconder a lista completa' : 'escolher outro idioma'}
            </button>
            {trocandoIdioma && (
              <div className="mt-2">
                <LangPicker
                  id="sala-idioma"
                  ariaLabel="Escolher outro idioma"
                  block
                  value={lang}
                  onPick={({ code }) => { if (code) { setLang(code); setNivel(undefined); setTrocandoIdioma(false); } }}
                />
              </div>
            )}
          </section>

          {/* ── DE ONDE ─────────────────────────────────────────────────────────────────────
              Binário e exclusivo. A trilha aparece SEMPRE: quando não há lista para o idioma
              ela vem desabilitada com o motivo, porque escondê-la é o que fez a trilha parecer
              inexistente. */}
          <section>
            <p className="label-mono mb-2">De onde vêm as palavras</p>
            <Segmentado
              rotuloDoGrupo="De onde vêm as palavras"
              variante="chip"
              valor={[origem]}
              aoTrocar={(o) => setOrigem(o as OrigemDaPratica)}
              opcoes={[
                {
                  id: 'gravacoes',
                  rotulo: ageProfile === 'kids' ? 'O que eu gravei' : 'Minhas gravações',
                  icone: <Mic className="w-3.5 h-3.5" aria-hidden />,
                  contagem: doIdioma?.jogaveis ?? 0,
                  tom: 'accent',
                },
                {
                  id: 'trilha',
                  rotulo: 'Trilha',
                  icone: <GraduationCap className="w-3.5 h-3.5" aria-hidden />,
                  contagem: temTrilha ? totalDaTrilha : undefined,
                  tom: 'good',
                  motivoBloqueio: temTrilha ? undefined : `ainda não existe trilha em ${langLabelPt(lang)}`,
                },
              ]}
            />
          </section>

          {/* ── A SUB-ESCOLHA, só do lado escolhido ───────────────────────────────────────── */}
          {origem === 'gravacoes' ? (
            <section>
              <p className="label-mono mb-2">Quais gravações</p>
              <Segmentado
                rotuloDoGrupo="Quais gravações entram"
                valor={[escopo]}
                aoTrocar={(e) => setEscopo(e as EscopoDeGravacoes)}
                opcoes={[
                  { id: 'todas', rotulo: 'Todas as gravações' },
                  {
                    id: 'uma',
                    rotulo: 'Uma gravação',
                    motivoBloqueio: gravacoes.length ? undefined : 'você ainda não tem gravações salvas',
                  },
                ]}
              />

              {/* Espaço reservado para duas linhas: a lista chega com `fetchSessions`, depois da
                  primeira pintura, e sem a reserva ela empurrava o rodapé inteiro para baixo. */}
              {escopo === 'uma' && (
                <div className="mt-2 min-h-[76px]">
                {gravacoes.length > 0 && (
                <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {gravacoes.map(g => (
                    <li key={g.id}>
                      <button
                        onClick={() => setSessionId(g.id)}
                        aria-pressed={sessionId === g.id}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] cursor-pointer flex items-center gap-2 ${
                          sessionId === g.id ? 'bg-accent-soft text-accent-ink font-bold' : 'text-ink hover:bg-surface-hover'
                        }`}
                        title={g.title}
                      >
                        <span className="truncate flex-1">{g.title}</span>
                        {/* Sem áudio, três jogos ficam de fora. Dizer ANTES evita a escolha que
                            leva a cartas bloqueadas. */}
                        {!g.audioUrl && <span className="badge-tag shrink-0">sem áudio</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                )}
                </div>
              )}
            </section>
          ) : (
            <section>
              <p className="label-mono mb-2">Nível da trilha</p>
              <Segmentado
                rotuloDoGrupo="Nível da trilha"
                valor={nivel ? [nivel] : []}
                aoTrocar={(n) => setNivel(n as CefrLevel)}
                opcoes={niveisDaTrilha.map(n => ({ id: n, rotulo: n }))}
              />
              {!nivel && (
                <p className="text-[11.5px] text-ink-faint mt-2">
                  Sem escolher, a trilha joga com todos os níveis de uma vez.
                </p>
              )}
            </section>
          )}
        </div>

        {/* ── O RODAPÉ: o que a escolha promete, e o único clique necessário. ──────────────── */}
        {/* SEM `flex-wrap`: a frase de aviso ("não tem palavras prontas") é longa e empurrava o
            botão para a linha de baixo; quando a contagem chegava, ela encolhia e os dois voltavam
            para a mesma linha, o botão subia 31px com o diálogo já pintado. Numa linha só, o
            rodapé tem a altura do botão nos dois estados. */}
        <footer className="flex items-center justify-between gap-3 p-5 border-t border-border-subtle">
          <p className="text-[12.5px] text-ink-muted min-w-0">
            {quantasPromete > 0 ? (
              <>
                <b className="text-ink">{quantasPromete.toLocaleString('pt-BR')}</b>{' '}
                {quantasPromete === 1 ? 'palavra pronta' : 'palavras prontas'}
                {origem === 'gravacoes' && escopo === 'uma' && gravacaoEscolhida && (
                  <span className="text-ink-faint"> · {gravacaoEscolhida.title}</span>
                )}
              </>
            ) : (
              /* Recorte vazio é dito ANTES de confirmar. Deixar a pessoa entrar e encontrar nove
                 cartas cinzas é o atrito que esta sala existe para eliminar. */
              <span className="text-warn-ink">Esta escolha não tem palavras prontas ainda.</span>
            )}
          </p>

          <button ref={botaoJogar} onClick={confirmar} className="btn-solid py-3 px-6">
            <IconePlay className="w-4 h-4" aria-hidden />
            {ageProfile === 'kids' ? 'Bora!' : 'Jogar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
