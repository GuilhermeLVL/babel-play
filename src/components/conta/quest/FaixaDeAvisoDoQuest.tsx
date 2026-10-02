import '../../../styles/questConta.css';

import { type LucideIcon, X } from 'lucide-react';

/** Uma saída do aviso: botão (`aoClicar`) ou link para fora (`href`). No máximo uma é a principal. */
export interface AcaoDoAviso {
  rotulo: string;
  aoClicar?: () => void;
  href?: string;
  principal?: boolean;
}

/**
 * O AVISO DE CONTA QUE NÃO INTERROMPE, NO META QUEST: uma faixa (`.q-aviso`) com o ícone, o título, a
 * frase, as saídas com 60 px e o fechar com 56. É a forma que `AvisoDeConta`, `CardDePlanos` e
 * `AvisoDePagamentoAtrasado` tomam no headset.
 *
 * Só apresentação: quando o aviso aparece, o que cada saída faz e a dispensa continuam em cada um
 * deles. `noTopo` dá a margem de quem fica acima do palco (fora de uma tela); sem ele, a faixa segue o
 * fluxo de onde foi posta.
 */
export default function FaixaDeAvisoDoQuest({
  icone: Icone,
  titulo,
  texto,
  acoes,
  aoDispensar,
  rotuloDeDispensar,
  tom = 'acento',
  noTopo = false,
  testId,
}: {
  icone: LucideIcon;
  titulo?: string;
  texto: string;
  acoes: readonly AcaoDoAviso[];
  aoDispensar?: () => void;
  rotuloDeDispensar?: string;
  tom?: 'acento' | 'alerta';
  noTopo?: boolean;
  testId?: string;
}) {
  return (
    <section
      className={`q-aviso ${noTopo ? 'qc-topo' : 'qc-convite'}${tom === 'alerta' ? ' qc-alerta' : ''}`}
      role="status"
      data-testid={testId}
    >
      <Icone aria-hidden />
      <div>
        {titulo ? (
          <>
            <b>{titulo}</b>
            <small>{texto}</small>
          </>
        ) : (
          texto
        )}
      </div>
      {acoes.map((a) =>
        a.href ? (
          <a
            key={a.rotulo}
            className={a.principal ? 'q-ctl pri' : 'q-ctl'}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            {a.rotulo}
          </a>
        ) : (
          <button key={a.rotulo} type="button" className={a.principal ? 'q-ctl pri' : 'q-ctl'} onClick={a.aoClicar}>
            {a.rotulo}
          </button>
        ),
      )}
      {aoDispensar && (
        <button type="button" className="qc-fechar" aria-label={rotuloDeDispensar} onClick={aoDispensar}>
          <X aria-hidden />
        </button>
      )}
    </section>
  );
}
