import { ApplicationsList } from "@/components/ApplicationsList";

import { Providers } from "./providers";

export default function HomePage() {
  return (
    <Providers>
      <ApplicationsList />
    </Providers>
  );
}
