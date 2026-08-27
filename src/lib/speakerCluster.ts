/**
 * AGRUPAMENTO ONLINE DE VOZES (diarização leve, 100% local).
 *
 * Recebe o embedding (WeSpeaker, 256 dims) de cada enunciado do áudio do sistema e decide,
 * em tempo real, "esta voz é de quem?": compara com o centróide de cada pessoa já vista
 * (similaridade de cosseno) e ou reaproveita o cluster mais parecido, ou abre uma pessoa nova.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * O BUG QUE ESTE ARQUIVO JÁ CAUSOU (e como foi resolvido)
 *
 * Com UM limiar só (0.5), uma conversa de DUAS pessoas produzia seis. A causa: áudio real não é
 * estúdio. Fala curta, música de fundo, compressão de vídeo e sobreposição derrubam a
 * similaridade da MESMA pessoa para bem abaixo do limiar — e todo tropeço desses virava "pessoa
 * nova", que nunca mais desaparecia da lista.
 *
 * Três mecanismos corrigem isso:
 *
 *  1. HISTERESE (dois limiares, não um). Reconhecer alguém e declarar um DESCONHECIDO são
 *     decisões com custos diferentes, então têm réguas diferentes:
 *       • sim ≥ `joinThreshold` (0.5)  → é a mesma pessoa: entra no cluster E atualiza o centróide.
 *       • sim < `newSpeakerThreshold` (0.3) → é gente diferente mesmo: abre pessoa nova.
 *       • entre os dois → ZONA DE DÚVIDA: atribui à voz mais parecida, mas NÃO mexe no centróide
 *         (não polui a referência com um trecho ruim) e NÃO inventa gente.
 *     As réguas vêm da medição (ver abaixo): mesma pessoa ≥ 0.735, pessoas diferentes ≤ 0.153.
 *     Uma fala ruidosa que caia para 0.35 é dúvida — não é motivo para criar alguém.
 *
 *  2. CONFIRMAÇÃO ANTES DE CRIAR UMA PESSOA. Uma voz nova nasce PROVISÓRIA: enquanto tiver uma
 *     única fala, não vira "Pessoa N" na tela — a fala fica com a voz anterior. Só quando uma
 *     SEGUNDA fala casa com ela é que a pessoa é promovida (e `assign` devolve `promoted` para a
 *     interface reetiquetar as falas guardadas). É o que mata o fantasma de uma fala só, que era
 *     a maior fonte de gente inventada: um trecho ruidoso isolado não é uma pessoa.
 *
 *  3. FUSÃO RETROATIVA. Quando a MESMA pessoa se parte em dois clusters que ambos continuam
 *     recebendo falas ("bugou no início e depois manteve as duas certas"), os centróides
 *     convergem; ao cruzarem `mergeThreshold` são fundidos e `assign` devolve o remapeamento
 *     para a interface corrigir as falas já etiquetadas.
 *
 *  4. NORMALIZAÇÃO L2. Os embeddings entram com magnitudes diferentes (trechos mais longos ou
 *     mais altos devolvem vetores maiores). O cosseno ignora magnitude, mas a MÉDIA que forma o
 *     centróide não: sem normalizar, uma fala longa dominava a referência da pessoa.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * DE ONDE VÊM OS LIMIARES — medido, não chutado. WeSpeaker q8 sobre o conjunto de verificação de
 * locutor do transformers.js-docs (2 falantes reais × 2 falas, 3–5s cada):
 *
 *        A1     A2     B1     B2          mesma pessoa    : 0.735 … 0.762
 *   A1  1.000  0.735  0.153  0.068        pessoas difs.   : 0.054 … 0.153
 *   A2  0.735  1.000  0.136  0.054        MARGEM          : 0.583
 *   B1  0.153  0.136  1.000  0.762
 *   B2  0.068  0.054  1.000  0.762
 *
 * O agrupamento sai correto (2 pessoas) com `joinThreshold` de 0.35 a 0.65 e erra em 0.75.
 *
 * LIMITES HONESTOS (o painel Falantes avisa): vozes muito parecidas ainda podem se fundir, e o
 * usuário pode renomear qualquer pessoa. O teto (`maxSpeakers`) evita a explosão em áudio ruim:
 * além dele, a fala vai para a voz mais parecida em vez de criar mais gente.
 */

