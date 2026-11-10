import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import {
  handleVoucherAssetsGet,
  handleVoucherAssetsPost,
  handleVoucherAssetsPatch,
  handleVoucherAssetsDelete
} from './root';

// /api/v1/voucher-assets/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const voucherAssetsRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handleVoucherAssetsGet(c.env.event))
  .post('/', (c) => handleVoucherAssetsPost(c.env.event))
  .patch('/', (c) => handleVoucherAssetsPatch(c.env.event))
  .delete('/', (c) => handleVoucherAssetsDelete(c.env.event));
