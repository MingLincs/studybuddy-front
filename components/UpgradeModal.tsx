"use client";

// components/UpgradeModal.tsx
// Shown when a free user hits any limit.
// Props:
//   reason: "class" | "upload" | "ai"  — which limit was hit
//   onClose: () => void

import { useState } from "react";
import { redirectToCheckout } from "@/lib/subscription";

type Reason = "class" | "upload" | "ai";

interface Props {
  reason: Reason;
  onClose: () => void;
}

const COPY: Record<Reason, { title: string; body: string; emoji: string }> = {
  class: {
    emoji: "📚",
    title: "You've reached your class limit",
    body:  "Free accounts can have up to 3 classes. Upgrade to Pro for unlimited classes and supercharge your studying.",
  },
  upload: {
    emoji: "📄",
    title: "Upload limit reached",
    body:  "Free accounts can upload up to 10 documents total. Upgrade to Pro for unlimited uploads and never worry about running out.",
  },
  ai: {
    emoji: "✨",
    title: "Monthly AI limit reached",
    body:  "You've used all 20 AI generations for this month. Upgrade to Pro for unlimited AI-powered study materials — no monthly cap, ever.",
  },
};

const PRO_FEATURES = [
  { icon: "♾️",  text: "Unlimited classes"              },
  { icon: "📂",  text: "Unlimited document uploads"      },
  { icon: "🤖",  text: "Unlimited AI generations / month"},
  { icon: "⚡",  text: "Priority processing"             },
  { icon: "💬",  text: "Priority support"                },
];

export default function UpgradeModal({ reason, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const copy = COPY[reason];

  const handleUpgrade = async () => {
    setLoading(true);
    setErr(null);
    try {
      await redirectToCheckout();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Header */}
        <div className="modal-emoji">{copy.emoji}</div>
        <h2 className="modal-title">{copy.title}</h2>
        <p className="modal-body">{copy.body}</p>

        {/* Pricing */}
        <div className="pricing-badge">
          <span className="price">$9.99</span>
          <span className="period">/month</span>
        </div>

        {/* Features */}
        <ul className="features-list">
          {PRO_FEATURES.map((f) => (
            <li key={f.text} className="feature-item">
              <span className="feature-icon">{f.icon}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>

        {err && <p className="error-msg">{err}</p>}

        {/* CTA */}
        <button
          className="upgrade-btn"
          onClick={handleUpgrade}
          disabled={loading}
        >
          {loading ? "Redirecting…" : "Upgrade to Pro →"}
        </button>

        <button className="maybe-later" onClick={onClose}>
          Maybe later
        </button>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          animation: fadeIn 0.15s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .modal-card {
          background: white;
          border-radius: 24px;
          padding: 40px 36px;
          max-width: 440px;
          width: 100%;
          position: relative;
          text-align: center;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
          animation: slideUp 0.2s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }

        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: #f1f5f9;
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          font-size: 14px;
          cursor: pointer;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .modal-close:hover { background: #e2e8f0; }

        .modal-emoji {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .modal-title {
          font-size: 22px;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 12px;
          line-height: 1.3;
        }

        .modal-body {
          font-size: 15px;
          color: #64748b;
          line-height: 1.6;
          margin: 0 0 24px;
        }

        .pricing-badge {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 16px;
          padding: 16px 24px;
          margin-bottom: 24px;
          display: inline-block;
        }

        .price {
          font-size: 36px;
          font-weight: 800;
          color: white;
        }

        .period {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.8);
          margin-left: 4px;
        }

        .features-list {
          list-style: none;
          padding: 0;
          margin: 0 0 28px;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 15px;
          color: #374151;
        }

        .feature-icon {
          font-size: 18px;
          width: 24px;
          text-align: center;
        }

        .error-msg {
          color: #ef4444;
          font-size: 14px;
          margin: 0 0 16px;
        }

        .upgrade-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 14px;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 12px;
          box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
        }

        .upgrade-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }

        .upgrade-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .maybe-later {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 14px;
          cursor: pointer;
          padding: 4px;
        }

        .maybe-later:hover { color: #64748b; }
      `}</style>
    </div>
  );
}
