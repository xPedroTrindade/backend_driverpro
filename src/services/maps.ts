// =============================================================================
// services/maps.ts — Proxy do Google Maps (a chave fica no SERVIDOR)
// -----------------------------------------------------------------------------
// Routes API (computeRoutes): rotas alternativas + distância + tempo + PEDÁGIO.
// A chave nunca vai para o app; o frontend chama /api/maps/routes.
// =============================================================================

export interface RouteOption {
    distanceKm: number;
    durationMin: number;
    tollBRL: number | null;
    coordinates: { latitude: number; longitude: number }[];
}

export async function computeRoutes(
    oLat: number,
    oLon: number,
    dLat: number,
    dLon: number,
): Promise<RouteOption[]> {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
        throw { status: 500, message: 'GOOGLE_MAPS_API_KEY não configurada no servidor.' };
    }

    const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask':
                'routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.travelAdvisory.tollInfo',
        },
        body: JSON.stringify({
            origin: { location: { latLng: { latitude: oLat, longitude: oLon } } },
            destination: { location: { latLng: { latitude: dLat, longitude: dLon } } },
            travelMode: 'DRIVE',
            computeAlternativeRoutes: true,
            extraComputations: ['TOLLS'],
            polylineEncoding: 'GEO_JSON_LINESTRING',
        }),
    });

    if (!resp.ok) {
        const detail = await resp.text();
        console.error('Google Routes erro:', resp.status, detail);
        throw { status: 502, message: 'Não foi possível calcular as rotas (Google).' };
    }

    const json: any = await resp.json();
    const routes: any[] = Array.isArray(json.routes) ? json.routes : [];

    return routes.map((r) => {
        const coords: [number, number][] = r.polyline?.geoJsonLinestring?.coordinates ?? [];
        const price = r.travelAdvisory?.tollInfo?.estimatedPrice?.[0];
        const tollBRL = price ? parseFloat(price.units ?? '0') + (price.nanos ?? 0) / 1e9 : null;
        return {
            distanceKm: (r.distanceMeters ?? 0) / 1000,
            durationMin: Math.round(parseInt(String(r.duration ?? '0'), 10) / 60),
            tollBRL,
            // GeoJSON vem como [lon, lat]; convertendo para {latitude, longitude}
            coordinates: coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
        };
    });
}
