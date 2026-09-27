import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .max(280)
  .optional()
  .transform((value) => (value ? value : null));

const money = z
  .string()
  .trim()
  .min(1)
  .refine((value) => /^\d+([.,]\d{1,2})?$/.test(value.replace(/\s/g, '').replace('€', '')), {
    message: 'Precio no válido',
  });

const optionalMoney = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d+([.,]\d{1,2})?$/.test(value.replace(/\s/g, '').replace('€', '')), {
    message: 'Segundo precio no válido',
  });

export const menuBoardItemInputSchema = z
  .object({
    categoryId: z.string().uuid(),
    nameCa: z.string().trim().min(1, 'El nombre en catalán es obligatorio').max(120),
    nameEs: z.string().trim().max(120),
    nameEn: z.string().trim().max(120),
    descriptionCa: optionalText,
    descriptionEs: optionalText,
    descriptionEn: optionalText,
    price: money,
    secondaryPrice: optionalMoney,
    secondaryPriceLabelCa: optionalText,
    secondaryPriceLabelEs: optionalText,
    secondaryPriceLabelEn: optionalText,
    active: z.boolean(),
    itemKind: z.enum(['product', 'plate', 'plate_option']),
    plateSection: z.enum(['entrants', 'principals', 'side']).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.itemKind === 'plate_option' && !value.plateSection) {
      ctx.addIssue({
        code: 'custom',
        path: ['plateSection'],
        message: 'Elige la sección del Plat Marbella',
      });
    }
    if (value.itemKind !== 'plate_option' && value.plateSection) {
      ctx.addIssue({
        code: 'custom',
        path: ['plateSection'],
        message: 'La sección solo aplica a una opción del Plat Marbella',
      });
    }
  });

export type MenuBoardItemInput = z.infer<typeof menuBoardItemInputSchema>;
