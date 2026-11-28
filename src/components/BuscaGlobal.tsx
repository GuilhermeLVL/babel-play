import {
  BookOpen,
  FileAudio,
  FileText,
  Mic,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Target,
  UserRound,
  Youtube,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ContagensDeConteudo } from '../core/learning/contagensDeConteudo';
import { itensDaBuscaAmpliada } from '../core/palavras/buscaAmpliada';
import { FLAG_ESTUDO_PALAVRAS_V2 } from '../core/planos';
import { fetchDeck } from '../data/api';
import { lerContagensDeConteudo } from '../data/rotas/conteudo';
import { conteudoAtual, escolherConteudo } from '../lib/conteudo/loja';
import { edicaoEstatica } from '../lib/edicaoEstatica';
import { useFlag } from '../lib/flags';
import { t } from '../lib/i18n';
import { pedirParaAbrirPalavra } from '../lib/palavras/abrirPalavra';
import { navegarPara } from '../lib/rotas';
import type { Recording, VocabCard } from '../types';
import CommandPalette, { type Command } from './CommandPalette';
import { type AgeProfileType, NAV_ITEMS, navLabel } from './shell/navItems';

/**
 * BUSCA GLOBAL — achar pelo nome, de qualquer tela. É a `itensDaBusca()` do protótipo aprovado.
 *
 * SEM DIGITAR, SUGESTÕES: revisar (só se houver o que revisar), continuar a última sessão, iniciar
 * captura e as primeiras telas. DIGITANDO, GRUPOS: "Ir para", "Palavras", "Gravações", "Ações".
 *
 * O BARALHO SÓ É BUSCADO QUANDO A BUSCA ABRE. `fetchDeck()` traz o baralho inteiro, e pagá-lo no
 * carregamento do app para uma tela que talvez ninguém abra seria trocar o custo de todo mundo pelo
 * benefício de alguns. A primeira abertura tem uma espera curta; as seguintes não têm nenhuma.
 *
 * AS PALAVRAS NÃO SÃO FILTRADAS AQUI. A paleta já casa por `label`, `hint` e `keywords`; mandar as
 * 1.900 e deixar o filtro dela trabalhar evita ter duas regras de busca que podem discordar.
 *
 * Fora do protótipo, de propósito: "Jogar Memória" (o app não tem porta direta para um jogo; "Jogar"
 * está em "Ir para") e a abertura da palavra num diálogo próprio (a palavra leva ao Vocabulário).
 */

/** Com uma consulta, casar em 1.900 palavras é barato; sem ela, ninguém lê uma parede. */
const MAX_PALAVRAS = 400;

const ICONE_DE_MIDIA = {
  audio: <FileAudio />,
  video: <Youtube />,
  document: <FileText />,
} as const;

interface BuscaGlobalProps {
  aberta: boolean;
  aoFechar: () => void;
  recordings: Recording[];
  /** `navigateTo` do App — mesma função que a navegação do shell usa. */
  aoNavegar: (view: string, data?: unknown) => void;
  /** Quantas palavras estão vencidas agora. `null` enquanto as métricas não chegaram. */
  vencidasAgora: number | null;
  /** O tema atual e como trocá-lo — a ação "Mudar para o modo escuro/claro". */
  escuro: boolean;
  aoAlternarTema: () => void;
  /** Os rótulos das telas são os do menu, no perfil da pessoa. */
  perfil: AgeProfileType;
}

