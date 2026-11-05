/** Small bundled company dataset used as an offline fallback (no API key needed). */
export interface OfflineCompany { name: string; industry: string; employees: number; country: string; city: string; linkedin?: string; description: string }

export const OFFLINE_COMPANIES: Record<string, OfflineCompany> = {
  "stripe.com": { name: "Stripe", industry: "Financial Services", employees: 8000, country: "US", city: "San Francisco", linkedin: "https://www.linkedin.com/company/stripe", description: "Payments infrastructure for the internet." },
  "shopify.com": { name: "Shopify", industry: "E-commerce Software", employees: 8300, country: "CA", city: "Ottawa", linkedin: "https://www.linkedin.com/company/shopify", description: "Commerce platform for merchants." },
  "vercel.com": { name: "Vercel", industry: "Developer Tools", employees: 700, country: "US", city: "San Francisco", linkedin: "https://www.linkedin.com/company/vercel", description: "Frontend cloud platform." },
  "github.com": { name: "GitHub", industry: "Developer Tools", employees: 3000, country: "US", city: "San Francisco", linkedin: "https://www.linkedin.com/company/github", description: "Code hosting and collaboration." },
  "notion.so": { name: "Notion", industry: "Productivity Software", employees: 800, country: "US", city: "San Francisco", linkedin: "https://www.linkedin.com/company/notionhq", description: "Connected workspace for docs and wikis." },
  "linear.app": { name: "Linear", industry: "Productivity Software", employees: 120, country: "US", city: "San Francisco", description: "Issue tracking for software teams." },
  "figma.com": { name: "Figma", industry: "Design Software", employees: 1500, country: "US", city: "San Francisco", linkedin: "https://www.linkedin.com/company/figma", description: "Collaborative interface design tool." },
  "monzo.com": { name: "Monzo", industry: "Financial Services", employees: 3500, country: "GB", city: "London", linkedin: "https://www.linkedin.com/company/monzo-bank", description: "Digital bank." },
  "revolut.com": { name: "Revolut", industry: "Financial Services", employees: 8000, country: "GB", city: "London", linkedin: "https://www.linkedin.com/company/revolut", description: "Global financial super-app." },
  "deliveroo.co.uk": { name: "Deliveroo", industry: "Consumer Internet", employees: 3000, country: "GB", city: "London", description: "Food delivery marketplace." },
  "wise.com": { name: "Wise", industry: "Financial Services", employees: 5000, country: "GB", city: "London", description: "International money transfers." },
  "atlassian.com": { name: "Atlassian", industry: "Software", employees: 11000, country: "AU", city: "Sydney", description: "Team collaboration software." },
  "canva.com": { name: "Canva", industry: "Design Software", employees: 4000, country: "AU", city: "Sydney", description: "Online visual design platform." },
  "spotify.com": { name: "Spotify", industry: "Media & Entertainment", employees: 7500, country: "SE", city: "Stockholm", description: "Audio streaming service." },
  "klarna.com": { name: "Klarna", industry: "Financial Services", employees: 4000, country: "SE", city: "Stockholm", description: "Buy now, pay later payments." },
  "n26.com": { name: "N26", industry: "Financial Services", employees: 1500, country: "DE", city: "Berlin", description: "Mobile bank." },
  "sap.com": { name: "SAP", industry: "Enterprise Software", employees: 105000, country: "DE", city: "Walldorf", description: "Enterprise application software." },
  "datadoghq.com": { name: "Datadog", industry: "Software", employees: 6000, country: "US", city: "New York", description: "Monitoring and security platform." },
  "hubspot.com": { name: "HubSpot", industry: "Marketing Software", employees: 7600, country: "US", city: "Cambridge", description: "CRM platform for scaling companies." },
  "salesforce.com": { name: "Salesforce", industry: "Enterprise Software", employees: 72000, country: "US", city: "San Francisco", description: "Customer relationship management." },
  "openai.com": { name: "OpenAI", industry: "Artificial Intelligence", employees: 3000, country: "US", city: "San Francisco", description: "AI research and deployment company." },
  "anthropic.com": { name: "Anthropic", industry: "Artificial Intelligence", employees: 1500, country: "US", city: "San Francisco", description: "AI safety and research company." },
  "airbnb.com": { name: "Airbnb", industry: "Travel & Hospitality", employees: 6900, country: "US", city: "San Francisco", description: "Marketplace for stays and experiences." },
  "acme.io": { name: "Acme Inc", industry: "Software", employees: 45, country: "GB", city: "Manchester", description: "Demo company used in FormForge samples." },
  "globex.com": { name: "Globex Corporation", industry: "Manufacturing", employees: 1200, country: "US", city: "Springfield", description: "Demo enterprise account." },
  "initech.com": { name: "Initech", industry: "IT Services", employees: 300, country: "US", city: "Austin", description: "Demo mid-market account." },
};

export const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "mail.com", "yandex.com",
  "zoho.com", "fastmail.com", "hey.com", "qq.com", "163.com", "btinternet.com", "sky.com", "virginmedia.com",
]);

export const ROLE_ACCOUNTS = new Set(["info", "admin", "support", "sales", "contact", "hello", "noreply", "no-reply", "office", "team", "billing", "marketing"]);
