import { CardsClient } from "@/components/CardsClient";

export default function CardsPage({ params }: { params: { code: string } }) {
  return <CardsClient code={params.code.toUpperCase()} />;
}
