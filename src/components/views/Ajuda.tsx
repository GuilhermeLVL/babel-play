import { Cpu, Github, Keyboard, Mail, Mic, Target } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { CRIADOR, preenchido } from '../../lib/criador';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import GuidePanel from '../GuidePanel';
import { Dialogo } from '../ui';
import AjudaDoQuest from './ajuda/quest/AjudaDoQuest';

/**
 * AJUDA E SUPORTE — a tela do protótipo aprovado (`T.ajuda`).
 *
 * Só o que existe de verdade: os artigos abrem o guia rápido do app; os atalhos são os que o app
 * tem (Ctrl+K, Ctrl+B, Esc e os da revisão), e "Ver todos" abre o diálogo `dialogoAtalhos()`; o contato usa os canais preenchidos em `lib/criador` — o app não tem
 * servidor de mensagens, então não há formulário fingindo enviar; e o status vem de `/api/health`.
 */

const ARTIGOS = [
  { Icone: Mic, titulo: 'Capturar o som do computador', desc: 'Funciona com vídeo, aula, chamada e jogo.' },
  { Icone: Target, titulo: 'Como funciona a revisão', desc: 'Por que as palavras voltam em dias diferentes.' },
  { Icone: Cpu, titulo: 'IA no aparelho ou na nuvem', desc: 'Diferenças de qualidade, privacidade e custo.' },
];

/** Os atalhos que o app TEM (o protótipo lista também `?` e `G I/J/V`, que o app não tem). */
const ATALHOS: [string[], string][] = [
  [['Ctrl', 'K'], 'Buscar gravação, palavra ou tela'],
  [['Ctrl', 'B'], 'Recolher ou abrir o menu lateral'],
  [['Espaço'], 'Mostrar a resposta (revisão)'],
  [['1', '–', '4'], 'Responder a revisão'],
  [['Esc'], 'Fechar painel ou diálogo'],
];

/** Uma linha `.atalho`: a descrição e as teclas; o "–" de um intervalo vira "a", como no protótipo. */
function LinhaDeAtalho({ teclas, desc }: { teclas: string[]; desc: string }) {
  return (
    <div className="entre atalho">
      <span>{desc}</span>
      <span>
        {teclas.map((t, i) => (
          <React.Fragment key={t}>
            {i > 0 && ' '}
            {t === '–' ? <span className="mut">a</span> : <kbd>{t}</kbd>}
          </React.Fragment>
        ))}
      </span>
    </div>
  );
}

type Status = 'verificando' | 'ok' | 'problema';

export default function Ajuda() {
  /* O APARELHO tem teclado físico? No computador os atalhos existem e a tela os mostra; no headset a
     lista não ocupa a tela (fica atrás de "Ver todos"). */
  const [temTeclado] = useState(() => recursosDoAparelho(perfilDoDispositivo()).tecladoFisico);
  /* No computador o menu é o trilho, que não recolhe: o Ctrl+B do menu lateral de antes não existe,
     e a lista não promete um atalho que não faz nada. */
  const atalhos = temTeclado ? ATALHOS.filter(([teclas]) => teclas.join('+') !== 'Ctrl+B') : ATALHOS;
  const [guiaAberto, setGuiaAberto] = useState(false);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<Status>('verificando');

  // Edição estática: não há servidor para verificar, e o cartão de status some (ver o JSX).
  const semServidor = edicaoEstatica();
  useEffect(() => {
    if (semServidor) return;
    let vivo = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: { status?: string }) => vivo && setStatus(j.status === 'ok' ? 'ok' : 'problema'))
      .catch(() => vivo && setStatus('problema'));
    return () => {
      vivo = false;
    };
  }, [semServidor]);

  const termo = busca.trim().toLowerCase();
  const artigos = useMemo(
    () => (termo ? ARTIGOS.filter((a) => `${a.titulo} ${a.desc}`.toLowerCase().includes(termo)) : ARTIGOS),
    [termo],
  );
  const canais = [
    /* "Falar com o suporte" (pausar, nota fiscal, trocar o cartão) cai aqui: sem e-mail próprio do
       criador, vale o contato que a política de privacidade já publica, para o botão nunca dar no vazio. */
    {
      href: preenchido(CRIADOR.email) ? CRIADOR.email : CRIADOR.contatoDePrivacidade,
      rotulo: 'E-mail',
      Icone: Mail,
    },
    { href: CRIADOR.github, rotulo: 'GitHub', Icone: Github },
  ].filter((c) => preenchido(c.href));

  /* O guia rápido e o diálogo de atalhos: os mesmos na tela de sempre e na do headset. */
  const dialogos = (
    <>
      {guiaAberto && <GuidePanel onClose={() => setGuiaAberto(false)} sub="Seis coisas que dá para fazer no app." />}
      {atalhosAbertos && (
        <Dialogo
          icone={Keyboard}
          titulo="Atalhos de teclado"
          sub="Funcionam em qualquer tela, fora de campos de texto."
          largura=""
          aoFechar={() => setAtalhosAbertos(false)}
        >
          <div className="dlg-corpo">
            {atalhos.map(([teclas, desc]) => (
              <LinhaDeAtalho key={desc} teclas={teclas} desc={desc} />
            ))}
          </div>
        </Dialogo>
      )}
    </>
  );

  /* QUEST: a mesma busca, os mesmos artigos e canais, numa janela só (`AjudaDoQuest`). */
  return (
    <>
      <AjudaDoQuest
        busca={busca}
        aoBuscar={setBusca}
        artigos={artigos}
        canais={canais.map(({ href, rotulo, Icone }) => ({
          rotulo,
          Icone,
          href: href.includes('@') && !href.startsWith('http') ? `mailto:${href}` : href,
          externo: href.startsWith('http'),
        }))}
        estado={semServidor ? null : status}
        aoAbrirGuia={() => setGuiaAberto(true)}
        aoAbrirAtalhos={() => setAtalhosAbertos(true)}
        /* Com teclado físico, os primeiros atalhos ficam à vista, como na tela de sempre. */
        atalhosAVista={
          temTeclado
            ? atalhos.slice(0, 4).map(([teclas, desc]) => <LinhaDeAtalho key={desc} teclas={teclas} desc={desc} />)
            : undefined
        }
      />
      {dialogos}
    </>
  );
}
