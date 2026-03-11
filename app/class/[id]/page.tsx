"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { getClassStudyMaterials } from "@/lib/api";
import { API_BASE } from "@/lib/env";

type ClassRow = {
  id: string;
  name: string;
  created_at: string;
  subject_area?: string;
  has_syllabus?: boolean;
};

type Doc = {
  id: string;
  title: string;
  created_at: string;
};

type StudyMaterials = {
  has_quizzes: boolean;
  has_flashcards: boolean;
  flashcard_count: number;
  quizzes: { id: string }[];
};

export default function EnhancedClassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [cls, setCls] = useState<ClassRow | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<StudyMaterials | null>(null);

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [procStageIdx, setProcStageIdx] = useState(0);
  const [procStageLabel, setProcStageLabel] = useState('');
  const [uploadStats, setUploadStats] = useState<{ concepts_extracted?: number; flashcards_created?: number; document_type?: string } | null>(null);
  const [processingDocId, setProcessingDocId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const [{ data: c }, { data: d }] = await Promise.all([
        supabase
          .from("classes")
          .select("id,name,created_at,subject_area,has_syllabus")
          .eq("id", id)
          .maybeSingle(),

        supabase
          .from("documents")
          .select("id,title,created_at")
          .eq("class_id", id)
          .order("created_at", { ascending: false }),
      ]);

      if (!alive) return;

      setCls((c as ClassRow) || null);
      setDocs((d as Doc[]) || []);

      // Load study materials metadata
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const mats = await getClassStudyMaterials(id, session.access_token);
          if (alive) setMaterials(mats);
        }
      } catch {
        // non-critical – silently ignore
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id, supabase]);

  async function refreshDocs() {
    const { data } = await supabase
      .from("documents")
      .select("id,title,created_at")
      .eq("class_id", id)
      .order("created_at", { ascending: false });
    setDocs((data as Doc[]) || []);
  }

  function openUpload() {
    setUploadFile(null);
    setUploadPhase('idle');
    setUploadProgress(0);
    setProcStageIdx(0);
    setProcStageLabel('');
    setUploadStats(null);
    setProcessingDocId(null);
    setUploadError(null);
    setUploadOpen(true);
  }

  function closeUpload() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setUploadOpen(false);
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploadError(null);
    setUploadStats(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/'); return; }

    // ── Phase 1: XHR upload with real % progress ──────────────────
    setUploadPhase('uploading');
    setUploadProgress(0);

    const uploadResponse = await new Promise<{ document_id: string; status: string; document_type?: string } | null>(
      (resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/intelligent/process-document/${id}`);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { setUploadPhase('error'); setUploadError('Invalid response'); resolve(null); }
          } else {
            try { setUploadPhase('error'); setUploadError(JSON.parse(xhr.responseText).detail || 'Upload failed'); }
            catch { setUploadPhase('error'); setUploadError('Upload failed'); }
            resolve(null);
          }
        };
        xhr.onerror = () => { setUploadPhase('error'); setUploadError('Network error'); resolve(null); };
        const fd = new FormData();
        fd.append('file', uploadFile);
        xhr.send(fd);
      }
    );

    if (!uploadResponse) return;

    // Backend already done (very small docs)
    if (uploadResponse.status === 'done') {
      setUploadStats({ document_type: uploadResponse.document_type });
      setUploadPhase('done');
      await refreshDocs();
      return;
    }

    // ── Phase 2: Poll until AI finishes ───────────────────────────
    const docId = uploadResponse.document_id;
    setProcessingDocId(docId);
    setUploadPhase('processing');
    setProcStageIdx(1);
    setProcStageLabel('Analyzing document');

    const pollStart = Date.now();
    const MAX_POLL_MS = 5 * 60 * 1000;

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStart > MAX_POLL_MS) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setUploadPhase('error');
        setUploadError('Processing timed out — please try again.');
        return;
      }
      try {
        const r = await fetch(`${API_BASE}/intelligent/process-status/${docId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!r.ok) return;
        const st = await r.json();
        setProcStageIdx(st.stage_index ?? 1);
        setProcStageLabel(st.stage ?? 'Processing…');
        if (st.status === 'done') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setUploadStats({ ...st.stats, document_type: st.document_type });
          setUploadPhase('done');
          await refreshDocs();
        } else if (st.status === 'error') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setUploadPhase('error');
          setUploadError(st.error || 'Processing failed');
        }
      } catch { /* ignore transient poll errors */ }
    }, 2500);
  }

  if (loading) {
    return (
      <div className="class-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading class...</p>
        </div>
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="class-container">
        <div className="error">Class not found</div>
      </div>
    );
  }

  return (
    <>
      <div className="class-container">
        {/* Header */}
        <header className="class-header">
          <div className="header-content">
            <div className="class-info">
              <Link href="/library" className="back-link">
                ← Back to Library
              </Link>
              <h1>{cls.name}</h1>
              {cls.subject_area && (
                <span className="subject-badge">{cls.subject_area}</span>
              )}
            </div>
          </div>
        </header>

        {/* Smart Features Menu */}
        <section className="features-menu">
          <h2 className="section-title">🚀 Smart Study Tools</h2>
          
          <div className="features-grid">
            <Link href={`/class/${id}/dashboard`} className="feature-card">
              <div className="feature-icon">📚</div>
              <h3>Dashboard</h3>
              <p>See what to study today</p>
              {cls.has_syllabus && <span className="feature-badge">Ready!</span>}
            </Link>

            <Link href={`/class/${id}/concept-map`} className="feature-card">
              <div className="feature-icon">🗺️</div>
              <h3>Concept Map</h3>
              <p>Visual knowledge graph</p>
            </Link>

            <Link href={`/class/${id}/flashcards`} className="feature-card">
              <div className="feature-icon">🎴</div>
              <h3>Flashcards</h3>
              <p>Auto-generated cards</p>
              {materials?.has_flashcards && (
                <span className="feature-badge">{materials.flashcard_count} cards</span>
              )}
              {docs.length > 0 && !materials?.has_flashcards && (
                <span className="feature-badge generate-badge">Generate →</span>
              )}
            </Link>

            <Link href={`/class/${id}/quiz`} className="feature-card">
              <div className="feature-icon">📝</div>
              <h3>Practice Quiz</h3>
              <p>Test your knowledge</p>
              {materials?.has_quizzes && (
                <span className="feature-badge">{materials.quizzes.length} quiz{materials.quizzes.length !== 1 ? "zes" : ""}</span>
              )}
              {docs.length > 0 && !materials?.has_quizzes && (
                <span className="feature-badge generate-badge">Generate →</span>
              )}
            </Link>

            <Link href={`/class/${id}/help`} className="feature-card">
              <div className="feature-icon">🆘</div>
              <h3>Get Help</h3>
              <p>Assignment guidance</p>
            </Link>

            <button onClick={openUpload} className="feature-card upload-card">
              <div className="feature-icon">📤</div>
              <h3>Upload Document</h3>
              <p>Add materials to this class</p>
            </button>
          </div>
        </section>

        {/* Syllabus CTA */}
        {!cls.has_syllabus && (
          <section className="syllabus-cta">
            <div className="cta-content">
              <div className="cta-icon">💡</div>
              <div>
                <h3>Get the Most Out of This Class</h3>
                <p>
                  Upload your syllabus and I'll create a personalized study plan for the entire semester!
                  I'll extract deadlines, create a timeline, and tell you what to study each week.
                </p>
                <button
                  onClick={openUpload}
                  className="cta-button"
                >
                  Upload Syllabus Now →
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Documents */}
        <section className="documents-section">
          <h2 className="section-title">📄 Uploaded Documents ({docs.length})</h2>
          
          {docs.length === 0 ? (
            <div className="empty-documents">
              <p>No documents yet. Upload your first document to get started!</p>
              <button onClick={openUpload} className="upload-link">
                Upload Document
              </button>
            </div>
          ) : (
            <div className="documents-list">
              {docs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/doc/${doc.id}`}
                  className="document-card"
                >
                  <div className="doc-icon">📄</div>
                  <div className="doc-info">
                    <h4>{doc.title}</h4>
                    <p className="doc-date">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="doc-arrow">→</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Quick Stats */}
        {docs.length > 0 && (
          <section className="stats-section">
            <h2 className="section-title">📊 Quick Stats</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-number">{docs.length}</div>
                <div className="stat-label">Documents</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">
                  {cls.has_syllabus ? '✓' : '—'}
                </div>
                <div className="stat-label">Syllabus</div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ─ Upload Modal ─ */}
      {uploadOpen && (
        <div
          className="upload-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && uploadPhase !== 'uploading' && uploadPhase !== 'processing')
              closeUpload();
          }}
        >
          <div className="upload-modal">
            {/* Header */}
            <div className="um-header">
              <div>
                <h2 className="um-title">📤 Add Materials</h2>
                <p className="um-subtitle">Upload a document to <strong>{cls?.name || 'this class'}</strong></p>
              </div>
              {uploadPhase !== 'uploading' && uploadPhase !== 'processing' && (
                <button className="um-close" onClick={closeUpload}>✕</button>
              )}
            </div>

            {/* ── IDLE / ERROR: file picker ── */}
            {(uploadPhase === 'idle' || uploadPhase === 'error') && (
              <>
                <div
                  className={`um-dropzone ${uploadFile ? 'um-dropzone--ready' : ''}`}
                  onClick={() => document.getElementById('class-file-input')?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) setUploadFile(f);
                  }}
                >
                  {uploadFile ? (
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
                  id="class-file-input"
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
                <div className="um-info">
                  ✨ AI will extract concepts, generate flashcards, a quiz, and update your study guide — all automatically.
                </div>
                {uploadPhase === 'error' && uploadError && (
                  <div className="um-error">❌ {uploadError}</div>
                )}
                <div className="um-actions">
                  <button className="um-btn um-btn--outline" onClick={closeUpload}>Cancel</button>
                  <button
                    className="um-btn um-btn--primary"
                    onClick={handleUpload}
                    disabled={!uploadFile}
                  >
                    🚀 Upload &amp; Process
                  </button>
                </div>
              </>
            )}

            {/* ── UPLOADING: XHR progress bar ── */}
            {uploadPhase === 'uploading' && (
              <div className="um-active-wrap">
                <div className="um-active-icon">📤</div>
                <p className="um-active-title">Uploading document…</p>
                {uploadFile && (
                  <p className="um-active-sub">{uploadFile.name}</p>
                )}
                <div className="um-prog-bar">
                  <div className="um-prog-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="um-prog-pct">{uploadProgress}%</p>

                <div className="um-stages">
                  <div className="um-stage um-stage--active">
                    <div className="um-stage-dot um-stage-dot--spin" />
                    <span>Uploading</span>
                  </div>
                  <div className="um-stage">
                    <div className="um-stage-dot um-stage-dot--pending" />
                    <span>Analyzing</span>
                  </div>
                  <div className="um-stage">
                    <div className="um-stage-dot um-stage-dot--pending" />
                    <span>Generating</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── PROCESSING: AI stage tracker ── */}
            {uploadPhase === 'processing' && (
              <div className="um-active-wrap">
                <div className="um-active-icon">🧠</div>
                <p className="um-active-title">{procStageLabel || 'AI is working…'}</p>
                <p className="um-active-sub">This usually takes 20–60 seconds. Feel free to leave — your document will be ready when you return.</p>

                <div className="um-stages">
                  <div className={`um-stage ${procStageIdx > 1 ? 'um-stage--done' : procStageIdx === 1 ? 'um-stage--active' : ''}`}>
                    <div className={`um-stage-dot ${procStageIdx > 1 ? 'um-stage-dot--done' : procStageIdx === 1 ? 'um-stage-dot--spin' : 'um-stage-dot--pending'}`} />
                    <span>Analyzing document</span>
                  </div>
                  <div className={`um-stage ${procStageIdx > 2 ? 'um-stage--done' : procStageIdx === 2 ? 'um-stage--active' : ''}`}>
                    <div className={`um-stage-dot ${procStageIdx > 2 ? 'um-stage-dot--done' : procStageIdx === 2 ? 'um-stage-dot--spin' : 'um-stage-dot--pending'}`} />
                    <span>Generating study materials</span>
                  </div>
                  <div className={`um-stage ${procStageIdx >= 3 ? 'um-stage--done' : ''}`}>
                    <div className={`um-stage-dot ${procStageIdx >= 3 ? 'um-stage-dot--done' : 'um-stage-dot--pending'}`} />
                    <span>Complete</span>
                  </div>
                </div>

                <button className="um-btn um-btn--outline um-dismiss-btn" onClick={closeUpload}>
                  Continue in background
                </button>
              </div>
            )}

            {/* ── DONE: success + stats ── */}
            {uploadPhase === 'done' && (
              <div className="um-success">
                <div className="um-success-icon">✅</div>
                <h3>Study materials ready!</h3>
                {uploadStats?.document_type === 'syllabus' ? (
                  <>
                    <p>Syllabus processed! Your semester plan is ready.</p>
                    <div className="um-success-actions">
                      <button className="um-btn um-btn--outline" onClick={() => router.push(`/class/${id}/dashboard`)}>📚 View Plan</button>
                      <button className="um-btn um-btn--primary" onClick={closeUpload}>Done</button>
                    </div>
                  </>
                ) : (
                  <>
                    {uploadStats && (
                      <div className="um-stats">
                        {uploadStats.concepts_extracted !== undefined && (
                          <div className="um-stat">
                            <span className="um-stat-n">{uploadStats.concepts_extracted}</span>
                            <span>Concepts</span>
                          </div>
                        )}
                        {uploadStats.flashcards_created !== undefined && (
                          <div className="um-stat">
                            <span className="um-stat-n">{uploadStats.flashcards_created}</span>
                            <span>Flashcards</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="um-success-actions">
                      <button className="um-btn um-btn--outline" onClick={() => router.push(`/class/${id}/flashcards`)}>🎴 Flashcards</button>
                      <button className="um-btn um-btn--outline" onClick={() => router.push(`/class/${id}/quiz`)}>📝 Quiz</button>
                      <button className="um-btn um-btn--primary" onClick={closeUpload}>Done</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .class-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 32px max(24px, 4vw);
          max-width: 1400px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .loading, .error {
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

        .class-header {
          background: white;
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 24px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          max-width: 100%;
          margin-left: auto;
          margin-right: auto;
          margin-bottom: 24px;
        }

        .header-content {
          max-width: 100%;
        }

        .back-link {
          display: inline-block;
          color: #64748b;
          text-decoration: none;
          margin-bottom: 16px;
          transition: color 0.2s;
        }

        .back-link:hover {
          color: #3b82f6;
        }

        .class-info h1 {
          margin: 0 0 12px 0;
          font-size: 32px;
          font-weight: 700;
          color: #0f172a;
        }

        .subject-badge {
          display: inline-block;
          padding: 6px 12px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          text-transform: capitalize;
        }

        section {
          max-width: 100%;
          margin: 0 auto 24px;
        }

        .section-title {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 20px;
        }

        .features-menu {
          background: white;
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .feature-card {
          position: relative;
          padding: 24px;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border: 2px solid #e2e8f0;
          border-radius: 16px;
          text-decoration: none;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          border-color: #3b82f6;
          box-shadow: 0 8px 16px rgba(59, 130, 246, 0.2);
        }

        .upload-card {
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border-color: #e2e8f0;
        }

        .upload-card:focus {
          outline: none;
          box-shadow: none;
        }

        .upload-card:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }

        .feature-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .feature-card h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: #0f172a;
        }

        .feature-card p {
          margin: 0;
          font-size: 14px;
          color: #64748b;
        }

        .feature-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          padding: 4px 8px;
          background: #10b981;
          color: white;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .generate-badge {
          background: #3b82f6;
        }

        .syllabus-cta {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-radius: 20px;
          padding: 32px;
          border: 2px solid #f59e0b;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .cta-content {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }

        .cta-icon {
          font-size: 48px;
        }

        .cta-content h3 {
          margin: 0 0 12px 0;
          font-size: 20px;
          font-weight: 700;
          color: #78350f;
        }

        .cta-content p {
          margin: 0 0 16px 0;
          color: #78350f;
          line-height: 1.6;
        }

        .cta-button {
          padding: 12px 24px;
          background: #f59e0b;
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cta-button:hover {
          background: #d97706;
          transform: translateY(-2px);
        }

        .documents-section {
          background: white;
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .empty-documents {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }

        .empty-documents p {
          margin-bottom: 16px;
        }

        .upload-link {
          display: inline-block;
          padding: 12px 24px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          text-decoration: none;
          border-radius: 12px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .upload-link:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(59, 130, 246, 0.3);
        }

        .documents-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .document-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 12px;
          text-decoration: none;
          transition: all 0.2s;
          border: 2px solid transparent;
        }

        .document-card:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          transform: translateX(4px);
        }

        .doc-icon {
          font-size: 32px;
        }

        .doc-info {
          flex: 1;
        }

        .doc-info h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
        }

        .doc-date {
          margin: 0;
          font-size: 14px;
          color: #64748b;
        }

        .doc-arrow {
          color: #94a3b8;
          font-size: 20px;
        }

        .stats-section {
          background: white;
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
        }

        .stat-card {
          padding: 24px;
          background: #f8fafc;
          border-radius: 12px;
          text-align: center;
        }

        .stat-number {
          font-size: 36px;
          font-weight: 700;
          color: #3b82f6;
          margin-bottom: 8px;
        }

        .stat-label {
          font-size: 14px;
          color: #64748b;
        }

        @media (max-width: 768px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .cta-content {
            flex-direction: column;
          }

          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        /* ─ Upload Modal ─ */
        .upload-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(6px);
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
          box-shadow: 0 32px 80px rgba(0,0,0,0.20);
          animation: modal-in 0.22s ease;
        }
        @keyframes modal-in {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: none; }
        }
        .um-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
        .um-title  { margin: 0 0 4px; font-size: 22px; font-weight: 800; color: #0f172a; }
        .um-subtitle { margin: 0; font-size: 14px; color: #64748b; }
        .um-close  { background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 14px; color: #64748b; flex-shrink: 0; }
        .um-close:hover { background: #e2e8f0; color: #0f172a; }

        /* file picker */
        .um-dropzone {
          border: 2px dashed #cbd5e1;
          border-radius: 16px;
          padding: 36px 24px;
          text-align: center;
          cursor: pointer;
          background: #f8fafc;
          margin-bottom: 20px;
          transition: all 0.2s;
        }
        .um-dropzone:hover { border-color: #3b82f6; background: #eff6ff; }
        .um-dropzone--ready { border-color: #10b981; background: #f0fdf4; border-style: solid; }
        .um-drop-icon { font-size: 40px; margin-bottom: 12px; }
        .um-drop-text { margin: 0 0 6px; font-size: 15px; color: #374151; }
        .um-drop-hint { margin: 0; font-size: 13px; color: #94a3b8; }
        .um-file-info { display: flex; align-items: center; gap: 14px; text-align: left; }
        .um-file-icon { font-size: 32px; flex-shrink: 0; }
        .um-file-name { font-weight: 600; color: #0f172a; font-size: 15px; word-break: break-all; }
        .um-file-size { font-size: 12px; color: #64748b; margin-top: 2px; }
        .um-remove-file { margin-left: auto; background: #fee2e2; border: none; border-radius: 6px; padding: 6px 8px; cursor: pointer; color: #dc2626; font-size: 12px; flex-shrink: 0; }
        .um-info { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 14px 16px; font-size: 13px; color: #0369a1; line-height: 1.6; margin-bottom: 20px; }
        .um-error { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px; padding: 12px 16px; color: #dc2626; font-size: 14px; margin-bottom: 16px; }
        .um-actions { display: flex; gap: 12px; justify-content: flex-end; }

        /* active (uploading / processing) */
        .um-active-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
          padding: 8px 0 4px;
        }
        .um-active-icon { font-size: 52px; margin-bottom: 4px; }
        .um-active-title { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; }
        .um-active-sub { margin: 0 0 16px; font-size: 13px; color: #64748b; max-width: 380px; line-height: 1.5; }

        /* upload progress bar */
        .um-prog-bar {
          width: 100%;
          height: 8px;
          background: #e2e8f0;
          border-radius: 99px;
          overflow: hidden;
          margin-bottom: 4px;
        }
        .um-prog-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #2563eb);
          border-radius: 99px;
          transition: width 0.3s ease;
        }
        .um-prog-pct { margin: 0 0 20px; font-size: 13px; color: #64748b; font-weight: 600; }

        /* stage stepper */
        .um-stages {
          display: flex;
          flex-direction: column;
          gap: 0;
          width: 100%;
          margin-bottom: 24px;
          border: 1.5px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
        }
        .um-stage {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          font-size: 14px;
          color: #94a3b8;
          background: #f8fafc;
          border-bottom: 1.5px solid #e2e8f0;
          transition: background 0.2s, color 0.2s;
        }
        .um-stage:last-child { border-bottom: none; }
        .um-stage--active { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
        .um-stage--done   { background: #f0fdf4; color: #15803d; }
        .um-stage-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .um-stage-dot--pending { background: #e2e8f0; }
        .um-stage-dot--spin {
          border: 2.5px solid #bfdbfe;
          border-top-color: #3b82f6;
          animation: spin 0.9s linear infinite;
        }
        .um-stage-dot--done { background: #22c55e; }
        .um-dismiss-btn { margin-top: 4px; font-size: 13px; padding: 8px 18px; }

        /* buttons */
        .um-btn { padding: 11px 22px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 2px solid transparent; }
        .um-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .um-btn--primary { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; }
        .um-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 16px rgba(59,130,246,0.35); transform: translateY(-1px); }
        .um-btn--outline { background: white; color: #374151; border-color: #e2e8f0; }
        .um-btn--outline:hover { background: #f8fafc; }

        /* success */
        .um-success { text-align: center; padding: 16px 0; }
        .um-success-icon { font-size: 56px; margin-bottom: 12px; }
        .um-success h3 { margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #0f172a; }
        .um-success p { margin: 0 0 24px; font-size: 15px; color: #64748b; }
        .um-stats { display: flex; gap: 16px; justify-content: center; margin-bottom: 24px; }
        .um-stat { display: flex; flex-direction: column; align-items: center; background: #f8fafc; border-radius: 12px; padding: 14px 20px; gap: 4px; }
        .um-stat-n { font-size: 28px; font-weight: 800; color: #3b82f6; }
        .um-stat span:last-child { font-size: 12px; color: #64748b; }
        .um-success-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      `}</style>
    </>
  );
}
