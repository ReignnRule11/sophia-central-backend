import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import client from '../api/client';

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const resp = await client.get('/users/me');
      setProfile(resp.data);
    } catch (err) {
      console.log(err);
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{profile ? `${profile.firstName} ${profile.lastName}` : 'Profile'}</Text>
      <Button title="Refresh" onPress={fetchProfile} />
      <View style={{ height: 12 }} />
      <Button title="Logout" onPress={handleLogout} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 12 }, title: { fontSize: 20, fontWeight: '700', marginBottom: 12 } });
