import {
  ArrowLeftRight,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Ellipsis,
  ExternalLink,
  Gauge,
  Layers,
  type LucideIcon,
  Minus,
  Pause,
  PenLine,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { diasAPartirDeAmanha, semanaComTeto } from '../../../lib/cartoes/estadoDeHoje';
import { numero, t, tp } from '../../../lib/i18n';
import { anima, MOLA_SUAVE, polido, reduz } from '../../../lib/polimento/base';
import { sentir } from '../../../lib/polimento/sentidos';
import type { OpcoesDaRevisao } from '../../../lib/revisao/preferencias';
import {
  Escolha,
  type OrdemDoQuest,
  Passo,
  type ProducaoAtivaNoQuest,
  type TipoDeCartaoDoQuest,
} from '../revisao/quest/RevisaoDoQuest';
import { diaCurto, fecharAFolhaDe, FolhaDeCartoes, type LinhaDeMenu, LinhasDeMenu } from './pecas';

/**
 * AS FOLHAS DA TELA CARTÕES — porte de `ctAbrirMenu`, `ctAbrirAjustes`/`ctHtmlDosAjustes`, `ctAbrirResto`
 * e `ctAbrirMenuDoBaralho` (`cartoes.js:804-857, 986-1009, 1166-1218` do protótipo enxuto). Todas no
 * molde `ctDlg`: painel no computador, folha que sobe no celular.
 *
 * O que o protótipo mostra e o app não cumpre NÃO vira botão: "Compartilhar por link", as opções por
 * baralho (novas por dia do baralho, prioridade, mapa, curadoria), "Espalhar pelos próximos 7 dias" e
 * "Adiar as que aguentam esperar" (pedem reagendamento no servidor), os passos de aprendizagem, os dias
 * leves e "Otimizar para a minha memória".
 */

/**
 * Uma folha de menu em que a linha FECHA a folha e só então age (abre a folha seguinte ou leva a outra
 * tela): dois diálogos modais não se empilham, e o foco volta para quem abriu antes de seguir.
 */
function useFecharEAgir(aoFechar: () => void) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  return {
    dialogo,
    ir: (acao: () => void) => () => {
      depois.current = acao;
      dialogo.current?.close();
    },
    aoFechar: () => {
      aoFechar();
      const f = depois.current;
      depois.current = null;
      f?.();
    },
  };
}

/** O "…" do cabeçalho (`ctAbrirMenu`, `cartoes.js:986-1009`). */
export function MenuDeCartoes({
  opcoes,
  fonte,
  aoPalavraNova,
  aoTrazerELevar,
  aoAjustes,
  aoMemoria,
  aoExportar,
  aoFechar,
}: {
  opcoes: Pick<OpcoesDaRevisao, 'retencao' | 'novas' | 'revisoes'>;
  /** A fonte da ficha, quando é uma sessão, um baralho do Anki ou a Trilha: "Opções de …". */
  fonte?: { Icone: LucideIcon; nome: string; detalhe: string; acao: () => void } | null;
  /** Ausentes sem conta: não há palavra para criar, trazer nem levar. */
  aoPalavraNova?: () => void;
  aoTrazerELevar?: () => void;
  aoAjustes: () => void;
  aoMemoria: () => void;
  aoExportar?: () => void;
  aoFechar: () => void;
}) {
  const folha = useFecharEAgir(aoFechar);
  const linhas: Array<LinhaDeMenu | false | null | undefined> = [
    aoPalavraNova && {
      chave: 'nova',
      Icone: Plus,
      titulo: t('Palavra nova'),
      detalhe: t('Uma de cada vez, com a frase se quiser'),
      acao: folha.ir(aoPalavraNova),
    },
    aoTrazerELevar && {
      chave: 'trazer',
      Icone: ArrowLeftRight,
      titulo: t('Trazer e levar'),
      detalhe: t('Arquivo do Anki e exportar'),
      acao: folha.ir(aoTrazerELevar),
    },
    fonte && {
      chave: 'conteudo',
      Icone: fonte.Icone,
      titulo: t('Opções de {nome}', { nome: fonte.nome }),
      detalhe: fonte.detalhe,
      acao: folha.ir(fonte.acao),
    },
    {
      chave: 'ajustes',
      Icone: SlidersHorizontal,
      titulo: t('Ajustes da memória'),
      detalhe: t('Meta de {retencao}%, {novas} novas e {revisoes} revisões por dia', {
        retencao: opcoes.retencao,
        novas: opcoes.novas,
        revisoes: opcoes.revisoes,
      }),
      acao: folha.ir(aoAjustes),
    },
    {
      chave: 'memoria',
      Icone: Brain,
      titulo: t('Memória'),
      detalhe: t('Sequência, retenção, previsão e calendário'),
      acao: folha.ir(aoMemoria),
    },
    aoExportar && {
      chave: 'exportar',
      Icone: Download,
      titulo: t('Exportar'),
      detalhe: t('De volta ao Anki, planilha ou texto'),
      acao: folha.ir(aoExportar),
    },
  ];
  return (
    <FolhaDeCartoes
      Icone={Ellipsis}
      titulo={t('Mais opções')}
      classe="ct-menu"
      refDialogo={folha.dialogo}
      aoFechar={folha.aoFechar}
    >
      <LinhasDeMenu linhas={linhas} fim={ChevronRight} />
    </FolhaDeCartoes>
  );
}

