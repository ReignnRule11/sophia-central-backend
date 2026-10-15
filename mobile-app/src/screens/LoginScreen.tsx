import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import client from '../api/client';
import * as SecureStore from 'expo-secure-store';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const resp = await client.post('/auth/login', { email, password });
      const { access_token } = resp.data;
      await SecureStore.setItemAsync('auth_token', access_token);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err) {
      console.log(err);
      alert('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sophia Central</Text>
      <TextInput placeholder="Email" style={styles.input} value={email} onChangeText={setEmail} />
      <TextInput placeholder="Password" secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
      <Button title={loading ? 'Signing in...' : 'Sign In'} onPress={handleLogin} disabled={loading} />
      <View style={{ height: 12 }} />
      <Button title="Register" onPress={() => navigation.navigate('Register')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 16 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, marginBottom: 12, borderRadius: 6 }
});
