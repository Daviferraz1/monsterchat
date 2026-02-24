import { DashboardShell } from '@/components/layout/DashboardShell';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { NewMessageSound } from '@/components/layout/NewMessageSound';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <NewMessageSound />
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
