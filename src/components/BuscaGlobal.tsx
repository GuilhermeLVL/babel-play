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

import { fetchDeck } from '../data/api';
import { useQuestNovo } from '../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../lib/edicaoEstatica';
import { t } from '../lib/i18n';
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
  /* DESENHO NOVO: "Planos" entra nas sugestões, com o ícone do protótipo (`telas2.js:143-152`, item D46). */
  const questNovo = useQuestNovo();

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
          icon: questNovo && n.id === 'planos' ? <Sparkles /> : <n.icon />,
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
        run: () => aoNavegar('metrics'),
      }));

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
              hint: 'YouTube, PDF, web, áudio',
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
      ...(questNovo && !edicaoEstatica()
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

    return { comandos: [...telas, ...palavras, ...gravacoes, ...acoes], sugestoes };
  }, [recordings, baralho, aoNavegar, vencidasAgora, escuro, aoAlternarTema, perfil, questNovo]);

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
