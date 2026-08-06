import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Phone,
  MapPin,
  Truck,
  LogOut,
  ShieldAlert,
  ChevronRight,
  Clock,
  AlertCircle
} from 'lucide-react-native';

// --- API & SUPABASE ---
import { supabase } from '../../utils/supabase';
import { api } from '../../utils/api';

// ==========================================
// 🧩 SUB-COMPONENTS
// ==========================================

const SettingsRow = ({ icon: Icon, title, subtitle, isDestructive = false, onPress, showArrow = true }: any) => (
  <Pressable
    onPress={() => {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (onPress) onPress();
    }}
    className="flex-row items-center justify-between py-4 border-b border-slate-100 last:border-0 active:opacity-60"
  >
    <View className="flex-row items-center flex-1 pr-4">
      <View className={`w-10 h-10 rounded-full items-center justify-center mr-4 ${isDestructive ? 'bg-red-50' : 'bg-slate-50'}`}>
        <Icon size={20} color={isDestructive ? '#EF4444' : '#64748B'} />
      </View>
      <View className="flex-1">
        <Text className={`font-bold text-base tracking-tight ${isDestructive ? 'text-red-600' : 'text-slate-800'}`}>
          {title}
        </Text>
        {subtitle && (
          <Text className="text-slate-400 text-sm font-medium mt-0.5 truncate" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
    {showArrow && <ChevronRight size={20} color="#CBD5E1" />}
  </Pressable>
);

// 🌐 CROSS-PLATFORM CUSTOM ALERT
const CustomAlert = ({ visible, title, message, cancelText = "Cancel", confirmText = "Confirm", isDestructive = false, onCancel, onConfirm }: any) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View className="flex-1 justify-center items-center bg-slate-900/40 px-5">
      <Pressable className="absolute inset-0" onPress={onCancel} />

      <View
        className="bg-white w-full max-w-sm rounded-[24px] p-6"
        style={Platform.OS === 'android' ? { elevation: 10 } : { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15 }}
      >
        <View className="items-center mb-4">
          <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${isDestructive ? 'bg-red-50' : 'bg-slate-50'}`}>
            <AlertCircle size={24} color={isDestructive ? '#EF4444' : '#64748B'} />
          </View>
          <Text className="text-xl font-black text-slate-800 tracking-tight text-center">{title}</Text>
        </View>

        <Text className="text-slate-500 text-sm font-medium text-center mb-6 leading-5">
          {message}
        </Text>

        <View className="flex-row gap-3">
          <Pressable
            onPress={onCancel}
            className="flex-1 bg-slate-100 h-12 rounded-xl items-center justify-center active:bg-slate-200"
          >
            <Text className="text-slate-700 font-bold text-base">{cancelText}</Text>
          </Pressable>

          <Pressable
            onPress={onConfirm}
            className={`flex-1 h-12 rounded-xl items-center justify-center active:opacity-80 ${isDestructive ? 'bg-red-500' : 'bg-slate-800'}`}
          >
            <Text className="text-white font-bold text-base">{confirmText}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

// ==========================================
// 🚀 MAIN SCREEN
// ==========================================

export default function DriverProfileScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // Custom Alert States
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);

  const [profile, setProfile] = useState({
    name: 'Driver',
    initials: 'D',
    phone: '',
    joinDate: '',
  });

  const [routeInfo, setRouteInfo] = useState<{ name: string; depot: string; shift: string } | null>(null);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const fullName = user?.user_metadata?.full_name || 'Unknown Driver';
      const initials = fullName.substring(0, 2).toUpperCase();

      const joinDateStr = user?.created_at
        ? `Joined ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
        : 'New Driver';

      setProfile({
        name: fullName,
        initials: initials,
        phone: user?.phone || user?.user_metadata?.phone || 'No phone recorded',
        joinDate: joinDateStr,
      });

      try {
        const targetDate = new Date().toISOString().split('T')[0];
        const manifest = await api.get(`/driver/manifest?date=${targetDate}`);

        if (manifest && manifest.routeName) {
          setRouteInfo({
            name: manifest.routeName,
            depot: 'Main Hub',
            shift: 'Morning Shift',
          });
        }
      } catch (manifestError: any) {
        if (manifestError.message?.includes('404') || manifestError.message?.includes('No active route')) {
          setRouteInfo(null);
        } else {
          console.error("Error fetching manifest for profile:", manifestError);
        }
      }

    } catch (error) {
      console.error("Failed to load profile", error);
    } finally {
      setIsLoading(false);
    }
  };

  const executeLogout = async () => {
    setLogoutVisible(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>

          {/* Header Area */}
          <View className="px-5 pt-6 pb-2 items-center">
            <View className="relative mb-4">
              <View className="w-28 h-28 rounded-full bg-slate-800 border-4 border-white shadow-sm overflow-hidden items-center justify-center" style={Platform.OS === 'android' ? { elevation: 4 } : {}}>
                <Text className="text-4xl font-black text-white">{profile.initials}</Text>
              </View>
              <View className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-slate-50 rounded-full" />
            </View>

            <Text className="text-3xl font-black text-slate-800 tracking-tighter">{profile.name}</Text>
            <Text className="text-slate-400 font-semibold text-sm mt-2">{profile.joinDate}</Text>
          </View>

          {/* Assigned Route Card */}
          <View className="px-5 mt-8">
            <Text className="text-slate-800 text-sm font-bold tracking-tight mb-2 px-1">Current Assignment</Text>

            {routeInfo ? (
              <View className="bg-white rounded-3xl p-5 border border-slate-200" style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}>
                <View className="flex-row items-start mb-4">
                  <View className="bg-green-50 w-12 h-12 rounded-2xl items-center justify-center mr-4">
                    <MapPin size={24} color="#16A34A" />
                  </View>
                  <View className="flex-1 pt-1">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Assigned Route</Text>
                    <Text className="text-slate-800 font-black text-lg tracking-tight leading-6">
                      {routeInfo.name}
                    </Text>
                  </View>
                </View>

                <View className="h-[1px] bg-slate-100 w-full mb-4" />

                <View className="flex-row justify-between">
                  <View className="flex-row items-center gap-2">
                    <Truck size={16} color="#94A3B8" />
                    <Text className="text-slate-600 font-semibold text-sm">{routeInfo.depot}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Clock size={16} color="#94A3B8" />
                    <Text className="text-slate-600 font-semibold text-sm">{routeInfo.shift}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View className="bg-slate-100 rounded-3xl p-6 border border-slate-200 border-dashed items-center justify-center">
                <AlertCircle size={32} color="#94A3B8" className="mb-3" />
                <Text className="text-slate-700 font-bold text-base mb-1">No Active Route</Text>
                <Text className="text-slate-400 text-sm text-center">You are not assigned to a delivery route today. Contact your depot manager.</Text>
              </View>
            )}
          </View>

          {/* Contact & Account Settings */}
          <View className="px-5 mt-6">
            <Text className="text-slate-800 text-sm font-bold tracking-tight mb-2 px-1">Account & Support</Text>
            <View className="bg-white rounded-3xl px-5 border border-slate-200" style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}>
              <SettingsRow
                icon={Phone}
                title="Phone Number"
                subtitle={profile.phone}
                showArrow={false}
              />
              <SettingsRow
                icon={ShieldAlert}
                title="Depot Support"
                subtitle="Contact route manager"
                onPress={() => setSupportVisible(true)}
              />
            </View>
          </View>

          {/* System Actions */}
          <View className="px-5 mt-6 mb-12">
            <View className="bg-white rounded-3xl px-5 border border-slate-200" style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}>
              <SettingsRow
                icon={LogOut}
                title="Log Out"
                isDestructive={true}
                showArrow={false}
                onPress={() => setLogoutVisible(true)}
              />
            </View>

            <Text className="text-center text-slate-400 font-medium text-xs mt-6 mb-8">
              PGSDirect Driver App • v1.0.4
            </Text>
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* Cross-Platform Modals */}
      <CustomAlert
        visible={logoutVisible}
        title="Sign Out"
        message="Are you sure you want to log out of your driver account?"
        confirmText="Log Out"
        isDestructive={true}
        onCancel={() => setLogoutVisible(false)}
        onConfirm={executeLogout}
      />

      <CustomAlert
        visible={supportVisible}
        title="Contact Support"
        message="Connecting you to your depot manager for assistance."
        confirmText="Call Now"
        isDestructive={false}
        onCancel={() => setSupportVisible(false)}
        onConfirm={() => {
          setSupportVisible(false);
          // Insert actual call logic here if needed
        }}
      />
    </View>
  );
}
