// components/spark/Badge.tsx — a small round count, like the "1" on an app icon.
import React from 'react';
import { View, Text } from 'react-native';

export function Badge({ count, style, label }: { count: number; style?: any; label?: string }) {
  if (count <= 0) return null;
  const text = count > 9 ? '9+' : String(count);
  return (
    <View accessible accessibilityLabel={label ?? `${count} new`} pointerEvents="none"
      style={[{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: '#FF5C4D', borderWidth: 2, borderColor: '#0D1310', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800', lineHeight: 15 }}>{text}</Text>
    </View>
  );
}