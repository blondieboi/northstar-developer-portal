import { defineConfig } from "vitepress";

const repo = "https://github.com/blondieboi/perongen-developer-portal";

export default defineConfig({
  title: "Perongen",
  titleTemplate: ":title · Perongen documentation",
  description:
    "A self-hosted, GitHub-native developer portal for software ownership, standards, and reviewable guardrails.",
  lang: "en-US",
  base: "/perongen-developer-portal/",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://blondieboi.github.io/perongen-developer-portal/",
  },
  head: [
    ["meta", { name: "theme-color", content: "#21302c" }],
    ["meta", { name: "color-scheme", content: "light dark" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    [
      "link",
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500&display=swap",
      },
    ],
  ],
  themeConfig: {
    logo: false,
    siteTitle: "Perongen / Documentation",
    nav: [
      { text: "Product", link: "/" },
      { text: "Guides", link: "/getting-started/" },
      { text: "Administration", link: "/admin/deployment" },
      { text: "Reference", link: "/reference/configuration" },
      { text: "GitHub", link: repo },
    ],
    sidebar: [
      {
        text: "Start here",
        collapsed: true,
        items: [
          { text: "What is Perongen?", link: "/overview" },
          { text: "Architecture & security", link: "/architecture-security" },
          { text: "Getting started", link: "/getting-started/" },
          { text: "Navigate the portal", link: "/getting-started/navigation" },
        ],
      },
      {
        text: "User guides",
        collapsed: true,
        items: [
          { text: "Services and catalog", link: "/guides/services" },
          { text: "Software map", link: "/guides/software-map" },
          { text: "Repository documentation", link: "/guides/documentation" },
          { text: "Service operations", link: "/guides/operations" },
          { text: "Teams and people", link: "/guides/teams" },
          { text: "Scorecards", link: "/guides/scorecards" },
          { text: "Self-service actions", link: "/guides/actions" },
          { text: "Shared tools", link: "/guides/tools" },
        ],
      },
      {
        text: "Administration",
        collapsed: true,
        items: [
          { text: "Deploy Perongen", link: "/admin/deployment" },
          { text: "Connect GitHub", link: "/admin/github" },
          { text: "Synchronize the catalog", link: "/admin/catalog" },
          { text: "Application intake", link: "/admin/application-intake" },
          { text: "Control plane", link: "/admin/control-plane" },
          { text: "Integration plugins", link: "/admin/plugins" },
          { text: "Metadata campaigns", link: "/admin/campaigns" },
          { text: "Portal analytics", link: "/admin/analytics" },
          { text: "Access and audit", link: "/admin/access" },
        ],
      },
      {
        text: "Reference",
        collapsed: true,
        items: [
          { text: "Portal configuration", link: "/reference/configuration" },
          { text: "Environment variables", link: "/reference/environment" },
          { text: "Service metadata", link: "/reference/service-metadata" },
          { text: "Team metadata", link: "/reference/team-metadata" },
          { text: "Scorecard rules", link: "/reference/scorecards" },
          { text: "Workflow actions", link: "/reference/actions" },
          { text: "Troubleshooting", link: "/reference/troubleshooting" },
        ],
      },
    ],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "On this page" },
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    lastUpdated: {
      text: "Last updated",
      formatOptions: { dateStyle: "medium" },
    },
    socialLinks: [{ icon: "github", link: repo }],
    footer: {
      message: "Source in GitHub. Context in Perongen. Changes through review.",
      copyright: "Perongen developer portal documentation",
    },
    docFooter: { prev: "Previous guide", next: "Next guide" },
    notFound: {
      title: "This route is not in the catalog.",
      quote:
        "The page may have moved, or the link points outside the current documentation set.",
      linkLabel: "Return to documentation",
      linkText: "Take me home",
    },
  },
});
