import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ApolloEveMarket",
    short_name: "ApolloEveMarket",
    description: "Buy and sell prices across the five major EVE trade hubs.",
    start_url: "/",
    display: "standalone",
    background_color: "#0F0B13",
    theme_color: "#0F0B13",
    icons: [
      {
        src: "/icon-192-dark.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512-dark.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
