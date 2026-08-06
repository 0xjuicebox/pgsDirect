import { Stack } from 'expo-router';

// This folder just needs stack navigation: the list (index) pushing into a
// detail screen ([id]). The previous version of this file declared a full
// second <Tabs> navigator identical to admin/_layout.tsx — that rendered a
// second tab bar nested inside the Customers tab and fought expo-router's
// routing to [id]. A Stack is all a sub-folder like this needs; the outer
// Tabs in admin/_layout.tsx already provides the tab bar.
export default function CustomersStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
