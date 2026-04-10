import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, mainnet, hardhat } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "SAW Protocol",
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || "saw-protocol-demo",
  chains: [sepolia, mainnet, hardhat],
  ssr: false,
});

export const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || "11155111", 10);
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
export const SAW_LAUNCH_ADDRESS = import.meta.env.VITE_SAW_LAUNCH_ADDRESS || "";
export const SAW_TOKEN_ADDRESS  = import.meta.env.VITE_SAW_TOKEN_ADDRESS  || "";
