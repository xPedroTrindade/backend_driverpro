import { Request, Response } from 'express';
import { z } from 'zod';
import { computeRoutes, autocomplete, placeDetails } from '../services/maps';

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

// GET /api/maps/autocomplete?q= — sugestões de endereço (Google Places)
export const getAutocomplete = async (req: Request, res: Response): Promise<void> => {
    try {
        const q = String(req.query.q ?? '').trim();
        if (q.length < 3) { res.json([]); return; }
        const results = await autocomplete(q);
        res.json(results);
    } catch {
        res.status(500).json({ error: 'Erro no autocomplete.' });
    }
};

// GET /api/maps/place/:placeId — coordenadas/detalhes de um lugar
export const getPlace = async (req: Request, res: Response): Promise<void> => {
    try {
        const place = await placeDetails(String(req.params.placeId));
        if (!place) { res.status(404).json({ error: 'Local não encontrado.' }); return; }
        res.json(place);
    } catch {
        res.status(500).json({ error: 'Erro ao buscar local.' });
    }
};
