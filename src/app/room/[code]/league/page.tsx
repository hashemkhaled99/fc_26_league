import { LeagueClient } from "@/components/LeagueClient";

export default function LeaguePage({ params }: { params: { code: string } }) {
  return <LeagueClient code={params.code.toUpperCase()} />;
}
