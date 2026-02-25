import { addDays, format, startOfWeek, subDays } from 'date-fns';
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native'; // Added ScrollView
import {
  Button,
  Card,
  DefaultTheme,
  IconButton,
  Menu,
  PaperProvider,
  Switch,
  Text,
  TextInput
} from 'react-native-paper';

import { auth, db } from '../../firebaseConfig';

// FORCE Light Theme for consistency
const lightTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: '#eeb909',
    background: '#F8F9FA', 
    surface: '#FFFFFF',
    outline: '#BBBBBB',
  },
};

interface Vehicle {
  id: string;
  name: string;
}

interface ExpenseItem {
  id: string;
  category: string;
  amount: string;
}

interface DayData {
  sales: string;
  isDayOff: boolean;
  expenses: ExpenseItem[]; 
}

export default function TabTwoScreen() {
  const [vehicleMenuVisible, setVehicleMenuVisible] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  const [records, setRecords] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(false);
  const [expenseTypes, setExpenseTypes] = useState<string[]>([]);
  const [activeExpenseMenu, setActiveExpenseMenu] = useState<{ dateKey: string; expenseId: string } | null>(null);

  const goldColor = '#eeb909';

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'vehicles')), (snapshot) => {
      const vehicleList = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name 
      })) as Vehicle[];
      setVehicles(vehicleList);
      if (vehicleList.length > 0 && !selectedVehicle) {
        setSelectedVehicle(vehicleList[0]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'expense_types')), (snapshot) => {
      const types = snapshot.docs.map(doc => doc.data().name);
      setExpenseTypes(types.length > 0 ? types : ['Advertisement', 'Gas', 'Food', 'Maintenance']);
    });
    return () => unsubscribe();
  }, []);

  const loadWeeklyData = useCallback(async () => {
    if (!selectedVehicle) return;
    const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const dayStrings = days.map(d => format(d, 'yyyy-MM-dd'));
    
    const q = query(
      collection(db, 'finances'), 
      where('vehicleId', '==', selectedVehicle.id), 
      where('date', 'in', dayStrings)
    );

    try {
      const querySnapshot = await getDocs(q);
      const loadedRecords: Record<string, DayData> = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedRecords[data.date] = { 
          sales: data.sales || '', 
          isDayOff: data.isDayOff ?? false, 
          expenses: data.expenses || [] 
        };
      });

      const completeWeeklyData: Record<string, DayData> = {};
      days.forEach(dayDate => {
        const dateKey = format(dayDate, 'yyyy-MM-dd');
        const dayName = format(dayDate, 'EEEE'); 
        
        if (loadedRecords[dateKey]) {
          completeWeeklyData[dateKey] = loadedRecords[dateKey];
        } else {
          let defaultDayOff = dayName === 'Friday' || 
            (selectedVehicle.name.toUpperCase() === 'J1' && dayName === 'Wednesday') || 
            (selectedVehicle.name.toUpperCase() === 'J2' && dayName === 'Tuesday');

          completeWeeklyData[dateKey] = {
            sales: '',
            isDayOff: defaultDayOff,
            expenses: [{ id: 'default-adv', category: 'Advertisement', amount: '400' }], 
          };
        }
      });
      setRecords(completeWeeklyData);
    } catch (error) {
      console.error("Error loading weekly data:", error);
    }
  }, [selectedVehicle, weekStart]);

  useEffect(() => {
    loadWeeklyData();
  }, [loadWeeklyData]);

  const updateSales = (dateKey: string, val: string) => {
    setRecords(prev => ({ ...prev, [dateKey]: { ...prev[dateKey], sales: val } }));
  };

  const toggleDayOff = (dateKey: string, val: boolean) => {
    setRecords(prev => ({ 
      ...prev, 
      [dateKey]: { 
        ...prev[dateKey], 
        isDayOff: val,
        sales: val ? '0' : prev[dateKey].sales 
      } 
    }));
  };

  const handleSave = async () => {
    if (!selectedVehicle) return Alert.alert("Error", "Select a vehicle first");
    setLoading(true);
    try {
      const batchPromises = Object.keys(records).map(async (dateKey) => {
        const docRef = doc(db, 'finances', `${selectedVehicle.id}_${dateKey}`);
        await setDoc(docRef, {
          ...records[dateKey],
          vehicleId: selectedVehicle.id,
          date: dateKey,
          userId: auth.currentUser?.uid,
          updatedAt: new Date(),
        }, { merge: true });
      });
      await Promise.all(batchPromises);
      Alert.alert("Success", "Weekly records saved!");
    } catch (error) {
      Alert.alert("Error", "Failed to save data");
    } finally {
      setLoading(false);
    }
  };

  const totalIncome = Object.values(records).reduce((sum, r) => sum + (parseFloat(r.sales) || 0), 0);
  const totalExpenses = Object.values(records).reduce((sum, r) => sum + r.expenses.reduce((dSum, exp) => dSum + (parseFloat(exp.amount) || 0), 0), 0);

  return (
    <PaperProvider theme={lightTheme}>
      <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}> 
        {/* Replaced ParallaxScrollView with standard ScrollView */}
        <ScrollView style={styles.contentContainer}>
          <View style={styles.topRow}>
            <Text style={styles.headerTitle}>Weekly Log</Text>
            <Menu
              visible={vehicleMenuVisible}
              onDismiss={() => setVehicleMenuVisible(false)}
              anchor={
                <Button mode="elevated" onPress={() => setVehicleMenuVisible(true)} textColor="#222" style={styles.vehicleBtn} icon="car">
                  {selectedVehicle ? selectedVehicle.name : 'Select'}
                </Button>
              }>
              {vehicles.map(v => (
                <Menu.Item key={v.id} title={v.name} onPress={() => { setSelectedVehicle(v); setVehicleMenuVisible(false); }} />
              ))}
            </Menu>
          </View>

          <View style={styles.weekSelector}>
            <IconButton icon="chevron-left" iconColor={goldColor} onPress={() => setWeekStart(subDays(weekStart, 7))} />
            <Text style={styles.dateRange}>{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}</Text>
            <IconButton icon="chevron-right" iconColor={goldColor} onPress={() => setWeekStart(addDays(weekStart, 7))} />
          </View>

          <View style={styles.summaryGrid}>
            <SummaryMiniCard label="INCOME" value={totalIncome} color="#2E7D32" />
            <SummaryMiniCard label="EXPENSES" value={totalExpenses} color="#C62828" />
            <SummaryMiniCard label="NET" value={totalIncome - totalExpenses} color="#000" isNet />
          </View>

          <Button 
            mode="contained" 
            onPress={handleSave} 
            loading={loading} 
            style={styles.saveBtn} 
            buttonColor={goldColor} 
            textColor="#000" 
            labelStyle={{ fontWeight: '900', fontSize: 16 }}
          >
            SAVE WEEKLY RECORDS
          </Button>

          {Array.from({ length: 7 }).map((_, i) => {
            const day = addDays(weekStart, i);
            const dateKey = format(day, 'yyyy-MM-dd');
            const data = records[dateKey] || { sales: '', isDayOff: false, expenses: [] };

            return (
              <Card key={dateKey} style={[styles.dayCard, data.isDayOff && styles.dayOffCard]} mode="elevated">
                <Card.Content style={styles.cardContentPatch}>
                  <View style={styles.dayHeader}>
                    <View>
                      <Text style={[styles.dayName, data.isDayOff && { color: '#BBB' }]}>{format(day, 'EEEE')}</Text>
                      <Text style={styles.dayDate}>{format(day, 'MMMM d')}</Text>
                    </View>
                    <View style={styles.dayOffToggle}>
                      <Text style={styles.dayOffText}>OFF DAY</Text>
                      <Switch value={data.isDayOff} onValueChange={(val) => toggleDayOff(dateKey, val)} color={goldColor} />
                    </View>
                  </View>

                  {!data.isDayOff ? (
                    <View style={{ marginTop: 15 }}>
                      <TextInput
                        mode="outlined"
                        label="Daily Sales Revenue"
                        value={data.sales}
                        onChangeText={(v) => updateSales(dateKey, v)}
                        keyboardType="numeric"
                        activeOutlineColor={goldColor}
                        textColor="#000"
                        style={styles.input}
                        outlineStyle={{ borderWidth: 2 }}
                        left={<TextInput.Icon icon="cash-multiple" color={goldColor} />}
                      />
                      
                      <Text style={styles.expenseLabel}>DAILY EXPENSES</Text>
                      {data.expenses.map((exp) => (
                        <View key={exp.id} style={styles.expenseRow}>
                          <Menu
                            visible={activeExpenseMenu?.dateKey === dateKey && activeExpenseMenu?.expenseId === exp.id}
                            onDismiss={() => setActiveExpenseMenu(null)}
                            anchor={
                              <Button 
                                mode="outlined" 
                                onPress={() => setActiveExpenseMenu({ dateKey, expenseId: exp.id })}
                                style={styles.catBtn}
                                labelStyle={{ fontSize: 10, fontWeight: '900' }}
                                contentStyle={{ height: 40 }}
                                textColor="#333"
                              >
                                {exp.category}
                              </Button>
                            }>
                            {expenseTypes.map(t => (
                              <Menu.Item key={t} title={t} onPress={() => {
                                setRecords(prev => ({
                                  ...prev, 
                                  [dateKey]: {
                                    ...prev[dateKey], 
                                    expenses: prev[dateKey].expenses.map(e => e.id === exp.id ? { ...e, category: t } : e)
                                  }
                                }));
                                setActiveExpenseMenu(null);
                              }} />
                            ))}
                          </Menu>
                          <TextInput
                            mode="outlined"
                            placeholder="0"
                            value={exp.amount}
                            onChangeText={(v) => setRecords(prev => ({
                              ...prev, 
                              [dateKey]: {
                                ...prev[dateKey], 
                                expenses: prev[dateKey].expenses.map(e => e.id === exp.id ? { ...e, amount: v } : e)
                              }
                            }))}
                            style={styles.amountInput}
                            textColor="#000"
                            keyboardType="numeric"
                            activeOutlineColor={goldColor}
                            outlineStyle={{ borderWidth: 1.5 }}
                          />
                          <IconButton icon="minus-circle" iconColor="#D32F2F" size={20} onPress={() => setRecords(prev => ({
                            ...prev, 
                            [dateKey]: {
                              ...prev[dateKey], 
                              expenses: prev[dateKey].expenses.filter(e => e.id !== exp.id)
                            }
                          }))} />
                        </View>
                      ))}
                      <Button 
                        icon="plus-thick" 
                        onPress={() => setRecords(prev => ({
                          ...prev, 
                          [dateKey]: {
                            ...prev[dateKey], 
                            expenses: [...prev[dateKey].expenses, { id: Date.now().toString(), category: 'Gas', amount: '' }]
                          }
                        }))} 
                        textColor={goldColor}
                        labelStyle={{ fontWeight: '900', fontSize: 13 }}
                        compact
                      >
                        ADD EXPENSE ITEM
                      </Button>
                    </View>
                  ) : (
                    <View style={styles.restDayBox}>
                      <Text style={styles.restDayText}>REST DAY - LOGS DISABLED</Text>
                    </View>
                  )}
                </Card.Content>
              </Card>
            );
          })}
        </ScrollView>
      </View>
    </PaperProvider>
  );
}

