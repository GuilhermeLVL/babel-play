import { describe, it, expect } from 'vitest';
import { SpeakerClusterer, cosineSimilarity } from '../src/lib/speakerCluster';

/**
 * Vetor 2-D no ângulo pedido — permite construir similaridades EXATAS: cos(θ) entre dois
 * vetores unitários é o cosseno da diferença de ângulo. É assim que os números medidos com
 * áudio real (mesma pessoa ≈ 0.75, pessoas diferentes ≈ 0.10) entram nos testes.
 */
const at = (deg: number) => Float32Array.from([Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)]);

const A = [1, 0, 0, 0];
const B = [0, 1, 0, 0];
const C = [0, 0, 1, 0];

describe('cosineSimilarity', () => {
  it('1 para vetores idênticos, 0 para ortogonais', () => {
    expect(cosineSimilarity(Float32Array.from(A), Float32Array.from(A))).toBeCloseTo(1);
    expect(cosineSimilarity(Float32Array.from(A), Float32Array.from(B))).toBeCloseTo(0);
  });

  it('não explode com vetor nulo (retorna 0)', () => {
    expect(cosineSimilarity(Float32Array.from([0, 0]), Float32Array.from(A))).toBe(0);
  });

  it('ignora magnitude (é ângulo, não tamanho)', () => {
    expect(cosineSimilarity(Float32Array.from([2, 0]), Float32Array.from([0.1, 0]))).toBeCloseTo(1);
  });
});

describe('SpeakerClusterer — básico', () => {
  it('primeira voz abre a Pessoa 1', () => {
    const c = new SpeakerClusterer();
    expect(c.assign(Float32Array.from(A))).toMatchObject({ clusterId: 1, isNew: true });
    expect(c.count).toBe(1);
  });

  it('voz ortogonal abre uma voz nova — PROVISÓRIA até a segunda fala', () => {
    const c = new SpeakerClusterer();
    c.assign(Float32Array.from(A));
    expect(c.assign(Float32Array.from(B))).toMatchObject({ clusterId: 2, isNew: true, provisional: true });
    expect(c.count).toBe(1);      // ainda não é uma pessoa na tela
    expect(c.tracked).toBe(2);    // mas já está sendo rastreada
    // Segunda fala compatível confirma a pessoa.
    expect(c.assign(Float32Array.from(B))).toMatchObject({ clusterId: 2, promoted: 2, provisional: false });
    expect(c.count).toBe(2);
  });

  it('no teto de vozes, uma voz nova cai na mais parecida (não inventa gente infinita)', () => {
    const c = new SpeakerClusterer({ maxSpeakers: 2 });
    c.assign(Float32Array.from(A));
    c.assign(Float32Array.from(B));
    expect(c.tracked).toBe(2); // teto atingido
    const r = c.assign(Float32Array.from(C));
    expect(r.isNew).toBe(false); // não abre a terceira
    expect(c.tracked).toBe(2);
  });

  it('reset limpa a memória de vozes e reinicia a numeração', () => {
    const c = new SpeakerClusterer();
    c.assign(Float32Array.from(A));
    c.reset();
    expect(c.count).toBe(0);
    expect(c.assign(Float32Array.from(B)).clusterId).toBe(1);
  });
});

describe('SpeakerClusterer — 2 falantes REAIS (similaridades medidas)', () => {
  // Mesma pessoa ≈ 0.75 (41°); pessoas diferentes ≈ 0.10 (84°).
  const A1 = at(0), A2 = at(41), B1 = at(125), B2 = at(84);

  it('as similaridades sintéticas reproduzem a medição real', () => {
    expect(cosineSimilarity(A1, A2)).toBeGreaterThan(0.7);  // medido 0.735
    expect(cosineSimilarity(A1, B1)).toBeLessThan(0.2);     // medido 0.153
  });

  it('agrupa a conversa alternada A,B,A,B em exatamente 2 pessoas', () => {
    const c = new SpeakerClusterer();
    const seq = [A1, B1, A2, B2].map(e => c.assign(e).clusterId);
    expect(c.count).toBe(2); // B foi confirmada pela 2ª fala dela (B2)
    expect(seq[0]).toBe(seq[2]);
    expect(seq[1]).toBe(seq[3]);
    expect(seq[0]).not.toBe(seq[1]);
  });
});

