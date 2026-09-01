import { AdminDashboard } from "@/components/AdminDashboard";

export default function AdminPage({ params }: { params: { code: string } }) {
  return <AdminDashboard code={params.code.toUpperCase()} />;
}