export default function BuscaGlobal({
  aberta,
  aoFechar,
  recordings,
  aoNavegar,
  vencidasAgora,
  escuro,
  aoAlternarTema,
  perfil,
}: BuscaGlobalProps) {
  const [baralho, setBaralho] = useState<VocabCard[] | null>(null);
  /* Busca ampliada (flag `estudo_palavras_v2`): ações, baralhos e as telas de dentro de Cartões; a palavra abre na própria lista. */
  const ampliada = useFlag(FLAG_ESTUDO_PALAVRAS_V2);
  const [catalogo, setCatalogo] = useState<ContagensDeConteudo | null>(null);
  useEffect(() => {
    if (!aberta || !ampliada || edicaoEstatica()) return;
    let vivo = true;
    void lerContagensDeConteudo(conteudoAtual().idioma)
      .then((k) => vivo && setCatalogo(k))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [aberta, ampliada]);

  useEffect(() => {
    if (!aberta || baralho) return;
    let vivo = true;
    fetchDeck()
      .then((cards) => {
        if (vivo) setBaralho(cards);
      })
      // Falhar aqui não pode derrubar a busca: as gravações e os destinos continuam achaveis.
      .catch(() => {
        if (vivo) setBaralho([]);
      });
    return () => {
      vivo = false;
    };
  }, [aberta, baralho]);

  const { comandos, sugestoes } = useMemo(() => {
    const telas: Command[] = [
      ...NAV_ITEMS.map(
        (n): Command => ({
          id: `ir:${n.id}`,
          grupo: 'Ir para',
          label: navLabel(n, perfil),
          /* "Planos" com o ícone do protótipo (`telas2.js:143-152`, item D46). */
          icon: n.id === 'planos' ? <Sparkles /> : <n.icon />,
          run: () => aoNavegar(n.id),
        }),
      ),
      { id: 'ir:profile', grupo: 'Ir para', label: 'Seu perfil', icon: <UserRound />, run: () => aoNavegar('profile') },
    ];

    /* Só o que está NO baralho. Um cartão arquivado pela curadoria saiu das rodadas de propósito;
       trazê-lo de volta pela busca desfaria em silêncio uma decisão que a pessoa tomou. A dica é a
       TRADUÇÃO, e só: a contagem de ocorrências vive no servidor e não chega ao `VocabCard`. */
    const palavras: Command[] = (baralho ?? [])
      .filter((c) => c.inDeck)
      .slice(0, MAX_PALAVRAS)
      .map((c) => ({
        id: `palavra:${c.id}`,
        grupo: 'Palavras',
        label: c.word,
        hint: c.translation || undefined,
        icon: <BookOpen />,
        run: () => {
          if (!ampliada) return aoNavegar('metrics');
          pedirParaAbrirPalavra(c.id);
          navegarPara({ view: 'cartoes', cartoesAba: 'palavras' });
        },
      }));

    /* Só com a flag: as ações de estudo, os baralhos e as telas de Cartões (a regra de busca é a do núcleo). */
    const ampliadas: Command[] = !ampliada
      ? []
      : itensDaBuscaAmpliada({ cartoes: [], conteudo: catalogo, traduzir: t }).map(
          (i): Command => ({
            id: `v2:${i.id}`,
            grupo: i.grupo,
            label: i.label,
            hint: i.hint && i.alvo.tipo === 'baralho' ? t('{n} palavras', { n: i.hint }) : undefined,
            keywords: i.keywords,
            icon: i.alvo.tipo === 'baralho' ? <BookOpen /> : i.alvo.tipo === 'acao' ? <Target /> : <Sparkles />,
            run: () => {
              const a = i.alvo;
              if (a.tipo === 'tela') navegarPara({ view: 'cartoes', cartoesAba: a.aba });
              else if (a.tipo === 'baralho') {
                escolherConteudo(a.fonte, conteudoAtual().idioma);
                navegarPara({ view: 'cartoes', cartoesAba: 'hoje' });
              } else if (a.tipo === 'acao') {
                if (a.acao === 'revisar-hoje') aoNavegar('study');
                else if (a.acao === 'revisar-dificeis') {
                  escolherConteudo({ tipo: 'dificeis' });
                  navegarPara({ view: 'cartoes', cartoesAba: 'palavras' });
                } else navegarPara({ view: 'cartoes', cartoesAba: a.acao === 'palavra-nova' ? 'palavras' : 'hoje' });
              }
            },
          }),
        );

    // "Quando · N palavras", como no protótipo; sem contagem, a duração. `date` já vem redigido.
    const gravacoes: Command[] = recordings.map((r) => ({
      id: `sessao:${r.id}`,
      grupo: 'Gravações',
      label: r.title,
      hint: [r.date, r.wordCount ? `${r.wordCount} palavras` : r.durationStr].filter(Boolean).join(' · '),
      keywords: r.tags.join(' '),
      icon: ICONE_DE_MIDIA[r.type],
      run: () => aoNavegar('analysis', { id: r.id }),
    }));

    const revisar: Command = {
      id: 'acao:revisar',
      grupo: 'Ações',
      label: 'Revisar agora',
      // Sem métrica ainda, a linha fica sem promessa — em vez de dizer "nada pendente" e mentir.
      hint: vencidasAgora === null ? undefined : vencidasAgora ? `${vencidasAgora} pendentes` : 'nada pendente',
      icon: <Target />,
      keywords: 'revisão srs vencidas',
      run: () => aoNavegar('study'),
    };
    const capturar: Command = {
      id: 'acao:capturar',
      grupo: 'Ações',
      label: 'Iniciar captura',
      hint: 'áudio do sistema ou microfone',
      icon: <Mic />,
      run: () => aoNavegar('capture'),
    };
    const acoes: Command[] = [
      revisar,
      capturar,
      /* Edição estática: importar é trabalho do servidor, que ela não tem. */
      ...(edicaoEstatica()
        ? []
        : [
            {
              id: 'acao:importar',
              grupo: 'Ações',
              label: 'Importar mídia ou documento',
              hint: 'PDF, web, áudio',
              icon: <Plus />,
              run: () => aoNavegar('library'),
            },
          ]),
      {
        id: 'acao:tema',
        grupo: 'Ações',
        label: escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro',
        hint: 'tema',
        icon: escuro ? <Sun /> : <Moon />,
        run: aoAlternarTema,
      },
    ];

    const ultima = recordings[0];
    const sugestoes: Command[] = [
      ...(vencidasAgora ? [{ ...revisar, id: 'sug:revisar', grupo: 'Sugestões' }] : []),
      ...(ultima
        ? [
            {
              id: 'sug:continuar',
              grupo: 'Sugestões',
              label: `Continuar: ${ultima.title}`,
              hint: 'última sessão',
              icon: ICONE_DE_MIDIA[ultima.type],
              run: () => aoNavegar('analysis', { id: ultima.id }),
            },
          ]
        : []),
      { ...capturar, id: 'sug:capturar', grupo: 'Sugestões' },
      ...telas.slice(0, 5),
      /* `telas2.js:143-152`: "Planos" depois do último item. Não na edição sem servidor, que não tem
         plano a assinar. */
      ...(!edicaoEstatica()
        ? [
            {
              id: 'sug:planos',
              grupo: 'Ir para',
              label: t('Planos'),
              icon: <Sparkles />,
              run: () => aoNavegar('planos'),
            },
          ]
        : []),
    ];

    return { comandos: [...telas, ...palavras, ...gravacoes, ...acoes, ...ampliadas], sugestoes };
  }, [recordings, baralho, aoNavegar, vencidasAgora, escuro, aoAlternarTema, perfil, ampliada, catalogo]);

  return (
    <CommandPalette
      open={aberta}
      onClose={aoFechar}
      commands={comandos}
      sugestoes={sugestoes}
      placeholder="Buscar gravação, palavra ou tela"
    />
  );
}
