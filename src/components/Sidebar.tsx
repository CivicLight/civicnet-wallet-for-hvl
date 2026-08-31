import { Home, Send, Download, Package, Plus, Layers, List, BookUser, Settings } from "lucide-react";
import civicLogo from "../assets/civic-logo.png";

export type View =
  | "overview"
  | "send"
  | "receive"
  | "assets"
  | "create-asset"
  | "staking"
  | "activity"
  | "addresses"
  | "settings";

const NAV_ITEMS: { view: View; label: string; icon: React.ElementType }[] = [
  { view: "overview", label: "Overview", icon: Home },
  { view: "send", label: "Send", icon: Send },
  { view: "receive", label: "Receive", icon: Download },
];

const NAV_ITEMS_2: { view: View; label: string; icon: React.ElementType }[] = [
  { view: "assets", label: "Assets", icon: Package },
  { view: "create-asset", label: "Create Asset", icon: Plus },
  { view: "staking", label: "Staking", icon: Layers },
  { view: "activity", label: "Activity", icon: List },
  { view: "addresses", label: "Addresses", icon: BookUser },
  { view: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  active: View;
  onNavigate: (view: View) => void;
  nodeHeight: number;
  nodeConnected: boolean;
}

function NavButton({
  view,
  label,
  icon: Icon,
  active,
  badge,
  onNavigate,
}: {
  view: View;
  label: string;
  icon: React.ElementType;
  active: boolean;
  badge?: string;
  onNavigate: (view: View) => void;
}) {
  return (
    <button
      onClick={() => onNavigate(view)}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600/15 text-blue-400"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      <Icon size={18} />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({ active, onNavigate, nodeHeight, nodeConnected }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-white/5 bg-[#0d1220] px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <img src={civicLogo} alt="CivicNet" className="h-8 w-8 rounded-lg object-cover" />
        <span className="text-[15px] font-semibold text-white">CivicNet Wallet</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.view} {...item} active={active === item.view} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="my-3 border-t border-white/5" />

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS_2.map((item) => (
          <NavButton
            key={item.view}
            {...item}
            badge={item.view === "create-asset" ? "New" : undefined}
            active={active === item.view}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${nodeConnected ? "bg-emerald-400" : "bg-red-400"}`} />
          <span className="text-slate-300">{nodeConnected ? "Connected" : "Disconnected"}</span>
          <span className="ml-auto text-slate-500">v0.1.0</span>
        </div>
        {nodeConnected && (
          <span className="text-slate-500">Block {nodeHeight.toLocaleString()}</span>
        )}
      </div>
    </aside>
  );
}
