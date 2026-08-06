import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, ArrowRight, ShieldCheck, User, Lock } from 'lucide-react-native';

export default function AdminLoginScreen() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAdminLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both username and password.');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Hardcoded check
    setTimeout(async () => {
      if (username.trim() === 'admin' && password === 'admingoespgs0') {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Save admin state locally so RootLayout knows we are authenticated
        await AsyncStorage.setItem('admin_auth', 'true');

        // We don't need to push! The RootLayout listener will catch the segment change,
        // but since we aren't using a Supabase real-time listener for this, we manually route:
        router.replace('/admin');
      } else {
        setErrorMsg('Invalid admin credentials.');
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setLoading(false);
    }, 800); // Slight delay to feel like a real auth request
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header Navigation */}
        <View className="px-5 pt-4 pb-2 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 bg-white rounded-full items-center justify-center border border-slate-200 shadow-sm active:bg-slate-50"
          >
            <ChevronLeft size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <View className="flex-1 px-6 justify-center pb-20">

          {/* Icon Header (Indigo Theme for Admin) */}
          <View className="w-16 h-16 bg-indigo-50 rounded-2xl items-center justify-center mb-6 border border-indigo-100">
            <ShieldCheck size={32} color="#4F46E5" strokeWidth={2.5} />
          </View>

          <Text className="text-3xl font-black text-slate-800 tracking-tighter mb-2">
            Admin Portal
          </Text>
          <Text className="text-slate-500 font-medium text-base mb-8 leading-6">
            Enter your credentials to access the command center.
          </Text>

          {errorMsg ? (
            <View className="bg-red-50 px-4 py-3 rounded-xl border border-red-100 mb-6">
              <Text className="text-red-600 font-semibold text-sm">{errorMsg}</Text>
            </View>
          ) : null}

          {/* Form Fields */}
          <View className="space-y-4">
            <View>
              <Text className="text-slate-800 font-bold text-sm mb-2 px-1">Username</Text>
              <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl h-14 px-4 shadow-sm focus:border-indigo-500">
                <User size={20} color="#94A3B8" className="mr-3" />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="admin"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 text-slate-800 font-semibold text-base h-full outline-none"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View>
              <Text className="text-slate-800 font-bold text-sm mb-2 px-1">Password</Text>
              <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl h-14 px-4 shadow-sm focus:border-indigo-500">
                <Lock size={20} color="#94A3B8" className="mr-3" />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  className="flex-1 text-slate-800 font-semibold text-base h-full outline-none"
                  autoCapitalize="none"
                />
              </View>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            onPress={handleAdminLogin}
            disabled={loading}
            className={`h-14 rounded-2xl items-center justify-center mt-8 flex-row shadow-sm ${loading ? 'bg-indigo-400' : 'bg-indigo-600 active:bg-indigo-700'
              }`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text className="text-white font-black text-base tracking-wide mr-2">
                  Secure Login
                </Text>
                <ArrowRight size={20} color="white" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
