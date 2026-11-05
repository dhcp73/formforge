# UI research — enterprise data-app patterns

References studied (Nov 2026): attio.com product site + help center (table views, record pages, 2026 record-page redesign changelog), Apollo.io app patterns (people/company cards, enrichment, fit scores), Linear (keyboard-first, Cmd+K), Retool/HubSpot (dense admin tables).

Nothing here copies logos, brand assets, or exact layouts — FormForge uses its own design system.

## What we took (conceptually)
| Pattern | Seen in | FormForge implementation |
| --- | --- | --- |
| Spreadsheet-style table views with column picker, reorder, filters, sort, bulk actions, record preview without leaving grid | Attio table views | `DataTable` (TanStack Table): dense 36px rows, sticky header, column visibility/reorder/resize, filter + sort chips, saved views (localStorage + URL), bulk select → mark read / spam / delete / export |
| Record page: headline + actions top-left, details panel, tabs (Overview/Activity/…) | Attio record page redesign | Record drawer + full record page with tabs: Answers · Enrichment (per-field source) · Routing timeline · Activity/webhooks · Raw JSON |
| Highlights widgets at top of record | Attio | Fit score, owner, country, company size highlight chips |
| Company + contact cards with logo, size, HQ, industry, LinkedIn, title/seniority | Apollo | `CompanyCard`, `ContactCard`, `FitScore` ring |
| Command palette, keyboard-first | Linear / Attio | `cmdk` palette on ⌘K / Ctrl+K: navigate, jump to form, create form, toggle theme |
| Collapsible sidebar with workspace switcher and grouped nav | Attio / Linear | Sidebar groups: Workspace · Data · Automation · Developers · Settings; collapses to icons; drawer on mobile |
| KPI cards + time-series + distribution charts | HubSpot / Apollo analytics | Overview: KPIs, submissions-over-time area chart, routing per rep, enrichment hit-rate per provider, spam rate |

## Design tokens
- Neutral zinc gray scale, single accent (indigo-600 `#4f46e5`), semantic green/amber/red for status.
- Inter (next/font), 13px app body / 14px inputs, 12px table meta.
- 4/8px spacing grid, 6–8px radii, 1px hairline borders, very soft shadows on floating layers only.
- Visible `focus-visible` ring (2px accent) on every interactive element.
- Light + dark theme (next-themes, class strategy), both checked by axe.
