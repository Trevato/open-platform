import { z } from "zod";

// Row shape returned from DB queries (joined result)
export const PostSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string().nullable(),
  author: z.string(),
  author_image: z.string().nullable(),
  published: z.boolean(),
  created_at: z.string(),
});
export type Post = z.infer<typeof PostSchema>;

// Creation input
export const CreatePostSchema = z.object({
  title: z
    .string()
    .min(1, "Title required")
    .max(200, "Title too long (max 200)"),
  content: z
    .string()
    .max(10000, "Content too long (max 10000)")
    .optional()
    .nullable(),
});
export type CreatePost = z.infer<typeof CreatePostSchema>;

// Update input (all optional)
export const UpdatePostSchema = z.object({
  title: z
    .string()
    .min(1, "Title required")
    .max(200, "Title too long (max 200)")
    .optional(),
  content: z
    .string()
    .max(10000, "Content too long (max 10000)")
    .optional()
    .nullable(),
  published: z.boolean().optional(),
});
export type UpdatePost = z.infer<typeof UpdatePostSchema>;
