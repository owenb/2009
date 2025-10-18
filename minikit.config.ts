const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {

  "accountAssociation": {
    "header": "eyJmaWQiOjkyNjQsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg2ZENhNjI0QjFBNzI1MzNkNDBiZDc1QjY1OTUyODZEZDYzRjRBM2VjIn0",
    "payload": "eyJkb21haW4iOiIyMDA5LWZpdmUudmVyY2VsLmFwcCJ9",
    "signature": "9zCw/TfoSP+OhxGtRDkvYiKFnCVehE7QzPQEkToVDXplnGDzR8xrz97OU4DDlnWopY2u3wMs6y0jgYq8tMVuHxw="
  },

  miniapp: {
    version: "1",
    name: "2009",
    subtitle: "An infinite adventure game",
    description: "Game",
    screenshotUrls: [`${ROOT_URL}/screenshot-portrait.png`],
    iconUrl: `${ROOT_URL}/blue-icon.png`,
    splashImageUrl: `${ROOT_URL}/blue-hero.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["game", "2009", "bitcoin", "ai"],
    heroImageUrl: `${ROOT_URL}/blue-hero.png`,
    tagline: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: `${ROOT_URL}/blue-hero.png`,
  },
  baseBuilder: {
    ownerAddress: "0xf2c0Ca3BDD2CD9eBE90d8354f50306fB93B0b799",
  },
} as const;
