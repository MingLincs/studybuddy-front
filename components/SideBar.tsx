"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { useSubscription, redirectToCheckout, FREE_UPLOAD_LIMIT, FREE_AI_MONTHLY_LIMIT } from "@/lib/subscription";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [user, setUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isPro, uploadsUsed, aiUsed } = useSubscription();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUserMenu]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setShowUserMenu(false);
    router.push("/");
    // Force reload to clear state
    setTimeout(() => window.location.href = "/", 100);
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const getUserInitial = () => {
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "?";
  };

  const getUserName = () => {
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return "Guest";
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button
        className="mobile-sidebar-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        ☰
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        {/* Logo */}
        <Link href="/home" className="sidebar-logo">
          <Image
            src="/studybuddy-mark.png"
            alt="StudyBuddy"
            width={40}
            height={28}
            priority
            className="logo-image"
          />
          <span className="logo-text">StudyBuddy</span>
        </Link>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <Link
            href="/home"
            className={`nav-item ${isActive('/home') ? 'active' : ''}`}
          >
            <span className="nav-icon">🏠</span>
            <span className="nav-text">Home</span>
          </Link>

          <Link
            href="/upload"
            className={`nav-item ${isActive('/upload') ? 'active' : ''}`}
          >
            <span className="nav-icon">📤</span>
            <span className="nav-text">Upload</span>
          </Link>

          <Link
  href="/classes"
  className={`nav-item ${isActive("/classes") || isActive("/class") ? "active" : ""}`}
>
  <span className="nav-icon">📚</span>
  <span className="nav-text">Classes</span>
</Link>

<Link
  href="/calendar"
  className={`nav-item ${isActive("/calendar") ? "active" : ""}`}
>
  <span className="nav-icon">📅</span>
  <span className="nav-text">Calendar</span>
</Link>

<Link
  href="/library"
  className={`nav-item ${isActive("/library") ? "active" : ""}`}
>
  <span className="nav-icon">📁</span>
  <span className="nav-text">Library</span>
</Link>

<Link
  href="/pricing"
  className={`nav-item ${isActive("/pricing") ? "active" : ""}`}
>
  <span className="nav-icon">💎</span>
  <span className="nav-text">Pricing</span>
</Link>
        </nav>

        {/* Usage bar (free users only) */}
        {!isPro && (
          <div className="usage-panel">
            <div className="usage-row">
              <span className="usage-label">Uploads</span>
              <span className="usage-count">{uploadsUsed} / {FREE_UPLOAD_LIMIT}</span>
            </div>
            <div className="usage-bar-bg">
              <div
                className="usage-bar-fill"
                style={{ width: `${Math.min(100, (uploadsUsed / FREE_UPLOAD_LIMIT) * 100)}%` }}
              />
            </div>
            <div className="usage-row" style={{ marginTop: 8 }}>
              <span className="usage-label">AI this month</span>
              <span className="usage-count">{aiUsed} / {FREE_AI_MONTHLY_LIMIT}</span>
            </div>
            <div className="usage-bar-bg">
              <div
                className="usage-bar-fill ai-fill"
                style={{ width: `${Math.min(100, (aiUsed / FREE_AI_MONTHLY_LIMIT) * 100)}%` }}
              />
            </div>
            <button
              className="upgrade-cta"
              onClick={() => redirectToCheckout().catch(() => {})}
            >
              ⚡ Upgrade to Pro
            </button>
          </div>
        )}

        {isPro && (
          <div className="pro-badge-panel">
            <span className="pro-crown">👑</span>
            <span className="pro-label">Pro Plan</span>
          </div>
        )}


        {/* User Menu at Bottom */}
        <div className="sidebar-bottom" ref={menuRef}>
          {user ? (
            <>
              <button
                className="user-trigger"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className="user-avatar">
                  {getUserInitial()}
                </div>
                <div className="user-details">
                  <div className="user-name">{getUserName()}</div>
                  <div className="user-email">{user.email}</div>
                </div>
                <div className="menu-arrow">{showUserMenu ? '▲' : '▼'}</div>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="user-menu-dropdown">
                  <div className="menu-header">
                    <div className="menu-avatar">{getUserInitial()}</div>
                    <div className="menu-user-info">
                      <div className="menu-user-name">{getUserName()}</div>
                      <div className="menu-user-email">{user.email}</div>
                    </div>
                  </div>

                  <div className="menu-divider"></div>

                  <button className="menu-item" onClick={() => setShowUserMenu(false)}>
                    <span className="menu-icon">⚙️</span>
                    <span>Settings</span>
                  </button>

                  <button className="menu-item" onClick={() => setShowUserMenu(false)}>
                    <span className="menu-icon">🌙</span>
                    <span>Dark mode</span>
                  </button>

                  <div className="menu-divider"></div>

                  <button className="menu-item logout-item" onClick={handleSignOut}>
                    <span className="menu-icon">🚪</span>
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <Link href="/" className="user-trigger">
              <div className="user-avatar">?</div>
              <div className="user-details">
                <div className="user-name">Sign In</div>
                <div className="user-email">Get started</div>
              </div>
            </Link>
          )}
        </div>

        <style jsx>{`
          .mobile-sidebar-toggle {
            display: none;
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 1001;
            background: white;
            border: none;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            cursor: pointer;
            font-size: 20px;
          }

          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            width: 280px;
            background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
            color: white;
            display: flex;
            flex-direction: column;
            padding: 24px 16px;
            box-shadow: 4px 0 12px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
            z-index: 1000;
          }

          .sidebar.closed {
            transform: translateX(-100%);
          }

          .sidebar-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            margin-bottom: 32px;
            text-decoration: none;
            color: white;
            border-radius: 12px;
            transition: all 0.2s;
          }

          .sidebar-logo:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .logo-image {
            border-radius: 8px;
          }

          .logo-text {
            font-size: 20px;
            font-weight: 700;
          }

          .sidebar-nav {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .nav-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 14px 20px;
            border-radius: 12px;
            text-decoration: none;
            color: rgba(255, 255, 255, 0.7);
            transition: all 0.2s;
            font-size: 16px;
            font-weight: 500;
          }

          .nav-item:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }

          .nav-item.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }

          .nav-icon {
            font-size: 24px;
          }

          .nav-text {
            font-size: 16px;
          }

          .sidebar-bottom {
            margin-top: auto;
            padding-top: 24px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            position: relative;
          }

          .user-trigger {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.05);
            border: none;
            border-radius: 12px;
            width: 100%;
            cursor: pointer;
            transition: all 0.2s;
            color: white;
            text-decoration: none;
          }

          .user-trigger:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .user-avatar {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 600;
            flex-shrink: 0;
          }

          .user-details {
            flex: 1;
            text-align: left;
            min-width: 0;
          }

          .user-name {
            font-size: 14px;
            font-weight: 600;
            color: white;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .user-email {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.6);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .menu-arrow {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.5);
            margin-left: 4px;
          }

          /* Dropdown Menu */
          .user-menu-dropdown {
            position: absolute;
            bottom: 70px;
            left: 16px;
            right: 16px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 12px;
            z-index: 1001;
            animation: slideUp 0.2s ease-out;
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .menu-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
          }

          .menu-avatar {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
            font-weight: 600;
          }

          .menu-user-info {
            flex: 1;
            min-width: 0;
          }

          .menu-user-name {
            font-size: 15px;
            font-weight: 600;
            color: #1e293b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .menu-user-email {
            font-size: 13px;
            color: #64748b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .menu-divider {
            height: 1px;
            background: #e2e8f0;
            margin: 8px 0;
          }

          .menu-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 12px;
            background: none;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            color: #1e293b;
            font-size: 14px;
            text-align: left;
          }

          .menu-item:hover {
            background: #f1f5f9;
          }

          .menu-icon {
            font-size: 18px;
          }

          .logout-item {
            color: #ef4444;
          }

          .logout-item:hover {
            background: #fee2e2;
          }

          /* Usage panel */
          .usage-panel {
            margin: 16px 0;
            padding: 16px;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.1);
          }

          .usage-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
          }

          .usage-label {
            font-size: 12px;
            color: rgba(255,255,255,0.55);
          }

          .usage-count {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255,255,255,0.8);
          }

          .usage-bar-bg {
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 4px;
          }

          .usage-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 4px;
            transition: width 0.4s ease;
          }

          .ai-fill {
            background: linear-gradient(90deg, #f093fb, #f5576c);
          }

          .upgrade-cta {
            margin-top: 12px;
            width: 100%;
            padding: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
          }

          .upgrade-cta:hover {
            opacity: 0.9;
            transform: translateY(-1px);
          }

          /* Pro badge */
          .pro-badge-panel {
            margin: 12px 0;
            padding: 12px 16px;
            background: linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%);
            border-radius: 12px;
            border: 1px solid rgba(102,126,234,0.3);
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .pro-crown { font-size: 18px; }

          .pro-label {
            font-size: 14px;
            font-weight: 700;
            background: linear-gradient(135deg, #a78bfa, #f9a8d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          @media (max-width: 768px) {
            .mobile-sidebar-toggle {
              display: block;
            }

            .sidebar {
              width: 280px;
            }

            .sidebar.closed {
              transform: translateX(-100%);
            }

            .user-menu-dropdown {
              bottom: 70px;
            }
          }
        `}</style>
      </aside>
    </>
  );
}
