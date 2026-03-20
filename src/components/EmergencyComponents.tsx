import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertCircle, ShieldAlert, Zap, Info, CheckCircle2, 
  Activity, Siren, MapPin, Clock, ChevronRight, History 
} from 'lucide-react';

interface EmergencyResponse {
  type: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  actions: string[];
  precautions: string[];
  summary: string;
  searchQuery?: string;
}

interface IncidentRecord {
  id: string;
  input: string;
  response: EmergencyResponse;
  location?: any;
  timestamp: any;
}

const getRiskStyles = (level: string) => {
  switch (level) {
    case 'High': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'Medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    default: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  }
};

export const EmergencyResponseView = ({ response }: { response: EmergencyResponse }) => {
  return (
    <div className="space-y-8">
      {/* Risk Banner */}
      <div className={`p-8 rounded-[2rem] border backdrop-blur-xl flex items-center gap-6 ${getRiskStyles(response.riskLevel)}`}>
        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 block mb-1">Risk Assessment</span>
          <h2 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
            {response.riskLevel} Alert
          </h2>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="bg-emerald-900/40 border border-emerald-500/20 p-8 rounded-[2rem] flex items-center gap-6">
        <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <span id="response-heading" className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block mb-1">Executive Summary</span>
          <p className="text-lg font-bold text-emerald-50 text-balance italic leading-tight">
            "{response.summary}"
          </p>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Actions */}
        <div className="glass-card p-8 rounded-[2.5rem] space-y-6">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-widest">Immediate Actions</h3>
          </div>
          <div className="space-y-3">
            {response.actions.map((action, i) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                key={i} 
                className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
              >
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 text-[10px] font-black flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-300 leading-relaxed">{action}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Precautions */}
        <div className="glass-card p-8 rounded-[2.5rem] space-y-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-widest">Critical Precautions</h3>
          </div>
          <div className="space-y-3">
            {response.precautions.map((precaution, i) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                key={i} 
                className="flex items-start gap-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/10 hover:bg-red-500/20 transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 shrink-0 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                <p className="text-sm text-slate-300 leading-relaxed">{precaution}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const IncidentHistory = ({ 
  history, 
  onSelect 
}: { 
  history: IncidentRecord[]; 
  onSelect: (record: IncidentRecord) => void;
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-2">
        <History className="w-5 h-5 text-emerald-500" />
        <h3 className="text-xs font-black text-white uppercase tracking-widest">Incident History</h3>
      </div>
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {history.map((record) => (
          <button
            key={record.id}
            onClick={() => onSelect(record)}
            className="w-full text-left glass-card p-5 rounded-3xl hover:bg-white/10 transition-all group border border-white/5 hover:border-white/20"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${getRiskStyles(record.response.riskLevel)}`}>
                  {record.response.riskLevel}
                </span>
                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                  {record.location && <MapPin className="w-2 h-2 text-red-500" />}
                  {new Date(record.timestamp?.toDate()).toLocaleDateString()}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-white transition-colors" />
            </div>
            <p className="text-xs text-white font-bold line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
              {record.input}
            </p>
          </button>
        ))}
        {history.length === 0 && (
          <div className="text-center py-12 px-6 rounded-3xl border border-dashed border-white/10">
            <Clock className="w-8 h-8 text-slate-800 mx-auto mb-3" />
            <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">No incidents recorded yet</p>
          </div>
        )}
      </div>
    </div>
  );
};
