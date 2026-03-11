"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TodayPlan = {
  class_name: string;
  current_week: number;
  week_title: string;
  today_focus: string[];
  estimated_time: number;
  why_important: string;
  upcoming_assessments: Array<{
    name: string;
    type: string;
    week: number;
    weight: number;
  }>;
  your_progress: {
    concepts_mastered: number;
    this_week_topics: string[];
  };
  study_methods: string[];
};

export default function SmartDashboard() {
  const { id } = useParams();
  const router = useRouter();
  const [todayPlan, setTodayPlan] = useState<TodayPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  useEffect(() => {
    loadTodayPlan();
  }, [id]);

  async function loadTodayPlan() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/intelligent/dashboard/${id}/today`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load dashboard');
      }

      const data = await response.json();
      
      if (data.message && data.message.includes('Upload your syllabus')) {
        setError('no_syllabus');
      } else {
        setTodayPlan(data);
      }
    } catch (err) {
      console.error('Dashboard error:', err);
      setError('error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploadStatus('uploading');
    setUploadError(null);
    setUploadResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/'); return; }
      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/intelligent/process-document/${id}`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: fd }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Upload failed');
      }
      const data = await res.json();
      setUploadResult(data);
      setUploadStatus('done');
    } catch (e: unknown) {
      setUploadStatus('error');
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  function openUpload() {
    setUploadFile(null);
    setUploadStatus('idle');
    setUploadError(null);
    setUploadResult(null);
    setUploadOpen(true);
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading your study plan...</p>
        </div>
      </div>
    );
  }

  if (error === 'no_syllabus') {
    return (
      <div className="dashboard-container">
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h2>Upload Your Syllabus to Get Started</h2>
          <p>Upload your course syllabus and I'll create a personalized study plan for the entire semester!</p>
          <button 
            className="primary-button"
            onClick={() => router.push(`/class/${id}`)}
          >
            Upload Syllabus
          </button>
        </div>
      </div>
    );
  }

  if (error || !todayPlan) {
    return (
      <div className="dashboard-container">
        <div className="error-state">
          <p>Could not load dashboard. Please try again.</p>
          <button onClick={loadTodayPlan}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-greeting">
            <h1>📚 Today's Study Plan</h1>
            <p className="subtitle">{todayPlan.class_name}</p>
          </div>
          <div className="header-meta">
            <span className="week-badge">Week {todayPlan.current_week}</span>
            <span className="time-badge">⏱ {todayPlan.estimated_time}h today</span>
          </div>
        </header>

        {/* Week Title */}
        <div className="week-focus">
          <h2>{todayPlan.week_title}</h2>
          {todayPlan.your_progress.this_week_topics.length > 0 && (
            <div className="topics-chips">
              {todayPlan.your_progress.this_week_topics.map((topic, i) => (
                <span key={i} className="topic-chip">{topic}</span>
              ))}
            </div>
          )}
        </div>

        {/* Today's Tasks */}
        <section className="today-section">
          <h3>🎯 Focus on Today</h3>
          <div className="tasks-list">
            {todayPlan.today_focus.map((task, i) => (
              <div key={i} className="task-card">
                <div className="task-number">{i + 1}</div>
                <div className="task-content">
                  <p>{task}</p>
                </div>
                <button className="task-action">Start</button>
              </div>
            ))}
          </div>
        </section>

        {/* Why Important */}
        {todayPlan.why_important && (
          <section className="insight-section">
            <div className="insight-icon">💡</div>
            <div>
              <h4>Why This Matters</h4>
              <p>{todayPlan.why_important}</p>
            </div>
          </section>
        )}

        {/* Progress */}
        <section className="progress-section">
          <h3>📈 Your Progress</h3>
          <div className="progress-card">
            <div className="progress-stat">
              <div className="stat-number">{todayPlan.your_progress.concepts_mastered}</div>
              <div className="stat-label">Concepts Mastered</div>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${(todayPlan.your_progress.concepts_mastered / 50) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Assessments */}
        {todayPlan.upcoming_assessments.length > 0 && (
          <section className="assessments-section">
            <h3>⚠️ Coming Up</h3>
            <div className="assessments-list">
              {todayPlan.upcoming_assessments.map((assessment, i) => (
                <div key={i} className="assessment-card">
                  <div className="assessment-type">{assessment.type}</div>
                  <div className="assessment-info">
                    <h4>{assessment.name}</h4>
                    <p>Week {assessment.week} • {assessment.weight}% of grade</p>
                  </div>
                  <button className="prep-button">Prepare</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Study Materials */}
        <section className="materials-section">
          <h3>📖 Study Materials</h3>
          <div className="materials-grid">
            <div 
              className="material-card"
              onClick={() => router.push(`/class/${id}/flashcards`)}
            >
              <div className="material-icon">🎴</div>
              <h4>Flashcards</h4>
              <p>Review key concepts</p>
            </div>
            
            <div 
              className="material-card"
              onClick={() => router.push(`/class/${id}/quiz`)}
            >
              <div className="material-icon">📝</div>
              <h4>Practice Quiz</h4>
              <p>Test your knowledge</p>
            </div>
            
            <div 
              className="material-card"
              onClick={() => router.push(`/class/${id}/concept-map`)}
            >
              <div className="material-icon">🗺️</div>
              <h4>Concept Map</h4>
              <p>Visualize connections</p>
            </div>
            
            <div 
              className="material-card"
              onClick={() => router.push(`/class/${id}/help`)}
            >
              <div className="material-icon">🆘</div>
              <h4>Get Help</h4>
              <p>Assignment assistance</p>
            </div>

            <div
              className="material-card material-card--upload"
              onClick={openUpload}
            >
              <div className="material-icon">📤</div>
              <h4>Upload Materials</h4>
              <p>Add documents to this class</p>
            </div>
          </div>
        </section>
      </div>

      {/* ─ Upload Modal ─ */}
      {uploadOpen && (
        <div className="upload-overlay" onClick={(e) => { if (e.target === e.currentTarget && uploadStatus !== 'uploading') setUploadOpen(false); }}>
          <div className="upload-modal">
            {/* Header */}
            <div className="um-header">
              <div>
                <h2 className="um-title">📤 Add Materials</h2>
                <p className="um-subtitle">Upload a document to <strong>{todayPlan?.class_name || 'this class'}</strong></p>
              </div>
              {uploadStatus !== 'uploading' && (
                <button className="um-close" onClick={() => setUploadOpen(false)}>✕</button>
              )}
            </div>

            {uploadStatus === 'done' && uploadResult ? (
              /* Success state */
              <div className="um-success">
                <div className="um-success-icon">✅</div>
                <h3>{uploadResult.message || 'Upload complete!'}</h3>
                {uploadResult.document_type === 'syllabus' ? (
                  <>
                    <p>Syllabus processed! Your entire semester plan is ready.</p>
                    <div className="um-success-actions">
                      <button className="um-btn um-btn--primary" onClick={() => { setUploadOpen(false); loadTodayPlan(); }}>
                        View Updated Plan
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {uploadResult.stats && (
                      <div className="um-stats">
                        <div className="um-stat"><span className="um-stat-n">{uploadResult.stats.concepts_extracted}</span><span>Concepts</span></div>
                        <div className="um-stat"><span className="um-stat-n">{uploadResult.stats.flashcards_created}</span><span>Flashcards</span></div>
                        <div className="um-stat"><span className="um-stat-n">{uploadResult.stats.quiz_questions}</span><span>Quiz Q's</span></div>
                      </div>
                    )}
                    <div className="um-success-actions">
                      <button className="um-btn um-btn--outline" onClick={() => router.push(`/class/${id}/flashcards`)}>🎴 Flashcards</button>
                      <button className="um-btn um-btn--outline" onClick={() => router.push(`/class/${id}/quiz`)}>📝 Quiz</button>
                      <button className="um-btn um-btn--primary" onClick={() => setUploadOpen(false)}>Done</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Upload form */
              <>
                {/* Drop zone */}
                <div
                  className={`um-dropzone ${uploadFile ? 'um-dropzone--ready' : ''} ${uploadStatus === 'uploading' ? 'um-dropzone--uploading' : ''}`}
                  onClick={() => uploadStatus !== 'uploading' && document.getElementById('dash-file-input')?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (uploadStatus === 'uploading') return;
                    const f = e.dataTransfer.files[0];
                    if (f) setUploadFile(f);
                  }}
                >
                  {uploadStatus === 'uploading' ? (
                    <div className="um-uploading">
                      <div className="um-spinner" />
                      <span>Processing with AI…</span>
                    </div>
                  ) : uploadFile ? (
                    <div className="um-file-info">
                      <span className="um-file-icon">📄</span>
                      <div>
                        <div className="um-file-name">{uploadFile.name}</div>
                        <div className="um-file-size">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      <button className="um-remove-file" onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}>✕</button>
                    </div>
                  ) : (
                    <div className="um-dropzone-idle">
                      <div className="um-drop-icon">📁</div>
                      <p className="um-drop-text"><strong>Click to choose</strong> or drag &amp; drop</p>
                      <p className="um-drop-hint">PDF, up to 50 MB</p>
                    </div>
                  )}
                </div>
                <input
                  id="dash-file-input"
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />

                {/* Info blurb */}
                <div className="um-info">
                  ✨ AI will extract concepts, generate flashcards, a quiz, and update your study guide — all automatically.
                </div>

                {uploadError && (
                  <div className="um-error">❌ {uploadError}</div>
                )}

                {/* Actions */}
                <div className="um-actions">
                  <button className="um-btn um-btn--outline" onClick={() => setUploadOpen(false)}>Cancel</button>
                  <button
                    className="um-btn um-btn--primary"
                    onClick={handleUpload}
                    disabled={!uploadFile || uploadStatus === 'uploading'}
                  >
                    🚀 Upload &amp; Process
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .dashboard-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 32px max(24px, 4vw);
          max-width: 1400px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .loading, .empty-state, .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 20px;
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e2e8f0;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-icon {
          font-size: 64px;
        }

        .primary-button {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          padding: 12px 32px;
          border-radius: 12px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .primary-button:hover {
          transform: translateY(-2px);
        }

        .dashboard-header {
          background: white;
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 24px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .header-greeting h1 {
          margin: 0 0 8px 0;
          font-size: 32px;
          font-weight: 700;
          color: #0f172a;
        }

        .subtitle {
          margin: 0;
          color: #64748b;
          font-size: 16px;
        }

        .header-meta {
          display: flex;
          gap: 12px;
        }

        .week-badge, .time-badge {
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
        }

        .week-badge {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
        }

        .time-badge {
          background: #f1f5f9;
          color: #475569;
        }

        .week-focus {
          background: white;
          border-radius: 20px;
          padding: 24px 32px;
          margin-bottom: 24px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .week-focus h2 {
          margin: 0 0 16px 0;
          font-size: 24px;
          color: #0f172a;
        }

        .topics-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .topic-chip {
          padding: 6px 12px;
          background: #eff6ff;
          color: #3b82f6;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        section {
          background: white;
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 24px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        section h3 {
          margin: 0 0 24px 0;
          font-size: 20px;
          font-weight: 600;
          color: #0f172a;
        }

        .tasks-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .task-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .task-card:hover {
          background: #f1f5f9;
          transform: translateX(4px);
        }

        .task-number {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          flex-shrink: 0;
        }

        .task-content {
          flex: 1;
        }

        .task-content p {
          margin: 0;
          color: #475569;
          line-height: 1.5;
        }

        .task-action {
          padding: 8px 16px;
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-weight: 600;
          color: #3b82f6;
          cursor: pointer;
          transition: all 0.2s;
        }

        .task-action:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .insight-section {
          display: flex;
          gap: 16px;
          padding: 24px;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-radius: 16px;
          border-left: 4px solid #f59e0b;
        }

        .insight-icon {
          font-size: 32px;
        }

        .insight-section h4 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
          color: #78350f;
        }

        .insight-section p {
          margin: 0;
          color: #78350f;
          line-height: 1.5;
        }

        .progress-card {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .progress-stat {
          text-align: center;
        }

        .stat-number {
          font-size: 48px;
          font-weight: 700;
          background: linear-gradient(135deg, #10b981, #059669);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .stat-label {
          font-size: 14px;
          color: #64748b;
          margin-top: 4px;
        }

        .progress-bar-container {
          flex: 1;
        }

        .progress-bar {
          height: 12px;
          background: #f1f5f9;
          border-radius: 6px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #059669);
          border-radius: 6px;
          transition: width 1s ease;
        }

        .assessments-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .assessment-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: #fef2f2;
          border-radius: 12px;
          border-left: 4px solid #ef4444;
        }

        .assessment-type {
          padding: 4px 12px;
          background: #ef4444;
          color: white;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .assessment-info {
          flex: 1;
        }

        .assessment-info h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
          color: #0f172a;
        }

        .assessment-info p {
          margin: 0;
          font-size: 14px;
          color: #64748b;
        }

        .prep-button {
          padding: 8px 16px;
          background: white;
          border: 2px solid #ef4444;
          border-radius: 8px;
          color: #ef4444;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .prep-button:hover {
          background: #ef4444;
          color: white;
        }

        .materials-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .material-card {
          padding: 24px;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border-radius: 16px;
          border: 2px solid #e2e8f0;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .material-card:hover {
          transform: translateY(-4px);
          border-color: #3b82f6;
          box-shadow: 0 8px 16px rgba(59, 130, 246, 0.2);
        }

        .material-card--upload {
          border-color: #c7d2fe;
          background: linear-gradient(135deg, #fff 0%, #eef2ff 100%);
        }

        .material-card--upload:hover {
          border-color: #6366f1;
          box-shadow: 0 8px 16px rgba(99, 102, 241, 0.2);
        }

        .material-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .material-card h4 {
          margin: 0 0 8px 0;
          font-size: 18px;
          color: #0f172a;
        }

        .material-card p {
          margin: 0;
          font-size: 14px;
          color: #64748b;
        }

        /* ─ Upload Modal ─ */
        .upload-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(4px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .upload-modal {
          background: white;
          border-radius: 24px;
          padding: 36px;
          width: 100%;
          max-width: 520px;
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.18);
          animation: modal-in 0.25s ease;
        }

        @keyframes modal-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: none; }
        }

        .um-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 28px;
        }

        .um-title {
          margin: 0 0 4px;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
        }

        .um-subtitle {
          margin: 0;
          font-size: 14px;
          color: #64748b;
        }

        .um-close {
          background: #f1f5f9;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #64748b;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .um-close:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .um-dropzone {
          border: 2px dashed #cbd5e1;
          border-radius: 16px;
          padding: 36px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: #f8fafc;
          margin-bottom: 20px;
        }

        .um-dropzone:hover {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .um-dropzone--ready {
          border-color: #10b981;
          background: #f0fdf4;
          border-style: solid;
        }

        .um-dropzone--uploading {
          cursor: default;
          border-color: #3b82f6;
          background: #eff6ff;
          border-style: solid;
        }

        .um-dropzone-idle {}
        .um-drop-icon { font-size: 40px; margin-bottom: 12px; }
        .um-drop-text { margin: 0 0 6px; font-size: 15px; color: #374151; }
        .um-drop-hint { margin: 0; font-size: 13px; color: #94a3b8; }

        .um-file-info {
          display: flex;
          align-items: center;
          gap: 14px;
          text-align: left;
        }

        .um-file-icon { font-size: 32px; flex-shrink: 0; }
        .um-file-name { font-weight: 600; color: #0f172a; font-size: 15px; word-break: break-all; }
        .um-file-size { font-size: 12px; color: #64748b; margin-top: 2px; }
        .um-remove-file {
          margin-left: auto;
          background: #fee2e2;
          border: none;
          border-radius: 6px;
          padding: 6px 8px;
          cursor: pointer;
          color: #dc2626;
          font-size: 12px;
          flex-shrink: 0;
        }

        .um-uploading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: #2563eb;
          font-weight: 600;
          font-size: 15px;
        }

        .um-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #bfdbfe;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .um-info {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 13px;
          color: #0369a1;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .um-error {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 10px;
          padding: 12px 16px;
          color: #dc2626;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .um-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .um-btn {
          padding: 11px 22px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: 2px solid transparent;
        }

        .um-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .um-btn--primary {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border-color: transparent;
        }

        .um-btn--primary:hover:not(:disabled) {
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
          transform: translateY(-1px);
        }

        .um-btn--outline {
          background: white;
          color: #374151;
          border-color: #e2e8f0;
        }

        .um-btn--outline:hover {
          border-color: #94a3b8;
          background: #f8fafc;
        }

        /* Success state */
        .um-success {
          text-align: center;
          padding: 8px 0;
        }

        .um-success-icon { font-size: 48px; margin-bottom: 12px; }

        .um-success h3 {
          margin: 0 0 10px;
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
        }

        .um-success p {
          margin: 0 0 20px;
          color: #64748b;
          font-size: 14px;
        }

        .um-stats {
          display: flex;
          justify-content: center;
          gap: 28px;
          margin-bottom: 24px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 16px;
        }

        .um-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .um-stat-n {
          font-size: 28px;
          font-weight: 800;
          color: #2563eb;
        }

        .um-stat span:last-child {
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }

        .um-success-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .dashboard-header {
            flex-direction: column;
            gap: 16px;
          }

          .progress-card {
            flex-direction: column;
          }

          .materials-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }
        }
      `}</style>
    </>
  );
}
