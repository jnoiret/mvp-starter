import Link from "next/link";
import { AdminShell } from "@/features/admin/AdminShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

export default function AdminPage() {
  return (
    <AdminShell title="Admin">
      <EmptyState
        title="No data yet"
        description="When you connect your product logic, this is where your metrics, users, or resources will appear."
        action={
          <Link href="/">
            <Button variant="primary">Back to homepage</Button>
          </Link>
        }
      />
    </AdminShell>
  );
}

