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
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { UserCheck, MapPin, Phone } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { api } from '../../../utils/api';

// Customer is identity-only now — no routeId/stopOrder. Those live per-slot
// on subscriptions, which the list doesn't need to fetch (avoids an N+1 call
// per row just to render a directory).
type Customer = {
  id: string;
  customer: string;
  phoneNumber: string;
  houseAddress: string;
  status: 'pending' | 'active' | 'disabled' | 'rejected';
  isActive: boolean;
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 border-green-200 text-green-800',
  rejected: 'bg-red-100 border-red-200 text-red-800',
  disabled: 'bg-slate-100 border-slate-200 text-slate-600',
  pending: 'bg-amber-100 border-amber-200 text-amber-800',
};

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'active' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const custData = await api.get('/customer?page=1&limit=100');
      setCustomers(custData || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredCustomers = customers.filter((c) => {
    if (filterStatus === 'pending') return c.status === 'pending';
    if (filterStatus === 'active') return c.status === 'active';
    return true;
  });

  const pendingCount = customers.filter((c) => c.status === 'pending').length;

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-4">
      <Text className="text-3xl font-black text-slate-800 tracking-tighter">Customers</Text>
      <Text className="text-sm font-semibold text-slate-400 mb-6">
        Manage registrations — tap a customer to route, approve, or edit their orders
      </Text>

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
                {tab === 'pending' ? `Pending (${pendingCount})` : tab}
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
                <UserCheck size={48} color="#CBD5E1" />
                <Text className="text-slate-700 font-bold text-base mt-4">No Customers Found</Text>
                <Text className="text-slate-400 font-medium text-center px-8 mt-2">
                  There are no customers matching this filter.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.pending;
              const textColorClass = statusStyle.split(' ')[2];
              return (
                <Pressable
                  onPress={() => router.push(`/admin/customers/${item.id}`)}
                  className="bg-white rounded-3xl p-5 mx-5 mb-4 border border-slate-200 active:opacity-95"
                  style={
                    Platform.OS === 'android'
                      ? { elevation: 2 }
                      : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }
                  }
                >
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1 pr-2">
                      <Text className="text-xl font-black text-slate-800 tracking-tight">{item.customer}</Text>
                      <View className="flex-row items-center gap-1.5 mt-1">
                        <Phone size={12} color="#64748B" />
                        <Text className="text-slate-500 text-sm font-semibold">{item.phoneNumber}</Text>
                      </View>
                    </View>
                    <View className={`px-2.5 py-1 rounded-lg border ${statusStyle}`}>
                      <Text className={`text-[10px] font-bold uppercase tracking-wider ${textColorClass}`}>
                        {item.status}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-start gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <MapPin size={16} color="#64748B" className="mt-0.5" />
                    <Text className="text-slate-600 text-sm font-medium flex-1 leading-5">
                      {item.houseAddress || 'No address on file'}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
