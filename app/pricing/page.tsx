"use client";

// app/pricing/page.tsx

import { useState } from "react";
import { useSubscription, redirectToCheckout, redirectToPortal } from "@/lib/subscription";

const FREE_FEATURES = [
  "3 classes",
  "10 total document uploads",
  "20 AI generations / month",
  "Flashcards & quizzes",
  "Concept maps",
  "Calendar sync",
  "Study guides",
];

const PRO_FEATURES = [
  "Unlimited classes",
  "Unlimited document uploads",
  "Unlimited AI generations",
  "Flashcards & quizzes",
  "Concept maps",
  "Calendar sync",
  "Study guides",
  "Priority processing",
  "Priority support",
];

const FAQ = [
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel anytime from your account portal. You keep Pro access until the end of your billing period.",
  },
  {
    q: "What counts as an AI generation?",
    a: "Each document you upload counts as one generation. So does each class-level quiz or flashcard set you create. Reading existing materials is always free.",
  },
  {
    q: "Is there a student discount?",
    a: "We built StudyBuddy for students — our $9.99/month price is already priced with you in mind. We may add an annual plan in the future.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards via Stripe. Your payment info is never stored on our servers.",
  },
];

export default function PricingPage() {
  const { isPro, loading } = useSubscription();
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [portalLoading,  setPortalLoading]  = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    setError(null);
    try {
      await redirectToCheckout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start checkout");
      setUpgradeLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      await redirectToPortal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open portal");
      setPortalLoading(false);
    }
  };

  return (
    <div className="pricing-page">
      {/* Header */}
      <div className="pricing-header">
        <div className="badge">Pricing</div>
        <h1 className="pricing-title">
          Simple, student-friendly pricing
        </h1>
        <p className="pricing-subtitle">
          Start free. Upgrade when you need more. No hidden fees.
        </p>
      </div>

      {/* Cards */}
      <div className="plans-grid">
        {/* Free */}
        <div className="plan-card">
          <div className="plan-name">Free</div>
          <div className="plan-price-row">
            <span className="plan-price">$0</span>
            <span className="plan-period">forever</span>
          </div>
          <p className="plan-desc">Perfect for trying StudyBuddy or lighter study loads.</p>

          <div className="plan-cta-area">
            {!isPro ? (
              <div className="current-plan-badge">✓ Your current plan</div>
            ) : (
              <button className="plan-btn secondary" onClick={handlePortal} disabled={portalLoading}>
                {portalLoading ? "Loading…" : "Manage subscription"}
              </button>
            )}
          </div>

          <ul className="feature-list">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="feature-row">
                <span className="check free-check">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div className="plan-card pro-card">
          <div className="popular-badge">Most popular</div>
          <div className="plan-name pro-name">Pro</div>
          <div className="plan-price-row">
            <span className="plan-price pro-price">$9.99</span>
            <span className="plan-period pro-period">/ month</span>
          </div>
          <p className="plan-desc pro-desc">For serious students who want zero limits.</p>

          <div className="plan-cta-area">
            {isPro ? (
              <button className="plan-btn portal-btn" onClick={handlePortal} disabled={portalLoading}>
                {portalLoading ? "Loading…" : "Manage subscription →"}
              </button>
            ) : (
              <button className="plan-btn pro-btn" onClick={handleUpgrade} disabled={upgradeLoading || loading}>
                {upgradeLoading ? "Redirecting…" : "Upgrade to Pro →"}
              </button>
            )}
          </div>

          {error && <p className="error-text">{error}</p>}

          <ul className="feature-list">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="feature-row">
                <span className="check pro-check">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Comparison table */}
      <div className="comparison-section">
        <h2 className="comparison-title">Feature comparison</h2>
        <div className="comparison-table">
          <div className="table-header">
            <div className="col-feature"></div>
            <div className="col-tier">Free</div>
            <div className="col-tier pro-col">Pro</div>
          </div>

          {[
            ["Classes",              "Up to 3",    "Unlimited"],
            ["Document uploads",     "Up to 10",   "Unlimited"],
            ["AI generations",       "20 / month", "Unlimited"],
            ["Flashcards",           "✓",          "✓"],
            ["Quizzes",              "✓",          "✓"],
            ["Concept maps",         "✓",          "✓"],
            ["Calendar sync",        "✓",          "✓"],
            ["Study guides",         "✓",          "✓"],
            ["Priority processing",  "—",          "✓"],
            ["Priority support",     "—",          "✓"],
          ].map(([feature, free, pro]) => (
            <div className="table-row" key={feature}>
              <div className="col-feature">{feature}</div>
              <div className="col-tier">{free}</div>
              <div className="col-tier pro-col">{pro}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="faq-section">
        <h2 className="faq-title">Frequently asked questions</h2>
        <div className="faq-list">
          {FAQ.map((item, i) => (
            <div key={i} className="faq-item">
              <button
                className="faq-question"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span>{item.q}</span>
                <span className="faq-arrow">{openFaq === i ? "▲" : "▼"}</span>
              </button>
              {openFaq === i && (
                <p className="faq-answer">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .pricing-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 20px 80px;
        }

        /* Header */
        .pricing-header {
          text-align: center;
          margin-bottom: 56px;
        }

        .badge {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 13px;
          font-weight: 600;
          padding: 4px 14px;
          border-radius: 20px;
          margin-bottom: 16px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .pricing-title {
          font-size: 40px;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 16px;
          line-height: 1.2;
        }

        .pricing-subtitle {
          font-size: 18px;
          color: #64748b;
          margin: 0;
        }

        /* Plans */
        .plans-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 64px;
        }

        @media (max-width: 640px) {
          .plans-grid { grid-template-columns: 1fr; }
          .pricing-title { font-size: 28px; }
        }

        .plan-card {
          background: white;
          border-radius: 24px;
          padding: 36px;
          border: 2px solid #e2e8f0;
          position: relative;
        }

        .pro-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-color: transparent;
        }

        .popular-badge {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          background: #f59e0b;
          color: white;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 16px;
          border-radius: 20px;
          white-space: nowrap;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .plan-name {
          font-size: 20px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
        }

        .pro-name { color: rgba(255,255,255,0.9); }

        .plan-price-row {
          display: flex;
          align-items: baseline;
          gap: 4px;
          margin-bottom: 12px;
        }

        .plan-price {
          font-size: 48px;
          font-weight: 800;
          color: #1e293b;
        }

        .pro-price { color: white; }

        .plan-period {
          font-size: 16px;
          color: #64748b;
        }

        .pro-period { color: rgba(255,255,255,0.7); }

        .plan-desc {
          font-size: 14px;
          color: #64748b;
          margin: 0 0 24px;
          line-height: 1.5;
        }

        .pro-desc { color: rgba(255,255,255,0.8); }

        .plan-cta-area {
          margin-bottom: 28px;
        }

        .current-plan-badge {
          text-align: center;
          padding: 14px;
          background: #f1f5f9;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          color: #64748b;
        }

        .plan-btn {
          width: 100%;
          padding: 15px;
          border-radius: 12px;
          border: none;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .plan-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pro-btn {
          background: white;
          color: #764ba2;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }

        .pro-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }

        .secondary {
          background: #f1f5f9;
          color: #475569;
        }

        .portal-btn {
          background: white;
          color: #764ba2;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }

        .error-text {
          color: #fca5a5;
          font-size: 13px;
          margin: -12px 0 16px;
          text-align: center;
        }

        /* Feature list */
        .feature-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .feature-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 15px;
          color: #374151;
        }

        .pro-card .feature-row { color: rgba(255,255,255,0.9); }

        .check {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .free-check {
          background: #dcfce7;
          color: #16a34a;
        }

        .pro-check {
          background: rgba(255,255,255,0.25);
          color: white;
        }

        /* Comparison */
        .comparison-section {
          margin-bottom: 64px;
        }

        .comparison-title {
          font-size: 28px;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 24px;
          text-align: center;
        }

        .comparison-table {
          background: white;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }

        .table-header,
        .table-row {
          display: grid;
          grid-template-columns: 1fr 140px 140px;
        }

        .table-header {
          background: #f8fafc;
          padding: 16px 24px;
          font-weight: 700;
          font-size: 14px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .table-row {
          padding: 16px 24px;
          font-size: 15px;
          color: #374151;
          border-top: 1px solid #f1f5f9;
        }

        .table-row:hover { background: #fafbfc; }

        .col-feature { font-weight: 500; }
        .col-tier { text-align: center; }
        .pro-col { color: #7c3aed; font-weight: 600; }

        /* FAQ */
        .faq-section { }

        .faq-title {
          font-size: 28px;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 24px;
          text-align: center;
        }

        .faq-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .faq-item {
          background: white;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }

        .faq-question {
          width: 100%;
          padding: 20px 24px;
          background: none;
          border: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          cursor: pointer;
          text-align: left;
          gap: 16px;
        }

        .faq-question:hover { background: #fafbfc; }

        .faq-arrow {
          font-size: 11px;
          color: #94a3b8;
          flex-shrink: 0;
        }

        .faq-answer {
          padding: 0 24px 20px;
          font-size: 15px;
          color: #64748b;
          line-height: 1.7;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
