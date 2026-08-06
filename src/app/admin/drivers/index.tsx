import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  Platform,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Route as RouteIcon,
  Truck,
  Plus,
  ArrowUp,
  ArrowDown,
  X,
  Save,
  Trash2,
  MapPin,
  Map,
  Edit2,
  ChevronDown,
  Search,
  CheckCircle2
} from 'lucide-react-native';

import { api } from '../../../utils/api';

// --- TYPES ---
type RouteItem = { id: string; name: string; description: string; driverId: string | null };
type DriverItem = { id: string; name: string; phoneNumber: string; isActive: boolean };

type ManifestStop = {
  id: string;
  customer: string;
  houseAddress: string;
  stopOrder: number;
};
type RosterData = {
  routeId: string;
  routeName: string;
  stops: any[];
};

// ---------------------------------------------------------------------------
// Reusable Component: Driver Picker Modal
// ---------------------------------------------------------------------------
function DriverPickerModal({
  visible,
  drivers,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  drivers: DriverItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => drivers.filter((d) => d.name.toLowerCase().includes(query.toLowerCase())),
    [drivers, query]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white rounded-t-[32px] max-h-[70%] pb-8">
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
            <View>
              <Text className="text-xl font-black text-slate-900">Assign Driver</Text>
              <Text className="text-xs text-slate-400 font-medium mt-0.5">Select a driver for this route</Text>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200">
              <X size={18} color="#0F172A" />
            </Pressable>
          </View>

          <View className="mx-6 my-4 flex-row items-center bg-slate-100 rounded-2xl px-4 h-12 border border-slate-200/60">
            <Search size={18} color="#94A3B8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search drivers by name..."
              placeholderTextColor="#94A3B8"
              className="flex-1 ml-3 text-sm font-bold text-slate-800"
            />
          </View>

          <FlatList
            data={[{ id: '', name: 'Unassigned (Remove Driver)' }, ...filtered]}
            keyExtractor={(item) => item.id || 'unassigned'}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20 }}
            renderItem={({ item }) => {
              const isSelected = (item.id || null) === selectedId;
              return (
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSelect(item.id || null);
                    onClose();
                  }}
                  className={`flex-row items-center justify-between my-1.5 px-4 py-4 rounded-2xl border ${isSelected ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'
                    }`}
                >
                  <View className="flex-row items-center gap-3">
                    <Truck size={18} color={isSelected ? 'white' : '#64748B'} />
                    <Text className={`font-bold text-base ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                      {item.name}
                    </Text>
                  </View>
                  {isSelected && <CheckCircle2 size={20} color="white" />}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text className="text-center text-slate-400 py-8 text-sm font-medium">No active drivers found</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen Component
// ---------------------------------------------------------------------------
export default function FleetAndRoutesScreen() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create & Edit Route State
  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeName, setRouteName] = useState('');
  const [routeDesc, setRouteDesc] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);

  // Driver Assignment State
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [selectedRouteForDriver, setSelectedRouteForDriver] = useState<RouteItem | null>(null);

  // Sequence Manager State
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [selectedRouteForSeq, setSelectedRouteForSeq] = useState<RouteItem | null>(null);
  const [manifestStops, setManifestStops] = useState<ManifestStop[]>([]);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [savingSequence, setSavingSequence] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [routesData, driversData] = await Promise.all([
        api.get('/route?page=1&limit=100'),
        api.get('/driver?page=1&limit=100').catch(() => [])
      ]);

      setRoutes(routesData || []);
      setDrivers(driversData || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load fleet data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreateModal = () => {
    setIsEditing(false);
    setEditingRouteId(null);
    setRouteName('');
    setRouteDesc('');
    setShowFormModal(true);
  };

  const openEditModal = (route: RouteItem) => {
    setIsEditing(true);
    setEditingRouteId(route.id);
    setRouteName(route.name);
    setRouteDesc(route.description);
    setShowFormModal(true);
  };

  const handleSaveRouteForm = async () => {
    if (!routeName.trim()) return Alert.alert('Required', 'Route name is required');
    setSavingRoute(true);
    try {
      if (isEditing && editingRouteId) {
        await api.put(`/route/${editingRouteId}`, { name: routeName, description: routeDesc });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Route details updated.');
      } else {
        await api.post('/route', { name: routeName, description: routeDesc });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setShowFormModal(false);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save route');
    } finally {
      setSavingRoute(false);
    }
  };

  const handleDeleteRoute = (id: string) => {
    Alert.alert('Delete Route', 'This will unassign all customers currently on this route. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/route/${id}`);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete route');
          }
        }
      }
    ]);
  };

  const handleAssignDriver = async (driverId: string | null) => {
    if (!selectedRouteForDriver) return;
    try {
      await api.put(`/route/${selectedRouteForDriver.id}/driver`, { driverId });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to assign driver');
    }
  };

  // 🚀 FIXED: Now hits /roster instead of /manifest to get ALL permanent stops
  const openSequenceManager = async (route: RouteItem) => {
    setSelectedRouteForSeq(route);
    setShowManifestModal(true);
    setLoadingManifest(true);
    try {
      const roster: RosterData = await api.get(`/route/${route.id}/roster`);

      const mappedStops = (roster.stops || []).map((s: any) => ({
        id: s.id,
        customer: s.name, // Roster returns 'name', map to UI 'customer'
        houseAddress: s.houseAddress,
        stopOrder: s.stopOrder
      }));

      const sortedStops = mappedStops.sort((a, b) => a.stopOrder - b.stopOrder);
      setManifestStops(sortedStops);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load route sequence. Ensure backend GET /roster is available.');
      setShowManifestModal(false);
    } finally {
      setLoadingManifest(false);
    }
  };

  const moveStop = (index: number, direction: 'up' | 'down') => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newStops = [...manifestStops];

    if (direction === 'up' && index > 0) {
      [newStops[index - 1], newStops[index]] = [newStops[index], newStops[index - 1]];
    } else if (direction === 'down' && index < newStops.length - 1) {
      [newStops[index + 1], newStops[index]] = [newStops[index], newStops[index + 1]];
    }

    const reindexed = newStops.map((stop, i) => ({ ...stop, stopOrder: i + 1 }));
    setManifestStops(reindexed);
  };

  const handleSaveSequence = async () => {
    if (!selectedRouteForSeq) return;
    setSavingSequence(true);
    try {
      const customerIds = manifestStops.map(stop => stop.id);
      await api.put(`/route/${selectedRouteForSeq.id}/sequence`, { customerIds });

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Route sequence saved successfully');
      setShowManifestModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save sequence');
    } finally {
      setSavingSequence(false);
    }
  };

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-4">
      <Text className="text-3xl font-black text-slate-800 tracking-tighter">Fleet & Routes</Text>
      <Text className="text-sm font-semibold text-slate-400 mb-6">Manage delivery zones and drop sequences</Text>

      <Pressable
        onPress={openCreateModal}
        className="bg-slate-900 flex-row items-center justify-center gap-2 py-4 rounded-2xl shadow-sm active:opacity-90"
      >
        <Plus size={20} color="white" />
        <Text className="text-white font-black text-sm tracking-wide">Create New Route</Text>
      </Pressable>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1">

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0F172A" />
          </View>
        ) : (
          <FlatList
            data={routes}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
            ListEmptyComponent={
              <View className="items-center justify-center mt-10">
                <Map size={48} color="#CBD5E1" />
                <Text className="text-slate-700 font-bold text-base mt-4">No Routes Configured</Text>
                <Text className="text-slate-400 font-medium text-center px-8 mt-2">
                  Create a route to start assigning customers and drivers.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const assignedDriver = drivers.find(d => d.id === item.driverId);

              return (
                <View className="bg-white rounded-[28px] p-5 mx-5 mb-5 border border-slate-200 shadow-sm">
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center gap-2 mb-1.5">
                        <RouteIcon size={20} color="#0F172A" />
                        <Text className="text-xl font-black text-slate-800 tracking-tight">{item.name}</Text>
                      </View>
                      <Text className="text-slate-500 text-xs font-medium leading-5 mb-2">
                        {item.description || 'No description provided.'}
                      </Text>
                    </View>

                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => openEditModal(item)}
                        className="w-10 h-10 items-center justify-center bg-slate-50 border border-slate-100 rounded-full active:bg-slate-200"
                      >
                        <Edit2 size={16} color="#64748B" />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteRoute(item.id)}
                        className="w-10 h-10 items-center justify-center bg-rose-50 border border-rose-100 rounded-full active:bg-rose-100"
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>

                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Assigned Driver</Text>
                  <Pressable
                    onPress={() => {
                      setSelectedRouteForDriver(item);
                      setShowDriverModal(true);
                    }}
                    className={`flex-row items-center justify-between p-3.5 rounded-xl border mb-5 active:opacity-80 ${item.driverId ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'
                      }`}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <Truck size={16} color={item.driverId ? 'white' : '#64748B'} />
                      <Text className={`text-sm font-bold tracking-wide ${item.driverId ? 'text-white' : 'text-slate-500'}`}>
                        {item.driverId ? (assignedDriver?.name || 'Driver Found (Loading...)') : "No Driver Assigned"}
                      </Text>
                    </View>
                    <ChevronDown size={18} color={item.driverId ? '#94A3B8' : '#CBD5E1'} />
                  </Pressable>

                  <Pressable
                    onPress={() => openSequenceManager(item)}
                    className="bg-emerald-50 border border-emerald-200 py-4 rounded-xl items-center flex-row justify-center gap-2 active:bg-emerald-100"
                  >
                    <MapPin size={16} color="#059669" />
                    <Text className="text-emerald-700 font-black text-sm tracking-wide">Manage Stop Sequence</Text>
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        {/* --- MODAL: CREATE / EDIT ROUTE --- */}
        <Modal visible={showFormModal} transparent animationType="slide" onRequestClose={() => setShowFormModal(false)}>
          <View className="flex-1 justify-end bg-black/40">
            <Pressable className="absolute inset-0" onPress={() => setShowFormModal(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-2xl font-black text-slate-900">{isEditing ? 'Edit Route' : 'New Route'}</Text>
                <Pressable onPress={() => setShowFormModal(false)} className="w-9 h-9 bg-slate-100 rounded-full items-center justify-center">
                  <X size={18} color="#0F172A" />
                </Pressable>
              </View>

              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Route Name</Text>
              <TextInput
                value={routeName}
                onChangeText={setRouteName}
                placeholder="e.g. South Delhi Morning"
                className="bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 font-bold text-slate-800 text-base mb-4"
              />

              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description (Optional)</Text>
              <TextInput
                value={routeDesc}
                onChangeText={setRouteDesc}
                placeholder="Coverage areas or driver instructions..."
                multiline
                className="bg-slate-50 border border-slate-200 rounded-2xl p-4 font-medium text-slate-800 min-h-[80px] mb-6"
              />

              <Pressable
                onPress={handleSaveRouteForm}
                disabled={savingRoute}
                className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
              >
                {savingRoute ? <ActivityIndicator color="white" /> : (
                  <>
                    <Save size={18} color="white" />
                    <Text className="text-white font-black text-base">{isEditing ? 'Save Changes' : 'Create Route'}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* --- MODAL: SEQUENCE MANAGER --- */}
        <Modal visible={showManifestModal} transparent animationType="slide" onRequestClose={() => setShowManifestModal(false)}>
          <View className="flex-1 bg-slate-50 pt-12">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shadow-sm">
              <View>
                <Text className="text-lg font-black text-slate-900">{selectedRouteForSeq?.name}</Text>
                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sequence Editor</Text>
              </View>
              <Pressable onPress={() => setShowManifestModal(false)} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center">
                <X size={18} color="#0F172A" />
              </Pressable>
            </View>

            {loadingManifest ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#0F172A" />
              </View>
            ) : (
              <FlatList
                data={manifestStops}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                ListEmptyComponent={
                  <View className="items-center justify-center mt-20 px-8">
                    <MapPin size={48} color="#CBD5E1" />
                    <Text className="text-slate-700 font-bold text-base mt-4 text-center">No Customers Found</Text>
                    <Text className="text-slate-400 font-medium text-sm text-center mt-1">Approve customers and assign them to this route from the Customers tab.</Text>
                  </View>
                }
                renderItem={({ item, index }) => (
                  <View className="flex-row items-center bg-white rounded-2xl border border-slate-200 mb-3 p-3 shadow-sm">
                    <View className="w-10 h-10 bg-slate-900 rounded-full items-center justify-center mr-4">
                      <Text className="text-white font-black text-sm">{item.stopOrder}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-black text-slate-800 text-sm mb-0.5">{item.customer}</Text>
                      <Text className="text-slate-500 text-[11px] font-medium" numberOfLines={1}>{item.houseAddress}</Text>
                    </View>
                    <View className="flex-row gap-1">
                      <Pressable
                        onPress={() => moveStop(index, 'up')}
                        disabled={index === 0}
                        className={`w-10 h-10 items-center justify-center rounded-xl border ${index === 0 ? 'border-slate-100 bg-slate-50 opacity-50' : 'border-slate-200 bg-white active:bg-slate-100'}`}
                      >
                        <ArrowUp size={18} color="#0F172A" />
                      </Pressable>
                      <Pressable
                        onPress={() => moveStop(index, 'down')}
                        disabled={index === manifestStops.length - 1}
                        className={`w-10 h-10 items-center justify-center rounded-xl border ${index === manifestStops.length - 1 ? 'border-slate-100 bg-slate-50 opacity-50' : 'border-slate-200 bg-white active:bg-slate-100'}`}
                      >
                        <ArrowDown size={18} color="#0F172A" />
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            )}

            {!loadingManifest && manifestStops.length > 0 && (
              <View className="absolute bottom-10 left-5 right-5">
                <Pressable
                  onPress={handleSaveSequence}
                  disabled={savingSequence}
                  className="bg-emerald-600 h-16 rounded-[24px] items-center justify-center flex-row gap-2 shadow-xl shadow-emerald-900/20 active:opacity-90"
                >
                  {savingSequence ? <ActivityIndicator color="white" /> : (
                    <>
                      <Save size={18} color="white" strokeWidth={2.5} />
                      <Text className="text-white text-base font-black tracking-wide">Save New Sequence</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </Modal>

        <DriverPickerModal
          visible={showDriverModal}
          drivers={drivers}
          selectedId={selectedRouteForDriver?.driverId || null}
          onSelect={handleAssignDriver}
          onClose={() => setShowDriverModal(false)}
        />

      </SafeAreaView>
    </View>
  );
}
