import { Stack } from 'expo-router';

// Stack navigation for the Drivers tab: list (index) pushes into detail ([id]).
export default function DriversStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
