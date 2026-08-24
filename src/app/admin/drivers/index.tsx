import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Platform,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Truck, Plus, X, Phone, ChevronRight, PowerOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';

import { api } from '../../../utils/api';
import { useKeyboardHeight } from '../../../utils/useKeyboardHeight';

type Driver = {
  id: string;
  name: string;
  phoneNumber: string;
  isActive: boolean;
  createdAt: string;
};

export default function DriversScreen() {
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get('/driver?page=1&limit=100');
      setDrivers(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load drivers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const filtered = drivers.filter((d) => (filter === 'active' ? d.isActive : true));

  const handleCreate = async () => {
    if (!newName.trim()) return Alert.alert('Required', 'Driver name is required');
    if (!newPhone.trim()) return Alert.alert('Required', 'Phone number is required');
    setCreating(true);
    try {
      await api.post('/driver', { name: newName.trim(), phoneNumber: newPhone.trim() });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      setNewName('');
      setNewPhone('');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create driver');
    } finally {
      setCreating(false);
    }
  };

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-4">
      <View className="flex-row items-end justify-between mb-5">
        <View className="flex-1">
          <Text className="text-3xl font-black text-slate-800 tracking-tighter">Drivers</Text>
          <Text className="text-sm font-semibold text-slate-400">Your delivery team</Text>
        </View>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreate(true);
          }}
          className="w-11 h-11 bg-slate-900 rounded-2xl items-center justify-center active:opacity-90"
        >
          <Plus size={22} color="white" />
        </Pressable>
      </View>

      <View className="flex-row bg-slate-200/50 p-1.5 rounded-2xl">
        {(['active', 'all'] as const).map((tab) => {
          const isActive = filter === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilter(tab);
              }}
              className={`flex-1 items-center justify-center py-2.5 rounded-xl ${isActive ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-sm font-bold capitalize ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>{tab}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#16A34A" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchData();
                }}
                tintColor="#16A34A"
              />
            }
            ListEmptyComponent={
              <View className="items-center justify-center mt-10">
                <Truck size={48} color="#CBD5E1" />
                <Text className="text-slate-700 font-bold text-base mt-4">No Drivers</Text>
                <Text className="text-slate-400 font-medium text-center px-8 mt-2">
                  Tap + to add your first driver.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/admin/drivers/${item.id}`)}
                className="bg-white rounded-3xl p-5 mx-5 mb-4 border border-slate-200 active:opacity-95 flex-row items-center"
                style={
                  Platform.OS === 'android'
                    ? { elevation: 2 }
                    : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }
                }
              >
                <View className={`w-12 h-12 rounded-2xl items-center justify-center mr-4 ${item.isActive ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                  <Truck size={22} color={item.isActive ? '#16A34A' : '#94A3B8'} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-lg font-black text-slate-800 tracking-tight">{item.name}</Text>
                    {!item.isActive && (
                      <View className="flex-row items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg">
                        <PowerOff size={10} color="#94A3B8" />
                        <Text className="text-[10px] font-bold text-slate-500 uppercase">Inactive</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <Phone size={12} color="#64748B" />
                    <Text className="text-slate-500 text-sm font-semibold">{item.phoneNumber}</Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#CBD5E1" />
              </Pressable>
            )}
          />
        )}

        <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
          <View
            className="flex-1 justify-end bg-slate-900/40"
            style={{ paddingBottom: keyboardHeight }}
          >
            <Pressable className="absolute inset-0" onPress={() => setShowCreate(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-black text-slate-800 tracking-tight">New Driver</Text>
                <Pressable onPress={() => setShowCreate(false)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>

              <Text className="text-xs font-bold text-slate-500 mb-1.5">Full Name</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Raju Kumar"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 font-semibold text-slate-800 mb-4"
              />

              <Text className="text-xs font-bold text-slate-500 mb-1.5">Phone Number</Text>
              <TextInput
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                className="bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 font-semibold text-slate-800 mb-3"
              />
              <Text className="text-xs text-slate-400 font-medium mb-8 px-1">
                The driver signs in on the driver app with this number via OTP. It must match exactly.
              </Text>

              <Pressable
                onPress={handleCreate}
                disabled={creating}
                className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
              >
                {creating ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Plus size={18} color="white" />
                    <Text className="text-white font-black text-sm">Create Driver</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
