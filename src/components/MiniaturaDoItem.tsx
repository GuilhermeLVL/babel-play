import { PACKS_DE_EMOJI, readPack, lerPackCustom, PACK_CUSTOM } from '../lib/particulas';
import { emojiDoCursor } from '../lib/cursores';
import { estiloDeRastro } from '../lib/rastroDoMouse';
import { todasAsPaletas } from '../lib/galeria/paletas';
import { CATEGORIAS_DE_EMOJI } from '../lib/galeria/emojis';
import { THEME_OPTIONS } from '../lib/appearance';
import { corDoCromaEquipado } from '../lib/galeria/cromas';
import type { ItemDaLoja } from '../lib/loja';

/**
 * A MINIATURA REAL DE UMA PEÇA (pedido do dono, 01/09: "adicione as miniaturas reais dos itens
 * para facilitar na navegação, esses ícones repetidos geram confusão").
 *
 * O DEFEITO QUE ISTO CORRIGE. `emojiDoItem` dá um ícone por TIPO — foi a correção certa para o
 * problema anterior (o ícone vinha por regex da descrição, então dependia do texto que alguém
 * escreveu). Mas na grade do inventário, onde as peças aparecem AGRUPADAS POR TIPO, um ícone por
 * tipo é a pior escolha possível: cinco partículas viram cinco ✨ idênticos e seis rastros viram
 * seis 💫. A grade deixa de ser visual e passa a se ler só pelo texto embaixo.
 *
 * A REGRA AQUI É OUTRA: **a miniatura mostra o que a peça DESENHA**, lendo as mesmas fontes que
 * o app lê na hora de desenhar de verdade —
 *
 *   · rastro    → `estiloDeRastro(alvo)`, o MESMO resolvedor que o canvas usa; dele saem a forma
 *                 (kind) e as cores (`sobrescrever.paleta`), inclusive nos rastros gerados
 *   · partícula → a forma do `alvo`, e o croma equipado quando há um
 *   · pack      → os emojis do próprio pack
 *   · cursor    → o emoji que vira ponteiro
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
  grade: { ponto: 9, emoji: 'text-[15px]', unico: 'text-[26px]', gap: 'gap-[3px]', caixa: 'h-8' },
  grande: { ponto: 16, emoji: 'text-[26px]', unico: 'text-[46px]', gap: 'gap-1.5', caixa: 'h-14' },
} as const;

/**
 * Uma fileira de formas que diminui — é o que faz "rastro" parecer rastro e não enfeite.
 *
 * CORAÇÃO É VETOR, NÃO EMOJI, porque é isso que o canvas desenha (`forma: 'coracao'` em
 * effects.ts). A diferença importa: emoji ignora cor, então um ❤️ na miniatura faria o Rastro
 * Lo-fi (corações roxos) parecer idêntico ao Rastro Corações (vermelhos) — que é exatamente a
 * confusão que estas miniaturas vieram resolver.
 */
