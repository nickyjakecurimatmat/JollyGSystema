import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, isValid, parseISO } from 'date-fns';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  DefaultTheme,
  Divider,
  IconButton,
  Menu,
  Modal,
  PaperProvider,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { db } from '../../firebaseConfig';

// Brand Identity Constants
const GOLD = '#eeb909';
const CHARCOAL = '#1C1C1E';
const BG_GRAY = '#F2F2F7';
const SUCCESS_GREEN = '#2E7D32';

const theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: GOLD,
    accent: CHARCOAL,
    background: BG_GRAY,
    surface: '#FFFFFF',
    outline: '#E5E5EA',
    text: CHARCOAL,
  },
};

interface ServiceRecord {
  id: string;
  date: string;
  description: string;
  cost: string;
  isAmortization?: boolean;
}

interface Vehicle {
  id: string;
  name: string;
  plateNumber: string;
  chassisNo: string;
  ltrbDate: string;
  registeredDate: string;
  isArchived?: boolean;
}

export default function VehiclesScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [visible, setVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    name: '',
    plate: '',
    chassis: '',
    ltrb: new Date().toISOString(),
    regDate: new Date().toISOString(),
  });

  const [serviceModal, setServiceModal] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [history, setHistory] = useState<ServiceRecord[]>([]);
  const [newService, setNewService] = useState({
    desc: '',
    cost: '',
    date: new Date().toISOString(),
  });

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState<'ltrb' | 'reg' | 'service' | null>(null);

  useEffect(() => {
    const qVehicles = query(collection(db, 'vehicles'), orderBy('name'));
    const unsubVehicles = onSnapshot(qVehicles, (snapshot) => {
      const vList = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Vehicle))
        .filter((v) => v.isArchived !== true);
      setVehicles(vList);
      setLoading(false);
    });

    const unsubCats = onSnapshot(doc(db, 'vehicle_categories', 'nlPVCM9YfprvjXESXMo0'), (docSnap) => {
      if (docSnap.exists()) {
        const list = docSnap.data().vehicle_categories || [];
        setCategories(list);
        if (list.length > 0) setNewService((prev) => ({ ...prev, desc: list[0] }));
      }
    });

    return () => {
      unsubVehicles();
      unsubCats();
    };
  }, []);

  const toDate = (value: string | undefined | null) => {
    if (!value) return new Date();
    try {
      const parsed = parseISO(value);
      return isValid(parsed) ? parsed : new Date();
    } catch (e) {
      return new Date();
    }
  };

  const safeFormat = (isoString: string | undefined | null, formatStr: string) => {
    if (!isoString) return 'N/A';
    try {
      const date = parseISO(isoString);
      return isValid(date) ? format(date, formatStr) : 'N/A';
    } catch (e) {
      return 'N/A';
    }
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(null);
    if (event.type === 'dismissed' || !selectedDate) return;

    const iso = selectedDate.toISOString();
    if (showPicker === 'reg') setForm((prev) => ({ ...prev, regDate: iso }));
    else if (showPicker === 'ltrb') setForm((prev) => ({ ...prev, ltrb: iso }));
    else if (showPicker === 'service') setNewService((prev) => ({ ...prev, date: iso }));
  };

  const handleSaveVehicle = async () => {
    if (!form.name.trim()) return Alert.alert('Required', 'Vehicle name is required.');
    const data = {
      name: form.name,
      plateNumber: form.plate,
      chassisNo: form.chassis,
      ltrbDate: form.ltrb,
      registeredDate: form.regDate,
      isArchived: false,
    };
    try {
      if (editMode && selectedVehicle) {
        await updateDoc(doc(db, 'vehicles', selectedVehicle.id), data);
      } else {
        await addDoc(collection(db, 'vehicles'), { ...data, createdAt: serverTimestamp() });
      }
      setVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Save failed');
    }
  };

  const handleArchiveVehicle = (v: Vehicle) => {
    Alert.alert('Archive Unit', `Archive ${v.name}? It will be hidden from the active list.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'vehicles', v.id), { isArchived: true });
          } catch (e) {
            Alert.alert('Error', 'Could not archive vehicle');
          }
        },
      },
    ]);
  };

  const openServiceHistory = (v: Vehicle) => {
    setSelectedVehicle(v);
    setServiceModal(true);
    setEditingServiceId(null);
    const q = query(collection(db, 'vehicles', v.id, 'service_history'), orderBy('date', 'desc'));
    onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceRecord)));
    });
  };

  const addOrUpdateService = async () => {
    if (!newService.desc || !selectedVehicle) return;
    try {
      const ref = collection(db, 'vehicles', selectedVehicle.id, 'service_history');
      const isAmort = newService.desc.toLowerCase().includes('amortization');
      const payload = {
        description: newService.desc,
        cost: newService.cost,
        date: newService.date,
        isAmortization: isAmort,
      };

      if (editingServiceId) {
        await updateDoc(doc(db, 'vehicles', selectedVehicle.id, 'service_history', editingServiceId), payload);
        setEditingServiceId(null);
      } else {
        await addDoc(ref, payload);
      }
      setNewService({ desc: categories[0] || '', cost: '', date: new Date().toISOString() });
    } catch (e) {
      Alert.alert('Error', 'Save failed');
    }
  };

  const deleteServiceLog = (logId: string) => {
    if (!selectedVehicle) return;
    Alert.alert('Delete Entry', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'vehicles', selectedVehicle.id, 'service_history', logId));
            if (editingServiceId === logId) setEditingServiceId(null);
          } catch (e) {
            Alert.alert('Error', 'Could not delete');
          }
        },
      },
    ]);
  };

  const totalCost = history.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);

  return (
    <PaperProvider theme={theme}>
      <StatusBar barStyle="dark-content" />
      <Portal>
        <ScrollView style={styles.mainContainer} contentContainerStyle={styles.scrollContent}>
          {/* Header Section */}
          <View style={styles.topRow}>
            <View>
              <Text variant="headlineLarge" style={styles.headerTitle}>Fleet</Text>
              <Text style={styles.subHeader}>{vehicles.length} Units Active</Text>
            </View>
            <IconButton
              icon="plus"
              mode="contained"
              containerColor={GOLD}
              iconColor={CHARCOAL}
              size={32}
              onPress={() => {
                setEditMode(false);
                setForm({
                  name: '', plate: '', chassis: '',
                  ltrb: new Date().toISOString(),
                  regDate: new Date().toISOString(),
                });
                setVisible(true);
              }}
              style={styles.addBtn}
            />
          </View>

          {loading ? (
            <ActivityIndicator animating color={GOLD} size="large" style={{ marginTop: 80 }} />
          ) : (
            vehicles.map((v) => (
              <Card key={v.id} style={styles.vCard} mode="elevated">
                <View style={styles.cardInternalWrapper}>
                  <View style={[styles.cardHighlight, { backgroundColor: GOLD }]} />
                  <Card.Content style={styles.cardPadding}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.vName}>{v.name}</Text>
                        <Text style={styles.vPlate}>{v.plateNumber || 'NO PLATE'}</Text>
                      </View>
                      <View style={styles.cardActionIcons}>
                        <IconButton
                          icon="pencil-outline"
                          iconColor="#8E8E93"
                          size={22}
                          onPress={() => {
                            setSelectedVehicle(v);
                            setForm({
                              name: v.name, plate: v.plateNumber, chassis: v.chassisNo,
                              ltrb: v.ltrbDate, regDate: v.registeredDate,
                            });
                            setEditMode(true);
                            setVisible(true);
                          }}
                        />
                        <IconButton icon="archive-outline" iconColor="#FF3B30" size={22} onPress={() => handleArchiveVehicle(v)} />
                      </View>
                    </View>

                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, styles.badgeReg]}>
                        <Text style={[styles.badgeText, { color: SUCCESS_GREEN }]}>
                          REG: {safeFormat(v.registeredDate, 'MM/dd/yy')}
                        </Text>
                      </View>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          LTFRB: {safeFormat(v.ltrbDate, 'MM/dd/yy')}
                        </Text>
                      </View>
                    </View>

                    <Divider style={styles.divider} />

                    <Button
                      mode="contained"
                      icon="receipt-text-outline"
                      onPress={() => openServiceHistory(v)}
                      textColor={CHARCOAL}
                      buttonColor={GOLD}
                      style={styles.expenseBtn}
                      labelStyle={styles.expenseBtnLabel}
                    >
                      Expense Logs
                    </Button>
                  </Card.Content>
                </View>
              </Card>
            ))
          )}
          <View style={{ height: 60 }} />
        </ScrollView>

        {/* --- UNIT MODAL --- */}
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
          <Text style={styles.modalHeader}>{editMode ? 'Update Unit' : 'Add New Unit'}</Text>
          <TextInput label="Vehicle Name" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} mode="outlined" style={styles.input} activeOutlineColor={GOLD} />
          <TextInput label="Plate Number" value={form.plate} onChangeText={(t) => setForm({ ...form, plate: t })} mode="outlined" style={styles.input} activeOutlineColor={GOLD} />
          <TextInput label="Chassis No." value={form.chassis} onChangeText={(t) => setForm({ ...form, chassis: t })} mode="outlined" style={styles.input} activeOutlineColor={GOLD} />
          <View style={styles.row}>
            <Pressable onPress={() => setShowPicker('reg')} style={{ flex: 1, marginRight: 10 }}>
              <View pointerEvents="none">
                <TextInput label="Reg Date" value={safeFormat(form.regDate, 'PP')} mode="outlined" editable={false} />
              </View>
            </Pressable>
            <Pressable onPress={() => setShowPicker('ltrb')} style={{ flex: 1 }}>
              <View pointerEvents="none">
                <TextInput label="LTFRB Exp" value={safeFormat(form.ltrb, 'PP')} mode="outlined" editable={false} />
              </View>
            </Pressable>
          </View>
          <Button mode="contained" onPress={handleSaveVehicle} buttonColor={GOLD} textColor={CHARCOAL} style={styles.modalSubmitBtn}>
            {editMode ? 'Update Vehicle' : 'Save Vehicle'}
          </Button>
        </Modal>

        {/* --- SERVICE HISTORY MODAL --- */}
        <Modal visible={serviceModal} onDismiss={() => setServiceModal(false)} contentContainerStyle={styles.historyModal}>
          <View style={styles.rowBetween}>
            <Text style={styles.modalHeader}>{editingServiceId ? 'Edit Entry' : `Logs: ${selectedVehicle?.name}`}</Text>
            <IconButton icon="close" onPress={() => setServiceModal(false)} size={24} />
          </View>

          <View style={[styles.serviceForm, editingServiceId ? { borderColor: GOLD, borderWidth: 2 } : null]}>
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <Pressable onPress={() => setMenuVisible(true)}>
                  <View pointerEvents="none">
                    <TextInput label="Category" value={newService.desc} mode="flat" right={<TextInput.Icon icon="chevron-down" color={GOLD} />} style={styles.flatInput} />
                  </View>
                </Pressable>
              }
            >
              {categories.map((cat) => (
                <Menu.Item key={cat} onPress={() => { setNewService({ ...newService, desc: cat }); setMenuVisible(false); }} title={cat} />
              ))}
            </Menu>
            <View style={[styles.row, { marginTop: 12 }]}>
              <TextInput label="Cost (₱)" value={newService.cost} onChangeText={(t) => setNewService({ ...newService, cost: t })} keyboardType="numeric" style={[styles.flatInput, { flex: 1, marginRight: 10 }]} mode="flat" />
              <Pressable onPress={() => setShowPicker('service')} style={{ flex: 1 }}>
                <View pointerEvents="none">
                  <TextInput label="Date" value={safeFormat(newService.date, 'MM/dd/yy')} mode="flat" editable={false} style={styles.flatInput} />
                </View>
              </Pressable>
            </View>
            <Button mode="contained" onPress={addOrUpdateService} buttonColor={GOLD} textColor={CHARCOAL} style={styles.addLogBtn}>
              {editingServiceId ? 'Update Entry' : 'Add Log Entry'}
            </Button>
            {editingServiceId && (
              <Button onPress={() => setEditingServiceId(null)} textColor="#8E8E93">Cancel Edit</Button>
            )}
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Expenses</Text>
            <Text style={styles.totalValue}>₱{totalCost.toLocaleString()}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {history.map((item) => (
              <Pressable key={item.id} onPress={() => { setEditingServiceId(item.id); setNewService({ desc: item.description, cost: item.cost, date: item.date }); }}>
                <View style={[styles.historyCard, editingServiceId === item.id && { borderColor: GOLD, borderWidth: 2 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDate}>{safeFormat(item.date, 'PP')}</Text>
                    <Text style={styles.historyDesc}>{item.description}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyCost}>₱{parseFloat(item.cost || '0').toLocaleString()}</Text>
                    <IconButton icon="trash-can-outline" iconColor="#FF3B30" size={20} onPress={() => deleteServiceLog(item.id)} />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Modal>

        {/* --- DATE PICKER --- */}
        {showPicker && (
          Platform.OS === 'ios' ? (
            <Modal visible={true} onDismiss={() => setShowPicker(null)} contentContainerStyle={styles.iosPickerModal}>
              <View style={styles.iosPickerHeader}>
                <Text style={styles.iosPickerTitle}>Select Date</Text>
                <Button onPress={() => setShowPicker(null)} textColor={GOLD}>Done</Button>
              </View>
              <View style={styles.iosPickerWrapper}>
                <DateTimePicker
                  value={showPicker === 'service' ? toDate(newService.date) : showPicker === 'reg' ? toDate(form.regDate) : toDate(form.ltrb)}
                  mode="date"
                  display="spinner"
                  onChange={onDateChange}
                  textColor={CHARCOAL}
                  themeVariant="light"
                />
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={showPicker === 'service' ? toDate(newService.date) : showPicker === 'reg' ? toDate(form.regDate) : toDate(form.ltrb)}
              mode="date"
              display="calendar"
              onChange={onDateChange}
            />
          )
        )}
      </Portal>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: BG_GRAY },
  scrollContent: { 
    paddingHorizontal: 20, 
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingBottom: 40 
  },
  topRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 35 
  },
  headerTitle: { 
    fontWeight: '900', 
    color: GOLD, 
    fontSize: 36, 
    letterSpacing: -1 
  },
  subHeader: { 
    color: '#8E8E93', 
    fontWeight: '800', 
    marginTop: 2, 
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  addBtn: { elevation: 4, shadowColor: GOLD, shadowOpacity: 0.3, shadowRadius: 10 },
  vCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 22, 
    marginBottom: 20, 
    elevation: 4, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 12 
  },
  cardInternalWrapper: { borderRadius: 22, overflow: 'hidden' },
  cardPadding: { paddingVertical: 20, paddingHorizontal: 16 },
  cardHighlight: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 8 },
  cardHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 15
  },
  cardActionIcons: { 
    flexDirection: 'row', 
    backgroundColor: '#F9F9F9', 
    borderRadius: 14, 
    padding: 2 
  },
  vName: { 
    fontWeight: '900', 
    color: CHARCOAL, 
    fontSize: 26, 
    letterSpacing: -0.5 
  },
  vPlate: { color: '#8E8E93', fontWeight: '700', fontSize: 15, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 10, marginTop: 5, flexWrap: 'wrap' },
  badge: { 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 10, 
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA'
  },
  badgeReg: { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' },
  badgeText: { fontSize: 12, fontWeight: '800', color: CHARCOAL },
  divider: { marginVertical: 20, backgroundColor: '#F2F2F7', height: 1.5 },
  expenseBtn: { borderRadius: 12, elevation: 0, paddingVertical: 4 },
  expenseBtnLabel: { fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },

  // Modal Styles
  modal: { backgroundColor: '#FFFFFF', padding: 25, margin: 20, borderRadius: 28 },
  historyModal: { backgroundColor: BG_GRAY, padding: 20, margin: 15, borderRadius: 28, height: '94%' },
  modalHeader: { fontSize: 24, fontWeight: '900', color: CHARCOAL, letterSpacing: -0.5 },
  input: { marginBottom: 15, backgroundColor: '#fff' },
  flatInput: { backgroundColor: '#fff' },
  modalSubmitBtn: { marginTop: 20, borderRadius: 14, paddingVertical: 6 },
  serviceForm: { 
    padding: 18, 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    marginBottom: 20, 
    shadowColor: '#000', 
    shadowOpacity: 0.1, 
    shadowRadius: 10, 
    elevation: 5 
  },
  addLogBtn: { marginTop: 15, borderRadius: 10 },
  totalRow: { 
    padding: 22, 
    borderRadius: 20, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 20, 
    backgroundColor: CHARCOAL,
    elevation: 8 
  },
  totalLabel: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  totalValue: { color: GOLD, fontWeight: '900', fontSize: 24 },
  historyCard: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 18, 
    backgroundColor: '#fff', 
    borderRadius: 18, 
    marginBottom: 12, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  historyDate: { fontSize: 12, color: '#8E8E93', fontWeight: '700', marginBottom: 2 },
  historyDesc: { fontWeight: '800', color: CHARCOAL, fontSize: 17, lineHeight: 22 },
  historyRight: { flexDirection: 'row', alignItems: 'center' },
  historyCost: { fontWeight: '900', fontSize: 18, color: CHARCOAL, marginRight: 5 },
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  
  // Picker
  iosPickerModal: { backgroundColor: '#FFFFFF', margin: 20, padding: 0, borderRadius: 24, overflow: 'hidden' },
  iosPickerHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderBottomWidth: 1, 
    borderColor: '#E5E5EA', 
    padding: 18, 
    backgroundColor: '#fff' 
  },
  iosPickerTitle: { fontWeight: '900', fontSize: 17, color: CHARCOAL },
  iosPickerWrapper: { backgroundColor: '#fff', height: 240, justifyContent: 'center' }
});