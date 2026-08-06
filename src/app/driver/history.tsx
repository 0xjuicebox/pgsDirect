import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Calendar,
  ChevronRight,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Package,
  X
} from 'lucide-react-native';
import { api } from '../../utils/api'; // Import your API instance

// --- TYPES & INTERFACES ---
type PastItemDetail = { name: string; expected: number; actual: number; unit: string };
type PastStop = {
  id: string;
  customer: string;
  address: string;
  status: 'DELIVERED' | 'SKIPPED' | 'UNATTEMPTED' | 'SYSTEM_AUTO_CLOSED';
  deliveryTime: string;
  items: PastItemDetail[];
};
type HistoryRecord = {
  id: string;
  date: string;
  timestamp: string;
  routeName: string;
  totalStops: number;
  completedStops: number;
  milkTotal: number;
  stops: PastStop[];
};

const FILTERS = ['All', 'This Week', 'Last 14 Days'];

export default function RouteHistoryScreen() {
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // --- API FETCH LOGIC ---
  const fetchHistory = async () => {
    try {
      // The Go backend automatically isolates data to the logged-in driver via the JWT
      const response = await api.get('/delivery/history');
      setHistoryData(response || []);
    } catch (error) {
      console.error("Failed to fetch driver history:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchHistory();
  }, []);

  // --- FILTERING LOGIC ---
  const filteredHistory = useMemo(() => {
    return historyData.filter(record => {
      if (selectedFilter === 'All') return true;

      const recordDate = new Date(record.timestamp);
      const today = new Date(); // Compares against actual system time
      const diffTime = Math.abs(today.getTime() - recordDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (selectedFilter === 'This Week') return diffDays <= 7;
      if (selectedFilter === 'Last 14 Days') return diffDays <= 14;
      return true;
    });
  }, [historyData, selectedFilter]);

  // --- HANDLERS ---
  const handleOpenDetails = (record: HistoryRecord) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRecord(record);
    setModalVisible(true);
  };

  const handleCloseDetails = () => {
    setModalVisible(false);
    setTimeout(() => setSelectedRecord(null), 300);
  };

  // --- RENDERING SUB-COMPONENTS ---
  const renderFilterBar = () => (
    <View className="mb-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 py-2 flex-row">
        {FILTERS.map(filter => {
          const isActive = selectedFilter === filter;
          return (
            <Pressable
              key={filter}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedFilter(filter);
              }}
              className={`px-5 py-2.5 rounded-full mr-3 border shadow-sm ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
                }`}
            >
              <Text className={`font-bold text-sm ${isActive ? 'text-white' : 'text-slate-500'}`}>
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  if (isLoading && !isRefreshing) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#16A34A" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1">

        {/* Fixed Section Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-3xl font-black text-slate-800 tracking-tighter">Route History</Text>
          <Text className="text-sm font-semibold text-slate-400 mb-4">Review historical drops and loads</Text>
        </View>

        {renderFilterBar()}

        {/* Core History Content Feed */}
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#16A34A" />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Calendar size={48} color="#94A3B8" strokeWidth={1.5} />
              <Text className="text-slate-400 font-bold mt-4 text-center">No delivery logs found for this era</Text>
            </View>
          }
          renderItem={({ item }) => {
            const performance = item.totalStops === 0 ? 0 : Math.round((item.completedStops / item.totalStops) * 100);
            return (
              <Pressable
                onPress={() => handleOpenDetails(item)}
                className="bg-white border border-slate-200 rounded-3xl p-5 mb-4 shadow-sm flex-row items-center justify-between active:bg-slate-50"
              >
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <Calendar size={14} color="#94A3B8" />
                    <Text className="text-slate-800 font-black text-base tracking-tight">{item.date}</Text>
                  </View>

                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-3">
                    Route: <Text className="text-slate-700 font-extrabold normal-case text-sm">{item.routeName}</Text>
                  </Text>

                  <View className="flex-row items-center gap-4">
                    <View>
                      <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Stops Done</Text>
                      <Text className="text-slate-800 font-black text-sm">{item.completedStops}/{item.totalStops}</Text>
                    </View>
                    <View className="w-[1px] h-6 bg-slate-200" />
                    <View>
                      <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Milk</Text>
                      <Text className="text-green-600 font-black text-sm">{item.milkTotal}L</Text>
                    </View>
                    <View className="w-[1px] h-6 bg-slate-200" />
                    <View>
                      <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Success</Text>
                      <Text className={`font-black text-sm ${performance >= 90 ? 'text-green-600' : 'text-amber-500'}`}>
                        {performance}%
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="bg-slate-50 p-2 rounded-full border border-slate-100">
                  <ChevronRight size={18} color="#64748B" strokeWidth={2.5} />
                </View>
              </Pressable>
            );
          }}
        />

        {/* --- DEEP DIVE EXPANDED VIEW MODAL --- */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleCloseDetails}
        >
          <View className="flex-1 bg-slate-50">
            <View className="flex-row justify-between items-center px-6 pt-5 pb-4 bg-white border-b border-slate-100">
              <View>
                <Text className="text-2xl font-black text-slate-800 tracking-tight">{selectedRecord?.date}</Text>
                <Text className="text-slate-400 text-xs font-semibold mt-0.5">Manifest Archive: {selectedRecord?.routeName}</Text>
              </View>
              <Pressable
                onPress={handleCloseDetails}
                className="h-10 w-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200"
              >
                <X size={20} color="#64748B" strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
              <Text className="text-slate-800 font-black text-lg tracking-tight mb-4 px-1">Drop Breakdown</Text>

              {selectedRecord?.stops.length === 0 ? (
                <Text className="text-slate-400 font-medium italic p-4 text-center">No structural logs parsed for this manifest layout</Text>
              ) : (
                selectedRecord?.stops.map((stop) => {
                  const isDelivered = stop.status === 'DELIVERED';
                  return (
                    <View key={stop.id} className="bg-white border border-slate-100 rounded-3xl p-5 mb-4 shadow-sm">
                      <View className="flex-row justify-between items-start mb-3">
                        <View className="flex-1 pr-4">
                          <Text className="text-slate-800 font-extrabold text-lg tracking-tight">{stop.customer}</Text>
                          <View className="flex-row items-center gap-1 mt-1">
                            <MapPin size={12} color="#94A3B8" />
                            <Text className="text-slate-400 text-xs font-medium truncate">{stop.address}</Text>
                          </View>
                        </View>

                        <View className="items-end">
                          <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${isDelivered ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'
                            }`}>
                            {isDelivered ? (
                              <>
                                <CheckCircle2 size={12} color="#16A34A" />
                                <Text className="text-green-700 font-bold text-[11px] uppercase">Delivered</Text>
                              </>
                            ) : (
                              <>
                                <XCircle size={12} color="#EF4444" />
                                <Text className="text-red-700 font-bold text-[11px] uppercase">
                                  {stop.status === 'UNATTEMPTED' ? 'Missed' : 'Skipped'}
                                </Text>
                              </>
                            )}
                          </View>

                          <View className="flex-row items-center gap-1 mt-2">
                            <Clock size={12} color="#94A3B8" />
                            <Text className="text-slate-400 font-bold text-[11px]">{stop.deliveryTime}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Render Items if delivered */}
                      {stop.items && stop.items.length > 0 && (
                        <View className="bg-slate-50 border border-slate-100 rounded-2xl p-3 mt-1 space-y-2">
                          {stop.items.map((prod, idx) => (
                            <View key={idx} className="flex-row justify-between items-center py-1">
                              <View className="flex-row items-center gap-2">
                                <Package size={14} color="#94A3B8" />
                                <Text className="text-slate-600 font-bold capitalize text-sm">{prod.name}</Text>
                              </View>
                              <View className="flex-row items-baseline gap-1">
                                <Text className="font-black text-sm text-slate-800">{prod.actual}{prod.unit}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}
