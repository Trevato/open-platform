import { Elysia } from "elysia";
import { authPlugin } from "../auth.js";

export const usersPlugin = new Elysia({ prefix: "/users" }).use(authPlugin).get(
  "/me",
  ({ user }) => ({
    id: user.id,
    login: user.login,
    email: user.email,
    fullName: user.fullName,
    isAdmin: user.isAdmin,
    avatarUrl: user.avatarUrl,
  }),
  {
    detail: { tags: ["Users"], summary: "Current user profile" },
  },
);
