import "../global.css";
import '../utils/webAlert';
import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { supabase } from '../utils/supabase';

// Keep the native splash screen visible while we check for auth tokens
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      // 1. Check for driver session (Supabase) AND admin session (AsyncStorage)
      const { data: { session } } = await supabase.auth.getSession();
      const adminAuthFlag = await AsyncStorage.getItem('admin_auth');
      const isAdmin = adminAuthFlag === 'true';

      handleAuthRouting(session, isAdmin);
      setIsInitialized(true);

      // 2. Hide native splash
      SplashScreen.hideAsync();
    };

    initializeAuth();

    // 3. Set up a real-time listener for Driver Login/Logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const adminAuthFlag = await AsyncStorage.getItem('admin_auth');
      handleAuthRouting(session, adminAuthFlag === 'true');
    });

    return () => subscription.unsubscribe();
  }, [segments]);

  const handleAuthRouting = (session: any, isAdmin: boolean) => {
    const inAuthGroup = segments[0] === 'auth';
    const isRootScreen = segments.length === 0;
    const isDriverRoute = segments[0] === 'driver';
    const isAdminRoute = segments[0] === 'admin';

    if (isAdmin) {
      // ✅ SCENARIO A: User is logged in as ADMIN
      // Keep them out of auth, root, and driver routes
      if (inAuthGroup || isRootScreen || isDriverRoute) {
        router.replace('/admin');
      }
    } else if (session) {
      // ✅ SCENARIO B: User is logged in as DRIVER
      // Keep them out of auth, root, and admin routes
      if (inAuthGroup || isRootScreen || isAdminRoute) {
        router.replace('/driver');
      }
    } else {
      // ❌ SCENARIO C: Not logged in at all
      // If they try to access protected driver/admin routes, boot to root!
      if (!inAuthGroup && !isRootScreen) {
        router.replace('/');
      }
    }
  };

  if (!isInitialized) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
