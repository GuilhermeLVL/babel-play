import { Crown, Frame, MousePointer2 } from 'lucide-react';

import { THEME_OPTIONS } from '../lib/appearance';
import { RECEITAS } from '../lib/comemoracao/efeitos';
import { corDoCromaEquipado } from '../lib/galeria/cromas';
import { todasAsPaletas } from '../lib/galeria/paletas';
import { iconeDoItem } from '../lib/galeria/progressao';
import type { ItemDaLoja } from '../lib/loja';
import { estiloDeRastro } from '../lib/rastroDoMouse';
import PreviaDaLegenda from './PreviaDaLegenda';
import PreviaDoCartao from './PreviaDoCartao';

/**
 * A MINIATURA REAL DE UMA PEÇA (pedido do dono, 01/09: "adicione as miniaturas reais dos itens
 * para facilitar na navegação, esses ícones repetidos geram confusão").
 *
 * O DEFEITO QUE ISTO CORRIGE. Um ícone por TIPO (`iconeDoItem`) foi a correção certa para o
 * problema anterior (o ícone vinha por regex da descrição, então dependia do texto que alguém
 * escreveu). Mas na grade do inventário, onde as peças aparecem AGRUPADAS POR TIPO, um ícone por
 * tipo é a pior escolha possível: cinco partículas viram cinco brilhos idênticos. A grade deixa de
 * ser visual e passa a se ler só pelo texto embaixo.
 *
 * SEM EMOJI (recompensas v2): toda forma aqui é vetor ou ícone lucide, na cor que o motor usa.
 *
 * A REGRA AQUI É OUTRA: **a miniatura mostra o que a peça DESENHA**, lendo as mesmas fontes que
 * o app lê na hora de desenhar de verdade —
 *
 *   · rastro    → `estiloDeRastro(alvo)`, o MESMO resolvedor que o canvas usa; dele saem a forma
 *                 (kind) e as cores (`sobrescrever.paleta`), inclusive nos rastros gerados
 *   · partícula → a forma do `alvo`, e o croma equipado quando há um
 *   · tema      → as quatro cores dele
 *   · fonte     → "Aa" na família que a fonte instala
 *   · layout    → um diagrama da moldura com a barra no lado certo
 *   · paletas   → quatro cores de uma paleta REAL daquele estilo
 *
 * Nada aqui é decoração escolhida à mão: se a peça mudar, a miniatura muda junto.
 *
 * MORA NA RAIZ DE `components/` porque quatro telas mostram listas de itens e todas sofriam do
 * mesmo defeito: o inventário, o passe, as conquistas e o modal de "subiu de nível". Uma só
 * fonte para a miniatura é o que impede as quatro de divergirem de novo.
 */

type Tam = 'grade' | 'grande';

const MEDIDAS = {
  grade: { ponto: 9, icone: 26, gap: 'gap-[3px]' },
  grande: { ponto: 16, icone: 46, gap: 'gap-1.5' },
} as const;

/**
 * Uma fileira de formas que diminui — é o que faz "rastro" parecer rastro e não enfeite.
 *
 * CORAÇÃO E ESTRELA SÃO VETOR, NÃO EMOJI: emoji ignora cor, então um coração de emoji na
 * miniatura faria o Rastro Lo-fi (corações roxos) parecer idêntico ao Rastro Corações (vermelhos) —
 * que é exatamente a confusão que estas miniaturas vieram resolver.
 */
function Fileira({
  tam,
  forma,
  cores,
}: {
  tam: Tam;
  forma: 'circulo' | 'quadrado' | 'confete' | 'coracao' | 'estrela';
  cores: string[];
}) {
  const m = MEDIDAS[tam];
  const escalas = [1, 0.72, 0.48];
  return (
    <span className={`flex items-center ${m.gap}`} aria-hidden>
      {escalas.map((e, i) =>
        forma === 'coracao' || forma === 'estrela' ? (
          <svg
            key={i}
            width={m.ponto * e * 1.25}
            height={m.ponto * e * 1.25}
            viewBox="0 0 24 24"
            style={{ opacity: 0.45 + e * 0.55 }}
            aria-hidden
          >
            <path d={forma === 'coracao' ? CORACAO : ESTRELA} fill={cores[i % cores.length]} />
          </svg>
        ) : (
          <span
            key={i}
            style={{
              width: m.ponto * e,
              height: m.ponto * e * (forma === 'confete' ? 0.6 : 1),
              background: cores[i % cores.length],
              borderRadius: forma === 'circulo' ? '50%' : forma === 'confete' ? '1px' : '0',
              transform: forma === 'confete' ? `rotate(${25 + i * 40}deg)` : undefined,
              opacity: 0.45 + e * 0.55,
            }}
          />
        ),
      )}
    </span>
  );
}

