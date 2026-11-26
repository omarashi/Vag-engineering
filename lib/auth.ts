import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins/username";
import { db } from "./db";
import { requireRule } from "./rules";
import { normalizeUsername, validUsername } from "./usernames";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  plugins: [username({
    displayUsername: false,
    usernameNormalization: normalizeUsername,
    usernameValidator: validUsername,
    validationOrder: { username: "post-normalization" },
  })],
  disabledPaths: [
    "/sign-in/email", "/sign-up/email", "/is-username-available",
    "/update-user", "/change-email", "/change-password", "/request-password-reset", "/reset-password", "/delete-user", "/delete-user/callback",
  ],
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60, cookieCache: { enabled: false } },
  rateLimit: { enabled: true, window: 60, max: 60, customRules: { "/sign-in/username": { window: 60, max: 8 } } },
  user: {
    additionalFields: {
      role: { type: "string", required: false, input: false },
      active: { type: "boolean", required: false, input: false },
    },
    changeEmail: { enabled: false },
  },
  hooks: {
    before: createAuthMiddleware(async ({ path, request }) => {
      if (path !== "/sign-in/username" || !request) return;
      const origin = new URL(process.env.BETTER_AUTH_URL ?? request.url).origin;
      if (request.headers.get("origin") !== origin) throw new APIError("FORBIDDEN", { message: "Invalid origin" });
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId } });
          return user?.active ? { data: session } : false;
        },
      },
    },
  },
});

export async function currentUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true, active: true },
  });
  return user?.active ? user : null;
}

export async function mutationUser(request: Request) {
  requireRule(request.headers.get("origin") === (process.env.BETTER_AUTH_URL ?? new URL(request.url).origin), "forbidden", 403);
  const actor = await currentUser(request.headers);
  requireRule(actor, "unauthenticated", 401);
  return actor;
}

