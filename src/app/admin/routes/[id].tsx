import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft, Trash2, Sun, Moon, Truck, ArrowUp, ArrowDown, Save,
  X, ChevronDown, Edit2, IndianRupee, UserX, Check,
  CalendarClock, XCircle,
} from 'lucide-react-native';

import { api } from '../../../utils/api';
import { useKeyboardHeight } from '../../../utils/useKeyboardHeight';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

type SlotDriver = {
  slot: 'morning' | 'evening';
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
};

type RouteDetail = {
  id: string;
  name: string;
  description: string;
  prices: { [key: string]: number };
  slotDrivers: SlotDriver[];
};

type DriverItem = { id: string; name: string; phoneNumber: string; isActive: boolean };

type Stop = { id: string; name: string; houseAddress: string; stopOrder: number };

type Slot = 'morning' | 'evening';

// Mirrors route.PendingPriceInfo. Null when nothing is queued.
type PendingPrices = {
  prices: { [key: string]: number };
  effectiveFrom: string;
};

const PRODUCTS = [
  { key: 'milk', label: 'Milk' },
  { key: 'curd', label: 'Curd' },
  { key: 'butter', label: 'Butter' },
  { key: 'ghee', label: 'Desi Ghee' },
  { key: 'lassi', label: 'Buttermilk' },
  { key: 'paneer', label: 'Paneer' },
  { key: 'jaggery', label: 'Jaggery' },
  { key: 'khand', label: 'Desi Khand' },
  { key: 'oil', label: 'Mustard Oil' },
  { key: 'atta', label: 'Atta' },
  { key: 'burfi', label: 'Milk Burfi' },
];

// -------------------------------------------------------------------------
// Driver picker modal (per slot)
// -------------------------------------------------------------------------

function DriverPickerModal({
  visible,
  drivers,
  slot,
  onSelect,
  onClose,
}: {
  visible: boolean;
  drivers: DriverItem[];
  slot: Slot;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const keyboardHeight = useKeyboardHeight();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        className="flex-1 bg-slate-900/40 justify-end"
        style={{ paddingBottom: keyboardHeight }}
      >
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] max-h-[70%] pb-8">
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
            <View>
              <Text className="text-xl font-black text-slate-900">Assign {slot === 'morning' ? 'Morning' : 'Evening'} Driver</Text>
              <Text className="text-xs text-slate-400 font-medium mt-0.5">One driver per slot on this route</Text>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200">
              <X size={18} color="#0F172A" />
            </Pressable>
          </View>

          <FlatList
            data={drivers.filter((d) => d.isActive)}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ padding: 20 }}
            ListHeaderComponent={
              <Pressable
                onPress={() => onSelect(null)}
                className="flex-row items-center gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 mb-3 active:opacity-80"
              >
                <UserX size={18} color="#D97706" />
                <Text className="font-bold text-amber-700">Unassign (no driver)</Text>
              </Pressable>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item.id)}
                className="flex-row items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white mb-3 active:bg-slate-50"
              >
                <View className="flex-row items-center gap-3">
                  <Truck size={18} color="#475569" />
                  <View>
                    <Text className="font-bold text-slate-800">{item.name}</Text>
                    <Text className="text-xs text-slate-400 font-medium">{item.phoneNumber}</Text>
                  </View>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text className="text-center text-slate-400 py-8">No active drivers. Create one in the Drivers tab first.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// -------------------------------------------------------------------------
// Main screen
// -------------------------------------------------------------------------

