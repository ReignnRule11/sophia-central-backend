import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';

export default function ResourceCard({ resource, onPress }: any) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View>
        <Text style={styles.title}>{resource.title}</Text>
        <Text style={styles.meta}>{resource.uploader?.firstName || ''} • {resource.type}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({ card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 8 }, title: { fontSize: 16, fontWeight: '600' }, meta: { color: '#666', marginTop: 6 } });