export interface SpeakerClusterOptions {
  /** Cosseno a partir do qual é a MESMA pessoa (entra e atualiza o centróide). */
  joinThreshold?: number;
  /** Cosseno ABAIXO do qual é gente diferente (abre pessoa nova). Entre os dois: dúvida. */
  newSpeakerThreshold?: number;
  /** Dois centróides com similaridade ≥ isto são a mesma pessoa: funde. */
  mergeThreshold?: number;
  /** Máximo de pessoas distintas; além disso, a fala vai para a mais parecida. */
  maxSpeakers?: number;
  /** Peso máximo do centróide na média móvel (limita a inércia). */
  maxCentroidWeight?: number;
}

export interface AssignResult {
  /** Id ESTÁVEL da pessoa (1, 2, 3…). Nunca muda nem é reciclado — sobrevive a fusões. */
  clusterId: number;
  /** true = esta fala abriu uma voz nova (ainda PROVISÓRIA — ver `provisional`). */
  isNew: boolean;
  /**
   * true = esta voz ainda não é uma pessoa na tela. A interface NÃO deve criar um perfil: guarda
   * a fala sob este `clusterId` e mantém o rótulo da voz anterior até uma eventual promoção.
   */
  provisional: boolean;
  /**
   * Preenchido quando uma voz provisória se confirmou (segunda fala compatível): a interface cria
   * a pessoa agora e reetiqueta as falas que guardou sob este id.
   */
  promoted?: number;
  /** Cosseno com a voz escolhida (1 na primeira fala de todas). */
  similarity: number;
  /** true = ficou na zona de dúvida (atribuída à mais parecida, sem alterar o centróide). */
  uncertain: boolean;
  /**
   * Fusões provocadas por esta fala: as pessoas `from` passaram a ser `into`. A interface deve
   * reetiquetar as falas antigas e remover os perfis mortos.
   */
  merged: Array<{ from: number; into: number }>;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/** Cópia com norma 1 (ver "NORMALIZAÇÃO L2" no cabeçalho). Vetor nulo volta como está. */
function l2normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (!norm) return Float32Array.from(v);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

interface Cluster {
  id: number;
  vec: Float32Array;
  weight: number;
  /** Ainda não confirmada por uma segunda fala — não é uma pessoa na tela (ver mecanismo 2). */
  provisional: boolean;
}

export class SpeakerClusterer {
  private clusters: Cluster[] = [];
  private nextId = 1;
  private readonly joinThreshold: number;
  private readonly newSpeakerThreshold: number;
  private readonly mergeThreshold: number;
  private readonly maxSpeakers: number;
  private readonly maxCentroidWeight: number;

  constructor(opts: SpeakerClusterOptions = {}) {
    this.joinThreshold = opts.joinThreshold ?? 0.5;
    this.newSpeakerThreshold = opts.newSpeakerThreshold ?? 0.3;
    // 0.55 e não 0.7: com 0.7 a fusão nunca disparava na prática — assim que um cluster começa a
    // ganhar as falas, o outro congela e os centróides se AFASTAM em vez de convergir. A medição
    // dá a folga para baixar: falantes DIFERENTES ficaram em 0.054–0.153, então 0.55 está 3,5×
    // acima do pior caso observado — dois clusters aí em cima são a mesma pessoa em condições
    // diferentes (perto/longe do microfone, com e sem música ao fundo).
    this.mergeThreshold = opts.mergeThreshold ?? 0.55;
    this.maxSpeakers = Math.max(1, opts.maxSpeakers ?? 6);
    this.maxCentroidWeight = Math.max(1, opts.maxCentroidWeight ?? 20);
  }

  /** Pessoas CONFIRMADAS (o que a tela mostra): exclui provisórias e já desconta as fundidas. */
  get count(): number {
    return this.clusters.filter(c => !c.provisional).length;
  }

