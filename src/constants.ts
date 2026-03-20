
export const MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
export const HAS_VALID_MAPS_KEY = Boolean(MAPS_API_KEY) && MAPS_API_KEY !== 'YOUR_API_KEY';

export const DEFAULT_LOCATION: google.maps.LatLngLiteral = { lat: 37.42, lng: -122.08 };

export const EMERGENCY_CONTACTS = [
  { name: 'Emergency Services', number: '911 / 112' },
  { name: 'Poison Control', number: '1-800-222-1222' }
];

export const MAX_HISTORY_ITEMS = 20;
export const MAX_INPUT_LENGTH = 5000;
