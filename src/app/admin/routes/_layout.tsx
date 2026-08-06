import { Stack } from 'expo-router';

// Stack navigation for the Routes tab: list (index) pushes into detail ([id]).
// The bottom tab bar comes from admin/_layout.tsx.
export default function RoutesStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
