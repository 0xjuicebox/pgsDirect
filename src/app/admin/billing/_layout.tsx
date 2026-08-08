import { Stack } from 'expo-router';

// Stack navigation for the Billing tab: list (index) pushes into a
// per-customer bill detail ([id]). Without this the billing folder has no
// navigator and router.push into [id] has nowhere to go.
export default function BillingStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
