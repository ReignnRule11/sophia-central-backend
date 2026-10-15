import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Text } from 'react-native';
import client from '../api/client';

export default function RegisterScreen({ navigation }: any) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async () => {
    try {
      await client.post('/auth/register', { firstName, lastName, email, password });
      alert('Registration successful. Please log in.');
      navigation.goBack();
    } catch (err) {
      console.log(err);
      alert('Registration failed');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <TextInput placeholder="First name" style={styles.input} value={firstName} onChangeText={setFirstName} />
      <TextInput placeholder="Last name" style={styles.input} value={lastName} onChangeText={setLastName} />
      <TextInput placeholder="Email" style={styles.input} value={email} onChangeText={setEmail} />
      <TextInput placeholder="Password" secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
      <Button title="Register" onPress={handleRegister} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, marginBottom: 12, borderRadius: 6 }
});
