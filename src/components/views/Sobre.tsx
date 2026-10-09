/**
 * SOBRE — quem faz o app, por que ele existe e como falar comigo.
 *
 * A marcação é a do protótipo aprovado (`T.sobre` em `docs/prototipos/consistencia-telas.html`),
 * que o dono trata como o Figma do app: `.cartao.hero` com o avatar no anel em degradê, a história
 * em `.g2` com a citação e a `.lista-check` ao lado, e "Quer ajudar?" em três cartões. O CSS é o
 * dele (`src/styles/prototipo.css`); aqui só se gera a mesma marcação com os dados reais.
 *
 * DADOS REAIS NO LUGAR DOS DE MENTIRA. O protótipo desenha um "G" no avatar e cinco redes que só
 * avisam para onde levariam. Aqui o avatar é a foto do GitHub (`lib/criador`) e as redes são as que
 * o dono preencheu, na ordem do protótipo (Portfólio, GitHub, LinkedIn, Instagram, E-mail);
 * placeholder (`*_AQUI`) some em vez de virar link quebrado — preencher `lib/criador` faz o botão
 * aparecer.
 *
 * POLÍTICA E TERMOS abrem o diálogo do protótipo (`sobre/DialogoLegal`), com o texto dele; "Baixar
 * PDF" abre o documento completo (`/privacidade.html`, `/termos.html`) para imprimir.
 */
import type { LucideIcon } from 'lucide-react';
import { CreditCard, Github, Globe, Instagram, Linkedin, Mail, MessageCircle, Star } from 'lucide-react';
import { useState } from 'react';

import { CRIADOR, preenchido } from '../../lib/criador';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import DialogoLegal, { type Documento } from './sobre/DialogoLegal';
import SobreDoQuest from './sobre/quest/SobreDoQuest';

/** As redes na ordem do protótipo; a primeira preenchida é o botão cheio. */
const REDES: Array<{ href: string; icone: LucideIcon; rotulo: string }> = [
  { href: CRIADOR.portfolio, icone: Globe, rotulo: 'Portfólio' },
  { href: CRIADOR.github, icone: Github, rotulo: 'GitHub' },
  { href: CRIADOR.linkedin, icone: Linkedin, rotulo: 'LinkedIn' },
  { href: CRIADOR.instagram, icone: Instagram, rotulo: 'Instagram' },
  { href: CRIADOR.email, icone: Mail, rotulo: 'E-mail' },
];

/**
 * DADOS ABERTOS — a atribuição que as licenças EXIGEM, dentro do app. O dicionário local (toque em
 * palavra, `lib/dicionarioLocal.ts`), as glosas da trilha e as frases dos jogos são redistribuídos
 * aqui; CC BY-SA e CC BY pedem crédito onde o dado aparece, não só no repositório. A lista dos
 * autores do Tatoeba, longa demais para a tela, fica em `FONTES.md`, que o último item abre.
 */
const DADOS_ABERTOS: Array<{ nome: string; licenca: string; uso: string; href: string }> = [
  {
    nome: 'Wikcionário (Wiktionary)',
    licenca: 'CC BY-SA',
    uso: 'Traduções do dicionário do app e verbetes, via Wiktextract/Kaikki',
    href: 'https://kaikki.org/',
  },
  {
    nome: 'Wikidata Lexemes',
    licenca: 'CC0',
    uso: 'Traduções palavra a palavra e formas das palavras',
    href: 'https://www.wikidata.org/wiki/Wikidata:Lexicographical_data',
  },
  {
    nome: 'Tatoeba',
    licenca: 'CC BY 2.0 FR',
    uso: 'Frases de exemplo e suas traduções',
    href: 'https://tatoeba.org',
  },
  {
    nome: 'FrequencyWords (OpenSubtitles)',
    licenca: 'CC BY-SA 4.0',
    uso: 'Frequência das palavras, que ordena a trilha',
    href: 'https://github.com/hermitdave/FrequencyWords',
  },
];

const hrefDe = (v: string) => (v.includes('@') && !v.startsWith('http') ? `mailto:${v}` : v);

const FATOS = ['Grátis para aprender', 'Código aberto', 'Roda no seu computador', 'Seus dados ficam com você'];

export default function Sobre({ onVerPlanos }: { onVerPlanos?: (view: string) => void } = {}) {
  const [copiado, setCopiado] = useState(false);
  const [semFoto, setSemFoto] = useState(false);
  const [legal, setLegal] = useState<Documento | null>(null);
  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(CRIADOR.pix);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado: a chave está visível para copiar à mão */
    }
  };

  const redes = REDES.filter((r) => preenchido(r.href));
  const ajudas: Array<{ icone: LucideIcon; titulo: string; desc: string; href?: string; aoClicar?: () => void }> = [
    {
      icone: Star,
      titulo: 'Deixe uma estrela no GitHub',
      desc: 'Leva dois segundos e ajuda mais gente a encontrar o projeto.',
      href: `${CRIADOR.github}/babel-play`,
    },
    {
      icone: MessageCircle,
      titulo: 'Me conte o que faltou',
      desc: 'Se algo te atrapalhou ou você sentiu falta de alguma coisa, eu quero saber. Eu leio tudo.',
      href: CRIADOR.comentarios,
    },
    /* Edição estática: não há plano a assinar — o cartão levaria a uma tela sem saída. */
    ...(edicaoEstatica()
      ? []
      : [
          {
            icone: CreditCard,
            titulo: 'Assine um plano',
            desc: 'Se o app te ajuda, é isso que paga o servidor e me deixa continuar.',
            aoClicar: onVerPlanos ? () => onVerPlanos('planos') : undefined,
          },
        ]),
  ];

  /* QUEST: o mesmo conteúdo em quatro abas (`SobreDoQuest`); o diálogo legal é o de sempre. */
  return (
    <>
      <SobreDoQuest
        redes={redes.map((r) => ({ ...r, href: hrefDe(r.href) }))}
        fatos={FATOS}
        ajudas={ajudas.map((a) => ({ ...a, href: a.href && preenchido(a.href) ? a.href : undefined }))}
        dadosAbertos={DADOS_ABERTOS}
        pix={preenchido(CRIADOR.pix) ? CRIADOR.pix : null}
        copiado={copiado}
        aoCopiarPix={() => void copiarPix()}
        semFoto={semFoto}
        aoFalharAFoto={() => setSemFoto(true)}
        aoAbrirLegal={setLegal}
      />
      {legal && <DialogoLegal doc={legal} aoFechar={() => setLegal(null)} />}
    </>
  );
}
