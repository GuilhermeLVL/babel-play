import { Download, Loader2, Mail, Minus, Send, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type ExerciseResultRow, fetchDeck, fetchExerciseResults } from '../../../data/api';
import type { VocabCard } from '../../../types';
import { toast } from '../../Toast';
import { Dialogo } from '../../ui';

/**
 * "SUA SEMANA NO BABEL PLAY" — o exemplo do resumo semanal (`dialogoRelatorio()` do protótipo),
 * montado com os dados REAIS dos últimos 7 dias: resultados de exercício e cartões do caderno, as
 * mesmas fontes da tela de Estatísticas.
 *
 * "Baixar PDF" abre o resumo numa janela própria e chama a impressão do navegador (Salvar como
 * PDF). "Enviar para mim" abre o e-mail do aparelho já com o resumo no corpo: o servidor ainda não
 * manda e-mail, e fingir que mandou seria pior que abrir o programa de e-mail.
 */

const DIA = 86_400_000;
const MES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const NOME_DO_JOGO: Record<string, string> = {
  memory: 'Memória',
  wordsearch: 'Caça-palavras',
  termo: 'Soletrar (Termo)',
  blitz: 'Duelo relâmpago',
  escuta: 'Qual foi a fala?',
  ditado: 'Ditado',
  karaoke: 'Karaokê da fala',
  scramble: 'Frase embaralhada',
  conectores: 'Caça-conectores',
  typing: 'Revisão digitando',
  mc: 'Revisão de escolha',
};

const inicioDoDia = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface ResumoDaSemana {
  de: Date;
  ate: Date;
  kpis: Array<{ rotulo: string; valor: string; variacao: number | null; unidade: '%' | 'pp' }>;
  destaque: string | null;
  proximas: number;
  picoDaSemana: string | null;
}

/** Os números do resumo, a partir dos dados crus. Exportado para teste. */
export function montarResumo(
  resultados: ExerciseResultRow[],
  cartoes: VocabCard[],
  agora = Date.now(),
): ResumoDaSemana {
  const hoje = inicioDoDia(agora);
  const iniAt = hoje - 6 * DIA,
    iniAnt = iniAt - 7 * DIA;
  const naJanela = (ms: number, ini: number) => ms >= ini && ms < ini + 7 * DIA;
  const periodo = (ini: number) => {
    const rs = resultados.filter((r) => naJanela(r.createdAt, ini));
    const minutos = Math.round(rs.reduce((s, r) => s + (typeof r.ms === 'number' ? r.ms : 0), 0) / 60_000);
    const dias = new Set(rs.map((r) => inicioDoDia(r.createdAt))).size;
    const novas = cartoes.filter((c) => c.createdAtMs && naJanela(c.createdAtMs, ini)).length;
    const acerto = rs.length ? Math.round((rs.filter((r) => r.correct).length / rs.length) * 100) : null;
    return { rs, minutos, dias, novas, acerto };
  };
  const at = periodo(iniAt),
    ant = periodo(iniAnt);
  const varPct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);

  const porJogo = new Map<string, { n: number; certos: number }>();
  for (const r of at.rs) {
    const kind = r.kind ?? 'outro';
    const k = porJogo.get(kind) ?? { n: 0, certos: 0 };
    k.n++;
    if (r.correct) k.certos++;
    porJogo.set(kind, k);
  }
  const melhor = [...porJogo.entries()]
    .filter(([, v]) => v.n >= 3)
    .sort((a, b) => b[1].certos / b[1].n - a[1].certos / a[1].n)[0];

  const proximos = Array.from({ length: 7 }, () => 0);
  for (const c of cartoes) {
    if (!c.inDeck || !c.dueAtMs) continue;
    const i = Math.max(0, Math.round((inicioDoDia(c.dueAtMs) - hoje) / DIA) - 1);
    if (i < 7) proximos[i]++;
  }
  const pico = proximos.some((n) => n > 0) ? proximos.indexOf(Math.max(...proximos)) : -1;
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  return {
    de: new Date(iniAt),
    ate: new Date(hoje),
    kpis: [
      {
        rotulo: 'Minutos de estudo',
        valor: String(at.minutos),
        variacao: varPct(at.minutos, ant.minutos),
        unidade: '%',
      },
      { rotulo: 'Dias ativos', valor: `${at.dias} de 7`, variacao: varPct(at.dias, ant.dias), unidade: '%' },
      { rotulo: 'Palavras novas', valor: String(at.novas), variacao: varPct(at.novas, ant.novas), unidade: '%' },
      {
        rotulo: 'Acerto médio',
        valor: at.acerto === null ? '—' : `${at.acerto}%`,
        variacao: at.acerto !== null && ant.acerto !== null ? at.acerto - ant.acerto : null,
        unidade: 'pp',
      },
    ],
    destaque: melhor
      ? `${NOME_DO_JOGO[melhor[0]] ?? melhor[0]} com ${Math.round((melhor[1].certos / melhor[1].n) * 100)}% de acerto.`
      : null,
    proximas: proximos.reduce((s, n) => s + n, 0),
    picoDaSemana: pico >= 0 ? DIAS[new Date(hoje + (pico + 1) * DIA).getDay()] : null,
  };
}

