import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/app/components/header";
import { PostForm } from "@/app/components/post-form";

export default async function NewPost() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <>
      <Header />
      <main className="container" style={{ maxWidth: 720 }}>
        <PostForm />
      </main>
    </>
  );
}
