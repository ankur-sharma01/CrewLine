import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
