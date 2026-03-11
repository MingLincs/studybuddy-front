"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getClassFlashcardSets, generateClassFlashcards } from "@/lib/api";

type Flashcard = {
  front: string;
  back: string;
  type?: string;
  difficulty?: string;
  concept_name?: string;
};

type FlashcardSet = {
  id: string;
  title: string;
  doc_id: string;
  doc_title: string;
  card_count: number;
  cards_json: string;
  created_at: string;
};

type ActiveSet = {
  id: string;
  title: string;
  doc_title?: string;
  cards: Flashcard[];
};

export default function FlashcardsPage() {
  const { id: classId } = useParams<{ id: string }>();
  const router = useRouter();

  const [className, setClassName] = useState("");
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSet[]>([]);
  const [activeSet, setActiveSet] = useState<ActiveSet | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [shuffled, setShuffled] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/"); return; }
      const token = session.access_token;

      const { data: cls } = await supabase
        .from("classes")
        .select("name")
        .eq("id", classId)
        .maybeSingle();
      if (alive) setClassName(cls?.name || "Class");

      try {
        const sets = await getClassFlashcardSets(classId, token);
        if (alive) setFlashcardSets(sets);
      } catch {
        // non-critical
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [classId, router]);

  async function reloadSets() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const sets = await getClassFlashcardSets(classId, session.access_token).catch(() => [] as FlashcardSet[]);
    setFlashcardSets(sets);
  }

  async function handleGenerate() {
    setGenerateError("");
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/"); return; }
      await generateClassFlashcards(classId, session.access_token);
      await reloadSets();
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate flashcards.");
    } finally {
      setGenerating(false);
    }
  }

  function openSet(set: FlashcardSet) {
    try {
      const parsed = typeof set.cards_json === "string" ? JSON.parse(set.cards_json) : set.cards_json;
      // Backend stores as {"cards": [...]}, fallback handles older {"flashcards": [...]} or plain array
      const cards: Flashcard[] = Array.isArray(parsed)
        ? parsed
        : (parsed.cards || parsed.flashcards || []);
      setActiveSet({ id: set.id, title: set.title, doc_title: set.doc_title, cards });
      setCurrentIndex(0);
      setFlipped(false);
      setFilterDifficulty("all");
      setShuffled(false);
    } catch {
      setGenerateError("Could not load flashcard set.");
    }
  }

  const filteredCards = activeSet
    ? filterDifficulty === "all"
      ? activeSet.cards
      : activeSet.cards.filter((c) => c.difficulty === filterDifficulty)
    : [];

  const currentCard = filteredCards[currentIndex];

  const nextCard = useCallback(() => {
    setFlipped(false);
    setTimeout(() => setCurrentIndex((i) => (i + 1) % filteredCards.length), 150);
  }, [filteredCards.length]);

  const prevCard = useCallback(() => {
    setFlipped(false);
    setTimeout(() => setCurrentIndex((i) => (i - 1 + filteredCards.length) % filteredCards.length), 150);
  }, [filteredCards.length]);

  function shuffleCards() {
    if (!activeSet) return;
    const s = [...activeSet.cards].sort(() => Math.random() - 0.5);
    setActiveSet({ ...activeSet, cards: s });
    setCurrentIndex(0);
    setFlipped(false);
    setShuffled(true);
  }

  useEffect(() => {
    if (!activeSet) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "ArrowRight") nextCard();
      else if (e.key === "ArrowLeft")  prevCard();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeSet, nextCard, prevCard]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="fc-page">
        <div className="fc-loading">
          <div className="fc-spinner" />
          <p style={{ color: "#64748b" }}>Loading flashcards...</p>
        </div>
        <style jsx>{`
          .fc-page { min-height: 100vh; background: linear-gradient(160deg, #f8fafc 0%, #f0f4ff 50%, #f8fafc 100%); display: flex; flex-direction: column; }
          .fc-loading { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
          .fc-spinner { width: 48px; height: 48px; border: 4px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  /* ─── STUDY VIEW ─── */
  if (activeSet) {
    return (
      <>
        <div className="fc-page">
          <div className="fc-topbar">
            <button className="fc-back-btn" onClick={() => setActiveSet(null)}>
              ← Sets
            </button>
            <div className="fc-topbar-center">
              <span className="fc-topbar-title">
                🎴 {activeSet.doc_title || activeSet.title}
              </span>
              <div className="fc-progress-track">
                <div
                  className="fc-progress-fill"
                  style={{ width: `${((currentIndex + 1) / Math.max(filteredCards.length, 1)) * 100}%` }}
                />
              </div>
            </div>
            <div className="fc-topbar-right">
              <span className="fc-counter">{currentIndex + 1} / {filteredCards.length}</span>
            </div>
          </div>

          <div className="fc-controls-row">
            <select
              value={filterDifficulty}
              onChange={(e) => { setFilterDifficulty(e.target.value); setCurrentIndex(0); setFlipped(false); }}
              className="fc-select"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <button onClick={shuffleCards} className="fc-control-btn">🔀 Shuffle</button>
            <div className="fc-deck-info">
              {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}
              {shuffled ? " · shuffled" : ""}
            </div>
          </div>

          <div className="fc-arena">
            {currentCard && (
              <div className={`fc-difficulty-badge fc-difficulty-${currentCard.difficulty || "medium"}`}>
                {currentCard.difficulty || "medium"}
              </div>
            )}

            <div
              className={`fc-card ${flipped ? "fc-card--flipped" : ""}`}
              onClick={() => setFlipped((f) => !f)}
            >
              <div className="fc-card-inner">
                <div className="fc-face fc-face--front">
                  <div className="fc-face-label">Question</div>
                  <div className="fc-face-content">{currentCard?.front}</div>
                  <div className="fc-face-hint">Click to reveal answer</div>
                </div>
                <div className="fc-face fc-face--back">
                  <div className="fc-face-label">Answer</div>
                  <div className="fc-face-content">{currentCard?.back}</div>
                  {currentCard?.concept_name && (
                    <div className="fc-face-meta">📚 {currentCard.concept_name}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="fc-dots">
              {filteredCards.slice(0, 15).map((_, i) => (
                <div
                  key={i}
                  className={`fc-dot ${i === currentIndex ? "fc-dot--active" : ""}`}
                  onClick={() => { setCurrentIndex(i); setFlipped(false); }}
                />
              ))}
              {filteredCards.length > 15 && (
                <span className="fc-dots-more">+{filteredCards.length - 15}</span>
              )}
            </div>
          </div>

          <div className="fc-nav">
            <button onClick={prevCard} className="fc-nav-btn" disabled={currentIndex === 0}>
              ← Previous
            </button>
            <div className="fc-shortcuts-hint">
              <kbd>Space</kbd> Flip · <kbd>←</kbd> Prev · <kbd>→</kbd> Next
            </div>
            <button onClick={nextCard} className="fc-nav-btn fc-nav-btn--next">
              Next →
            </button>
          </div>
        </div>
        <style jsx>{`
          .fc-page { min-height: 100vh; background: linear-gradient(160deg, #f8fafc 0%, #f0f4ff 50%, #f8fafc 100%); display: flex; flex-direction: column; }
          .fc-topbar { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid #e8edf5; padding: 0 32px; height: 64px; display: flex; align-items: center; gap: 20px; }
          .fc-back-btn { background: none; border: none; color: #64748b; font-size: 14px; font-weight: 600; cursor: pointer; padding: 8px 14px; border-radius: 10px; transition: all 0.2s; white-space: nowrap; flex-shrink: 0; }
          .fc-back-btn:hover { background: #f1f5f9; color: #3b82f6; }
          .fc-topbar-center { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
          .fc-topbar-title { font-size: 14px; font-weight: 700; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .fc-progress-track { height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden; }
          .fc-progress-fill { height: 100%; background: linear-gradient(90deg,#3b82f6,#8b5cf6); border-radius: 2px; transition: width 0.35s ease; }
          .fc-topbar-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
          .fc-counter { font-size: 13px; font-weight: 700; color: #3b82f6; background: #eff6ff; padding: 5px 12px; border-radius: 8px; }
          .fc-controls-row { display: flex; align-items: center; gap: 12px; padding: 16px 32px; background: white; border-bottom: 1px solid #f1f5f9; }
          .fc-select { padding: 8px 14px; border: 2px solid #e2e8f0; border-radius: 10px; background: white; font-size: 14px; font-weight: 500; color: #374151; cursor: pointer; transition: border-color 0.2s; }
          .fc-select:hover, .fc-select:focus { border-color: #3b82f6; outline: none; }
          .fc-control-btn { padding: 8px 16px; border: 2px solid #e2e8f0; border-radius: 10px; background: white; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; color: #374151; }
          .fc-control-btn:hover { border-color: #3b82f6; background: #eff6ff; color: #2563eb; }
          .fc-deck-info { font-size: 13px; color: #94a3b8; margin-left: auto; }
          .fc-arena { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 40px 24px 24px; position: relative; }
          .fc-difficulty-badge { position: absolute; top: 48px; right: calc(50% - 380px); padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; z-index: 1; }
          .fc-difficulty-easy { background: #10b981; color: white; }
          .fc-difficulty-medium { background: #f59e0b; color: white; }
          .fc-difficulty-hard { background: #ef4444; color: white; }
          .fc-card { width: 100%; max-width: 760px; height: 440px; cursor: pointer; perspective: 1200px; }
          .fc-card-inner { width: 100%; height: 100%; position: relative; transition: transform 0.65s cubic-bezier(0.4,0.2,0.2,1); transform-style: preserve-3d; }
          .fc-card--flipped .fc-card-inner { transform: rotateY(180deg); }
          .fc-face { position: absolute; inset: 0; backface-visibility: hidden; border-radius: 24px; padding: 52px 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
          .fc-face--front { background: white; border: 2px solid #e8edf5; box-shadow: 0 24px 60px rgba(0,0,0,0.08); }
          .fc-face--back { background: linear-gradient(145deg,#3b82f6 0%,#1d4ed8 100%); color: white; transform: rotateY(180deg); box-shadow: 0 24px 60px rgba(37,99,235,0.35); }
          .fc-face-label { position: absolute; top: 22px; left: 26px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.55; }
          .fc-face-content { font-size: 26px; line-height: 1.6; text-align: center; max-width: 580px; font-weight: 500; }
          .fc-face--front .fc-face-content { color: #0f172a; }
          .fc-face-hint { position: absolute; bottom: 22px; font-size: 13px; opacity: 0.5; }
          .fc-face-meta { position: absolute; bottom: 22px; font-size: 13px; opacity: 0.85; }
          .fc-dots { display: flex; align-items: center; gap: 7px; margin-top: 28px; }
          .fc-dot { width: 9px; height: 9px; border-radius: 50%; background: #cbd5e1; cursor: pointer; transition: all 0.2s; }
          .fc-dot--active { width: 28px; border-radius: 5px; background: #3b82f6; }
          .fc-dots-more { font-size: 12px; color: #94a3b8; margin-left: 4px; }
          .fc-nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px 40px; max-width: 840px; width: 100%; margin: 0 auto; }
          .fc-nav-btn { padding: 13px 32px; background: white; border: 2px solid #e2e8f0; border-radius: 14px; font-size: 15px; font-weight: 600; color: #374151; cursor: pointer; transition: all 0.2s; }
          .fc-nav-btn:hover:not(:disabled) { border-color: #3b82f6; background: #eff6ff; color: #2563eb; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(59,130,246,0.15); }
          .fc-nav-btn--next { background: linear-gradient(135deg,#3b82f6,#2563eb); border-color: transparent; color: white; }
          .fc-nav-btn--next:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(59,130,246,0.4); background: linear-gradient(135deg,#2563eb,#1d4ed8); }
          .fc-nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
          .fc-shortcuts-hint { font-size: 13px; color: #94a3b8; text-align: center; }
          kbd { padding: 3px 8px; background: white; border: 1px solid #e2e8f0; border-radius: 5px; font-family: monospace; font-size: 12px; color: #475569; }
          @media (max-width: 900px) { .fc-difficulty-badge { right: 16px; } }
          @media (max-width: 640px) {
            .fc-topbar { padding: 0 16px; height: 56px; }
            .fc-controls-row { padding: 12px 16px; }
            .fc-arena { padding: 24px 16px 16px; }
            .fc-card { height: 360px; }
            .fc-face-content { font-size: 20px; }
            .fc-face { padding: 36px 28px; }
            .fc-nav { padding: 16px 16px 32px; }
          }
        `}</style>
      </>
    );
  }

  /* ─── PICKER VIEW ─── */
  return (
    <>
      <div className="fc-page">
        <div className="fc-topbar">
          <button className="fc-back-btn" onClick={() => router.push(`/class/${classId}`)}>
            ← Back to Class
          </button>
          <div className="fc-topbar-center">
            <span className="fc-topbar-title">🎴 Flashcard Sets · {className}</span>
          </div>
          <div className="fc-topbar-right">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="fc-gen-btn"
            >
              {generating ? "Generating…" : "✨ Generate New"}
            </button>
          </div>
        </div>

        <div className="fc-picker-body">
          {generateError && (
            <div className="fc-error-banner">❌ {generateError}</div>
          )}

          {flashcardSets.length === 0 ? (
            <div className="fc-empty">
              <div style={{ fontSize: "64px" }}>🎴</div>
              <h2 style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                No Flashcard Sets Yet
              </h2>
              <p style={{ margin: "0 0 24px", color: "#64748b", textAlign: "center", maxWidth: "380px" }}>
                Upload course materials and generate flashcards, or click Generate New to
                create a set from existing documents.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
                <button onClick={handleGenerate} disabled={generating} className="fc-gen-btn-large">
                  {generating ? "Generating…" : "✨ Generate Flashcards"}
                </button>
                <button onClick={() => router.push(`/class/${classId}`)} className="fc-secondary-btn">
                  Upload Materials
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="fc-sets-header">
                <h2 className="fc-sets-title">{flashcardSets.length} Flashcard Set{flashcardSets.length !== 1 ? "s" : ""}</h2>
                <p className="fc-sets-sub">Click a set to start studying</p>
              </div>
              <div className="fc-sets-grid">
                {flashcardSets.map((set) => (
                  <button key={set.id} className="fc-set-card" onClick={() => openSet(set)}>
                    <div className="fc-set-icon">🎴</div>
                    <div className="fc-set-info">
                      <div className="fc-set-title">{set.doc_title || set.title}</div>
                      <div className="fc-set-meta">
                        {set.card_count} card{set.card_count !== 1 ? "s" : ""} · {new Date(set.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="fc-set-arrow">→</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <style jsx>{`
        .fc-page { min-height: 100vh; background: linear-gradient(160deg, #f8fafc 0%, #f0f4ff 50%, #f8fafc 100%); display: flex; flex-direction: column; }
        .fc-topbar { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid #e8edf5; padding: 0 32px; height: 64px; display: flex; align-items: center; gap: 20px; }
        .fc-back-btn { background: none; border: none; color: #64748b; font-size: 14px; font-weight: 600; cursor: pointer; padding: 8px 14px; border-radius: 10px; transition: all 0.2s; white-space: nowrap; flex-shrink: 0; }
        .fc-back-btn:hover { background: #f1f5f9; color: #3b82f6; }
        .fc-topbar-center { flex: 1; min-width: 0; }
        .fc-topbar-title { font-size: 15px; font-weight: 700; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fc-topbar-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .fc-gen-btn { padding: 9px 20px; background: linear-gradient(135deg,#3b82f6,#2563eb); color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .fc-gen-btn:hover:not(:disabled) { box-shadow: 0 4px 14px rgba(59,130,246,0.4); transform: translateY(-1px); }
        .fc-gen-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .fc-picker-body { flex: 1; padding: 40px max(24px, 4vw); max-width: 1400px; width: 100%; margin: 0 auto; box-sizing: border-box; }
        .fc-error-banner { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px; padding: 14px 18px; color: #dc2626; font-size: 14px; margin-bottom: 24px; }
        .fc-sets-header { margin-bottom: 24px; }
        .fc-sets-title { margin: 0 0 4px; font-size: 22px; font-weight: 800; color: #0f172a; }
        .fc-sets-sub { margin: 0; font-size: 14px; color: #64748b; }
        .fc-sets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
        .fc-set-card { display: flex; align-items: center; gap: 16px; background: white; border: 2px solid #e8edf5; border-radius: 18px; padding: 22px 20px; cursor: pointer; text-align: left; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .fc-set-card:hover { border-color: #3b82f6; box-shadow: 0 8px 24px rgba(59,130,246,0.12); transform: translateY(-2px); }
        .fc-set-icon { font-size: 36px; flex-shrink: 0; }
        .fc-set-info { flex: 1; min-width: 0; }
        .fc-set-title { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fc-set-meta { font-size: 13px; color: #64748b; }
        .fc-set-arrow { font-size: 20px; color: #94a3b8; flex-shrink: 0; transition: color 0.2s; }
        .fc-set-card:hover .fc-set-arrow { color: #3b82f6; }
        .fc-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 80px 24px; text-align: center; }
        .fc-gen-btn-large { padding: 14px 32px; background: linear-gradient(135deg,#3b82f6,#2563eb); color: white; border: none; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .fc-gen-btn-large:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(59,130,246,0.4); transform: translateY(-2px); }
        .fc-gen-btn-large:disabled { opacity: 0.55; cursor: not-allowed; }
        .fc-secondary-btn { padding: 14px 32px; background: white; border: 2px solid #e2e8f0; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; color: #374151; transition: all 0.2s; }
        .fc-secondary-btn:hover { background: #f8fafc; border-color: #94a3b8; }
        @media (max-width: 640px) {
          .fc-topbar { padding: 0 16px; height: 56px; }
          .fc-picker-body { padding: 24px 16px; }
          .fc-sets-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}