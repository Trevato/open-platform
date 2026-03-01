const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("Hello from Open Platform", {
      headers: { "Content-Type": "text/plain" },
    });
  },
});

console.log(`Listening on :${server.port}`);
