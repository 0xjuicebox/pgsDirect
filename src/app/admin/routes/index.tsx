import React, { useState, useEffect, useCallback } from 'react';
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
import { Route as RouteIcon, Plus, X, Sun, Moon, ChevronRight, UserX } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';

import { api } from '../../../utils/api';
import { useKeyboardHeight } from '../../../utils/useKeyboardHeight';

// The backend returns prices and slotDrivers inline on each route (List
// batch-loads slot drivers in one query), so the list needs no extra calls.
type SlotDriver = {
  slot: 'morning' | 'evening';
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
};

type RouteItem = {
  id: string;
  name: string;
  description: string;
  prices: { [key: string]: number };
  slotDrivers: SlotDriver[];
};

// A tiny pill showing who runs a slot — or that it's unassigned.
function SlotDriverPill({ slot, drivers }: { slot: 'morning' | 'evening'; drivers: SlotDriver[] }) {
  const match = drivers.find((d) => d.slot === slot && d.driverId);
  const Icon = slot === 'morning' ? Sun : Moon;
  const assigned = !!match?.driverName;

  return (
    <View
      className={`flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl border ${assigned ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-100'}`}
    >
      <Icon size={13} color={assigned ? '#475569' : '#D97706'} />
      {assigned ? (
        <Text className="text-slate-700 font-bold text-xs" numberOfLines={1}>
          {match!.driverName}
        </Text>
      ) : (
        <View className="flex-row items-center gap-1">
          <UserX size={11} color="#D97706" />
          <Text className="text-amber-700 font-bold text-xs">No driver</Text>
        </View>
      )}
    </View>
  );
}

export default function RoutesScreen() {
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get('/route?page=1&limit=100');
      setRoutes(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load routes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetch whenever the screen regains focus — coming back from the detail
  // screen after editing a driver or price should show fresh data.
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const handleCreate = async () => {
    if (!newName.trim()) return Alert.alert('Required', 'Route name is required');
    setCreating(true);
    try {
      await api.post('/route', { name: newName.trim(), description: newDesc.trim() });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create route');
    } finally {
      setCreating(false);
    }
  };

  // Show a compact "milk ₹30 · curd ₹60 · +3" style price summary.
  const priceSummary = (prices: { [key: string]: number }) => {
    const entries = Object.entries(prices || {}).filter(([, v]) => v > 0);
    if (entries.length === 0) return 'No prices set';
    const shown = entries.slice(0, 2).map(([k, v]) => `${k} ₹${v}`);
    const extra = entries.length - shown.length;
    return shown.join('  ·  ') + (extra > 0 ? `  ·  +${extra}` : '');
  };

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-4 flex-row items-end justify-between">
      <View className="flex-1">
        <Text className="text-3xl font-black text-slate-800 tracking-tighter">Routes</Text>
        <Text className="text-sm font-semibold text-slate-400">Stops, drivers and pricing per route</Text>
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
            data={routes}
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
                <RouteIcon size={48} color="#CBD5E1" />
                <Text className="text-slate-700 font-bold text-base mt-4">No Routes Yet</Text>
                <Text className="text-slate-400 font-medium text-center px-8 mt-2">
                  Tap the + button to create your first delivery route.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/admin/routes/${item.id}`)}
                className="bg-white rounded-3xl p-5 mx-5 mb-4 border border-slate-200 active:opacity-95"
                style={
                  Platform.OS === 'android'
                    ? { elevation: 2 }
                    : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }
                }
              >
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-xl font-black text-slate-800 tracking-tight">{item.name}</Text>
                    {!!item.description && (
                      <Text className="text-slate-500 text-sm font-medium mt-0.5">{item.description}</Text>
                    )}
                  </View>
                  <ChevronRight size={20} color="#CBD5E1" />
                </View>

                <View className="flex-row gap-2 mb-3">
                  <SlotDriverPill slot="morning" drivers={item.slotDrivers || []} />
                  <SlotDriverPill slot="evening" drivers={item.slotDrivers || []} />
                </View>

                <View className="bg-slate-50 rounded-2xl px-3.5 py-2.5 border border-slate-100">
                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pricing</Text>
                  <Text className="text-slate-600 text-sm font-semibold" numberOfLines={1}>
                    {priceSummary(item.prices)}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}

        {/* Create route modal */}
        <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
          <View
            className="flex-1 justify-end bg-slate-900/40"
            style={{ paddingBottom: keyboardHeight }}
          >
            <Pressable className="absolute inset-0" onPress={() => setShowCreate(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-black text-slate-800 tracking-tight">New Route</Text>
                <Pressable
                  onPress={() => setShowCreate(false)}
                  className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100"
                >
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>

              <Text className="text-xs font-bold text-slate-500 mb-1.5">Route Name</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Sector 12 Morning Loop"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 font-semibold text-slate-800 mb-4"
              />

              <Text className="text-xs font-bold text-slate-500 mb-1.5">Description (optional)</Text>
              <TextInput
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Any notes about this route"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 font-semibold text-slate-800 mb-8"
              />

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
                    <Text className="text-white font-black text-sm">Create Route</Text>
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
