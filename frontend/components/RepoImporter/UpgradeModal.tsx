"use client";

interface Props {
  onClose: () => void;
}

export default function UpgradeModal({ onClose }: Props) {
  return (
    <div className="upgrade-backdrop" onClick={onClose}>
      <div className="upgrade-modal" onClick={e => e.stopPropagation()}>

        {/* Glow */}
        <div className="upgrade-glow" />

        {/* Icon */}
        <div className="upgrade-icon-wrap">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#a78bfa" }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>

        <h2 className="upgrade-title">Unlock Private Repositories</h2>
        <p className="upgrade-sub">
          Private repos require a Pro plan. Get unlimited private repo access, priority indexing, and advanced AI context.
        </p>

        {/* Features */}
        <ul className="upgrade-features">
          {[
            "Unlimited private repository access",
            "Priority indexing queue",
            "Extended AI context window",
            "Team collaboration features",
          ].map(f => (
            <li key={f} className="upgrade-feature-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {/* Price */}
        <div className="upgrade-price-row">
          <span className="upgrade-price">$12</span>
          <span className="upgrade-price-per">/ month</span>
        </div>

        <button className="upgrade-cta" onClick={onClose}>
          Upgrade to Pro
        </button>

        <button className="upgrade-dismiss" onClick={onClose}>
          Maybe later
        </button>

      </div>

      <style>{`
        .upgrade-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: upgrade-bg-in 0.25s ease-out both;
        }
        @keyframes upgrade-bg-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .upgrade-modal {
          position: relative;
          width: 100%;
          max-width: 420px;
          background: linear-gradient(180deg, #111 0%, #080808 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 36px 32px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.04),
                      0 32px 64px -16px rgba(0,0,0,0.8),
                      0 0 60px rgba(167,139,250,0.06);
          overflow: hidden;
          animation: upgrade-modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes upgrade-modal-in {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .upgrade-glow {
          position: absolute;
          top: -60px;
          left: 50%;
          transform: translateX(-50%);
          width: 280px;
          height: 200px;
          background: radial-gradient(ellipse at center, rgba(167,139,250,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .upgrade-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: rgba(167,139,250,0.08);
          border: 1px solid rgba(167,139,250,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .upgrade-title {
          font-size: 19px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.03em;
          margin-bottom: 10px;
        }
        .upgrade-sub {
          font-size: 13.5px;
          color: #737373;
          line-height: 1.6;
          max-width: 320px;
          margin-bottom: 24px;
        }
        .upgrade-features {
          list-style: none;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 28px;
          text-align: left;
        }
        .upgrade-feature-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13.5px;
          color: #d4d4d4;
        }
        .upgrade-price-row {
          display: flex;
          align-items: baseline;
          gap: 4px;
          margin-bottom: 20px;
        }
        .upgrade-price {
          font-size: 36px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.05em;
        }
        .upgrade-price-per {
          font-size: 14px;
          color: #737373;
        }
        .upgrade-cta {
          width: 100%;
          background: linear-gradient(135deg, #a78bfa 0%, #818cf8 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          padding: 13px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
          margin-bottom: 10px;
          box-shadow: 0 4px 24px rgba(167,139,250,0.3);
        }
        .upgrade-cta:hover { opacity: 0.88; }
        .upgrade-cta:active { transform: scale(0.98); }
        .upgrade-dismiss {
          background: none;
          border: none;
          color: #525252;
          font-size: 13px;
          cursor: pointer;
          padding: 6px;
          transition: color 0.15s;
          font-family: inherit;
        }
        .upgrade-dismiss:hover { color: #a3a3a3; }
      `}</style>
    </div>
  );
}
