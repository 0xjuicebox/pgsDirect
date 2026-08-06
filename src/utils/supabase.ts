import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// ⚠️ Replace these with your actual Supabase Project URL and Anon Key
const supabaseUrl = "https://umwxsrtufosbfzkgnhka.supabase.co";
const supabaseAnonKey = "sb_publishable_zZmgsWR_nXWnjgADNOvPvA_E3ODUpLA";

// Dummy storage adapter to prevent Node.js (Expo Router SSR) from crashing
const ssrStorage = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // If running on web AND window is undefined (Node SSR), use the dummy storage.
    // Otherwise, use AsyncStorage for physical iOS/Android devices and actual web browsers.
    storage:
      Platform.OS === "web" && typeof window === "undefined"
        ? ssrStorage
        : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
