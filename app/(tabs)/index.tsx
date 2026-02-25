import {
  endOfMonth,
  endOfQuarter,
  isValid,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfQuarter
} from 'date-fns';
import { collection, getDocs, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Checkbox,
  Divider,
  Menu,
  Modal,
  Portal,
  SegmentedButtons,
  Text,
} from 'react-native-paper';
import { db } from '../../firebaseConfig';

// --- Interfaces ---
interface Expense {
  category: string;
  amount: string | number;
}

interface FinanceData {
  vehicleId: string;
  sales: string | number;
  expenses: Expense[];
  date: Timestamp | string;
  isDayOff?: boolean;
}

interface LogEntry {
  date: Date;
  vehicleId: string;
  vehicleLabel: string;
  type: 'Daily' | 'Service';
  income: number;
  expenses: number;
  description: string;
}

interface SummaryDetail {
  income: number;
  expenses: number;
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [summaryView, setSummaryView] = useState('month');
  const [includeAmortization, setIncludeAmortization] = useState(true);

  // Period Selections
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3));

  // Data States
  const [availableVehicles, setAvailableVehicles] = useState<{ label: string, value: string }[]>([]);
  const [data, setData] = useState({ income: 0, expenses: 0, net: 0 });
  const [details, setDetails] = useState<Record<string, SummaryDetail>>({});
  const [rawLogs, setRawLogs] = useState<LogEntry[]>([]);
  const [missingDays, setMissingDays] = useState<Record<string, number[]>>({});

  // UI Visibility
  const [monthMenuVisible, setMonthMenuVisible] = useState(false);
  const [quarterMenuVisible, setQuarterMenuVisible] = useState(false);
  const [yearMenuVisible, setYearMenuVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  
  // Drill Down States
  const [drillDownLogs, setDrillDownLogs] = useState<LogEntry[]>([]);
  const [drillDownTitle, setDrillDownTitle] = useState("");
  const [drillDownVisible, setDrillDownVisible] = useState(false);

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const quarters = [
    { label: 'Q1 (Jan-Mar)', value: 0 },
    { label: 'Q2 (Apr-Jun)', value: 1 },
    { label: 'Q3 (Jul-Sep)', value: 2 },
    { label: 'Q4 (Oct-Dec)', value: 3 },
  ];
  const goldColor = '#eeb909';

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'vehicles')), (snapshot) => {
      const vList = snapshot.docs.map(doc => ({ label: doc.data().name || 'Unnamed', value: doc.id }));
      setAvailableVehicles([{ label: 'All Units', value: 'all' }, ...vList]);
    });
    return () => unsubscribe();
  }, []);

  const fetchSummaryData = useCallback(async () => {
    if (availableVehicles.length === 0) return;
    setLoading(true);
    try {
      const now = new Date();
      let interval: { start: Date; end: Date };
      const refDate = new Date(selectedYear, (summaryView === 'quarter' ? selectedQuarter * 3 : selectedMonth), 1);
      
      if (summaryView === 'month') { interval = { start: startOfMonth(refDate), end: endOfMonth(refDate) }; }
      else if (summaryView === 'quarter') { interval = { start: startOfQuarter(refDate), end: endOfQuarter(refDate) }; }
      else { interval = { start: new Date(selectedYear, 0, 1), end: new Date(selectedYear, 11, 31, 23, 59, 59) }; }

      let totalInc = 0; let totalExp = 0;
      const detailTracker: Record<string, SummaryDetail> = {};
      const tempLogs: LogEntry[] = [];
      const recordsTracker: Record<string, Set<number>> = {};
      const dayOffTracker: Record<string, Set<number>> = {};
      
      const vehiclesToCheck = availableVehicles.filter(v => v.value !== 'all');
      vehiclesToCheck.forEach(v => { 
        recordsTracker[v.value] = new Set(); 
        dayOffTracker[v.value] = new Set(); 
      });

      // 1. Daily Finances
      const qFinances = vehicleFilter === 'all' ? query(collection(db, 'finances')) : query(collection(db, 'finances'), where('vehicleId', '==', vehicleFilter));
      const financeSnap = await getDocs(qFinances);
      
      financeSnap.forEach((doc) => {
        const d = doc.data() as FinanceData;
        const dDate = (d.date as Timestamp).seconds ? new Date((d.date as Timestamp).seconds * 1000) : new Date(d.date as string);
        
        if (isWithinInterval(dDate, interval)) {
          const vInfo = availableVehicles.find(v => v.value === d.vehicleId);
          const groupKey = summaryView === 'month' ? (vInfo?.label || 'Unknown') : months[dDate.getMonth()];
          if (!detailTracker[groupKey]) detailTracker[groupKey] = { income: 0, expenses: 0 };

          const dayNum = dDate.getDate();
          if (recordsTracker[d.vehicleId]) { 
            if (d.isDayOff) dayOffTracker[d.vehicleId].add(dayNum);
            else recordsTracker[d.vehicleId].add(dayNum); 
          }

          const incAmt = Number(d.sales || 0);
          let expAmt = 0;
          if (d.expenses) {
            d.expenses.forEach(e => {
              if ((e.category || "").toLowerCase().includes('amortization') && !includeAmortization) return;
              expAmt += Number(e.amount || 0);
            });
          }

          totalInc += incAmt; totalExp += expAmt;
          detailTracker[groupKey].income += incAmt; detailTracker[groupKey].expenses += expAmt;
          tempLogs.push({ date: dDate, vehicleId: d.vehicleId, vehicleLabel: vInfo?.label || 'Unknown', type: 'Daily', income: incAmt, expenses: expAmt, description: d.isDayOff ? 'Day Off' : 'Daily Sales' });
        }
      });

      // 2. Service History
      const vIds = vehicleFilter === 'all' ? vehiclesToCheck.map(v => v.value) : [vehicleFilter];
      for (const vId of vIds) {
        const sSnap = await getDocs(collection(db, 'vehicles', vId, 'service_history'));
        sSnap.forEach((sDoc) => {
          const sData = sDoc.data();
          const sDate = sData.date?.seconds ? new Date(sData.date.seconds * 1000) : parseISO(sData.date);
          if (isValid(sDate) && isWithinInterval(sDate, interval)) {
            const vInfo = availableVehicles.find(v => v.value === vId);
            const groupKey = summaryView === 'month' ? (vInfo?.label || 'Unknown') : months[sDate.getMonth()];
            if (!detailTracker[groupKey]) detailTracker[groupKey] = { income: 0, expenses: 0 };

            if ((sData.description || "").toLowerCase().includes('amortization') && !includeAmortization) return;
            const cost = Number(sData.cost || 0);
            totalExp += cost;
            detailTracker[groupKey].expenses += cost;
            tempLogs.push({ date: sDate, vehicleId: vId, vehicleLabel: vInfo?.label || 'Unknown', type: 'Service', income: 0, expenses: cost, description: sData.description || 'Repair/Service' });
          }
        });
      }

      // 3. Missing Days Logic
      if (summaryView === 'month') {
        const isCurrentMonthSelection = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
        const lastDayToCheck = isCurrentMonthSelection ? now.getDate() : interval.end.getDate();
        const gaps: Record<string, number[]> = {};

        vehiclesToCheck.forEach(v => {
          if (vehicleFilter !== 'all' && v.value !== vehicleFilter) return;
          const missing = [];
          for (let i = 1; i <= lastDayToCheck; i++) {
            if (!recordsTracker[v.value].has(i) && !dayOffTracker[v.value].has(i)) missing.push(i);
          }
          if (missing.length > 0) gaps[v.label] = missing;
        });
        setMissingDays(gaps);
      } else {
        setMissingDays({});
      }

      setDetails(detailTracker); setRawLogs(tempLogs);
      setData({ income: totalInc, expenses: totalExp, net: totalInc - totalExp });
    } catch (e) { console.error(e); } finally { setLoading(false); setRefreshing(false); }
  }, [availableVehicles, vehicleFilter, selectedMonth, selectedYear, selectedQuarter, summaryView, includeAmortization]);

  useEffect(() => { fetchSummaryData(); }, [fetchSummaryData]);

  const handleDrillDown = (groupKey: string) => {
    let filtered = [];
    if (summaryView === 'month') {
      filtered = rawLogs.filter(log => log.vehicleLabel === groupKey);
    } else {
      filtered = rawLogs.filter(log => months[log.date.getMonth()] === groupKey);
    }
    setDrillDownLogs(filtered.sort((a, b) => b.date.getTime() - a.date.getTime()));
    setDrillDownTitle(groupKey);
    setDrillDownVisible(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <Portal>
        {/* MODAL 1: BREAKDOWN PER VEHICLE/MONTH */}
        <Modal visible={detailModalVisible} onDismiss={() => setDetailModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Breakdown</Text>
          <Text style={styles.modalSubtitle}>Click a row to see detailed daily logs</Text>
          <Divider style={{ marginVertical: 10 }} />
          <ScrollView>
            {Object.entries(details).sort().map(([key, val]) => (
              <TouchableOpacity key={key} style={styles.detailItem} onPress={() => handleDrillDown(key)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailKey}>{key} ➔</Text>
                  <Text style={styles.detailSub}>Inc: ₱{val.income.toLocaleString()} | Exp: ₱{val.expenses.toLocaleString()}</Text>
                </View>
                <Text style={[styles.detailNet, { color: (val.income - val.expenses) >= 0 ? '#1B5E20' : '#B71C1C' }]}>
                  ₱{(val.income - val.expenses).toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Button mode="contained" onPress={() => setDetailModalVisible(false)} style={styles.closeBtn}>Close</Button>
        </Modal>

        {/* MODAL 2: DRILL DOWN DAILY LOGS */}
        <Modal visible={drillDownVisible} onDismiss={() => setDrillDownVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>{drillDownTitle} Logs</Text>
          <Divider style={{ marginVertical: 10 }} />
          <ScrollView>
            {drillDownLogs.map((log, i) => (
              <View key={i} style={styles.logRow}>
                <View style={styles.logDateBox}>
                  <Text style={styles.logDay}>{log.date.getDate()}</Text>
                  <Text style={styles.logMonthAbbr}>{months[log.date.getMonth()].substring(0, 3)}</Text>
                </View>
                <View style={{ flex: 1, paddingLeft: 10 }}>
                  <Text style={styles.logDesc} numberOfLines={1}>{log.description}</Text>
                  <Text style={styles.logType}>{log.type === 'Service' ? '🛠 Service History' : '🚚 Daily Transaction'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {log.income > 0 && <Text style={{ color: '#1B5E20', fontWeight: 'bold' }}>+₱{log.income.toLocaleString()}</Text>}
                  <Text style={{ color: '#B71C1C' }}>-₱{log.expenses.toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Button mode="outlined" onPress={() => setDrillDownVisible(false)} style={{ marginTop: 15 }}>Back</Button>
        </Modal>
      </Portal>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchSummaryData();}} tintColor={goldColor} />}>
        <Text style={[styles.headerTitle, { color: goldColor }]}>JollyG! Analytics</Text>
        
        <View style={styles.topRow}>
          <Menu visible={yearMenuVisible} onDismiss={() => setYearMenuVisible(false)} anchor={<Button mode="elevated" onPress={() => setYearMenuVisible(true)} icon="calendar" textColor="#333" style={styles.yearBtn}>{selectedYear}</Button>}>
            {[2025, 2026, 2027].map(y => <Menu.Item key={y} title={y.toString()} onPress={() => { setSelectedYear(y); setYearMenuVisible(false); }} />)}
          </Menu>
          <SegmentedButtons value={vehicleFilter} onValueChange={setVehicleFilter} buttons={availableVehicles.map(v => ({ label: v.label, value: v.value }))} style={{ flex: 1, marginLeft: 10 }} density="small" />
        </View>

        <Divider style={styles.divider} />
        
        <SegmentedButtons 
          density="small" 
          value={summaryView} 
          onValueChange={setSummaryView} 
          buttons={[{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }]} 
          style={{ marginBottom: 15 }} 
        />

        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          {summaryView === 'month' && (
            <Menu visible={monthMenuVisible} onDismiss={() => setMonthMenuVisible(false)} anchor={<Button mode="outlined" onPress={() => setMonthMenuVisible(true)} icon="calendar-month" textColor="#444" style={{ borderColor: goldColor }}>Month: {months[selectedMonth]}</Button>}>
              {months.map((m, i) => <Menu.Item key={m} title={m} onPress={() => { setSelectedMonth(i); setMonthMenuVisible(false); }} />)}
            </Menu>
          )}
          {summaryView === 'quarter' && (
            <Menu visible={quarterMenuVisible} onDismiss={() => setQuarterMenuVisible(false)} anchor={<Button mode="outlined" onPress={() => setQuarterMenuVisible(true)} icon="chart-pie" textColor="#444" style={{ borderColor: goldColor }}>Quarter: {quarters[selectedQuarter].label}</Button>}>
              {quarters.map((q) => <Menu.Item key={q.value} title={q.label} onPress={() => { setSelectedQuarter(q.value); setQuarterMenuVisible(false); }} />)}
            </Menu>
          )}
        </View>

        {loading && !refreshing ? <ActivityIndicator style={{ marginTop: 50 }} color={goldColor} size="large" /> : (
          <>
            <View style={styles.periodHeader}>
                <Text style={styles.periodMainLabel}>
                  {summaryView === 'month' ? months[selectedMonth] : summaryView === 'quarter' ? `Q${selectedQuarter + 1}` : selectedYear}
                </Text>
            </View>

            <View style={styles.cardContainer}>
              <SummaryCard title="Gross Income" value={data.income} color="#1B5E20" />
              <SummaryCard title="Total Expenses" value={data.expenses} color="#B71C1C" />
              <View style={[styles.netContainer, { backgroundColor: goldColor }]}>
                <Text style={styles.netLabel}>NET PROFIT</Text>
                <Text style={styles.netVal}>₱{data.net.toLocaleString()}</Text>
                <Button mode="text" textColor="#000" onPress={() => setDetailModalVisible(true)} labelStyle={{ fontWeight: '900', textDecorationLine: 'underline' }}>VIEW DETAILED BREAKDOWN</Button>
              </View>
            </View>

            <Card style={styles.filterCard} mode="contained">
              <Card.Content style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontWeight: 'bold' }}>Include Amortization</Text>
                  <Text style={{ fontSize: 11, color: '#888' }}>Monthly Unit Payments</Text>
                </View>
                <Checkbox status={includeAmortization ? 'checked' : 'unchecked'} onPress={() => setIncludeAmortization(!includeAmortization)} color={goldColor} />
              </Card.Content>
            </Card>

            {summaryView === 'month' && Object.keys(missingDays).length > 0 && (
              <View style={{ marginTop: 25 }}>
                <Text style={styles.missingTitle}>⚠️ UNLOGGED DAYS ({months[selectedMonth]})</Text>
                {Object.entries(missingDays).map(([vName, days]) => (
                  <Card key={vName} style={styles.missingCard}>
                    <Card.Content>
                      <Text style={{ fontWeight: '900', color: '#333' }}>{vName}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                        {days.map(d => <View key={d} style={styles.dayBadge}><Text style={styles.dayText}>{d}</Text></View>)}
                      </View>
                    </Card.Content>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ title, value, color }: { title: string, value: number, color: string }) {
  return (
    <Card style={styles.miniCard} mode="elevated">
      <Card.Content>
        <Text style={styles.miniLabel}>{title.toUpperCase()}</Text>
        <Text style={[styles.miniValue, { color }]}>₱{value.toLocaleString()}</Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  headerTitle: { fontSize: 28, fontWeight: '900', marginBottom: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  yearBtn: { backgroundColor: '#fff', borderRadius: 8 },
  divider: { marginVertical: 20 },
  periodHeader: { alignItems: 'center', marginBottom: 25 },
  periodMainLabel: { fontSize: 32, fontWeight: '900' },
  cardContainer: { gap: 12 },
  miniCard: { backgroundColor: '#FFF', borderRadius: 12 },
  miniLabel: { fontSize: 11, fontWeight: '900', color: '#888' },
  miniValue: { fontSize: 26, fontWeight: 'bold' },
  netContainer: { padding: 20, borderRadius: 15, alignItems: 'center', marginTop: 10, elevation: 4 },
  netLabel: { fontWeight: '900', letterSpacing: 1.5 },
  netVal: { fontSize: 38, fontWeight: '900' },
  filterCard: { marginTop: 15, borderRadius: 12, backgroundColor: '#fff' },
  // Modal
  modalContent: { backgroundColor: 'white', padding: 20, margin: 10, borderRadius: 16, height: '85%', width: '95%', alignSelf: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900' },
  modalSubtitle: { fontSize: 12, color: '#666', marginBottom: 5 },
  detailItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  detailKey: { fontSize: 17, fontWeight: '900' },
  detailSub: { fontSize: 13, color: '#666' },
  detailNet: { fontSize: 18, fontWeight: 'bold' },
  closeBtn: { marginTop: 15, backgroundColor: '#eeb909' },
  // Logs & Missing Days
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  logDateBox: { width: 45, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, padding: 5 },
  logDay: { fontSize: 18, fontWeight: '900' },
  logMonthAbbr: { fontSize: 10, textTransform: 'uppercase' },
  logDesc: { fontSize: 14, fontWeight: '700' },
  logType: { fontSize: 11, color: '#888' },
  missingTitle: { fontSize: 13, fontWeight: '900', color: '#B71C1C', marginBottom: 10 },
  missingCard: { marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#B71C1C' },
  dayBadge: { backgroundColor: '#FEEBEE', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  dayText: { fontSize: 11, fontWeight: 'bold', color: '#B71C1C' }
});