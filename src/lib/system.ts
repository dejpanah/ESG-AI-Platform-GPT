import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Calculator,
  Cloud,
  Compass,
  Database,
  Droplets,
  FileStack,
  FileText,
  Flame,
  Gauge,
  GitCompareArrows,
  HeartPulse,
  History,
  Landmark,
  Layers,
  MessagesSquare,
  Network,
  Recycle,
  RefreshCcw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Table2,
  Users,
  UsersRound,
  Wind,
  Zap,
} from "lucide-react";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Route for shipped sections; omitted while a section is still planned. */
  to?: string;
  /** Planned release, e.g. "v2". Omitted once the section ships. */
  ships?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Navigation for the product interface. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { label: "Ask Knowledge", icon: MessagesSquare, to: "/" },
      { label: "Documents", icon: FileStack, to: "/documents" },
      { label: "ESG Reports", icon: FileText, to: "/reports" },
      { label: "ESG Data", icon: Table2, to: "/esg-data" },
      { label: "Collections", icon: Layers, to: "/collections" },
      { label: "Sync Queue", icon: RefreshCcw, to: "/sync" },
    ],
  },
  {
    title: "Materiality Assessment",
    items: [
      {
        label: "Double Materiality",
        icon: Compass,
        to: "/materiality/double-materiality",
      },
      {
        label: "Stakeholder Survey & Weighting",
        icon: UsersRound,
        to: "/materiality/stakeholder-survey",
      },
      {
        label: "Topic-to-Standard Mapping",
        icon: GitCompareArrows,
        to: "/materiality/topic-mapping",
      },
      {
        label: "Periodic Review & Rationale Log",
        icon: History,
        to: "/materiality/periodic-review",
      },
    ],
  },
  {
    title: "Calculation Engines",
    items: [
      { label: "01. Scope 1 Calculation", icon: Flame, to: "/calc/scope-1" },
      { label: "02. Scope 2 Calculation", icon: Zap, to: "/calc/scope-2" },
      { label: "03. Scope 3 Calculation", icon: Network, to: "/calc/scope-3" },
      { label: "04. Emission Factor Library", icon: BookOpen, to: "/calc/emission-factors" },
      { label: "05. Methane Accounting", icon: Wind, to: "/calc/methane" },
      { label: "06. Flaring & Losses", icon: Flame, to: "/calc/flaring" },
      { label: "07. Carbon Intensity", icon: Gauge, to: "/calc/carbon-intensity" },
      { label: "08. Water Accounting", icon: Droplets, to: "/calc/water" },
      { label: "09. Waste & Materials", icon: Recycle, to: "/calc/waste" },
      { label: "10. Air Emissions", icon: Cloud, to: "/calc/air-emissions" },
      { label: "11. Safety & HSE", icon: ShieldAlert, to: "/calc/safety-hse" },
      { label: "12. Social & Human Capital", icon: Users, to: "/calc/social-capital" },
      { label: "13. Governance", icon: Landmark, to: "/calc/governance" },
      { label: "14. Formula & Rules Engine", icon: Calculator, to: "/calc/formulas-rules" },
    ],
  },
  {
    title: "Observability",
    items: [
      { label: "Activity", icon: Activity, to: "/activity" },
      { label: "Performance", icon: Gauge, to: "/performance" },
      { label: "Backend Health", icon: HeartPulse, to: "/backend-health" },
      { label: "Evaluations", icon: BarChart3, to: "/evaluations" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Models", icon: SlidersHorizontal, to: "/models" },
      { label: "Indexes", icon: Boxes, to: "/indexes" },
      { label: "Settings", icon: Settings, to: "/settings" },
      { label: "Storage", icon: Database, to: "/storage" },
    ],
  },
];
