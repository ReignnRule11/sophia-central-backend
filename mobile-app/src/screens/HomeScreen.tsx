import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, StyleSheet, ActivityIndicator } from 'react-native';
import client from '../api/client';
import ResourceCard from '../components/ResourceCard';

export default function HomeScreen({ navigation }: any) {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      const resp = await client.get('/resources?limit=20&status=approved');
      setResources(resp.data.data || resp.data);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" />;

  return (
    <View style={styles.container}>
      <FlatList data={resources} keyExtractor={(item) => item.id} renderItem={({ item }) => (
        <ResourceCard resource={item} onPress={() => navigation.navigate('ResourceDetail', { id: item.id })} />
      )} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 12 } });
