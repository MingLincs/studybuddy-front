"use client";
// components/UploadProgressModal.tsx
// Full-screen blocking overlay that polls processing status and shows live progress.

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/env";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

interface Props {
  docId: string;
  classId: string;
  fileName: string;
  onClose: () => void;
}

type Stage = "upload" | "processing" | "done" | "error";

interface Status {
  status: string;
  stage: string;
  stage_index: number;
  total_stages: number;
  stats?: { concepts_extracted?: number; flashcards_created?: number; syllabus_weeks?: number };
  error?: string;
}

const STAGE_LABELS = ["Upload", "Processing", "Study Plan"];
const TIPS = [
  "AI is reading through your document...",
  "Extracting key concepts and relationships...",
  "Building your knowledge graph...",
  "Generating flashcards from core concepts...",
  "Writing your study summary...",
  "Almost there — finalizing your materials!",
];

export default function UploadProgressModal({ docId, classId, fileName, onClose }: Props) {
  const router = useRouter();
  const [status, setStatus]     = useState<Status | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [uploadPct, setUploadPct] = useState(0);
  const [processPct, setProcessPct] = useState(0);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const pollRef                 = useRef<NodeJS.Timeout | null>(null);
  const tipRef                  = useRef<NodeJS.Timeout | null>(null);

  // Animate upload bar to 100% quickly
  useEffect(() => {
    let pct = 0;
    const t = setInterval(() => {
      pct += 8;
      if (pct >= 100) { pct = 100; clearInterval(t); }
      setUploadPct(pct);
    }, 60);
    return () => clearInterval(t);
  }, []);

  // Rotate tips
  useEffect(() => {
    tipRef.current = setInterval(() => {
      setTipIndex(i => (i + 1) % TIPS.length);
    }, 3200);
    return () => { if (tipRef.current) clearInterval(tipRef.current); };
  }, []);

  // Poll processing status
  useEffect(() => {
    let attempts = 0;
    const MAX = 120; // 2 min max

    const poll = async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        const res = await fetch(`${API_BASE}/intelligent/process-status/${docId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) throw new Error("Status check failed");
        const s: Status = await res.json();
        setStatus(s);

        // Animate process bar based on stage
        const target = s.stage_index >= 3 ? 100 : Math.min(90, (s.stage_index / 3) * 100 + attempts * 0.4);
        setProcessPct(Math.round(target));

        if (s.status === "done") {
          setProcessPct(100);
          setDone(true);
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }

        if (s.status === "error") {
          setError(s.error || "Processing failed");
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }

        attempts++;
        if (attempts >= MAX) {
          setError("Processing timed out. Your document was saved — check your library.");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (e) {
        // Silently retry
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [docId]);

  const handleViewMaterials = () => {
    router.push(`/doc/${docId}`);
    onClose();
  };

  const currentStageIndex = status ? Math.min(status.stage_index, 3) : 1;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        {/* Header */}
        <div className="modal-header">
          <div className="dog-emoji">🐶</div>
          <h2 className="modal-title">
            {done ? "Your Materials Are Ready!" : error ? "Something Went Wrong" : "Preparing Your Materials"}
          </h2>
          <p className="modal-subtitle">
            {done
              ? "AI has generated your flashcards, summary, and concept map."
              : error
              ? error
              : "We're analyzing your content and creating smart study materials."}
          </p>
        </div>

        {/* Stage indicators */}
        <div className="stages">
          {STAGE_LABELS.map((label, i) => {
            const idx   = i + 1;
            const state = done ? "done" : error && i >= currentStageIndex - 1 ? "error" : idx < currentStageIndex ? "done" : idx === currentStageIndex ? "active" : "pending";
            return (
              <div key={label} className={`stage-item ${state}`}>
                <div className="stage-icon">
                  {state === "done"   ? "✓" :
                   state === "error"  ? "✕" :
                   state === "active" ? <span className="spin">⟳</span> :
                   label === "Upload" ? "↑" : label === "Processing" ? "⚙" : "🎓"}
                </div>
                <div className="stage-label">{label}</div>
                <div className="stage-status">
                  {state === "done"   ? "Complete"  :
                   state === "error"  ? "Failed"    :
                   state === "active" ? "In progress..." :
                   "Pending..."}
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bars */}
        <div className="progress-section">
          <div className="progress-row">
            <span className="progress-label">Uploading</span>
            <span className={`progress-badge ${uploadPct === 100 ? "complete" : ""}`}>
              {uploadPct === 100 ? "Complete!" : `${uploadPct}%`}
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${uploadPct}%` }} />
          </div>

          <div className="progress-row" style={{ marginTop: 16 }}>
            <span className="progress-label">Processing Progress</span>
            <span className={`progress-badge ${processPct === 100 ? "complete" : ""}`}>
              {done ? "Complete!" : `${processPct}%`}
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill ai-fill" style={{ width: `${processPct}%`, transition: "width 1s ease" }} />
          </div>
        </div>

        {/* Tip or stats */}
        {!done && !error && (
          <div className="tip-box">
            <span className="tip-label">Tip:</span> {TIPS[tipIndex]}
          </div>
        )}

        {done && status?.stats && (
          <div className="stats-row">
            {status.stats.concepts_extracted != null && (
              <div className="stat-chip">🧠 {status.stats.concepts_extracted} concepts</div>
            )}
            {status.stats.flashcards_created != null && (
              <div className="stat-chip">🃏 {status.stats.flashcards_created} flashcards</div>
            )}
            {status.stats.syllabus_weeks != null && (
              <div className="stat-chip">📅 {status.stats.syllabus_weeks}-week plan</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          {done ? (
            <button className="btn-primary" onClick={handleViewMaterials}>
              View Study Materials →
            </button>
          ) : error ? (
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          ) : (
            <p className="footer-note">
              We're processing your materials with AI to create the best study experience.<br />
              This includes generating notes, flashcards, practice tests, and more.<br />
              You'll be redirected automatically when ready.
            </p>
          )}
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .modal-card {
          background: white;
          border-radius: 24px;
          padding: 40px 36px;
          max-width: 560px;
          width: 100%;
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.25s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .modal-header {
          text-align: center;
          margin-bottom: 28px;
        }

        .dog-emoji {
          font-size: 52px;
          margin-bottom: 12px;
          display: block;
        }

        .modal-title {
          font-size: 22px;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 8px;
        }

        .modal-subtitle {
          font-size: 14px;
          color: #64748b;
          margin: 0;
          line-height: 1.5;
        }

        /* Stage indicators */
        .stages {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 28px;
        }

        .stage-item {
          border: 1.5px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px 12px;
          text-align: center;
          transition: all 0.3s;
        }

        .stage-item.active {
          border-color: #667eea;
          background: #f5f3ff;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
        }

        .stage-item.done {
          border-color: #22c55e;
          background: #f0fdf4;
        }

        .stage-item.error {
          border-color: #ef4444;
          background: #fef2f2;
        }

        .stage-icon {
          font-size: 22px;
          margin-bottom: 6px;
          color: #94a3b8;
        }

        .stage-item.active .stage-icon { color: #667eea; }
        .stage-item.done  .stage-icon { color: #22c55e; }
        .stage-item.error .stage-icon { color: #ef4444; }

        .stage-label {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 3px;
        }

        .stage-status {
          font-size: 11px;
          color: #94a3b8;
        }

        .stage-item.active .stage-status { color: #667eea; }
        .stage-item.done  .stage-status { color: #22c55e; }
        .stage-item.error .stage-status { color: #ef4444; }

        .spin {
          display: inline-block;
          animation: spinAnim 1s linear infinite;
        }

        @keyframes spinAnim {
          to { transform: rotate(360deg); }
        }

        /* Progress bars */
        .progress-section { margin-bottom: 20px; }

        .progress-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .progress-label {
          font-size: 13px;
          font-weight: 600;
          color: #475569;
        }

        .progress-badge {
          font-size: 12px;
          font-weight: 700;
          color: #667eea;
          background: #f0f0ff;
          padding: 2px 10px;
          border-radius: 20px;
        }

        .progress-badge.complete {
          color: #16a34a;
          background: #dcfce7;
        }

        .progress-track {
          height: 8px;
          background: #f1f5f9;
          border-radius: 8px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 8px;
          transition: width 0.4s ease;
        }

        .ai-fill {
          background: linear-gradient(90deg, #4facfe, #667eea, #764ba2);
        }

        /* Tip */
        .tip-box {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 13px;
          color: #92400e;
          margin-bottom: 20px;
          min-height: 44px;
          transition: all 0.3s;
        }

        .tip-label { font-weight: 700; }

        /* Stats */
        .stats-row {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .stat-chip {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 20px;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 600;
          color: #0369a1;
        }

        /* Footer */
        .modal-footer { text-align: center; }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 14px;
          padding: 15px 32px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }

        .btn-secondary {
          background: #f1f5f9;
          color: #475569;
          border: none;
          border-radius: 14px;
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }

        .footer-note {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.6;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
