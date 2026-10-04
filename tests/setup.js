import { vi } from "vitest";

const uri = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/basecampy_test";
const dbName = new URL(uri).pathname.replace("/", "");
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to run tests: the database name "${dbName}" must end with "_test" (the tests wipe it).`);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  MONGO_URI: uri,
  ACCESS_TOKEN_SECRET: "test-access-secret-test-access-secret",
  ACCESS_TOKEN_EXPIRY: "15m",
  REFRESH_TOKEN_SECRET: "test-refresh-secret-test-refresh-secret",
  REFRESH_TOKEN_EXPIRY: "7d",
  FRONTEND_URL: "http://localhost:5173",
  CORS_ORIGIN: "",
  RATE_LIMIT_DISABLED: "true",
  MAILTRAP_SMTP_HOST: "",
  GOOGLE_CLIENT_ID: "test-google-id",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GITHUB_CLIENT_ID: "test-github-id",
  GITHUB_CLIENT_SECRET: "test-github-secret",
});

// capture emails instead of sending them
vi.mock("../src/utils/mail.js", async (importOriginal) => {
  const actual = await importOriginal();
  globalThis.__mails = [];
  return {
    ...actual,
    sendEmail: async (options) => {
      globalThis.__mails.push(options);
      return true;
    },
  };
});