function Variacao({ v, un }: { v: number | null; un: '%' | 'pp' }) {
  if (v === null) return null;
  if (v === 0)
    return (
      <span className="var neutra">
        <Minus aria-hidden /> igual ao anterior
      </span>
    );
  return (
    <span className={`var ${v > 0 ? 'sobe' : 'desce'}`}>
      {v > 0 ? <TrendingUp aria-hidden /> : <TrendingDown aria-hidden />} {v > 0 ? '+' : ''}
      {v}
      {un === 'pp' ? ' p.p.' : '%'} <span aria-hidden="true">vs. anterior</span>
      <span className="sr">em relação ao período anterior</span>
    </span>
  );
}

const intervalo = (r: ResumoDaSemana) =>
  r.de.getMonth() === r.ate.getMonth()
    ? `${r.de.getDate()} a ${r.ate.getDate()} de ${MES[r.ate.getMonth()]}`
    : `${r.de.getDate()} de ${MES[r.de.getMonth()]} a ${r.ate.getDate()} de ${MES[r.ate.getMonth()]}`;

function textoDoResumo(r: ResumoDaSemana, nome: string): string {
  return [
    `Oi${nome ? `, ${nome}` : ''}! Aqui vai o resumo da sua semana (${intervalo(r)}).`,
    '',
    ...r.kpis.map((k) => `${k.rotulo}: ${k.valor}`),
    '',
    r.destaque ? `Destaque: ${r.destaque}` : 'Destaque: jogue uma rodada para aparecer aqui.',
    `Para a próxima semana: ${r.proximas} revisões previstas${r.picoDaSemana ? `, com pico na ${r.picoDaSemana}` : ''}.`,
  ].join('\n');
}

/** Monta uma página simples na janela nova (só nós de texto, nada interpretado como HTML). */
export function imprimirTexto(w: Window, titulo: string, texto: string) {
  const d = w.document;
  d.title = titulo;
  d.body.style.cssText = 'font:15px/1.6 system-ui,sans-serif;padding:32px;max-width:64ch';
  const h = d.createElement('h1');
  h.style.fontSize = '22px';
  h.textContent = titulo;
  d.body.appendChild(h);
  for (const linha of texto.split('\n')) {
    const p = d.createElement('p');
    p.style.margin = '0 0 6px';
    p.textContent = linha || ' ';
    d.body.appendChild(p);
  }
}

export default function RelatorioSemanal({ nome, aoFechar }: { nome: string; aoFechar: () => void }) {
  const [resumo, setResumo] = useState<ResumoDaSemana | null>(null);

  useEffect(() => {
    let vivo = true;
    void Promise.all([fetchExerciseResults().catch(() => []), fetchDeck().catch(() => [])]).then(([rs, cs]) => {
      if (vivo) setResumo(montarResumo(rs, cs));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const baixarPdf = () => {
    if (!resumo) return;
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) {
      toast.warn('O navegador bloqueou a janela. Libere pop-ups para baixar o PDF.');
      return;
    }
    imprimirTexto(w, 'Sua semana no Babel Play', textoDoResumo(resumo, nome));
    w.focus();
    w.print();
  };

  const enviar = () => {
    if (!resumo) return;
    const url = `mailto:?subject=${encodeURIComponent('Sua semana no Babel Play')}&body=${encodeURIComponent(textoDoResumo(resumo, nome))}`;
    window.location.href = url;
  };

  return (
    <Dialogo
      icone={Mail}
      titulo="Sua semana no Babel Play"
      sub={resumo ? `${intervalo(resumo)} · é assim que chega no e-mail` : 'é assim que chega no e-mail'}
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo relatorio">
        {!resumo ? (
          <p className="mut linha" style={{ gap: 8 }}>
            <Loader2 className="gira" aria-hidden /> Montando o resumo…
          </p>
        ) : (
          <>
            <p style={{ fontSize: 15 }}>Oi{nome ? `, ${nome}` : ''}! Aqui vai o resumo da sua semana.</p>
            <div className="ladrilhos" style={{ gridTemplateColumns: 'repeat(2,1fr)', margin: '14px 0' }}>
              {resumo.kpis.map((k) => (
                <div key={k.rotulo} className="cartao ladrilho">
                  <span className="label-mono">{k.rotulo}</span>
                  <span className="v tn">{k.valor}</span>
                  <Variacao v={k.variacao} un={k.unidade} />
                </div>
              ))}
            </div>
            <p>
              <b>Destaque:</b> {resumo.destaque ?? 'jogue uma rodada esta semana para aparecer aqui.'}
            </p>
            <p>
              <b>Para a próxima semana:</b> {resumo.proximas} revisões previstas
              {resumo.picoDaSemana ? `, com pico na ${resumo.picoDaSemana}` : ''}.
            </p>
          </>
        )}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={baixarPdf} disabled={!resumo}>
          <Download aria-hidden /> Baixar PDF
        </button>
        <button type="button" className="btn btn-solid" onClick={enviar} disabled={!resumo}>
          <Send aria-hidden /> Enviar para mim
        </button>
      </div>
    </Dialogo>
  );
}
