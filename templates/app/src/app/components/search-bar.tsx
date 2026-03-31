"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      sp.set("q", value.trim());
    } else {
      sp.delete("q");
    }
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <form onSubmit={handleSubmit} style={{ flex: 1, minWidth: 140 }}>
      <input
        type="search"
        placeholder="Search posts..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input"
        style={{ width: "100%" }}
      />
    </form>
  );
}
