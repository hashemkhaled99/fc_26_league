import { IconBoxesClient } from "@/components/IconBoxesClient";

export default function IconBoxesPage({ params }: { params: { code: string } }) {
  return <IconBoxesClient code={params.code.toUpperCase()} />;
}