function Fileira({ tam, forma, cores, emojis }: {
  tam: Tam;
  forma: 'circulo' | 'quadrado' | 'confete' | 'coracao';
  cores: string[];
  emojis?: string[];
}) {
  const m = MEDIDAS[tam];
  const escalas = [1, 0.72, 0.48];
  return (
    <span className={`flex items-center ${m.gap}`} aria-hidden>
      {escalas.map((e, i) =>
        emojis ? (
          <span key={i} className={m.emoji} style={{ fontSize: `${(tam === 'grade' ? 15 : 26) * e}px`, opacity: 0.45 + e * 0.55 }}>
            {emojis[i % emojis.length]}
          </span>
        ) : forma === 'coracao' ? (
          <svg key={i} width={m.ponto * e * 1.25} height={m.ponto * e * 1.25} viewBox="0 0 24 24"
            style={{ opacity: 0.45 + e * 0.55 }} aria-hidden>
            <path d="M12 21s-8-5.1-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 15.9 12 21 12 21z"
              fill={cores[i % cores.length]} />
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

/** Uma grade 2×2 de emojis — o formato que mostra um PACK sem virar sopa de letrinhas. */
function Quadro({ tam, emojis }: { tam: Tam; emojis: string[] }) {
  const m = MEDIDAS[tam];
  return (
    <span className="grid grid-cols-2 gap-0.5 leading-none" aria-hidden>
      {emojis.slice(0, 4).map((e, i) => <span key={i} className={m.emoji}>{e}</span>)}
    </span>
  );
}

/** As cores que estão de fato no pack equipado — usado por "Chuva de Emojis" e rastro de emoji. */
function emojisDoPackEquipado(): string[] {
  const id = readPack();
  if (id === PACK_CUSTOM) {
    const meu = lerPackCustom();
    if (meu.length) return meu;
  }
  return PACKS_DE_EMOJI.find((p) => p.id === id)?.emojis ?? PACKS_DE_EMOJI[0].emojis;
}

/** O `kind` do rastro decide a forma; é o mesmo `kind` que o canvas recebe. */
const FORMA_DO_KIND: Record<string, 'circulo' | 'quadrado' | 'confete' | 'emoji' | 'estrela' | 'coracao'> = {
  rastroFaisca: 'circulo',
  rastroPixel: 'quadrado',
  rastroEstrelas: 'estrela',
  rastroCoracoes: 'coracao',
  rastroEmoji: 'emoji',
  rastroArcoiris: 'circulo',
};

export default function MiniaturaDoItem({ item, tam = 'grade' }: { item: ItemDaLoja; tam?: Tam }) {
  const m = MEDIDAS[tam];
  const solo = (conteudo: string) => <span className={m.unico} aria-hidden>{conteudo}</span>;

  /* ── TEMA: as quatro cores dele ──────────────────────────────────────────── */
  if (item.tipo === 'tema') {
    const cores = item.previa ?? (() => {
      const t = THEME_OPTIONS.find((o) => o.id === item.alvo);
      return t ? [t.swatches.canvas, t.swatches.surface, t.swatches.accent, t.swatches.ink] : null;
    })();
    if (cores) {
      return (
        <span className={`flex ${m.gap}`} aria-hidden>
          {cores.map((c, i) => (
            <span key={i} className="rounded-full border border-border-subtle"
              style={{ width: m.ponto * 1.4, height: m.ponto * 1.4, background: c }} />
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
    if (item.alvo === 'coracoes') return <Fileira tam={tam} forma="coracao" cores={croma ? [croma] : ['#F04E23', '#FF7BAC', '#E63946']} />;
    if (item.alvo === 'estrelas') return <Fileira tam={tam} forma="circulo" cores={[]} emojis={['⭐', '✨', '🌟']} />;
    if (item.alvo === 'emoji') return <Fileira tam={tam} forma="circulo" cores={[]} emojis={emojisDoPackEquipado()} />;
    if (item.alvo === 'confete') return <Fileira tam={tam} forma="confete" cores={[acento, 'var(--warn)', 'var(--good)']} />;
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
          <span className={m.emoji}>🖱️</span>
          <span className="rounded-full bg-ink-faint" style={{ width: m.ponto * 1.6, height: 2 }} />
        </span>
      );
    }
    const croma = corDoCromaEquipado(item.id);
    const paleta = estilo.sobrescrever?.paleta as string[] | undefined;
    const cores = croma ? [croma] : paleta?.length ? paleta : ['var(--accent)'];
    const forma = FORMA_DO_KIND[estilo.kind] ?? 'circulo';
    // Estrela É emoji no canvas (`forma: 'emoji'`, ⭐/✨) — e emoji ignora cor. A miniatura
    // mostra isso em vez de inventar uma estrela pintada que o rastro não desenharia.
    if (forma === 'estrela') return <Fileira tam={tam} forma="circulo" cores={[]} emojis={['⭐', '✨', '⭐']} />;
    if (forma === 'coracao') return <Fileira tam={tam} forma="coracao" cores={cores} />;
    if (forma === 'emoji') return <Fileira tam={tam} forma="circulo" cores={[]} emojis={emojisDoPackEquipado()} />;
    // Arco-íris é o único que muda de cor entre as partículas — a miniatura mostra isso.
    if (estilo.kind === 'rastroArcoiris') {
      return <Fileira tam={tam} forma="circulo" cores={['hsl(0 80% 62%)', 'hsl(120 70% 55%)', 'hsl(250 80% 68%)']} />;
    }
    return <Fileira tam={tam} forma={forma} cores={cores} />;
  }

  /* ── PACK: os emojis do próprio pack, em 2×2 ─────────────────────────────── */
  if (item.tipo === 'pack') {
    const pack = PACKS_DE_EMOJI.find((p) => p.id === item.alvo);
    if (pack) return <Quadro tam={tam} emojis={pack.emojis} />;
  }

  /* ── CURSOR: o emoji que vira ponteiro ───────────────────────────────────── */
  if (item.tipo === 'cursor') {
    const e = emojiDoCursor(item.alvo);
    if (e) return solo(e);
  }

  /* ── LAYOUT: onde a barra fica, desenhado ────────────────────────────────── */
  if (item.tipo === 'posicao') {
    const lado = item.alvo; // top | left | right | bottom
    const barra = 'bg-accent rounded-[1px]';
    const w = tam === 'grade' ? 30 : 52;
    const h = tam === 'grade' ? 22 : 38;
    const esp = tam === 'grade' ? 6 : 10;
    return (
      <span className="relative border border-border-subtle rounded-[3px] bg-canvas block" style={{ width: w, height: h }} aria-hidden>
        <span
          className={`absolute ${barra}`}
          style={
            lado === 'top' ? { top: 1, left: 1, right: 1, height: esp }
            : lado === 'bottom' ? { bottom: 1, left: 1, right: 1, height: esp }
            : lado === 'right' ? { top: 1, bottom: 1, right: 1, width: esp }
            : { top: 1, bottom: 1, left: 1, width: esp }
          }
        />
      </span>
    );
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
              <span key={i} className="rounded-full border border-border-subtle"
                style={{ width: m.ponto * 1.4, height: m.ponto * 1.4, background: c }} />
            ))}
          </span>
        );
      }
    }
    if (item.alvo.startsWith('cat:')) {
      const cat = CATEGORIAS_DE_EMOJI.find((c) => c.id === item.alvo.slice(4));
      if (cat) return <Quadro tam={tam} emojis={cat.emojis} />;
    }
    if (item.alvo === 'editor-pack') return solo('✏️');
    if (item.alvo === 'cursor-emoji') return solo('🖱️');
  }

  if (item.tipo === 'estudio') return solo('🪄');
  if (item.tipo === 'aprimoramento') return solo(item.alvo === 'sorte' ? '🎲' : '💥');

  /* Fallback: o ícone do tipo. Chega aqui só o que não tem forma própria — e, quando um tipo
     novo chegar, é este ramo que denuncia que falta a miniatura dele. */
  return solo('🎁');
}
