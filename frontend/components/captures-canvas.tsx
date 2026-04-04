"use client";

import React, { useState, useMemo } from "react";
import { 
  Camera, 
  Filter, 
  Calendar, 
  Search, 
  ChevronDown, 
  LayoutGrid, 
  List,
  Plus
} from "lucide-react";
import { EvidenceGallery } from "./evidence-gallery";

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  status: string;
  quality_score: number;
  is_visible_to_client: boolean;
  ai_processing_status: string;
  url_archivo: string;
  created_at?: string;
};

type Task = {
  id: string;
  title: string;
};

type Project = {
  id: string;
  name: string;
};

type CapturesCanvasProps = {
  project: Project | null;
  evidences: Evidence[];
  tasks: Task[];
  onNewCapture?: () => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  loading?: boolean;
};

export function CapturesCanvas({
  project,
  evidences,
  tasks,
  onNewCapture,
  onApprove,
  onReject,
  loading
}: CapturesCanvasProps) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTaskId, setFilterTaskId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredEvidences = useMemo(() => {
    return evidences.filter(ev => {
      const matchStatus = filterStatus === "all" || ev.status === filterStatus;
      const matchTask = filterTaskId === "all" || ev.task_id === filterTaskId;
      const matchSearch = searchQuery === "" || ev.file_name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchTask && matchSearch;
    });
  }, [evidences, filterStatus, filterTaskId, searchQuery]);

  if (!project) return null;

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header section with refined Midnight Glass aesthetic */}
      <div className="p-8 border-b border-white/5 bg-white/[0.02]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Camera className="text-blue-400" size={20} />
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight uppercase">Progress Gallery</h1>
            </div>
            <p className="text-xs text-white/40 font-bold uppercase tracking-[0.2em]">
              {project.name} · {evidences.length} Total Records
            </p>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center bg-white/5 border border-white/5 rounded-xl p-1">
                <button 
                   onClick={() => setViewMode("grid")}
                   className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"}`}
                >
                   <LayoutGrid size={18} />
                </button>
                <button 
                   onClick={() => setViewMode("list")}
                   className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white/10 text-white shadow-lg" : "text-white/20 hover:text-white/40"}`}
                >
                   <List size={18} />
                </button>
             </div>
             
             <button 
                onClick={onNewCapture}
                className="btn-glass px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
             >
                <Plus size={18} />
                <span className="text-xs tracking-widest uppercase">New Capture</span>
             </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mt-8 flex flex-wrap items-center gap-4">
           <div className="relative group flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-400 transition-colors" />
              <input 
                 type="text"
                  placeholder="SEARCH BY NAME..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full bg-white/5 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white placeholder:text-white/10 focus:border-blue-500/30 transition-all outline-none"
              />
           </div>

           <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl">
                 <Filter size={12} className="text-white/30" />
                 <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-white/80 outline-none cursor-pointer"
                 >
                    <option value="all">ALL STATUSES</option>
                    <option value="pending_approval">PENDING</option>
                    <option value="approved">APPROVED</option>
                    <option value="rejected">REJECTED</option>
                 </select>
              </div>

              <div className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl">
                 <Calendar size={12} className="text-white/30" />
                 <select 
                    value={filterTaskId}
                    onChange={(e) => setFilterTaskId(e.target.value)}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-white/80 outline-none cursor-pointer max-w-[150px] truncate"
                 >
                    <option value="all">ALL TASKS</option>
                    {tasks.map(t => (
                       <option key={t.id} value={t.id}>{t.title.toUpperCase()}</option>
                    ))}
                 </select>
              </div>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
         {loading ? (
            <div className="h-full flex items-center justify-center">
               <div className="flex flex-col items-center gap-4">
                  <div className="h-12 w-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] animate-pulse">Syncing Gallery...</p>
               </div>
            </div>
         ) : filteredEvidences.length > 0 ? (
            <EvidenceGallery 
               evidences={filteredEvidences} 
               onApprove={onApprove}
               onReject={onReject}
               showActions={true}
            />
         ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-20">
               <Camera size={64} strokeWidth={1} />
               <div className="space-y-2">
                  <h3 className="text-xl font-black uppercase tracking-[0.2em]">No Captures Found</h3>
                  <p className="text-xs font-bold font-mono">Try changing filters or upload a new image.</p>
               </div>
               <button 
                  onClick={onNewCapture}
                  className="px-6 py-2 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
               >
                  Upload Capture
               </button>
            </div>
         )}
      </div>

      {/* Technical Footer Indicator */}
      <div className="p-6 text-center border-t border-white/5 bg-white/[0.01]">
         <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
            ProjectPulse Operational Engine · Digital Evidence Vault v2.4
          </div>
       </div>
    </div>
  );
}