function SummaryMiniCard({ label, value, color, isNet }: any) {
  return (
    <View style={[styles.miniCard, isNet && styles.netMiniCard]}>
      <Text style={[styles.miniLabel, isNet && { color: '#000' }]}>{label}</Text>
      <Text style={[styles.miniValue, { color }]}>₱{value.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: { 
    backgroundColor: '#F8F9FA', 
    paddingTop: 60, // Added padding to avoid Notch/Dynamic Island
    paddingBottom: 40 
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 5 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#eeb909', letterSpacing: -1 },
  vehicleBtn: { borderRadius: 8, backgroundColor: '#fff', elevation: 2 },
  weekSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  dateRange: { fontSize: 16, fontWeight: '800', color: '#222' },
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', marginHorizontal: 16, padding: 15, borderRadius: 12, elevation: 4, marginBottom: 15 },
  miniCard: { alignItems: 'center' },
  netMiniCard: { backgroundColor: '#FFECB3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  miniLabel: { fontSize: 9, color: '#888', fontWeight: '900', letterSpacing: 0.5, marginBottom: 2 },
  miniValue: { fontSize: 17, fontWeight: '900' },
  saveBtn: { marginHorizontal: 16, marginBottom: 20, borderRadius: 12, height: 52, justifyContent: 'center', elevation: 3 },
  dayCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 14, borderLeftWidth: 6, borderLeftColor: '#eeb909', elevation: 2 },
  dayOffCard: { backgroundColor: '#F5F5F5', borderLeftColor: '#E0E0E0', elevation: 1 },
  cardContentPatch: { paddingVertical: 12 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName: { fontSize: 22, fontWeight: '900', color: '#111', letterSpacing: -0.5 },
  dayDate: { fontSize: 13, color: '#eeb909', fontWeight: '800' },
  dayOffToggle: { alignItems: 'center' },
  dayOffText: { fontSize: 8, color: '#666', fontWeight: '900', marginBottom: 2 },
  input: { backgroundColor: '#fff', marginBottom: 8, fontSize: 18, fontWeight: '800', height: 50 },
  expenseLabel: { fontSize: 10, fontWeight: '900', color: '#777', marginTop: 10, marginBottom: 8, letterSpacing: 1 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  catBtn: { flex: 1, marginRight: 6, backgroundColor: '#F1F3F4', borderColor: '#DADCE0' },
  amountInput: { width: 100, height: 42, backgroundColor: '#fff', fontSize: 16, fontWeight: '800' },
  restDayBox: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20 },
  restDayText: { color: '#CCC', fontSize: 12, fontWeight: '900', letterSpacing: 1 }
});