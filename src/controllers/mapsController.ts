import { Request, Response } from 'express';
import { z } from 'zod';
import { computeRoutes } from '../services/maps';

const routesSchema = z.object({
    oLat: z.number(),
    oLon: z.number(),
    dLat: z.number(),
    dLon: z.number(),
});

// POST /api/maps/routes — rotas alternativas (Google) com distância, tempo e pedágio
export const getRoutes = async (req: Request, res: Response): Promise<void> => {
    try {
        const { oLat, oLon, dLat, dLon } = routesSchema.parse(req.body);
        const routes = await computeRoutes(oLat, oLon, dLat, dLon);
        res.json(routes);
    } catch (err: any) {
        if (err.name === 'ZodError') { res.status(422).json({ error: err.issues[0].message }); return; }
        res.status(err.status ?? 500).json({ error: err.message ?? 'Erro ao calcular rotas.' });
    }
};
