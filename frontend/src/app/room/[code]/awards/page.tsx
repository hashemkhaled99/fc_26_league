import { AwardsClient } from "@/components/AwardsClient";

export default function AwardsPage({ params }: { params: { code: string } }) {
  return <AwardsClient code={params.code.toUpperCase()} />;
}