/**
 * O "…" DE UMA FONTE (`ctAbrirMenuDoBaralho`, `cartoes.js:1201-1218`): o que não é de todo dia. Abre pelo
 * painel da fonte no catálogo e pelo "…" do cabeçalho ("Opções de …"). É aqui que continua o que só
 * existia na aba Baralhos: abrir a sessão, ativar mais notas, gerenciar (e apagar) o baralho do Anki e
 * exportar só este conteúdo.
 */
export function MenuDaFonte({
  Icone,
  nome,
  aoAbrirASessao,
  ativar,
  aoGerenciar,
  aoExportar,
  aoFechar,
}: {
  Icone: LucideIcon;
  nome: string;
  aoAbrirASessao?: () => void;
  /** Baralho do Anki com notas ainda guardadas: quantas dá para ativar agora e o que já entrou. */
  ativar?: { quantas: number; ativas: number; total: number; acao: () => void } | null;
  /** Baralho do Anki: a tela de gerenciar (notas, desativar, apagar). */
  aoGerenciar?: () => void;
  aoExportar?: () => void;
  aoFechar: () => void;
}) {
  const folha = useFecharEAgir(aoFechar);
  return (
    <FolhaDeCartoes
      Icone={Icone}
      titulo={nome}
      classe="ct-menu ct-menu-da-fonte"
      refDialogo={folha.dialogo}
      aoFechar={folha.aoFechar}
    >
      <LinhasDeMenu
        fim={ChevronRight}
        linhas={[
          aoAbrirASessao && {
            chave: 'sessao',
            Icone: ExternalLink,
            titulo: t('Abrir a sessão'),
            detalhe: t('A legenda, a leitura e os jogos dela'),
            acao: folha.ir(aoAbrirASessao),
          },
          ativar &&
            ativar.quantas > 0 && {
              chave: 'ativar',
              Icone: Plus,
              titulo: t('Ativar mais {n}', { n: ativar.quantas }),
              detalhe: t('{ativas} de {total} já ativadas', {
                ativas: numero(ativar.ativas),
                total: numero(ativar.total),
              }),
              acao: folha.ir(ativar.acao),
            },
          aoGerenciar && {
            chave: 'gerenciar',
            Icone: SlidersHorizontal,
            titulo: t('Gerenciar'),
            detalhe: t('As notas do baralho, desativar e apagar'),
            acao: folha.ir(aoGerenciar),
          },
          aoExportar && {
            chave: 'exportar',
            Icone: Download,
            titulo: t('Exportar'),
            detalhe: t('De volta ao Anki, planilha ou texto: só este conteúdo'),
            acao: folha.ir(aoExportar),
          },
        ]}
      />
    </FolhaDeCartoes>
  );
}

/**
 * AJUSTES DA MEMÓRIA, NUMA FOLHA SÓ (`ctAbrirAjustes` e `ctHtmlDosAjustes`, `cartoes.js:804-857`): os três
 * que quase todo mundo mexe ficam à vista; o resto, atrás de "Mais ajustes".
 *
 * Os valores são as opções da revisão do app (`lib/revisao/preferencias`): ficam neste navegador e os
 * dois limites valem por rodada.
 */
