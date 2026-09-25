/**
 * O SCHEMA ZOD DO PAYLOAD DE OFERTAS (`oferta_planos`, Fase 8). A forma e o padrão moram em
 * `src/core/ofertas.ts`; aqui mora a VALIDAÇÃO, que o servidor aplica duas vezes:
 *   - na ESCRITA (admin/CLI): payload inválido é recusado com 400 e a lista do que está errado;
 *   - na LEITURA (`server/lib/flags.ts`): linha editada à mão no banco e fora da forma tem o payload
 *     descartado — o cliente então usa o padrão embutido, que é "nenhuma oferta".
 *
 * Os tetos (quantidade de gatilhos, tamanho de texto) não são estética: o payload vai para TODO
 * cliente em toda leitura de `/api/flags`, inclusive o anônimo.
 */
import { z } from 'zod'

import { PLANOS_DA_FLAG } from '../../src/core/flags'
import {
  COMPONENTES_DE_OFERTA,
  type ConfigDeOfertas,
  FORMATO_DA_VARIANTE,
  MOMENTOS_DE_OFERTA,
  type TextoRemoto,
} from '../../src/core/ofertas'

/** `pt`, `en`, `pt-BR`, `zh-Hans`… */
export const FORMATO_DE_IDIOMA = /^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})?$/

const textoRemoto: z.ZodType<TextoRemoto> = z.union([
  z.string().trim().min(1).max(300),
  z
    .record(z.string().regex(FORMATO_DE_IDIOMA), z.string().trim().min(1).max(500))
    .refine((o) => Object.keys(o).length > 0, 'informe ao menos um idioma'),
])

const gatilhoSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,40}$/, 'id: minúsculas, dígitos, _ ou -, até 40'),
    momento: z.enum(MOMENTOS_DE_OFERTA),
    componente: z.enum(COMPONENTES_DE_OFERTA),
    titulo: textoRemoto,
    texto: textoRemoto,
    cta: textoRemoto,
    maxPorDia: z.number().int().min(0).max(50),
    maxPorSemana: z.number().int().min(0).max(200),
    intervaloMinHoras: z
      .number()
      .min(0)
      .max(24 * 30),
    planos: z.array(z.enum(PLANOS_DA_FLAG)).min(1),
    variante: z.string().regex(FORMATO_DA_VARIANTE, 'variante: minúsculas, dígitos, _ ou -, até 24').optional(),
  })
  .strict()
  .refine((g) => g.maxPorSemana >= g.maxPorDia, {
    message: 'maxPorSemana não pode ser menor que maxPorDia',
    path: ['maxPorSemana'],
  })

export const ofertasSchema = z
  .object({ gatilhos: z.array(gatilhoSchema).max(50) })
  .strict()
  .refine((c) => new Set(c.gatilhos.map((g) => g.id)).size === c.gatilhos.length, {
    message: 'ids de gatilho repetidos',
    path: ['gatilhos'],
  })

/* O schema e o tipo do núcleo não podem divergir: se um campo mudar num lado só, isto não compila. */
const _formaConfere: z.ZodType<ConfigDeOfertas> = ofertasSchema
void _formaConfere
