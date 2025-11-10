import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  await new Promise((resolve) => setTimeout(resolve, 10)); // simulate async

  res.json({ message: "pong" });
}
