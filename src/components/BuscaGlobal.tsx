import { useEffect, useMemo, useState } from 'react';
import { Mic, BookOpen, Headphones, Video, FileText, LayoutGrid, Gamepad2, Library, BarChart3, Settings as SettingsIcon, Timer } from 'lucide-react';
import CommandPalette, { type Command } from './CommandPalette';
import { fetchDeck } from '../data/api';
import type { Recording, VocabCard } from '../types';

/**
 * BUSCA GLOBAL — achar pelo nome, de qualquer tela.
 *
 * O DEFEITO QUE ISTO CONSERTA. A paleta de comandos existia desde a Central de Exercícios e resolvia
 * bem o problema de "encontrar as funcionalidades" — mas só dentro do Study. Em qualquer outra tela
 * o ⌘K não fazia nada, e achar uma gravação de três semanas atrás exigia ir à Biblioteca, escolher a
 * categoria certa e rolar. O componente genérico já estava pronto; faltava alguém montá-lo por cima
 * do app inteiro.
 *
 * O BARALHO SÓ É BUSCADO QUANDO A BUSCA ABRE. `fetchDeck()` traz o baralho inteiro, e pagá-lo no
 * carregamento do app para uma tela que talvez ninguém abra seria trocar o custo de todo mundo pelo
 * benefício de alguns. A primeira abertura tem uma espera curta; as seguintes não têm nenhuma.
 *
 * AS PALAVRAS NÃO SÃO FILTRADAS AQUI. A paleta já casa por `label`, `hint` e `keywords`; mandar as
 * 1.900 e deixar o filtro dela trabalhar evita ter duas regras de busca que podem discordar. O teto
 * de `MAX_PALAVRAS` existe só para a lista inicial (sem consulta) não virar uma parede.
 */

/** Sem consulta digitada, mostrar mil palavras não ajuda ninguém a escolher. */
const MAX_PALAVRAS = 400;

const ICONE_DE_MIDIA = {
  audio: <Headphones className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  document: <FileText className="w-4 h-4" />,
} as const;

interface BuscaGlobalProps {
  aberta: boolean;
  aoFechar: () => void;
  recordings: Recording[];
  /** `navigateTo` do App — mesma função que a navegação do shell usa. */
  aoNavegar: (view: string, data?: unknown) => void;
  /** Quantas palavras estão vencidas agora. `null` enquanto as métricas não chegaram. */
  vencidasAgora: number | null;
}

export default function BuscaGlobal({
  aberta,
  aoFechar,
  recordings,
  aoNavegar,
  vencidasAgora,
}: BuscaGlobalProps) {
  const [baralho, setBaralho] = useState<VocabCard[] | null>(null);

  useEffect(() => {
    if (!aberta || baralho) return;
    let vivo = true;
    fetchDeck()
      .then((cards) => { if (vivo) setBaralho(cards); })
      // Falhar aqui não pode derrubar a busca: as gravações e os destinos continuam achaveis.
      .catch(() => { if (vivo) setBaralho([]); });
    return () => { vivo = false; };
  }, [aberta, baralho]);

  const comandos = useMemo<Command[]>(() => {
    const lista: Command[] = [];

    for (const r of recordings) {
      lista.push({
        id: `sessao:${r.id}`,
        grupo: 'suas gravações',
        label: r.title,
        // `date` e `durationStr` já vêm redigidos pela camada que monta `Recording`.
        hint: `${r.date} · ${r.durationStr}`,
        keywords: r.tags.join(' '),
        icon: ICONE_DE_MIDIA[r.type],
        run: () => aoNavegar('analysis', { id: r.id }),
      });
    }

    /* Só o que está NO baralho. Um cartão arquivado pela curadoria saiu das rodadas de propósito;
       trazê-lo de volta pela busca desfaria em silêncio uma decisão que a pessoa tomou. */
    for (const c of (baralho ?? []).filter((c) => c.inDeck).slice(0, MAX_PALAVRAS)) {
      lista.push({
        id: `palavra:${c.id}`,
        grupo: 'suas palavras',
        label: c.word,
        /* A dica é a TRADUÇÃO, e só. O mockup trazia "apareceu 11 vezes", mas a contagem de
           ocorrências vive em `vocab_occurrences` no servidor e não chega ao `VocabCard` do
           cliente, exibi-la aqui exigiria inventar o número ou uma segunda ida à rede por palavra. */
        hint: c.translation || undefined,
        keywords: c.translation,
        icon: <BookOpen className="w-4 h-4" />,
        run: () => aoNavegar('metrics'),
      });
    }

    lista.push(
      { id: 'ir:hub', grupo: 'ir para', label: 'Início', icon: <LayoutGrid className="w-4 h-4" />, keywords: 'home painel', run: () => aoNavegar('hub') },
      { id: 'ir:capture', grupo: 'ir para', label: 'Gravar', icon: <Mic className="w-4 h-4" />, keywords: 'capturar captura áudio microfone', run: () => aoNavegar('capture') },
      { id: 'ir:play', grupo: 'ir para', label: 'Jogar', icon: <Gamepad2 className="w-4 h-4" />, keywords: 'jogos exercícios praticar', run: () => aoNavegar('play') },
      { id: 'ir:library', grupo: 'ir para', label: 'Biblioteca', icon: <Library className="w-4 h-4" />, keywords: 'sessões importar youtube', run: () => aoNavegar('library') },
      { id: 'ir:metrics', grupo: 'ir para', label: 'Palavras', icon: <BarChart3 className="w-4 h-4" />, keywords: 'vocabulário caderno métricas', run: () => aoNavegar('metrics') },
      {
        id: 'ir:study',
        grupo: 'ir para',
        label: vencidasAgora ? `Revisar as ${vencidasAgora} que venceram` : 'Revisar',
        // Sem métrica ainda, a linha fica sem promessa — em vez de dizer "0 vencidas" e mentir.
        hint: vencidasAgora === null ? undefined : vencidasAgora === 0 ? 'nada vencido agora' : undefined,
        icon: <Timer className="w-4 h-4" />,
        keywords: 'revisão srs vencidas due',
        run: () => aoNavegar('study'),
      },
      { id: 'ir:settings', grupo: 'ir para', label: 'Ajustes', icon: <SettingsIcon className="w-4 h-4" />, keywords: 'configurações idioma tema conta', run: () => aoNavegar('settings') },
    );

    return lista;
  }, [recordings, baralho, aoNavegar, vencidasAgora]);

  return (
    <CommandPalette
      open={aberta}
      onClose={aoFechar}
      commands={comandos}
      placeholder="Buscar gravação, palavra ou tela…"
    />
  );
}
