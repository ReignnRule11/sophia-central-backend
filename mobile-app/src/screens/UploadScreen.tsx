import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet } from 'react-native';
import client from '../api/client';

export default function UploadScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleUpload = async () => {
    try {
      // For MVP: create resource record (file upload via presigned URL should be added)
      await client.post('/resources', { title, description, type: 'other' });
      alert('Resource created (pending). Implement file upload flow with presigned URLs.');
      setTitle(''); setDescription('');
    } catch (err) {
      console.log(err);
      alert('Upload failed');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput placeholder="Title" style={styles.input} value={title} onChangeText={setTitle} />
      <TextInput placeholder="Description" style={styles.input} value={description} onChangeText={setDescription} />
      <Button title="Create Resource" onPress={handleUpload} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 12 }, input: { borderWidth: 1, borderColor: '#ddd', padding: 12, marginBottom: 12, borderRadius: 6 } });