  /** Vozes rastreadas, incluindo as provisórias — só para diagnóstico. */
  get tracked(): number {
    return this.clusters.length;
  }

  assign(embedding: Float32Array): AssignResult {
    const emb = l2normalize(embedding);

    // A PRIMEIRA voz da sessão não é provisória: é o falante padrão, não um fantasma.
    if (!this.clusters.length) {
      const id = this.nextId++;
      this.clusters.push({ id, vec: Float32Array.from(emb), weight: 1, provisional: false });
      return { clusterId: id, isNew: true, provisional: false, similarity: 1, uncertain: false, merged: [] };
    }

    let best: Cluster = this.clusters[0];
    let bestSim = -Infinity;
    for (const c of this.clusters) {
      const sim = cosineSimilarity(c.vec, emb);
      if (sim > bestSim) { bestSim = sim; best = c; }
    }

    // Gente diferente mesmo → voz nova, mas PROVISÓRIA até uma segunda fala confirmar.
    if (bestSim < this.newSpeakerThreshold && this.clusters.length < this.maxSpeakers) {
      const id = this.nextId++;
      this.clusters.push({ id, vec: Float32Array.from(emb), weight: 1, provisional: true });
      return { clusterId: id, isNew: true, provisional: true, similarity: bestSim, uncertain: false, merged: [] };
    }

    // Zona de dúvida: fica com a voz mais parecida, sem contaminar o centróide dela. Uma voz
    // provisória também não se confirma por dúvida — confirmação exige casamento claro.
    if (bestSim < this.joinThreshold) {
      return {
        clusterId: best.id,
        isNew: false,
        provisional: best.provisional,
        similarity: bestSim,
        uncertain: true,
        merged: [],
      };
    }

    // Mesma pessoa: média móvel com peso limitado (o centróide acompanha a voz sem enrijecer).
    const w = Math.min(best.weight, this.maxCentroidWeight);
    for (let i = 0; i < best.vec.length; i++) {
      best.vec[i] = (best.vec[i] * w + emb[i]) / (w + 1);
    }
    best.vec = l2normalize(best.vec);
    best.weight = w + 1;

    // Segunda fala compatível: a voz provisória vira uma pessoa de verdade.
    let promoted: number | undefined;
    if (best.provisional) {
      best.provisional = false;
      promoted = best.id;
    }

    return {
      clusterId: best.id,
      isNew: false,
      provisional: false,
      promoted,
      similarity: bestSim,
      uncertain: false,
      merged: this.mergeInto(best),
    };
  }

  /**
   * Funde no cluster `into` todos os outros que ficaram parecidos demais com ele. Só roda depois
   * de o centróide ter sido atualizado — é aí que fantasmas do começo convergem para a voz real.
   */
  private mergeInto(into: Cluster): Array<{ from: number; into: number }> {
    const merged: Array<{ from: number; into: number }> = [];
    for (let i = this.clusters.length - 1; i >= 0; i--) {
      const other = this.clusters[i];
      if (other.id === into.id) continue;
      if (cosineSimilarity(other.vec, into.vec) < this.mergeThreshold) continue;
      // O de MAIOR peso absorve o outro (mais evidência = referência melhor).
      const [vencedor, perdedor] = into.weight >= other.weight ? [into, other] : [other, into];
      const wv = Math.min(vencedor.weight, this.maxCentroidWeight);
      const wp = Math.min(perdedor.weight, this.maxCentroidWeight);
      for (let k = 0; k < vencedor.vec.length; k++) {
        vencedor.vec[k] = (vencedor.vec[k] * wv + perdedor.vec[k] * wp) / (wv + wp);
      }
      vencedor.vec = l2normalize(vencedor.vec);
      vencedor.weight = Math.min(this.maxCentroidWeight, vencedor.weight + perdedor.weight);
      this.clusters = this.clusters.filter(c => c.id !== perdedor.id);
      merged.push({ from: perdedor.id, into: vencedor.id });
      if (perdedor.id === into.id) break; // o próprio "into" foi absorvido, nada mais a comparar
    }
    return merged;
  }

  reset(): void {
    this.clusters = [];
    this.nextId = 1;
  }
}
