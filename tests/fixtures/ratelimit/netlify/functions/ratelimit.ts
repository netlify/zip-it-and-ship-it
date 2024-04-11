import { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  return new Response(`Something!`);
};

export const config: Config = {
  path: "/ratelimited",
  rateLimit: {
    windowLimit: 60,
    windowSize: 50,
    aggregateBy: ["ip", "domain"],
  }
};
