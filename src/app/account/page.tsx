import { AppShell } from "@/components/app-shell";
import { AccountSettings } from "@/components/account-settings";

export const metadata = { title: "Account & Security" };

export default function AccountPage() {
  return (
    <AppShell activePage="account" title="Account & security" subtitle="Manage your profile and protect access to your learning history.">
      <AccountSettings />
    </AppShell>
  );
}
