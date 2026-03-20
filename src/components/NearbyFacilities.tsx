import React, { useEffect, useState, useRef } from 'react';
import { AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { Navigation, MapPin } from 'lucide-react';

// Route Display Component
export function RouteDisplay({ origin, destination }: { 
  origin: google.maps.LatLngLiteral; 
  destination: google.maps.LatLngLiteral;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !origin || !destination) return;

    // Clear previous route
    polylinesRef.current.forEach(p => p.setMap(null));

    (routesLib as any).Route.computeRoutes({
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    }).then(({ routes }: { routes: any[] }) => {
      if (routes?.[0]) {
        const newPolylines = routes[0].createPolylines();
        newPolylines.forEach((p: any) => p.setMap(map));
        polylinesRef.current = newPolylines;
        if (routes[0].viewport) map.fitBounds(routes[0].viewport);
      }
    });

    return () => polylinesRef.current.forEach(p => p.setMap(null));
  }, [routesLib, map, origin, destination]);

  return null;
}

// Marker with InfoWindow Component
export function MarkerWithInfoWindow({ place, userLocation, onGetDirections }: { 
  place: any; 
  userLocation: google.maps.LatLngLiteral;
  onGetDirections: (dest: google.maps.LatLngLiteral) => void;
  key?: any;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdvancedMarker 
        ref={markerRef}
        position={place.location} 
        onClick={() => setOpen(true)}
        title={place.displayName || 'Emergency Facility'}
      >
        <Pin background="#ef4444" glyphColor="#fff" borderColor="#991b1b" />
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-2 max-w-[200px] space-y-2">
            <h4 className="font-bold text-slate-900 text-sm">{place.displayName}</h4>
            <p className="text-[10px] text-slate-600 leading-tight">{place.formattedAddress}</p>
            <button 
              onClick={() => {
                if (place.location) onGetDirections(place.location as unknown as google.maps.LatLngLiteral);
                setOpen(false);
              }}
              className="w-full bg-red-600 text-white text-[10px] font-black uppercase tracking-widest py-1.5 rounded-lg hover:bg-red-500 transition-colors"
            >
              Get Directions
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// Nearby Facilities Component
export function NearbyFacilities({ query, userLocation }: { query: string; userLocation: google.maps.LatLngLiteral }) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [places, setPlaces] = useState<google.maps.places.Place[]>([]);
  const [destination, setDestination] = useState<google.maps.LatLngLiteral | null>(null);

  useEffect(() => {
    if (!placesLib || !map || !query) return;

    const center = map.getCenter();
    if (!center) return;

    placesLib.Place.searchByText({
      textQuery: query,
      fields: ['displayName', 'location', 'formattedAddress', 'id'],
      locationBias: center,
      maxResultCount: 5,
    }).then(({ places }) => {
      setPlaces(places || []);
    });
  }, [placesLib, map, query]);

  return (
    <>
      {places.map((p) => (
        <MarkerWithInfoWindow 
          key={p.id as any} 
          place={p as any} 
          userLocation={userLocation}
          onGetDirections={setDestination}
        />
      ))}
      {destination && <RouteDisplay origin={userLocation} destination={destination} />}
    </>
  );
}
