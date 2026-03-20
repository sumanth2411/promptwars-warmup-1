import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  AlertCircle, ShieldAlert, Zap, 
  Loader2, Send, Activity, Siren, MapPin, Navigation, 
  LogIn, LogOut, User as UserIcon 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';

// Components
import { NearbyFacilities } from './components/NearbyFacilities';
import { EmergencyResponseView, IncidentHistory } from './components/EmergencyComponents';

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
  location?: any;
  timestamp: any;
}

export default function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<EmergencyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<IncidentRecord[]>([]);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral>({ lat: 37.42, lng: -122.08 });
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Memoized current user UID
  const userUid = useMemo(() => user?.uid, [user]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error("Error getting location:", error)
      );
    }
  }, []);

  // History Listener
  useEffect(() => {
    if (!userUid || !isAuthReady) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'incidents'),
      where('uid', '==', userUid),
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
  }, [userUid, isAuthReady]);

  const analyzeEmergency = useCallback(async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const prompt = `Analyze this emergency situation and provide a structured response in JSON format: "${input}". 
      Include:
      1. type: The type of emergency.
      2. riskLevel: "Low", "Medium", or "High".
      3. actions: Array of 3-5 immediate life-saving actions.
      4. precautions: Array of 3-5 critical precautions.
      5. summary: A 1-sentence executive summary.
      6. searchQuery: A specific search query to find the nearest relevant emergency facility (e.g. "nearest trauma center", "nearest fire station", "nearest poison control center").`;

      const result = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
              actions: { type: Type.ARRAY, items: { type: Type.STRING } },
              precautions: { type: Type.ARRAY, items: { type: Type.STRING } },
              summary: { type: Type.STRING },
              searchQuery: { type: Type.STRING }
            },
            required: ["type", "riskLevel", "actions", "precautions", "summary", "searchQuery"]
          }
        }
      });

      const parsed = JSON.parse(result.text) as EmergencyResponse;
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
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Failed to analyze the situation. Please try again or call emergency services.");
    } finally {
      setLoading(false);
    }
  }, [input, user, userLocation]);

  const handleHistorySelect = useCallback((record: IncidentRecord) => {
    setResponse(record.response);
    setInput(record.input);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSignIn = useCallback(() => signInWithGoogle(), []);
  const handleLogout = useCallback(() => logout(), []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-emerald-500/30">
      <a href="#emergency-input" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold">
        Skip to emergency input
      </a>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-header border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse">
              <Siren className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black italic uppercase tracking-tighter leading-none">Guardian AI</h1>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1 block">Emergency Response Protocol</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4 bg-white/5 p-1.5 pr-4 rounded-2xl border border-white/5">
                <img 
                  src={user.photoURL || ''} 
                  alt={user.displayName || 'User'} 
                  className="w-8 h-8 rounded-xl border border-white/10"
                  referrerPolicy="no-referrer"
                />
                <div className="hidden sm:block">
                  <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">
                    {user.displayName?.split(' ')[0]}
                  </p>
                  <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest leading-none">Active Session</p>
                </div>
                <button 
                  onClick={handleLogout}
                  aria-label="Sign out"
                  className="ml-2 p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleSignIn}
                className="flex items-center gap-3 bg-white text-slate-950 px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-xl active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                Sign In with Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Input & Results */}
          <div className="lg:col-span-8 space-y-12">
            
            {/* Input Section */}
            <section className="relative group">
              <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative glass-card p-10 rounded-[3rem] border border-white/10 shadow-2xl">
                <div className="flex items-center gap-3 mb-8">
                  <Activity className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-xs font-black text-white uppercase tracking-widest">Emergency Input</h2>
                </div>
                
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
                      className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(16,185,129,0.3)] active:scale-95"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Analyze Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-4 text-red-400"
                >
                  <AlertCircle className="w-6 h-6 shrink-0" />
                  <p className="text-sm font-bold">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Response Section */}
            <AnimatePresence>
              {response && (
                <motion.section 
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-12"
                  role="region"
                  aria-labelledby="response-heading"
                  aria-live="polite"
                >
                  <EmergencyResponseView response={response} />

                  {/* Maps Section */}
                  {hasValidMapsKey && response.searchQuery && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center gap-3 px-2">
                        <MapPin className="w-5 h-5 text-red-500" />
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">Nearby Emergency Facilities</h3>
                      </div>
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
                    </motion.div>
                  )}
                </motion.section>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: History & Stats */}
          <aside className="lg:col-span-4 space-y-8">
            {user ? (
              <IncidentHistory history={history} onSelect={handleHistorySelect} />
            ) : (
              <div className="glass-card p-10 rounded-[2.5rem] text-center border border-dashed border-white/10">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
                  <UserIcon className="w-8 h-8 text-slate-700" />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">Personal Dashboard</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-8">
                  Sign in to securely store your incident history and access personalized emergency protocols.
                </p>
                <button 
                  onClick={handleSignIn}
                  className="w-full bg-white text-slate-950 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all active:scale-95"
                >
                  Connect with Google
                </button>
              </div>
            )}

            {/* Emergency Contacts */}
            <div className="glass-card p-8 rounded-[2.5rem] bg-red-950/20 border-red-500/10">
              <h3 className="text-xs font-black text-red-500 uppercase tracking-widest mb-6">Global Emergency</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 rounded-2xl bg-white/5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emergency Services</span>
                  <span className="text-lg font-black italic text-white tracking-tighter">911 / 112</span>
                </div>
                <div className="flex justify-between items-center p-4 rounded-2xl bg-white/5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Poison Control</span>
                  <span className="text-lg font-black italic text-white tracking-tighter">1-800-222-1222</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 opacity-30">
            <Siren className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Guardian AI System v2.1</span>
          </div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center md:text-right max-w-md leading-relaxed">
            Disclaimer: This AI is for informational purposes only. In life-threatening situations, always contact professional emergency services immediately.
          </p>
        </div>
      </footer>
    </div>
  );
}
