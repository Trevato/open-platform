import { Router } from "express";

export const usersRouter = Router();

usersRouter.get("/me", async (req, res) => {
  res.json({
    id: req.user!.id,
    login: req.user!.login,
    email: req.user!.email,
    fullName: req.user!.fullName,
    isAdmin: req.user!.isAdmin,
    avatarUrl: req.user!.avatarUrl,
  });
});