export function AjustesDaMemoria({
  valores,
  padrao,
  temVoz,
  producao,
  aoTrocar,
  aoFechar,
}: {
  valores: OpcoesDaRevisao;
  padrao: OpcoesDaRevisao;
  /** Há voz para o idioma estudado neste aparelho? Sem ela, "ouvir ao mostrar" diz o motivo. */
  temVoz: boolean;
  producao?: ProducaoAtivaNoQuest;
  aoTrocar: (v: Partial<OpcoesDaRevisao>) => void;
  aoFechar: () => void;
}) {
  const [mais, setMais] = useState(false);
  const corpoDeMais = useRef<HTMLDivElement>(null);
  const abrirMais = () => {
    sentir('aba');
    setMais((v) => !v);
    if (mais || !polido() || reduz()) return;
    requestAnimationFrame(() =>
      corpoDeMais.current?.querySelectorAll(':scope > *').forEach((x, i) =>
        anima(
          x,
          [
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { d: 340, atraso: Math.min(i, 10) * 35 },
        ),
      ),
    );
  };
  const descricaoDoTipo: Record<TipoDeCartaoDoQuest, string> = {
    lembrar: t('Você pensa e mostra a resposta.'),
    digitar: t('Você escreve a tradução.'),
    escolha: t('Quatro alternativas.'),
  };
  return (
    <FolhaDeCartoes
      Icone={SlidersHorizontal}
      titulo={t('Ajustes da memória')}
      sub={t('Valem para todas as rodadas. A agenda é do FSRS.')}
      classe="ct-ajustes"
      aoFechar={aoFechar}
      pe={
        <button type="button" className="q-ctl pri" onClick={(e) => fecharAFolhaDe(e.currentTarget)}>
          <Check aria-hidden /> {t('Pronto')}
        </button>
      }
    >
      <div className="q-ajuste">
        <div>
          <b>{t('Meta de retenção · {n}%', { n: valores.retencao })}</b>
          <small>
            {valores.retencao > 93
              ? t('Acima de 90% a carga sobe forte; 90% é o que o método recomenda.')
              : t('Mais alta = palavras voltam mais cedo, mais revisões por dia.')}
          </small>
        </div>
        <span className="qr-passo">
          <button
            type="button"
            className="q-ctl"
            aria-label={t('Diminuir: {rotulo}', { rotulo: t('Meta de retenção') })}
            disabled={valores.retencao <= 80}
            onClick={() => aoTrocar({ retencao: Math.max(80, valores.retencao - 1) })}
          >
            <Minus aria-hidden />
          </button>
          <input
            type="range"
            min={80}
            max={97}
            value={valores.retencao}
            aria-label={t('Meta de retenção')}
            onChange={(e) => aoTrocar({ retencao: Number(e.target.value) })}
          />
          <button
            type="button"
            className="q-ctl"
            aria-label={t('Aumentar: {rotulo}', { rotulo: t('Meta de retenção') })}
            disabled={valores.retencao >= 97}
            onClick={() => aoTrocar({ retencao: Math.min(97, valores.retencao + 1) })}
          >
            <Plus aria-hidden />
          </button>
        </span>
      </div>
      <div className="q-ajuste">
        <div>
          <b>{t('Novas por dia')}</b>
          <small>{t('Quantas palavras nunca vistas entram por dia.')}</small>
        </div>
        <Passo
          rotulo={t('Novas por dia')}
          valor={valores.novas}
          min={0}
          max={200}
          passo={5}
          aoTrocar={(novas) => aoTrocar({ novas })}
        />
      </div>
      <div className="q-ajuste">
        <div>
          <b>{t('Revisões por dia')}</b>
          <small>{t('Um teto para dias de atraso; o resto fica para amanhã.')}</small>
        </div>
        <Passo
          rotulo={t('Revisões por dia')}
          valor={valores.revisoes}
          min={10}
          max={999}
          passo={10}
          aoTrocar={(revisoes) => aoTrocar({ revisoes })}
        />
      </div>
      <button type="button" className="q-linha ct-mais-ajustes" aria-expanded={mais} onClick={abrirMais}>
        <span className="q-ic" aria-hidden>
          <Settings2 />
        </span>
        <span>
          <b>{t('Mais ajustes')}</b>
          <small>{t('Botões de resposta, tipo de cartão, ordem e ouvir ao mostrar')}</small>
        </span>
        <span className="q-fim" aria-hidden>
          <ChevronDown />
        </span>
      </button>
      {mais && (
        <div className="ct-ajustes-mais" ref={corpoDeMais}>
          <div className="q-ajuste">
            <div>
              <b>{t('Botões de resposta')}</b>
              <small>
                {valores.botoes === 2 ? t('Esqueci e Lembrei: gravam Errei e Bom.') : t('Errei, Difícil, Bom e Fácil.')}
              </small>
            </div>
            <Escolha<'2' | '4'>
              rotulo={t('Botões de resposta')}
              atual={String(valores.botoes) as '2' | '4'}
              aoTrocar={(v) => aoTrocar({ botoes: v === '2' ? 2 : 4 })}
              opcoes={[
                ['4', t('Quatro')],
                ['2', t('Dois')],
              ]}
            />
          </div>
          <div className="q-ajuste">
            <div>
              <b>{t('Tipo de cartão')}</b>
              <small>{descricaoDoTipo[valores.tipo]}</small>
            </div>
            <Escolha<TipoDeCartaoDoQuest>
              rotulo={t('Tipo de cartão')}
              atual={valores.tipo}
              aoTrocar={(tipo) => aoTrocar({ tipo })}
              opcoes={[
                ['lembrar', t('Lembrar')],
                ['digitar', t('Digitar')],
                ['escolha', t('Escolher')],
              ]}
            />
          </div>
          <div className="q-ajuste">
            <div>
              <b>{t('Ordem')}</b>
            </div>
            <Escolha<OrdemDoQuest>
              rotulo={t('Ordem')}
              atual={valores.ordem}
              aoTrocar={(ordem) => aoTrocar({ ordem })}
              opcoes={[
                ['vencidas', t('Vencidas primeiro')],
                ['misturar', t('Misturar')],
              ]}
            />
          </div>
          <div className="q-ajuste">
            <div>
              <b>{t('Ouvir a palavra ao mostrar')}</b>
              {!temVoz && <small>{t('Este aparelho não tem voz para o idioma que você estuda.')}</small>}
            </div>
            <button
              type="button"
              className="q-interruptor"
              role="switch"
              aria-checked={valores.ouvir}
              aria-label={t('Ouvir a palavra ao mostrar')}
              onClick={() => aoTrocar({ ouvir: !valores.ouvir })}
            />
          </div>
          {/* Não é um ajuste: é o outro exercício da revisão, que no computador só abre pelo teclado. */}
          {producao && (
            <div className="q-ajuste" data-testid="producao-ativa-nas-opcoes">
              <div>
                <b>{producao.rotulo}</b>
                <small>{producao.bloqueio ?? producao.dica}</small>
              </div>
              <button
                type="button"
                className="q-ctl"
                disabled={!!producao.bloqueio}
                onClick={(e) => {
                  fecharAFolhaDe(e.currentTarget);
                  producao.aoComecar();
                }}
              >
                <PenLine aria-hidden /> {t('Começar')}
              </button>
            </div>
          )}
          <div className="q-acoes ct-pe-dos-ajustes">
            <button type="button" className="q-ctl" onClick={() => aoTrocar({ ...padrao })}>
              <RotateCcw aria-hidden /> {t('Voltar ao padrão')}
            </button>
          </div>
        </div>
      )}
    </FolhaDeCartoes>
  );
}

/** A carga de 7 dias, em miniatura (`ctMini7`, `cartoes.js:516`). */
function Mini7({ valores, dias, rotulo }: { valores: number[]; dias: string[]; rotulo: string }) {
  const maior = Math.max(1, ...valores);
  return (
    <span
      className="ct-mini7"
      role="img"
      aria-label={`${rotulo}: ${valores.map((x, i) => `${dias[i]} ${x}`).join(', ')}`}
    >
      {valores.map((x, i) => (
        <span key={i} className={`ct-m7c ${i === 0 ? 'amanha' : ''}`}>
          <b>{x}</b>
          <i style={{ ['--h' as string]: (x / maior).toFixed(3) }} />
          <small>{dias[i]}</small>
        </span>
      ))}
    </span>
  );
}

/**
 * "E O RESTO?" (`ctAbrirResto`, `cartoes.js:1166-1198`): as saídas da pilha acumulada, fora da tela.
 *
 * Das quatro saídas do protótipo o app cumpre duas, com as opções da revisão que já existem: o teto de
 * revisões (o que passa dele espera) e ficar sem palavras novas. "Como fica a semana" é a previsão do
 * resumo passada pelo teto; só aparece quando a previsão é a do conteúdo escolhido.
 */
export function FolhaDoResto({
  opcoes,
  vencem,
  previsao,
  inicioDoDia,
  aoTrocar,
  aoFechar,
}: {
  opcoes: Pick<OpcoesDaRevisao, 'novas' | 'revisoes'>;
  /** Quantos cartões esperam agora. */
  vencem: number;
  /** A previsão do resumo (o índice 0 é hoje), ou `null` quando ela não é a do conteúdo escolhido. */
  previsao: readonly number[] | null;
  inicioDoDia: number;
  aoTrocar: (v: Partial<OpcoesDaRevisao>) => void;
  aoFechar: () => void;
}) {
  /* O limite de novas de antes de "Sem palavras novas": desligar a saída devolve o que estava. */
  const [novasDeAntes] = useState(() => opcoes.novas || 20);
  const semNovas = opcoes.novas === 0;
  const grafico = useRef<HTMLDivElement>(null);
  const crescer = () => {
    if (!polido() || reduz()) return;
    requestAnimationFrame(() =>
      grafico.current?.querySelectorAll('.ct-mini7 i').forEach((x, i) =>
        anima(x, [{ transform: 'scaleY(0.2)' }, { transform: 'scaleY(1)' }], {
          d: 480,
          atraso: i * 35,
          e: MOLA_SUAVE,
        }),
      ),
    );
  };
  const escolher = (qual: 'teto' | 'semnovas') => {
    if ((qual === 'semnovas') === semNovas) return;
    sentir('aba');
    aoTrocar({ novas: qual === 'semnovas' ? 0 : novasDeAntes });
    crescer();
  };
  const saidas: Array<['teto' | 'semnovas', LucideIcon, string, string]> = [
    [
      'teto',
      Gauge,
      t('Só {n} por dia', { n: opcoes.revisoes }),
      t('Estuda até {n} revisões agora e o resto espera, sem virar dívida.', { n: opcoes.revisoes }),
    ],
    ['semnovas', Pause, t('Sem palavras novas'), t('Nenhuma palavra nova entra na rodada até você religar aqui.')],
  ];
  const dias = diasAPartirDeAmanha(inicioDoDia, 7).map(diaCurto);
  return (
    <FolhaDeCartoes
      Icone={Layers}
      titulo={t('E o resto?')}
      sub={tp(
        vencem,
        '{n} cartão espera. Escolha uma saída; dá para mudar amanhã.',
        '{n} cartões esperam. Escolha uma saída; dá para mudar amanhã.',
        { n: numero(vencem) },
      )}
      classe="ct-resto-folha"
      aoFechar={aoFechar}
      pe={
        <button type="button" className="q-ctl pri" onClick={(e) => fecharAFolhaDe(e.currentTarget)}>
          <Check aria-hidden /> {t('Pronto')}
        </button>
      }
    >
      <div className="q-ajuste">
        <div>
          <b>{t('Limite de hoje')}</b>
          <small>{t('Quantas revisões cabem numa rodada.')}</small>
        </div>
        <Passo
          rotulo={t('Limite de hoje')}
          valor={opcoes.revisoes}
          min={10}
          max={999}
          passo={10}
          aoTrocar={(revisoes) => {
            aoTrocar({ revisoes });
            crescer();
          }}
        />
      </div>
      <div className="q-lista ct-saidas" role="radiogroup" aria-label={t('O que fazer com o resto')}>
        {saidas.map(([chave, Icone, titulo, detalhe]) => (
          <button
            key={chave}
            type="button"
            className="q-linha"
            role="radio"
            aria-checked={(chave === 'semnovas') === semNovas}
            data-ct-pilha={chave}
            onClick={() => escolher(chave)}
          >
            <span className="q-ic" aria-hidden>
              <Icone />
            </span>
            <span>
              <b>{titulo}</b>
              <small>{detalhe}</small>
            </span>
            <span className="q-fim ct-marcado" aria-hidden>
              <Check />
            </span>
          </button>
        ))}
      </div>
      {previsao && (
        <div className="q-cartao fundo ct-semana-do-resto" ref={grafico}>
          <p className="q-rotulo">{t('Como fica a semana')}</p>
          <Mini7 valores={semanaComTeto(previsao, opcoes.revisoes)} dias={dias} rotulo={t('Como fica a semana')} />
        </div>
      )}
    </FolhaDeCartoes>
  );
}
