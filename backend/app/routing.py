"""Road travel estimates. Only coordinates are sent to the routing provider."""
import math
import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

class Origin(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

def destination(center):
    try:
        return Origin(latitude=float(str(center.get('latitude','')).replace(',','.')),
                      longitude=float(str(center.get('longitude','')).replace(',','.')))
    except (ValueError, TypeError):
        raise HTTPException(422,'center_coordinates_missing')

async def estimate(base_url, origin, target):
    coordinates=f'{origin.longitude},{origin.latitude};{target.longitude},{target.latitude}'
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response=await client.get(f'{base_url.rstrip("/")}/route/v1/driving/{coordinates}',
                params={'overview':'false','alternatives':'false','radiuses':'500;500'})
            body=response.json()
            if body.get('code') in ('NoRoute','NoSegment'): raise HTTPException(422,'route_not_found')
            response.raise_for_status()
        if body.get('code') in ('NoRoute','NoSegment'): raise HTTPException(422,'route_not_found')
        if body.get('code')!='Ok': raise ValueError('routing_response')
        route=body['routes'][0]
        duration=float(route['duration']); distance=float(route['distance'])
        if not all(math.isfinite(v) and v>=0 for v in (duration,distance)): raise ValueError('routing_response')
        return {'duration_seconds':math.ceil(duration),'distance_meters':round(distance),
                'provider':'OSRM','traffic_included':False}
    except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError):
        raise HTTPException(503,'routing_unavailable') from None