export default function RouteDetailScreen() {
  const keyboardHeight = useKeyboardHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);

  const [slot, setSlot] = useState<Slot>('morning');

  // Stops for the current slot
  const [stops, setStops] = useState<Stop[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [savingSequence, setSavingSequence] = useState(false);
  const [sequenceDirty, setSequenceDirty] = useState(false);

  // Driver picker
  const [showDriverPicker, setShowDriverPicker] = useState(false);

  // Pricing
  const [prices, setPrices] = useState<{ [key: string]: string }>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [pendingPrices, setPendingPrices] = useState<PendingPrices | null>(null);

  // Edit route meta
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const fetchRoute = useCallback(async () => {
    try {
      const [routeData, driverData] = await Promise.all([
        api.get(`/route/${id}`),
        api.get('/driver?page=1&limit=100').catch(() => []),
      ]);
      setRoute(routeData);
      setDrivers(driverData || []);
      setEditName(routeData.name || '');
      setEditDesc(routeData.description || '');
      // Seed price editor from route's current price list.
      const seeded: { [key: string]: string } = {};
      PRODUCTS.forEach((p) => {
        seeded[p.key] = String(routeData.prices?.[p.key] ?? 0);
      });
      setPrices(seeded);
    } catch (err: any) {
      Alert.alert('Load Error', err.message || 'Failed to load route');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // The endpoint answers 204 with no body when nothing is queued, which the
  // api helper surfaces as an empty object — so we check for the field rather
  // than truthiness of the response.
  const fetchPendingPrices = useCallback(async () => {
    try {
      const res = await api.get(`/route/${id}/prices/pending`);
      setPendingPrices(res && res.effectiveFrom ? res : null);
    } catch {
      setPendingPrices(null);
    }
  }, [id]);

  useEffect(() => {
    fetchRoute();
    fetchPendingPrices();
  }, [fetchRoute, fetchPendingPrices]);

  // Load stops whenever the slot changes (or route loads).
  const fetchStops = useCallback(async () => {
    if (!id) return;
    setLoadingStops(true);
    setSequenceDirty(false);
    try {
      const roster = await api.get(`/route/${id}/roster?slot=${slot}`);
      const mapped: Stop[] = (roster.stops || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        houseAddress: s.houseAddress,
        stopOrder: s.stopOrder,
      }));
      mapped.sort((a, b) => a.stopOrder - b.stopOrder);
      setStops(mapped);
    } catch (err: any) {
      setStops([]);
    } finally {
      setLoadingStops(false);
    }
  }, [id, slot]);

  useEffect(() => {
    fetchStops();
  }, [fetchStops]);

  const currentDriver = route?.slotDrivers?.find((d) => d.slot === slot && d.driverId);

  const moveStop = (index: number, direction: 'up' | 'down') => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...stops];
    if (direction === 'up' && index > 0) {
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
    } else if (direction === 'down' && index < next.length - 1) {
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
    }
    setStops(next.map((s, i) => ({ ...s, stopOrder: i + 1 })));
    setSequenceDirty(true);
  };

  const handleSaveSequence = async () => {
    setSavingSequence(true);
    try {
      await api.put(`/route/${id}/sequence`, {
        slot,
        customerIds: stops.map((s) => s.id),
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSequenceDirty(false);
      Alert.alert('Saved', `${slot === 'morning' ? 'Morning' : 'Evening'} sequence updated.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save sequence');
    } finally {
      setSavingSequence(false);
    }
  };

  const handleAssignDriver = async (driverId: string | null) => {
    setShowDriverPicker(false);
    try {
      await api.put(`/route/${id}/driver`, { slot, driverId });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchRoute();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to assign driver');
    }
  };

  // The backend decides whether a price change applies now (route has never
  // been priced) or is queued for the 1st of next month, and says which in
  // its response — so the confirmation reports what actually happened rather
  // than assuming one or the other.
  const handleSavePrices = async () => {
    setSavingPrices(true);
    try {
      const payload: { [key: string]: number } = {};
      PRODUCTS.forEach((p) => {
        const v = parseFloat(prices[p.key]);
        payload[p.key] = isNaN(v) ? 0 : v;
      });
      const res = await api.put(`/route/${id}/prices`, { prices: payload });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        res?.applied === 'immediately' ? 'Prices set' : 'Price change queued',
        res?.message || 'Saved.'
      );
      fetchRoute();
      fetchPendingPrices();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save prices');
    } finally {
      setSavingPrices(false);
    }
  };

  const handleCancelPending = () => {
    Alert.alert(
      'Cancel queued price change?',
      'Prices will stay as they are. You can queue a new change any time.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel change',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/route/${id}/prices/pending`);
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              fetchPendingPrices();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel');
            }
          },
        },
      ]
    );
  };

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    try {
      await api.put(`/route/${id}`, { name: editName, description: editDesc });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowEditMeta(false);
      fetchRoute();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update route');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Route', 'Customers on this route (any slot) will be unassigned. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/route/${id}`);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete route');
          }
        },
      },
    ]);
  };

  if (loading || !route) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const SlotIcon = slot === 'morning' ? Sun : Moon;

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <Pressable onPress={() => router.back()} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200">
            <ArrowLeft size={20} color="#0F172A" />
          </Pressable>
          <Text className="text-lg font-black text-slate-900 tracking-tight" numberOfLines={1}>{route.name}</Text>
          <View className="flex-row gap-2">
            <Pressable onPress={() => setShowEditMeta(true)} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center">
              <Edit2 size={16} color="#0F172A" />
            </Pressable>
            <Pressable onPress={handleDelete} className="w-10 h-10 bg-rose-50 rounded-full items-center justify-center">
              <Trash2 size={16} color="#E11D48" />
            </Pressable>
          </View>
        </View>

        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          {!!route.description && (
            <Text className="text-slate-500 font-medium mb-5">{route.description}</Text>
          )}

          {/* Slot switch — drives stops + driver below */}
          <View className="flex-row bg-slate-200/60 p-1.5 rounded-2xl mb-5">
            {(['morning', 'evening'] as const).map((s) => {
              const isActive = slot === s;
              const Icon = s === 'morning' ? Sun : Moon;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSlot(s);
                  }}
                  className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${isActive ? 'bg-white shadow-sm' : ''}`}
                >
                  <Icon size={16} color={isActive ? '#0F172A' : '#94A3B8'} />
                  <Text className={`font-black text-sm ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                    {s === 'morning' ? 'Morning' : 'Evening'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Driver for this slot */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Driver ({slot})</Text>
          <Pressable
            onPress={() => setShowDriverPicker(true)}
            className={`flex-row items-center justify-between p-4 rounded-2xl border mb-6 active:opacity-80 ${currentDriver ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
          >
            <View className="flex-row items-center gap-2.5">
              <Truck size={18} color={currentDriver ? 'white' : '#64748B'} />
              <Text className={`font-bold ${currentDriver ? 'text-white' : 'text-slate-500'}`}>
                {currentDriver?.driverName || 'No driver assigned'}
              </Text>
            </View>
            <ChevronDown size={18} color={currentDriver ? '#94A3B8' : '#CBD5E1'} />
          </Pressable>

          {/* Stops for this slot */}
          <View className="flex-row items-center justify-between mb-2.5">
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stop Sequence ({slot})</Text>
            <View className="flex-row items-center gap-1">
              <SlotIcon size={12} color="#94A3B8" />
              <Text className="text-xs font-bold text-slate-400">{stops.length} stops</Text>
            </View>
          </View>

          <View className="bg-white rounded-[24px] p-3 border border-slate-200 mb-3">
            {loadingStops ? (
              <ActivityIndicator size="small" color="#0F172A" className="py-8" />
            ) : stops.length === 0 ? (
              <View className="items-center py-8">
                <Text className="text-slate-400 font-medium text-center px-4">
                  No customers on this route's {slot} slot yet. Assign them from a customer's detail screen.
                </Text>
              </View>
            ) : (
              stops.map((item, index) => (
                <View
                  key={item.id}
                  className="flex-row items-center justify-between p-3 border-b border-slate-100 last:border-0"
                >
                  <View className="flex-row items-center gap-3 flex-1 pr-2">
                    <View className="w-8 h-8 bg-slate-100 rounded-lg items-center justify-center">
                      <Text className="font-black text-slate-600 text-xs">{index + 1}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-slate-800" numberOfLines={1}>{item.name}</Text>
                      {!!item.houseAddress && (
                        <Text className="text-xs text-slate-400 font-medium" numberOfLines={1}>{item.houseAddress}</Text>
                      )}
                    </View>
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => moveStop(index, 'up')}
                      disabled={index === 0}
                      className={`w-9 h-9 items-center justify-center rounded-lg border ${index === 0 ? 'border-slate-100 bg-slate-50 opacity-40' : 'border-slate-200 bg-white active:bg-slate-100'}`}
                    >
                      <ArrowUp size={16} color="#0F172A" />
                    </Pressable>
                    <Pressable
                      onPress={() => moveStop(index, 'down')}
                      disabled={index === stops.length - 1}
                      className={`w-9 h-9 items-center justify-center rounded-lg border ${index === stops.length - 1 ? 'border-slate-100 bg-slate-50 opacity-40' : 'border-slate-200 bg-white active:bg-slate-100'}`}
                    >
                      <ArrowDown size={16} color="#0F172A" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          {sequenceDirty && (
            <Pressable
              onPress={handleSaveSequence}
              disabled={savingSequence}
              className="bg-emerald-600 h-14 rounded-2xl items-center justify-center flex-row gap-2 mb-6 active:opacity-90"
            >
              {savingSequence ? <ActivityIndicator color="white" /> : (
                <>
                  <Save size={18} color="white" />
                  <Text className="text-white font-black text-sm">Save {slot === 'morning' ? 'Morning' : 'Evening'} Sequence</Text>
                </>
              )}
            </Pressable>
          )}

          {/* Queued price change, if any. Shown above the editor so it's read
              before someone starts typing a second change over the top. */}
          {pendingPrices && (
            <View className="bg-amber-50 border border-amber-200 rounded-[24px] p-4 mt-2 mb-3">
              <View className="flex-row items-start gap-3">
                <CalendarClock size={17} color="#D97706" />
                <View className="flex-1">
                  <Text className="font-black text-amber-900 text-sm">Price change queued</Text>
                  <Text className="text-amber-800 text-xs mt-0.5 leading-5">
                    Takes effect{' '}
                    {new Date(pendingPrices.effectiveFrom + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                    . This month's deliveries keep the current prices.
                  </Text>

                  <View className="bg-white/70 rounded-xl px-3 py-2 mt-2.5">
                    {PRODUCTS.filter((p) => pendingPrices.prices[p.key] !== undefined).map((p) => (
                      <View key={p.key} className="flex-row justify-between py-1">
                        <Text className="text-xs text-amber-900 font-medium">{p.label}</Text>
                        <Text className="text-xs text-amber-900 font-bold">
                          ₹{prices[p.key]} → ₹{pendingPrices.prices[p.key]}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    onPress={handleCancelPending}
                    className="flex-row items-center gap-1.5 mt-3 self-start active:opacity-70"
                  >
                    <XCircle size={13} color="#B45309" />
                    <Text className="text-amber-800 font-bold text-xs">Cancel this change</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* Pricing — route-wide, NOT per slot */}
          <View className="flex-row items-center gap-2 mt-2 mb-2.5">
            <IndianRupee size={14} color="#94A3B8" />
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing — changes apply from next month</Text>
          </View>
          <View className="bg-white rounded-[24px] p-4 border border-slate-200 mb-3">
            {PRODUCTS.map((p) => (
              <View key={p.key} className="flex-row items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                <Text className="font-bold text-slate-700 text-sm">{p.label}</Text>
                <View className="flex-row items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3">
                  <Text className="text-slate-400 font-bold">₹</Text>
                  <TextInput
                    value={prices[p.key]}
                    onChangeText={(v) => setPrices({ ...prices, [p.key]: v })}
                    keyboardType="decimal-pad"
                    className="font-bold text-slate-800 w-16 py-2.5 text-right"
                  />
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={handleSavePrices}
            disabled={savingPrices}
            className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
          >
            {savingPrices ? <ActivityIndicator color="white" /> : (
              <>
                <Save size={18} color="white" />
                <Text className="text-white font-black text-sm">
                  {pendingPrices ? 'Replace Queued Change' : 'Save Prices'}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>

        <DriverPickerModal
          visible={showDriverPicker}
          drivers={drivers}
          slot={slot}
          onSelect={handleAssignDriver}
          onClose={() => setShowDriverPicker(false)}
        />

        {/* Edit route meta modal */}
        <Modal visible={showEditMeta} transparent animationType="slide" onRequestClose={() => setShowEditMeta(false)}>
          <View
            className="flex-1 justify-end bg-slate-900/40"
            style={{ paddingBottom: keyboardHeight }}
          >
            <Pressable className="absolute inset-0" onPress={() => setShowEditMeta(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-black text-slate-800">Edit Route</Text>
                <Pressable onPress={() => setShowEditMeta(false)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>
              <Text className="text-xs font-bold text-slate-500 mb-1.5">Route Name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                className="bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 font-semibold text-slate-800 mb-4"
              />
              <Text className="text-xs font-bold text-slate-500 mb-1.5">Description</Text>
              <TextInput
                value={editDesc}
                onChangeText={setEditDesc}
                multiline
                className="bg-slate-50 border border-slate-200 rounded-2xl p-4 font-semibold text-slate-800 min-h-[80px] mb-8"
              />
              <Pressable
                onPress={handleSaveMeta}
                disabled={savingMeta}
                className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
              >
                {savingMeta ? <ActivityIndicator color="white" /> : (
                  <>
                    <Check size={18} color="white" />
                    <Text className="text-white font-black text-sm">Save Changes</Text>
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
