import {
  eachMonthOfInterval,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfYear
} from 'date-fns';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Text as RNText, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { LineChart } from "react-native-chart-kit";
import {
  ActivityIndicator,
  Button,
  Card,
  Checkbox,
  Divider,
  Menu,
  SegmentedButtons,
  Text,
  useTheme
} from 'react-native-paper';
import { db } from '../../firebaseConfig';

export default function ReportsScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);

  // Filters
  const [reportView, setReportView] = useState('month'); // Defaulting to Month (Full Year Graph)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3));
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [includeAmortization, setIncludeAmortization] = useState(true);

  // UI States
  const [availableVehicles, setAvailableVehicles] = useState<{ label: string, value: string }[]>([]);
  const [yearMenuVisible, setYearMenuVisible] = useState(false);
  const [quarterMenuVisible, setQuarterMenuVisible] = useState(false);
  const [chartData, setChartData] = useState<any>(null);

  // Constants
  const goldColor = '#eeb909';
  const incomeColor = '#2E7D32';
  const expenseColor = '#C62828';
  const quarters = [
    { label: 'Q1 (Jan-Mar)', value: 0 },
    { label: 'Q2 (Apr-Jun)', value: 1 },
    { label: 'Q3 (Jul-Sep)', value: 2 },
    { label: 'Q4 (Oct-Dec)', value: 3 },
  ];
  const years = [2025, 2026, 2027];

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'vehicles')), (snapshot) => {
      const vList = snapshot.docs.map(doc => ({ label: doc.data().name || 'Unnamed', value: doc.id }));
      setAvailableVehicles([{ label: 'All Units', value: 'all' }, ...vList]);
    });
    return () => unsubscribe();
  }, []);

  const fetchReportData = useCallback(async () => {
    if (availableVehicles.length === 0) return;
    setLoading(true);
    try {
      let start: Date, end: Date, formatStr: string;
      const buckets: Record<string, { inc: number; exp: number }> = {};

      if (reportView === 'month') {
        // "MONTH" TAB LOGIC: Shows Jan - Dec for the selected year
        start = startOfYear(new Date(selectedYear, 0, 1));
        end = endOfYear(new Date(selectedYear, 0, 1));
        formatStr = 'MMM';
        eachMonthOfInterval({ start, end }).forEach(d => {
            buckets[format(d, formatStr)] = { inc: 0, exp: 0 };
        });
      } else if (reportView === 'year') {
        // "YEARS" TAB LOGIC: Shows 2025, 2026, 2027 comparison
        start = new Date(Math.min(...years), 0, 1);
        end = new Date(Math.max(...years), 11, 31, 23, 59, 59);
        formatStr = 'yyyy';
        years.forEach(y => buckets[y.toString()] = { inc: 0, exp: 0 });
      } else {
        // QUARTER LOGIC: Shows the 3 months of the selected quarter
        const qStartMonth = selectedQuarter * 3;
        start = new Date(selectedYear, qStartMonth, 1);
        end = new Date(selectedYear, qStartMonth + 3, 0, 23, 59, 59);
        formatStr = 'MMM';
        eachMonthOfInterval({ start, end }).forEach(d => {
            buckets[format(d, formatStr)] = { inc: 0, exp: 0 };
        });
      }

      const qFinances = vehicleFilter === 'all'
        ? query(collection(db, 'finances'))
        : query(collection(db, 'finances'), where('vehicleId', '==', vehicleFilter));

      const financeSnap = await getDocs(qFinances);
      financeSnap.forEach(doc => {
        const d = doc.data();
        const dDate = d.date?.seconds ? new Date(d.date.seconds * 1000) : new Date(d.date);

        if (isValid(dDate) && dDate >= start && dDate <= end) {
          const key = format(dDate, formatStr);
          if (buckets[key]) {
            buckets[key].inc += parseFloat(d.sales || '0');
            if (d.expenses && Array.isArray(d.expenses)) {
              d.expenses.forEach((exp: any) => {
                if (!includeAmortization && (exp.category || "").toLowerCase().includes('amortization')) return;
                buckets[key].exp += parseFloat(exp.amount || '0');
              });
            }
          }
        }
      });

      const vIds = vehicleFilter === 'all' ? availableVehicles.filter(v => v.value !== 'all').map(v => v.value) : [vehicleFilter];
      for (const vId of vIds) {
        const sSnap = await getDocs(collection(db, 'vehicles', vId, 'service_history'));
        sSnap.forEach((doc) => {
          const sData = doc.data();
          const sDate = sData.date?.seconds ? new Date(sData.date.seconds * 1000) : parseISO(sData.date);
          if (isValid(sDate) && sDate >= start && sDate <= end) {
            const key = format(sDate, formatStr);
            if (buckets[key]) {
              const isAmort = sData.isAmortization === true || sData.description?.toLowerCase().includes('amortization');
              if (!includeAmortization && isAmort) return;
              buckets[key].exp += parseFloat(sData.cost || '0');
            }
          }
        });
      }

      setChartData({
        labels: Object.keys(buckets),
        datasets: [
          { data: Object.values(buckets).map(b => b.inc), color: () => incomeColor, strokeWidth: 3 },
          { data: Object.values(buckets).map(b => b.exp), color: () => expenseColor, strokeWidth: 3 }
        ],
        legend: ["Income", "Expenses"]
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [availableVehicles, reportView, selectedYear, selectedQuarter, vehicleFilter, includeAmortization]);

  useEffect(() => { fetchReportData(); }, [fetchReportData]);

  const getPeriodLabel = () => {
    if (reportView === 'month') return `Yearly Breakdown ${selectedYear}`;
    if (reportView === 'quarter') return `${quarters[selectedQuarter].label} ${selectedYear}`;
    return `Annual Comparison (${years[0]} - ${years[years.length - 1]})`;
  };

  const formatValue = (val: number) => {
    if (val === 0) return null;
    return val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Math.round(val).toString();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.header, { color: goldColor }]}>Visual Analysis</Text>

        <View style={styles.topRow}>
          {reportView !== 'year' && (
             <Menu
             visible={yearMenuVisible}
             onDismiss={() => setYearMenuVisible(false)}
             anchor={
               <Button mode="elevated" onPress={() => setYearMenuVisible(true)} icon="calendar" textColor="#222" style={styles.filterBtn}>
                 {selectedYear}
               </Button>
             }
           >
             {years.map(y => <Menu.Item key={y} title={y.toString()} onPress={() => { setSelectedYear(y); setYearMenuVisible(false); }} />)}
           </Menu>
          )}
          
          <SegmentedButtons
            value={vehicleFilter}
            onValueChange={setVehicleFilter}
            buttons={availableVehicles.length > 0 ? availableVehicles.map(v => ({ label: v.label, value: v.value })) : [{ label: '...', value: 'all' }]}
            style={{ flex: 1, marginLeft: reportView === 'year' ? 0 : 10 }}
            density="small"
          />
        </View>

        <Divider style={styles.divider} />

        <SegmentedButtons
          value={reportView}
          onValueChange={setReportView}
          buttons={[
            { value: 'month', label: 'Month' }, 
            { value: 'quarter', label: 'Quarter' }, 
            { value: 'year', label: 'Years' }
          ]}
          style={{ marginBottom: 15 }}
        />

        <View style={styles.subSelectorRow}>
          {reportView === 'quarter' && (
            <Menu visible={quarterMenuVisible} onDismiss={() => setQuarterMenuVisible(false)} 
              anchor={
                <Button mode="outlined" onPress={() => setQuarterMenuVisible(true)} icon="chart-pie" textColor="#333" style={{ borderColor: goldColor }}>
                  {quarters[selectedQuarter].label}
                </Button>
              }
            >
              {quarters.map((q) => <Menu.Item key={q.value} title={q.label} onPress={() => { setSelectedQuarter(q.value); setQuarterMenuVisible(false); }} />)}
            </Menu>
          )}
        </View>

        {loading || !chartData ? (
          <ActivityIndicator style={{ marginTop: 50 }} color={goldColor} size="large" />
        ) : (
          <>
            <View style={styles.periodHeader}>
                <Text style={styles.periodSubtitle}>{reportView === 'year' ? 'Multi-Year Growth' : 'Financial Trends'}</Text>
                <Text style={styles.periodMainLabel}>{getPeriodLabel()}</Text>
            </View>

            <Card style={styles.chartCard} mode="elevated">
              <Card.Title
                title={reportView === 'year' ? "YEARLY GROWTH" : "MONTHLY CASHFLOW"}
                titleStyle={styles.chartTitle}
                subtitle={reportView === 'year' ? "Comparison by year" : `Data for ${selectedYear}`}
                subtitleStyle={styles.chartSubtitle}
              />
              <Card.Content>
                <LineChart
                  data={chartData}
                  width={Dimensions.get("window").width - 30}
                  height={300}
                  chartConfig={{
                    backgroundColor: '#ffffff',
                    backgroundGradientFrom: '#ffffff',
                    backgroundGradientTo: '#ffffff',
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    labelColor: () => '#666',
                    propsForDots: { r: "5", strokeWidth: "2", stroke: "#fff" },
                    propsForBackgroundLines: { stroke: "#F2F2F2" }
                  }}
                  renderDotContent={({ x, y, index, indexData }) => {
                    const label = formatValue(indexData);
                    return label ? (
                      <RNText key={`${index}-${indexData}`} style={[styles.dotLabel, { top: y - 25, left: x - 15 }]}>
                        {label}
                      </RNText>
                    ) : null;
                  }}
                  bezier
                  fromZero
                  style={styles.chart}
                />
              </Card.Content>
            </Card>

            <Card style={styles.toggleCard} mode="contained">
              <Card.Content style={styles.toggleContent}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.labelBold}>Include Amortizations</Text>
                  <Text variant="bodySmall" style={styles.labelSub}>Monthly unit payments</Text>
                </View>
                <Checkbox status={includeAmortization ? 'checked' : 'unchecked'} onPress={() => setIncludeAmortization(!includeAmortization)} color={goldColor} />
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 15, paddingBottom: 40 },
  header: { fontSize: 28, fontWeight: '900', marginBottom: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  filterBtn: { borderRadius: 8, backgroundColor: '#fff', elevation: 2 },
  divider: { marginVertical: 20, backgroundColor: '#E0E0E0' },
  subSelectorRow: { marginBottom: 10, alignItems: 'center', height: 45 },
  periodHeader: { alignItems: 'center', marginBottom: 25 },
  periodSubtitle: { fontSize: 11, fontWeight: '900', color: '#888', textTransform: 'uppercase' },
  periodMainLabel: { fontSize: 24, fontWeight: '900', color: '#000', textAlign: 'center' },
  chartCard: { borderRadius: 15, elevation: 4, backgroundColor: '#FFF', paddingBottom: 10, marginBottom: 20 },
  chartTitle: { fontSize: 18, fontWeight: '900', color: '#222' },
  chartSubtitle: { fontSize: 12, color: '#888' },
  chart: { marginVertical: 15, borderRadius: 16, marginLeft: -15 },
  toggleCard: { borderRadius: 12, backgroundColor: '#FFF', borderLeftWidth: 4, borderLeftColor: '#eeb909', elevation: 2 },
  toggleContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelBold: { fontWeight: '900', fontSize: 16, color: '#222' },
  labelSub: { fontSize: 12, color: '#666' },
  dotLabel: { 
    position: 'absolute', fontSize: 10, fontWeight: '900', color: '#FFF', 
    textAlign: 'center', width: 36, backgroundColor: 'rgba(0,0,0,0.6)', 
    borderRadius: 4, padding: 2 
  }
});