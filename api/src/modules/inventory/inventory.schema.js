import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  price: z.number().min(0).default(0),
  stock: z.number().int().min(0).default(0),
  status: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).default('IN_STOCK'),
  warehouse: z.string().optional(),
  aisle: z.string().optional(),
  bin: z.string().optional(),
  avgMonthlyUsage: z.number().optional(),
  leadTimeDays: z.number().int().optional(),
  minThreshold: z.number().int().min(0).default(10),
});

export const updateProductSchema = productSchema.partial();
