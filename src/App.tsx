import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { AlertCircle, ShieldAlert, Zap, Info, CheckCircle2, Loader2, Send, Activity, Siren, MapPin, Navigation, LogIn, LogOut, History, Clock, ChevronRight, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(MAPS_API_KEY) && MAPS_API_KEY !== 'YOUR_API_KEY';

interface EmergencyResponse {
  type: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  actions: string[];
  precautions: string[];
  summary: string;
  searchQuery?: string; // Query for nearby facilities
}

interface IncidentRecord {
  id: string;
  input: string;
  response: EmergencyResponse;
  timestamp: any;
}

// Route Display Component
function RouteDisplay({ origin, destination }: { 
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
function MarkerWithInfoWindow({ place, userLocation, onGetDirections }: { 
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
function NearbyFacilities({ query, userLocation }: { query: string; userLocation: google.maps.LatLngLiteral }) {
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

export default function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<EmergencyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<IncidentRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // History Listener
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'incidents'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as IncidentRecord[];
      setHistory(records);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'incidents');
    });

    return () => unsubscribe();
  }, [user]);

  // Get user location for maps
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 37.42, lng: -122.08 }) // Default to Mountain View
      );
    }
  }, []);

  const analyzeEmergency = useCallback(async () => {
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `
        Analyze the following messy real-world emergency input and convert it into structured, life-saving actions.
        
        INPUT:
        "${input}"
        
        INSTRUCTIONS:
        1. Identify possible emergency type.
        2. Assess risk level (Low | Medium | High).
        3. Provide immediate actions (critical steps only).
        4. Provide precautions (bullet points).
        5. Provide a 1-line summary.
        6. Suggest a Google Maps search query for the nearest relevant emergency facility (e.g., "nearest hospital", "fire station", "police station").
        
        OUTPUT FORMAT (JSON):
        {
          "type": "short description",
          "riskLevel": "Low | Medium | High",
          "actions": ["step 1", "step 2", ...],
          "precautions": ["precaution 1", "precaution 2", ...],
          "summary": "one line summary",
          "searchQuery": "search query string"
        }
      `;

      const result = await genAI.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = result.text;
      if (text) {
        const parsed = JSON.parse(text) as EmergencyResponse;
        setResponse(parsed);

        // Save to Firestore if logged in
        if (user) {
          try {
            await addDoc(collection(db, 'incidents'), {
              uid: user.uid,
              input: input,
              response: parsed,
              location: userLocation,
              timestamp: Timestamp.now()
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'incidents');
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze input. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input, user]);

  const getRiskStyles = (level: string) => {
    switch (level) {
      case 'High': return 'text-red-400 bg-red-500/10 border-red-500/30 shadow-red-500/20';
      case 'Medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-amber-500/20';
      case 'Low': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-emerald-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'High': return <ShieldAlert className="w-6 h-6" />;
      case 'Medium': return <Zap className="w-6 h-6" />;
      case 'Low': return <Info className="w-6 h-6" />;
      default: return <AlertCircle className="w-6 h-6" />;
    }
  };

  if (!hasValidMapsKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="glass-card max-w-md w-full p-8 text-center space-y-6 rounded-3xl border border-white/10">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20">
            <MapPin className="w-8 h-8 text-red-500" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">Maps Key Required</h2>
          <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
            <p>To enable nearby emergency facility tracking, please provide a Google Maps API Key.</p>
            <div className="bg-white/5 p-4 rounded-xl text-left space-y-2 border border-white/5">
              <p className="font-bold text-white text-xs uppercase tracking-widest">Setup Instructions:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>Open <strong>Settings</strong> (⚙️ gear icon)</li>
                <li>Select <strong>Secrets</strong></li>
                <li>Add <code>GOOGLE_MAPS_PLATFORM_KEY</code></li>
                <li>Paste your key and press Enter</li>
              </ol>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 italic">The app will rebuild automatically after adding the secret.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh relative overflow-x-hidden selection:bg-red-500/30">
      {/* Skip to Content Link */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-red-600 focus:text-white focus:px-6 focus:py-3 focus:rounded-xl focus:font-black focus:uppercase focus:tracking-widest focus:shadow-2xl"
      >
        Skip to content
      </a>

      {/* Background Image Layer */}
      <div className="fixed inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&q=80&w=2000" 
          alt="Emergency Background" 
          className="w-full h-full object-cover opacity-10 mix-blend-overlay grayscale"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/80 to-slate-950" />
      </div>

      {/* Decorative Elements */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-50 z-50" />
      
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-16">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-red-600 blur-xl opacity-40 animate-pulse" />
              <div className="relative bg-red-600 p-3 rounded-2xl shadow-2xl shadow-red-900/50">
                <Siren className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">
                Response <span className="text-red-500">AI</span>
              </h1>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                <Activity className="w-3 h-3 text-red-500 animate-pulse" />
                Emergency Protocol v5.0
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            {user ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors relative"
                  aria-label="Toggle incident history"
                >
                  <History className="w-5 h-5" />
                  {history.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                      {history.length}
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-6 h-6 rounded-full border border-white/20" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-[10px] font-black text-white uppercase tracking-widest hidden sm:block">
                    {user.displayName?.split(' ')[0]}
                  </span>
                  <button onClick={logout} className="text-slate-400 hover:text-red-500 transition-colors" aria-label="Sign out">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="flex items-center gap-3 bg-white text-slate-950 px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors shadow-xl shadow-white/10"
              >
                <LogIn className="w-4 h-4" />
                Sign In with Google
              </button>
            )}
          </motion.div>
        </header>

        <main id="main-content" className="relative">
          {/* History Sidebar */}
          <AnimatePresence>
            {showHistory && user && (
              <motion.aside
                initial={{ opacity: 0, x: 300 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 300 }}
                className="fixed top-0 right-0 h-full w-80 bg-slate-950/95 backdrop-blur-2xl border-l border-white/10 z-[100] p-8 overflow-y-auto shadow-2xl"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-3">
                    <History className="w-4 h-4 text-red-500" />
                    Incident History
                  </h2>
                  <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white transition-colors">
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  {history.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                      <Clock className="w-12 h-12 text-slate-800 mx-auto" />
                      <p className="text-xs text-slate-600 font-bold uppercase tracking-widest leading-relaxed">No incidents recorded yet.</p>
                    </div>
                  ) : (
                    history.map((record) => (
                      <button
                        key={record.id}
                        onClick={() => {
                          setResponse(record.response);
                          setInput(record.input);
                          setShowHistory(false);
                        }}
                        className="w-full text-left glass-card p-4 rounded-2xl hover:bg-white/5 transition-all group border border-white/5 hover:border-white/20"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${getRiskStyles(record.response.riskLevel)}`}>
                            {record.response.riskLevel}
                          </span>
                          <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                            {record.location && <MapPin className="w-2 h-2 text-red-500" />}
                            {new Date(record.timestamp?.toDate()).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-white font-bold line-clamp-2 mb-1 group-hover:text-red-400 transition-colors">
                          {record.input}
                        </p>
                        <p className="text-[10px] text-slate-500 italic truncate">
                          {record.response.type}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
            {/* Main Input Area */}
            <div className="space-y-8">
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-[2rem] p-8 relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Activity className="w-32 h-32 text-white" />
                </div>
                
                <label htmlFor="emergency-input" className="block text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6">
                  Incident Description
                </label>
                
                <div className="relative">
                  <textarea
                    id="emergency-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe the emergency in detail..."
                    aria-label="Describe the emergency situation"
                    aria-describedby="input-instruction"
                    className="glass-input w-full min-h-[220px] p-6 rounded-2xl text-xl leading-relaxed text-white placeholder:text-slate-600 outline-none"
                  />
                  
                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p id="input-instruction" className="text-xs text-slate-500 italic max-w-xs">
                      AI will analyze your input to generate structured life-saving protocols.
                    </p>
                    <button
                      onClick={analyzeEmergency}
                      disabled={loading || !input.trim()}
                      aria-busy={loading}
                      aria-label="Analyze emergency situation"
                      className="w-full sm:w-auto bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white px-10 py-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-red-900/20 active:scale-95"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processing
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Generate Response
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.section>

              {/* Response Area */}
              <AnimatePresence mode="wait">
                {response && !loading && (
                  <motion.div
                    key="response"
                    role="region"
                    aria-live="polite"
                    aria-labelledby="response-heading"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-6"
                  >
                    {/* Summary Banner */}
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 flex items-center gap-6">
                      <div className="bg-emerald-500 p-3 rounded-2xl shadow-lg shadow-emerald-900/40">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <span id="response-heading" className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block mb-1">Executive Summary</span>
                        <p className="text-lg font-bold text-emerald-50 text-balance italic leading-tight">
                          "{response.summary}"
                        </p>
                      </div>
                    </div>

                    {/* Immediate Actions */}
                    <div className="glass-card rounded-[2rem] overflow-hidden">
                      <div className="bg-white/5 px-8 py-5 border-b border-white/10 flex items-center justify-between">
                        <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                          <Zap className="w-4 h-4 text-amber-400" aria-hidden="true" />
                          Critical Protocols
                        </h3>
                        <div className="px-3 py-1 bg-red-500/20 rounded-full text-[10px] font-bold text-red-400 uppercase tracking-widest border border-red-500/30">
                          Priority One
                        </div>
                      </div>
                      <div className="p-8 space-y-6">
                        {response.actions.map((action, idx) => (
                          <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            key={idx} 
                            className="flex gap-6 items-start group"
                            role="listitem"
                          >
                            <span className="flex-shrink-0 w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-sm font-black text-slate-400 border border-white/10 group-hover:bg-red-500 group-hover:text-white transition-all duration-500" aria-hidden="true">
                              {idx + 1}
                            </span>
                            <p className="text-slate-200 text-lg font-medium leading-relaxed pt-1.5">
                              {action}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Google Maps Integration */}
                    {MAPS_API_KEY && userLocation && response.searchQuery && (
                      <div className="glass-card rounded-[2rem] overflow-hidden h-[400px] relative">
                        <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                          <Navigation className="w-4 h-4 text-red-500" />
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">Nearby Facilities</span>
                        </div>
                        <APIProvider apiKey={MAPS_API_KEY}>
                          <Map
                            defaultCenter={userLocation}
                            defaultZoom={13}
                            mapId="EMERGENCY_MAP"
                            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                            style={{ width: '100%', height: '100%' }}
                            disableDefaultUI={true}
                          >
                            <AdvancedMarker position={userLocation} title="Your Location">
                              <Pin background="#3b82f6" glyphColor="#fff" borderColor="#1e3a8a" />
                            </AdvancedMarker>
                            <NearbyFacilities query={response.searchQuery} userLocation={userLocation} />
                          </Map>
                        </APIProvider>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sidebar Info */}
            <aside className="space-y-6">
              <AnimatePresence>
                {response && !loading ? (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-6"
                  >
                    {/* Risk Level Card */}
                    <div className={`glass-card rounded-3xl p-8 border-2 ${getRiskStyles(response.riskLevel)}`}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Risk Assessment</span>
                        {getRiskIcon(response.riskLevel)}
                      </div>
                      <div className="text-4xl font-black uppercase tracking-tighter mb-2 italic">
                        {response.riskLevel}
                      </div>
                      <p className="text-xs opacity-70 font-medium">
                        Situation categorized as {response.riskLevel.toLowerCase()} priority based on input analysis.
                      </p>
                    </div>

                    {/* Emergency Type Card */}
                    <div className="glass-card rounded-3xl p-8">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Classification</span>
                      <h2 className="text-2xl font-bold text-white leading-tight">{response.type}</h2>
                    </div>

                    {/* Precautions Card */}
                    <div className="glass-card rounded-3xl p-8">
                      <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                        Safety Warnings
                      </h3>
                      <ul className="space-y-4">
                        {response.precautions.map((precaution, idx) => (
                          <li key={idx} className="flex items-start gap-4 text-slate-400 text-sm leading-relaxed">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                            {precaution}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                ) : (
                  <div className="glass-card rounded-3xl p-8 text-center space-y-6 py-12">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
                      <Activity className="w-10 h-10 text-slate-600 animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-white font-bold">Awaiting Input</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Enter a description of the emergency to initialize response protocols.
                      </p>
                    </div>
                    {!user && (
                      <div className="pt-4 border-t border-white/5">
                        <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-3">Sign in to save history</p>
                        <button
                          onClick={signInWithGoogle}
                          className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-white/10"
                        >
                          <LogIn className="w-3 h-3" />
                          Sign In
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>

              {/* Global Warning */}
              <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/10 text-[10px] text-red-500/60 font-bold uppercase tracking-widest leading-relaxed text-center">
                Critical: AI guidance is supplemental. Always contact local emergency services immediately.
              </div>
            </aside>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 max-w-6xl mx-auto px-6 py-12 border-t border-white/5 mt-12 flex flex-col md:flex-row items-center justify-between gap-6 text-slate-600 text-[10px] font-bold uppercase tracking-widest">
          <p>© 2026 Emergency Response AI • Protocol 5.0</p>
          <div className="flex items-center gap-8">
            <a href="#" className="hover:text-red-500 transition-colors">Privacy</a>
            <a href="#" className="hover:text-red-500 transition-colors">Terms</a>
            <a href="#" className="hover:text-red-500 transition-colors">Contact</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
