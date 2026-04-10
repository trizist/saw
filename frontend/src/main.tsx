import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles/globals.css";

import { wagmiConfig } from "./lib/wagmi";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Ceremony from "./pages/Ceremony";
import CommitReveal from "./pages/CommitReveal";
import Allocations from "./pages/Allocations";
import Audit from "./pages/Audit";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5_000 },
  },
});

const sawTheme = darkTheme({
  accentColor:          "#6366f1",
  accentColorForeground:"white",
  borderRadius:         "large",
  fontStack:            "system",
  overlayBlur:          "large",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={sawTheme} modalSize="compact">
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/"            element={<Dashboard />} />
                <Route path="/ceremony"    element={<Ceremony />} />
                <Route path="/commit"      element={<CommitReveal />} />
                <Route path="/allocations" element={<Allocations />} />
                <Route path="/audit"       element={<Audit />} />
                <Route path="*"            element={<Dashboard />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
