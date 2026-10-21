import { Router } from 'express';

const router = Router();

router.get('/', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({ status: 'ok', service: 'manglam-hotel-api' });
});

export default router;
