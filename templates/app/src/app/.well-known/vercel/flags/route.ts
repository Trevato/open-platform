import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";
import { exampleFeature } from "@/flags";

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData({ exampleFeature });
});
