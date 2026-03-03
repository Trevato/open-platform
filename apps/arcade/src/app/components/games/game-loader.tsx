"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

export interface GameProps {
  slug: string;
  isLoggedIn: boolean;
  onScoreSubmitted: () => void;
}

function GameSkeleton() {
  return (
    <div
      style={{
        height: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#555",
        background: "#12121a",
        borderRadius: 12,
        border: "1px solid #2a2a3a",
      }}
    >
      Loading game...
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gameModules: Record<string, React.ComponentType<any>> = {
  snake: dynamic(() => import("./snake"), {
    ssr: false,
    loading: () => <GameSkeleton />,
  }),
  tetris: dynamic(() => import("./tetris"), {
    ssr: false,
    loading: () => <GameSkeleton />,
  }),
  breakout: dynamic(() => import("./breakout"), {
    ssr: false,
    loading: () => <GameSkeleton />,
  }),
  memory: dynamic(() => import("./memory"), {
    ssr: false,
    loading: () => <GameSkeleton />,
  }),
  typing: dynamic(() => import("./typing"), {
    ssr: false,
    loading: () => <GameSkeleton />,
  }),
};

export function GameLoader({
  slug,
  isLoggedIn,
}: {
  slug: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const GameComponent = gameModules[slug];
  if (!GameComponent) return null;
  return (
    <GameComponent
      slug={slug}
      isLoggedIn={isLoggedIn}
      onScoreSubmitted={() => router.refresh()}
    />
  );
}