/**
 * O BUG RELATADO: uma conversa de duas pessoas virou seis. Estes testes fixam os dois
 * mecanismos que impedem a recaída.
 */
describe('SpeakerClusterer — anti-fantasma', () => {
  it('fala RUIDOSA da mesma pessoa NÃO cria gente nova (zona de dúvida)', () => {
    const c = new SpeakerClusterer();
    c.assign(at(0));
    // 65° ⇒ cos ≈ 0.42: abaixo do limiar de "mesma pessoa" (0.5) mas acima do de
    // "gente diferente" (0.3). Com limiar único isto abria uma pessoa fantasma.
    const r = c.assign(at(65));
    expect(r.uncertain).toBe(true);
    expect(r.isNew).toBe(false);
    expect(c.count).toBe(1);
  });

  it('a dúvida NÃO contamina a referência da pessoa', () => {
    const c = new SpeakerClusterer();
    c.assign(at(0));
    c.assign(at(65));           // dúvida: não deve mexer no centróide
    const r = c.assign(at(0));  // a voz limpa de novo
    expect(r.similarity).toBeCloseTo(1, 2); // centróide intacto — segue idêntico ao original
  });

  it('voz claramente diferente vira pessoa DEPOIS de confirmada', () => {
    const c = new SpeakerClusterer();
    c.assign(at(0));
    const r1 = c.assign(at(85)); // cos ≈ 0.087 — faixa medida p/ pessoas diferentes
    expect(r1.isNew).toBe(true);
    expect(r1.provisional).toBe(true);
    expect(c.count).toBe(1);
    const r2 = c.assign(at(85));
    expect(r2.promoted).toBe(r1.clusterId);
    expect(c.count).toBe(2);
  });

  /**
   * O CASO EXATO DO BUG: um trecho ruidoso isolado (uma fala só) não pode virar gente. Com o
   * mecanismo antigo ele nascia "Pessoa N" e ficava na lista para sempre.
   */
  it('trecho ruidoso ISOLADO nunca vira uma pessoa', () => {
    const c = new SpeakerClusterer();
    c.assign(at(0));                    // pessoa real
    const ruido = c.assign(at(88));     // trecho esquisito, uma vez só
    expect(ruido.provisional).toBe(true);
    // A conversa segue com a pessoa real; o ruído nunca se repete.
    for (const ang of [3, 6, 2, 5]) c.assign(at(ang));
    expect(c.count).toBe(1);            // continua UMA pessoa na tela
  });

  it('FUSÃO: duas vozes confirmadas que se revelam a mesma pessoa são unidas', () => {
    const c = new SpeakerClusterer();
    c.assign(at(0)); c.assign(at(2));       // pessoa 1, confirmada
    c.assign(at(85)); c.assign(at(84));     // pessoa 2, confirmada (ainda distante)
    expect(c.count).toBe(2);
    // A "pessoa 2" recebe falas que a aproximam da pessoa 1 até os centróides convergirem.
    let merged: Array<{ from: number; into: number }> = [];
    for (const ang of [70, 55, 45, 35, 28, 20, 14, 8, 4]) {
      merged = c.assign(at(ang)).merged;
      if (merged.length) break;
    }
    expect(merged.length).toBeGreaterThan(0);
    expect(c.count).toBe(1);
    expect(merged[0].from).not.toBe(merged[0].into);
  });

  it('ids são ESTÁVEIS: nunca são reciclados para outra pessoa', () => {
    const c = new SpeakerClusterer();
    c.assign(at(0));                               // id 1
    c.assign(at(85)); c.assign(at(85));            // id 2 (confirmada)
    const terceira = c.assign(at(170)).clusterId;  // id 3
    expect(terceira).toBe(3);
    const nova = c.assign(at(250)).clusterId;
    expect(nova).toBeGreaterThan(3);
  });
});