const CORACAO = 'M12 21s-8-5.1-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 15.9 12 21 12 21z';
const ESTRELA = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
/* As estrelas: as cores quentes do aviso, como o brilho que o motor desenha. */
const CORES_DA_ESTRELA = ['var(--warn)', 'color-mix(in srgb, var(--warn) 60%, #fff)', 'var(--warn)'];

/** O `kind` do rastro decide a forma; é o mesmo `kind` que o canvas recebe. */
const FORMA_DO_KIND: Record<string, 'circulo' | 'quadrado' | 'confete' | 'estrela' | 'coracao'> = {
  rastroFaisca: 'circulo',
  rastroPixel: 'quadrado',
  rastroEstrelas: 'estrela',
  rastroCoracoes: 'coracao',
  rastroArcoiris: 'circulo',
};

export default function MiniaturaDoItem({ item, tam = 'grade' }: { item: ItemDaLoja; tam?: Tam }) {
  const m = MEDIDAS[tam];
  const soloIcone = (Icone: typeof Frame, cor = 'var(--accent-ink)') => (
    <Icone aria-hidden style={{ width: m.icone, height: m.icone, color: cor }} />
  );

  /* ── TEMA: as quatro cores dele ──────────────────────────────────────────── */
  if (item.tipo === 'tema') {
    const cores =
      item.previa ??
      (() => {
        const t = THEME_OPTIONS.find((o) => o.id === item.alvo);
        return t ? [t.swatches.canvas, t.swatches.surface, t.swatches.accent, t.swatches.ink] : null;
      })();
    if (cores) {
      return (
        <span className={`flex ${m.gap}`} aria-hidden>
          {cores.map((c, i) => (
            <span
              key={i}
              className="rounded-full border border-border-subtle"
              style={{ width: m.ponto * 1.4, height: m.ponto * 1.4, background: c }}
            />
          ))}
        </span>
      );
    }
  }

  /* ── FONTE: "Aa" na família que a peça instala ───────────────────────────── */
  if (item.tipo === 'fonte') {
    const pixel = item.alvo === 'pixel';
    return (
      <span
        className="font-black text-ink leading-none"
        style={{ fontFamily: pixel ? "'Silkscreen', monospace" : undefined, fontSize: tam === 'grade' ? 17 : 30 }}
        aria-hidden
      >
        Aa
      </span>
    );
  }

  /* ── PARTÍCULAS: a forma que o burst desenha, na cor do croma quando há um ── */
  if (item.tipo === 'particulas') {
    const croma = corDoCromaEquipado(item.id);
    const acento = croma ?? 'var(--accent)';
    // A skin 'coracoes' desenha `forma: 'coracao'` na paleta rosa/vermelha do preset.
    if (item.alvo === 'coracoes')
      return <Fileira tam={tam} forma="coracao" cores={croma ? [croma] : ['#F04E23', '#FF7BAC', '#E63946']} />;
    if (item.alvo === 'estrelas') return <Fileira tam={tam} forma="estrela" cores={croma ? [croma] : CORES_DA_ESTRELA} />;
    if (item.alvo === 'confete')
      return <Fileira tam={tam} forma="confete" cores={[acento, 'var(--warn)', 'var(--good)']} />;
    if (item.alvo === 'pixel') return <Fileira tam={tam} forma="quadrado" cores={[acento, acento, acento]} />;
    // 'tema' e 'cometa' (e qualquer skin nova) caem no redondo, que é o burst padrão.
    return <Fileira tam={tam} forma="circulo" cores={[acento, acento, acento]} />;
  }

  /* ── RASTRO: o MESMO resolvedor do canvas decide forma e cor ─────────────── */
  if (item.tipo === 'rastro') {
    const estilo = estiloDeRastro(item.alvo);
    // 'off' resolve para null — e "sem rastro" é uma peça de verdade, com miniatura própria.
    if (!estilo) {
      return (
        <span className="flex items-center gap-1 opacity-60" aria-hidden>
          <MousePointer2 style={{ width: m.ponto * 1.7, height: m.ponto * 1.7, color: 'var(--ink-muted)' }} />
          <span className="rounded-full bg-ink-faint" style={{ width: m.ponto * 1.6, height: 2 }} />
        </span>
      );
    }
    const croma = corDoCromaEquipado(item.id);
    const paleta = estilo.sobrescrever?.paleta as string[] | undefined;
    const cores = croma ? [croma] : paleta?.length ? paleta : ['var(--accent)'];
    const forma = FORMA_DO_KIND[estilo.kind] ?? 'circulo';
    if (forma === 'estrela') return <Fileira tam={tam} forma="estrela" cores={croma ? [croma] : paleta?.length ? paleta : CORES_DA_ESTRELA} />;
    if (forma === 'coracao') return <Fileira tam={tam} forma="coracao" cores={cores} />;
    // Arco-íris é o único que muda de cor entre as partículas — a miniatura mostra isso.
    if (estilo.kind === 'rastroArcoiris') {
      return <Fileira tam={tam} forma="circulo" cores={['hsl(0 80% 62%)', 'hsl(120 70% 55%)', 'hsl(250 80% 68%)']} />;
    }
    return <Fileira tam={tam} forma={forma} cores={cores} />;
  }

  /* ── LAYOUT: onde a barra fica, desenhado ────────────────────────────────── */
  if (item.tipo === 'posicao') {
    const lado = item.alvo; // top | left | right | bottom
    const barra = 'bg-accent rounded-[1px]';
    const w = tam === 'grade' ? 30 : 52;
    const h = tam === 'grade' ? 22 : 38;
    const esp = tam === 'grade' ? 6 : 10;
    return (
      <span
        className="relative border border-border-subtle rounded-[3px] bg-canvas block"
        style={{ width: w, height: h }}
        aria-hidden
      >
        <span
          className={`absolute ${barra}`}
          style={
            lado === 'top'
              ? { top: 1, left: 1, right: 1, height: esp }
              : lado === 'bottom'
                ? { bottom: 1, left: 1, right: 1, height: esp }
                : lado === 'right'
                  ? { top: 1, bottom: 1, right: 1, width: esp }
                  : { top: 1, bottom: 1, left: 1, width: esp }
          }
        />
      </span>
    );
  }

  /* ── EFEITOS DE JOGO (onda 3): a forma e a cor da RECEITA, as mesmas que o motor desenha ── */
  if (item.tipo === 'efeito-acerto' || item.tipo === 'efeito-combo' || item.tipo === 'finalizacao') {
    const r = RECEITAS[item.tipo][item.alvo];
    const forma =
      r?.forma === 'pixel' ? 'quadrado' : r?.forma === 'confete' || r?.forma === 'coracao' ? r.forma : 'circulo';
    const cor = `var(${r?.cor ?? '--accent'})`;
    return <Fileira tam={tam} forma={forma} cores={[cor, cor, cor]} />;
  }

  /* ── MOLDURA E TÍTULO DE PERFIL (onda 3): o ícone lucide, sem emoji ────────── */
  if (item.tipo === 'moldura' || item.tipo === 'titulo') {
    const Icone = item.tipo === 'moldura' ? Frame : Crown;
    return soloIcone(Icone, 'var(--warn-ink)');
  }

  /* ── CAPACIDADES: cada uma mostra o que ela abre ─────────────────────────── */
  if (item.tipo === 'galeria') {
    if (item.alvo.startsWith('estilo:')) {
      // Uma paleta REAL daquele estilo — a miniatura é uma amostra do produto, não um símbolo.
      const estilo = item.alvo.slice(7);
      const p = todasAsPaletas().find((x) => x.estilo === estilo);
      if (p) {
        return (
          <span className={`flex ${m.gap}`} aria-hidden>
            {[p.canvas, p.surface, p.accent, p.ink].map((c, i) => (
              <span
                key={i}
                className="rounded-full border border-border-subtle"
                style={{ width: m.ponto * 1.4, height: m.ponto * 1.4, background: c }}
              />
            ))}
          </span>
        );
      }
    }
  }

  /* ── LEGENDA (onda 4): a fala de exemplo vestindo o estilo, não um símbolo ── */
  if (item.tipo === 'legenda') return <PreviaDaLegenda estilo={item.alvo} compacta={tam === 'grade'} />;
  /* ── CARTÃO (onda 4): os três estados da pele lado a lado ── */
  if (item.tipo === 'cartao') return <PreviaDoCartao pele={item.alvo} compacta={tam === 'grade'} />;

  /* Fallback: o ícone lucide do tipo (`iconeDoItem`). Chega aqui só o que não tem forma própria
     (o Estúdio, por exemplo) — e, quando um tipo novo chegar, é este ramo que denuncia que falta a
     miniatura dele. */
  return soloIcone(iconeDoItem(item));
}
