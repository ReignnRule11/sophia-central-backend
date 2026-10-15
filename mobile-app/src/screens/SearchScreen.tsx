import React, { useState } from 'react';
import { View, TextInput, Button, FlatList, StyleSheet } from 'react-native';
import client from '../api/client';
import ResourceCard from '../components/ResourceCard';

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const doSearch = async () => {
    try {
      const resp = await client.get('/search', { params: { q: query, limit: 20 } });
      setResults(resp.data.data || resp.data);
    } catch (err) {
      console.log(err);
      alert('Search failed');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput placeholder="Search resources" style={styles.input} value={query} onChangeText={setQuery} />
      <Button title="Search" onPress={doSearch} />
      <FlatList data={results} keyExtractor={(item) => item.id} renderItem={({ item }) => (
        <ResourceCard resource={item} onPress={() => navigation.navigate('ResourceDetail', { id: item.id })} />
      )} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 12 }, input: { borderWidth: 1, borderColor: '#ddd', padding: 12, marginBottom: 8, borderRadius: 6 } });
