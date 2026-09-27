import { z } from 'zod';

export const menuBoardPlaceSchema = z.object({
  categoryId: z.string().uuid(),
  articuloId: z.number().int().positive({ message: 'Elige un producto de la carta' }),
  active: z.boolean(),
});

export type MenuBoardPlaceInput = z.infer<typeof menuBoardPlaceSchema>;
