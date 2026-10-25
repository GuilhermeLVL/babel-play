/**
 * VALIDA UM REGISTRO DE PROVEDORES DE IA e mostra o que ele faz, antes de ir para o ambiente.
 *
 *   npx tsx scripts/ia/validar-registro.ts [arquivo.json]      # padrão: ops/ia-provedores.openrouter.json
 *
 * Confere nas duas modalidades (desenvolvimento e produção: a produção exige retenção zero e https), lista a cascata de cada
 * função (e de cada nível da tradução) e diz quais variáveis de chave o registro nomeia e se elas existem no ambiente.
 * NUNCA imprime valor de chave. O Gemini é recusado pelo próprio registro (o app atende menores).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  endpointDaTranscricao,
  esquecerRegistro,
  pernasDaFuncao,
  validarRegistro,
} from '../../server/ai/registroDeProvedores';

const arquivo = path.resolve(process.argv[2] ?? 'ops/ia-provedores.openrouter.json');
const bruto = JSON.parse(readFileSync(arquivo, 'utf8')) as { provedores?: Array<{ chave?: string; conta?: string }> };

let ok = true;
for (const producao of [false, true]) {
  const r = validarRegistro(bruto, { producao });
  console.log(`${producao ? 'produção     ' : 'desenvolvimento'}: ${r.ok ? 'VÁLIDO' : 'INVÁLIDO'}`);
  if (!r.ok) {
    ok = false;
    // O tsconfig não é `strict`: `!r.ok` não estreita a união, então o tipo é dito à mão.
    for (const e of (r as { erros: string[] }).erros) console.log(`   - ${e}`);
  }
}

esquecerRegistro();
const chaves = [...new Set((bruto.provedores ?? []).flatMap((p) => [p.chave, p.conta]).filter(Boolean))] as string[];
const env = { ...process.env, IA_PROVEDORES_ARQUIVO: arquivo } as NodeJS.ProcessEnv;
for (const c of chaves) env[c] ||= 'x'; // só para montar as pernas; o valor real não é lido nem impresso

console.log('\nCascata por função (a ordem é a das pernas):');
for (const f of ['stt', 'traducao', 'tutor', 'tts'] as const) {
  const pernas = pernasDaFuncao(f, {}, env);
  if (!pernas.length) continue;
  console.log(`  ${f}: ${pernas.map((p) => `${p.fornecedor ?? p.rotulo}:${p.model}`).join('  →  ')}`);
}
for (const nivel of ['rapida', 'nuance', 'polimento'] as const) {
  const pernas = pernasDaFuncao('traducao', { nivel }, env);
  if (pernas.length) console.log(`  tradução nível ${nivel}: ${pernas.map((p) => p.model).join('  →  ')}`);
}
for (const nivel of ['rapida', 'nuance'] as const) {
  const pernas = pernasDaFuncao('explicacao', { nivel }, env);
  if (pernas.length) console.log(`  explicação nível ${nivel}: ${pernas.map((p) => p.model).join('  →  ')}`);
}
const stt = pernasDaFuncao('stt', {}, env)[0];
if (stt) console.log(`  endpoint de transcrição: ${endpointDaTranscricao(stt) ?? '(nenhum)'}`);

console.log('\nChaves que o registro nomeia (só presença; o valor nunca é impresso):');
for (const c of chaves) console.log(`  ${c}: ${process.env[c]?.trim() ? 'definida' : 'AUSENTE no ambiente'}`);
process.exit(ok ? 0 : 1);
