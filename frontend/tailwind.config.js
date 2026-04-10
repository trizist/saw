/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // SAW Protocol brand palette
        saw: {
          50:  "#f0f4ff",
          100: "#e0e9ff",
          200: "#c7d7fe",
          300: "#a5bbfc",
          400: "#8094f8",
          500: "#6366f1",   // Primary — Indigo
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        ceremony: {
          gold:    "#f59e0b",
          silver:  "#94a3b8",
          emerald: "#10b981",
          crimson: "#ef4444",
          violet:  "#8b5cf6",
          cyan:    "#06b6d4",
        },
        dark: {
          900: "#0a0a0f",
          800: "#111118",
          700: "#1a1a26",
          600: "#232333",
          500: "#2d2d45",
        },
      },
      fontFamily: {
        mono:   ["JetBrains Mono", "Fira Code", "monospace"],
        sans:   ["Inter", "system-ui", "sans-serif"],
        ritual: ["Space Grotesk", "Inter", "sans-serif"],
      },
      backgroundImage: {
        "saw-gradient":     "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
        "ceremony-gradient":"linear-gradient(180deg, #0a0a0f 0%, #111118 100%)",
        "state-active":     "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        "state-complete":   "linear-gradient(135deg, #059669 0%, #10b981 100%)",
        "state-pending":    "linear-gradient(135deg, #374151 0%, #4b5563 100%)",
        "entropy-pulse":    "radial-gradient(circle at center, #4f46e5 0%, transparent 70%)",
      },
      animation: {
        "pulse-slow":    "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow":     "spin 8s linear infinite",
        "glow":          "glow 2s ease-in-out infinite alternate",
        "slide-up":      "slideUp 0.5s ease-out",
        "fade-in":       "fadeIn 0.4s ease-out",
        "state-advance": "stateAdvance 0.8s ease-out",
      },
      keyframes: {
        glow: {
          "0%":   { boxShadow: "0 0 5px #4f46e5, 0 0 10px #4f46e5" },
          "100%": { boxShadow: "0 0 20px #4f46e5, 0 0 40px #7c3aed" },
        },
        slideUp: {
          "0%":   { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        stateAdvance: {
          "0%":   { transform: "scale(0.95)", opacity: "0.5" },
          "50%":  { transform: "scale(1.02)", opacity: "1" },
          "100%": { transform: "scale(1)",    opacity: "1" },
        },
      },
      boxShadow: {
        "saw-glow":  "0 0 30px rgba(79, 70, 229, 0.4)",
        "state":     "0 4px 20px rgba(99, 102, 241, 0.3)",
        "hash":      "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};
