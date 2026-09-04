#!/usr/bin/env node
/**
 * O DANO LEGADO DO F26, CONTADO — sem reescrever nada.
 *
 * A trilha promovia cartão com o nível e a tradução da lista curada, e carimbava `tgt_lang` com o
 * idioma nativo de quem jogava. Como a lista do inglês só traz glosa PORTUGUESA, quem estudava com
 * outro nativo saiu com cartões que AFIRMAM ser daquele par e são português.
 *
 * Reescrever automaticamente seria trocar um dado errado por um palpite: a contagem é o entregável,
 * e a decisão do que fazer com ela é de quem lê.
 *
 *   node scripts/trilha/diagnostico.mjs [caminho/do/banco.db]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const banco = process.argv[2] ?? path.resolve(process.cwd(), 'data/babel.db');
const indice = JSON.parse(readFileSync(path.resolve(process.cwd(), 'src/data/trilha/indice.json'), 'utf8'));

const db = new DatabaseSync(banco, { readOnly: true });
const base = (s) => String(s ?? '').toLowerCase().split('-')[0];

/* A procedência mora na OCORRÊNCIA, não no cartão: `session_id` da trilha é sintético e o
   `bulkAdd` o decompõe antes de gravar. Filtrar por ele daria zero em qualquer banco. */
const daTrilha = db.prepare(`
  SELECT c.src_lang, c.tgt_lang, c.cefr_level, c.cefr_confidence, COUNT(*) AS n
    FROM vocab_cards c
   WHERE c.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM vocab_occurrences o
                  WHERE o.card_id = c.id AND o.user_id = c.user_id
                    AND o.deleted_at IS NULL AND o.origin_kind = 'trilha')
   GROUP BY c.src_lang, c.tgt_lang, c.cefr_level, c.cefr_confidence
`).all();

const total = daTrilha.reduce((s, r) => s + r.n, 0);
let parErrado = 0;
let cefrFalso = 0;

for (const r of daTrilha) {
  const entrada = indice[base(r.src_lang)];
  if (entrada && !entrada.glosas.includes(base(r.tgt_lang))) parErrado += r.n;
  if (r.cefr_level && entrada?.escala === 'frequencia') cefrFalso += r.n;
}

console.log(`cartões vindos da trilha: ${total}`);
console.log(`  par sem glosa (tradução de outro idioma carimbada como do nativo): ${parErrado}`);
console.log(`  faixa de frequência gravada como nível CEFR: ${cefrFalso}`);
if (!parErrado && !cefrFalso) console.log('  nenhum dano encontrado neste banco.');

for (const r of daTrilha.filter(r => r.n > 0)) {
  console.log(`  ${r.src_lang}→${r.tgt_lang} · ${r.cefr_level ?? 'sem nível'} (conf ${r.cefr_confidence}) · ${r.n}`);
}
