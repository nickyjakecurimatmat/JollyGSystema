// components/ui/toggle.tsx
import { StyleSheet, Switch, Text, View } from 'react-native';

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange?: (val: boolean) => void;
};

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={checked} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
});
