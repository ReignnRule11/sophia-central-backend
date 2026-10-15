import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Button, ScrollView } from 'react-native';
import client from '../api/client';

export default function ResourceDetailScreen({ route }: any) {
  const { id } = route.params;
  const [resource, setResource] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDetail(); }, []);

  const fetchDetail = async () => {
    try {
      const resp = await client.get(`/resources/${id}`);
      setResource(resp.data);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" />;
  if (!resource) return <View style={styles.container}><Text>Resource not found</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 12 }}>
      <Text style={styles.title}>{resource.title}</Text>
      <Text style={styles.meta}>{resource.course?.title || ''} • Level {resource.level}</Text>
      <Text style={styles.desc}>{resource.description}</Text>
      <View style={{ height: 12 }} />
      <Button title="Download / Open" onPress={() => {/* TODO: link to fileUrl */}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 }, title: { fontSize: 20, fontWeight: '700' }, meta: { color: '#666', marginTop: 6 }, desc: { marginTop: 12, lineHeight: 20 } });
