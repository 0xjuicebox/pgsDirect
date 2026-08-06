import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';

// Dummy data — mimics what your Go backend will return
const DUMMY_STOPS = [
  {
    customerId: '1',
    customerName: 'Ramesh Sharma',
    address: 'B-12, Sector 4, Dwarka',
    stopOrder: 1,
    status: 'pending',
    deliveryOrder: {
      quantities: { milk: 2, curd: 1 },
    },
  },
  {
    customerId: '2',
    customerName: 'Priya Mehta',
    address: 'Flat 3A, Green Apartments, Rohini',
    stopOrder: 2,
    status: 'delivered',
    deliveryOrder: {
      quantities: { milk: 1, butter: 1, ghee: 1 },
    },
  },
  {
    customerId: '3',
    customerName: 'Suresh Gupta',
    address: '45, Old Delhi Road, Pitampura',
    stopOrder: 3,
    status: 'pending',
    deliveryOrder: {
      quantities: { milk: 3, paneer: 1 },
    },
  },
  {
    customerId: '4',
    customerName: 'Anjali Singh',
    address: 'House 7, Model Town',
    stopOrder: 4,
    status: 'pending',
    deliveryOrder: {
      quantities: { milk: 1, lassi: 2, curd: 1 },
    },
  },
];

// Helper — turns { milk: 2, curd: 1 } into "Milk x2, Curd x1"
function formatItems(quantities: Record<string, number>) {
  return Object.entries(quantities)
    .map(([key, qty]) => `${key.charAt(0).toUpperCase() + key.slice(1)} x${qty}`)
    .join(', ');
}

export default function ManifestScreen() {
  const delivered = DUMMY_STOPS.filter(s => s.status === 'delivered').length;
  const total = DUMMY_STOPS.length;

  return (
    <View style={styles.container}>

      {/* Header summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>Today's Route</Text>
        <Text style={styles.summaryCount}>{delivered}/{total} done</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBackground}>
        <View style={[styles.progressFill, { width: `${(delivered / total) * 100}%` }]} />
      </View>

      {/* List of stops */}
      <FlatList
        data={DUMMY_STOPS}
        keyExtractor={(item) => item.customerId}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const isDone = item.status === 'delivered';

          return (
            <TouchableOpacity
              style={[styles.card, isDone && styles.cardDone]}
              activeOpacity={0.7}
            >
              {/* Stop number + status */}
              <View style={styles.cardHeader}>
                <View style={styles.stopBadge}>
                  <Text style={styles.stopNumber}>{item.stopOrder}</Text>
                </View>
                <View style={[styles.statusBadge, isDone ? styles.statusDone : styles.statusPending]}>
                  <Text style={styles.statusText}>
                    {isDone ? '✓ Delivered' : 'Pending'}
                  </Text>
                </View>
              </View>

              {/* Customer info */}
              <Text style={styles.customerName}>{item.customerName}</Text>
              <Text style={styles.address}>📍 {item.address}</Text>

              {/* Items to deliver */}
              <View style={styles.itemsRow}>
                <Text style={styles.itemsLabel}>Items: </Text>
                <Text style={styles.itemsText}>
                  {formatItems(item.deliveryOrder.quantities)}
                </Text>
              </View>

              {/* Action button — only show if pending */}
              {!isDone && (
                <TouchableOpacity style={styles.deliverButton}>
                  <Text style={styles.deliverButtonText}>Mark Delivered →</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  summaryText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryCount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressBackground: {
    height: 6,
    backgroundColor: '#C8E6C9',
  },
  progressFill: {
    height: 6,
    backgroundColor: '#2E7D32',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDone: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stopBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumber: {
    fontWeight: '700',
    color: '#2E7D32',
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDone: {
    backgroundColor: '#E8F5E9',
  },
  statusPending: {
    backgroundColor: '#FFF3E0',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  customerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  address: {
    fontSize: 13,
    color: '#777',
    marginBottom: 10,
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  itemsLabel: {
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
  },
  itemsText: {
    fontSize: 13,
    color: '#444',
    flex: 1,
  },
  deliverButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deliverButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
