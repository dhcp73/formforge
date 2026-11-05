import { LayoutDashboard, FileText, Users, GitBranch, Sparkles, Plug, KeyRound, Webhook, CalendarClock, Settings, Activity, ScanSearch, Mail, BookOpen } from "lucide-react";

export const NAV_GROUPS = [
  { label: "Workspace", items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true }] },
  { label: "Data", items: [{ href: "/dashboard/forms", label: "Forms", icon: FileText }, { href: "/dashboard/leads", label: "Submissions & leads", icon: Users }] },
  { label: "Automation", items: [
    { href: "/dashboard/routing", label: "Routing", icon: GitBranch },
    { href: "/dashboard/enrichment", label: "Enrichment", icon: Sparkles },
    { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
    { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
    { href: "/dashboard/schedules", label: "Schedules", icon: CalendarClock },
  ] },
  { label: "Developers", items: [{ href: "/dashboard/api-keys", label: "API & keys", icon: KeyRound }, { href: "/docs/api", label: "API reference", icon: BookOpen }] },
  { label: "Operations", items: [
    { href: "/dashboard/health", label: "System health", icon: Activity },
    { href: "/dashboard/qa", label: "QA agent", icon: ScanSearch },
    { href: "/dashboard/outbox", label: "Email outbox", icon: Mail },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ] },
];

export const CRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard", forms: "Forms", leads: "Submissions & leads", routing: "Routing", enrichment: "Enrichment", integrations: "Integrations",
  webhooks: "Webhooks", schedules: "Schedules", "api-keys": "API & keys", health: "System health", qa: "QA agent", outbox: "Email outbox",
  settings: "Settings", setup: "Setup", automations: "Automations", submissions: "Submission",
};
