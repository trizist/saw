import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Waves, Eye, ShieldCheck, BarChart3,
  Menu, X, ExternalLink, Github, Zap
} from "lucide-react";
import { useProtocolState } from "../hooks/useProtocolState";
import { STATES } from "../lib/constants";

const NAV_ITEMS = [
  { path: "/",           label: "Dashboard",   icon: LayoutDashboard },
  { path: "/ceremony",   label: "Ceremony",    icon: Waves },
  { path: "/commit",     label: "Participate", icon: Eye },
  { path: "/allocations",label: "Allocations", icon: BarChart3 },
  { path: "/audit",      label: "Audit",       icon: ShieldCheck },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location   = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: protocolState } = useProtocolState();

  const currentStateIdx  = protocolState?.current?.index ?? 0;
  const currentStateName = STATES[currentStateIdx]?.name ?? "Foundation";

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-dark-900/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-saw-gradient flex items-center justify-center shadow-state group-hover:saw-glow transition-all">
              <Waves className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-ritual font-bold text-slate-100 text-lg tracking-tight">SAW</span>
              <span className="hidden sm:inline font-ritual text-slate-400 text-lg"> Protocol</span>
            </div>
          </Link>

          {/* State pill */}
          <div className="hidden md:flex items-center gap-2 bg-dark-700 border border-white/5 rounded-full px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-saw-400 animate-pulse-slow" />
            <span className="text-xs font-mono text-slate-400">
              State {currentStateIdx + 1}: <span className="text-saw-300">{currentStateName}</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const active = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                    ${active
                      ? "bg-saw-600/20 text-saw-300 border border-saw-500/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/trizist/saw"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-icon hidden sm:flex"
            >
              <Github className="w-4 h-4" />
            </a>
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="avatar"
            />
            {/* Mobile menu toggle */}
            <button
              className="lg:hidden btn-icon"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden overflow-hidden border-t border-white/5 bg-dark-800"
            >
              <nav className="px-4 py-3 flex flex-col gap-1">
                {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
                  const active = location.pathname === path;
                  return (
                    <Link
                      key={path}
                      to={path}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                        ${active
                          ? "bg-saw-600/20 text-saw-300"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-6 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-saw-500" />
            <span className="font-ritual">SAW Protocol © 2026 Umair Abbas (trizist)</span>
          </div>
          <div className="font-ritual text-saw-600 font-medium tracking-wide">
            "Twelve States. One Truth."
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/trizist/saw" target="_blank" rel="noopener noreferrer"
              className="hover:text-slate-400 flex items-center gap-1 transition-colors">
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
            <span>·</span>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
