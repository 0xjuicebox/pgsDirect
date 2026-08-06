import React, { useState, useEffect, useCallback } from 'react';
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
  ScrollView,
  Alert
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  UserCheck,
  MapPin,
  Phone,
  CheckCircle2,
  XCircle,
  X,
  Route as RouteIcon,
  CircleDot
} from 'lucide-react-native';
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from 'expo-router';

import { api } from '../../../utils/api';

type Customer = { id: string; customer: string; phoneNumber: string; houseAddress: string; status: string; routeId: string | null; stopOrder: number; };
type RouteItem = { id: string; name: string; };

const REJECTION_REASONS = [
  'Outside current delivery zone',
  'No available delivery slots on this route',
  'Incomplete address or unverified location',
  'Duplicate request',
];

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'active' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Form State
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [stopOrder, setStopOrder] = useState<string>('1');
  const [rejectReason, setRejectReason] = useState<string>(REJECTION_REASONS[0]);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [custData, routeData] = await Promise.all([
        api.get('/customer?page=1&limit=100'),
        api.get('/route')
      ]);

      setCustomers(custData || []);
      setRoutes(routeData || []);

      if (routeData && routeData.length > 0) {
        setSelectedRouteId(routeData[0].id);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      Alert.alert('Error', err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredCustomers = customers.filter((c) => {
    if (filterStatus === 'pending') return c.status === 'pending';
    if (filterStatus === 'active') return c.status === 'active';
    return true;
  });

  const handleApproveSubmit = async () => {
    if (!selectedCustomer || !selectedRouteId) return;
    setSubmitting(true);
    try {
      await api.post(`/customer/${selectedCustomer.id}/approve`, {
        routeId: selectedRouteId,
        stopOrder: parseInt(stopOrder, 10) || 1
      });

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowApproveModal(false);
      fetchData();
    } catch (err: any) {
      Alert.alert('Approval Error', err.message || 'Failed to approve customer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!selectedCustomer) return;
    setSubmitting(true);
    try {
      await api.post(`/customer/${selectedCustomer.id}/reject`, {
        reason: rejectReason
      });

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRejectModal(false);
      fetchData();
    } catch (err: any) {
      Alert.alert('Rejection Error', err.message || 'Failed to reject customer');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 border-green-200 text-green-800';
      case 'rejected': return 'bg-red-100 border-red-200 text-red-800';
      case 'disabled': return 'bg-slate-100 border-slate-200 text-slate-600';
      default: return 'bg-amber-100 border-amber-200 text-amber-800';
    }
  };

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-4">
      <Text className="text-3xl font-black text-slate-800 tracking-tighter">Customers</Text>
      <Text className="text-sm font-semibold text-slate-400 mb-6">Manage registrations and routing</Text>

      <View className="flex-row bg-slate-200/50 p-1.5 rounded-2xl">
        {(['pending', 'active', 'all'] as const).map((tab) => {
          const isActive = filterStatus === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterStatus(tab);
              }}
              className={`flex-1 items-center justify-center py-2.5 rounded-xl ${isActive ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-sm font-bold capitalize ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                {tab === 'pending' ? `Pending (${customers.filter(c => c.status === 'pending').length})` : tab}
              </Text>
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
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#16A34A" />}
            ListEmptyComponent={
              <View className="items-center justify-center mt-10">
                <UserCheck size={48} color="#CBD5E1" />
                <Text className="text-slate-700 font-bold text-base mt-4">No Customers Found</Text>
                <Text className="text-slate-400 font-medium text-center px-8 mt-2">
                  There are no customers matching this filter.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                // ✅ FIXED: Use relative path to navigate to [id].tsx in the same directory
                onPress={() => router.push(`./customers/${item.id}`)}
                className="bg-white rounded-3xl p-5 mx-5 mb-4 border border-slate-200 active:opacity-95"
                style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-xl font-black text-slate-800 tracking-tight">{item.customer}</Text>
                    <View className="flex-row items-center gap-1.5 mt-1">
                      <Phone size={12} color="#64748B" />
                      <Text className="text-slate-500 text-sm font-semibold">{item.phoneNumber}</Text>
                    </View>
                  </View>
                  <View className={`px-2.5 py-1 rounded-lg border ${getStatusStyle(item.status)}`}>
                    <Text className={`text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(item.status).split(' ')[2]}`}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-start gap-1.5 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <MapPin size={16} color="#64748B" className="mt-0.5" />
                  <Text className="text-slate-600 text-sm font-medium flex-1 leading-5">{item.houseAddress}</Text>
                </View>

                {item.status === 'pending' && (
                  <View className="flex-row gap-3 pt-4 border-t border-slate-100">
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); setSelectedCustomer(item); setShowRejectModal(true); }}
                      className="flex-1 h-12 bg-red-50 border border-red-100 rounded-xl items-center justify-center flex-row gap-2 active:bg-red-100"
                    >
                      <XCircle size={18} color="#EF4444" />
                      <Text className="text-red-600 font-bold text-sm">Reject</Text>
                    </Pressable>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); setSelectedCustomer(item); setShowApproveModal(true); }}
                      className="flex-1 h-12 bg-slate-900 rounded-xl items-center justify-center flex-row gap-2 active:bg-slate-800"
                    >
                      <CheckCircle2 size={18} color="white" />
                      <Text className="text-white font-bold text-sm">Approve</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            )}
          />
        )}

        {/* APPROVAL MODAL */}
        <Modal visible={showApproveModal} transparent animationType="slide" onRequestClose={() => setShowApproveModal(false)}>
          <View className="flex-1 justify-end bg-slate-900/40">
            <Pressable className="absolute inset-0" onPress={() => setShowApproveModal(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-2xl font-black text-slate-800 tracking-tight">Approve Customer</Text>
                <Pressable onPress={() => setShowApproveModal(false)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>
              <Text className="text-slate-500 font-medium mb-6">Assign {selectedCustomer?.customer} to a route.</Text>

              <Text className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">Assign Route</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                {routes.map(r => (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelectedRouteId(r.id)}
                    className={`flex-row items-center gap-2 px-4 py-3 rounded-2xl border mr-3 ${selectedRouteId === r.id ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                  >
                    <RouteIcon size={18} color={selectedRouteId === r.id ? 'white' : '#64748B'} />
                    <Text className={`font-bold ${selectedRouteId === r.id ? 'text-white' : 'text-slate-600'}`}>{r.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">Stop Order Sequence</Text>
              <TextInput
                value={stopOrder}
                onChangeText={setStopOrder}
                keyboardType="numeric"
                placeholder="e.g. 15"
                className="bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 text-lg font-bold text-slate-800 mb-8"
              />

              <Pressable
                onPress={handleApproveSubmit}
                disabled={submitting}
                className="bg-green-500 h-[56px] rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
              >
                {submitting ? <ActivityIndicator color="white" /> : (
                  <>
                    <CheckCircle2 size={20} color="white" />
                    <Text className="text-white text-base font-black tracking-wide">Approve & Notify</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* REJECTION MODAL */}
        <Modal visible={showRejectModal} transparent animationType="slide" onRequestClose={() => setShowRejectModal(false)}>
          <View className="flex-1 justify-end bg-slate-900/40">
            <Pressable className="absolute inset-0" onPress={() => setShowRejectModal(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-2xl font-black text-slate-800 tracking-tight">Reject Application</Text>
                <Pressable onPress={() => setShowRejectModal(false)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>
              <Text className="text-slate-500 font-medium mb-6">Select a reason to include in the WhatsApp alert.</Text>

              <View className="space-y-3 mb-8">
                {REJECTION_REASONS.map(reason => (
                  <Pressable
                    key={reason}
                    onPress={() => setRejectReason(reason)}
                    className={`flex-row items-center gap-3 p-4 rounded-2xl border ${rejectReason === reason ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}
                  >
                    <CircleDot size={20} color={rejectReason === reason ? '#EF4444' : '#CBD5E1'} />
                    <Text className={`flex-1 font-semibold ${rejectReason === reason ? 'text-red-700' : 'text-slate-600'}`}>{reason}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={handleRejectSubmit}
                disabled={submitting}
                className="bg-red-500 h-[56px] rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
              >
                {submitting ? <ActivityIndicator color="white" /> : (
                  <>
                    <XCircle size={20} color="white" />
                    <Text className="text-white text-base font-black tracking-wide">Reject & Send Alert</Text>
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
