import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ApolloEveMarket",
    short_name: "ApolloEveMarket",
    description: "Buy and sell prices across the five major EVE trade hubs.",
    start_url: "/",
    display: "standalone",
    background_color: "#1B1524",
    theme_color: "#1B1524",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
