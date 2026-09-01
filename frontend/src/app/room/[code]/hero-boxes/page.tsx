import { IconBoxesClient } from "@/components/IconBoxesClient";

export default function HeroBoxesPage({ params }: { params: { code: string } }) {
  return <IconBoxesClient code={params.code.toUpperCase()} kind="hero" />;
}
