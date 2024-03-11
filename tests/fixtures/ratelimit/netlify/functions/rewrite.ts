import { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  return new Response(`Something!`);
};

export const config: Config = {
  path: "/rewrite",
  rateLimit: {
    action: "rewrite",
    to: "/rewritten",
    windowSize: 20,
    windowLimit: 200,
    aggregateBy: ["ip", "domain"],
  }
};
