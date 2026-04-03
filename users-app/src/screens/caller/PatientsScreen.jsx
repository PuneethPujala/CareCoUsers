import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Platform, Pressable } from 'react-native';
import { Search, MapPin, ChevronRight, Activity } from 'lucide-react-native';
import { colors } from '../../theme';

const ALL_PATIENTS = [
    { id: '1', name: 'Alok Gupta', condition: 'Type 2 Diabetes', city: 'Mumbai', adherence: 'High', requiresFollowUp: false },
    { id: '2', name: 'Meena Devi', condition: 'Osteoarthritis', city: 'Delhi', adherence: 'Low', requiresFollowUp: true },
    { id: '3', name: 'Rajesh Kumar', condition: 'Hypertension', city: 'Pune', adherence: 'Medium', requiresFollowUp: false },
    { id: '4', name: 'Sarita Sharma', condition: 'Asthma', city: 'Mumbai', adherence: 'High', requiresFollowUp: false },
    { id: '5', name: 'Vivek Singh', condition: 'Heart Disease', city: 'Delhi', adherence: 'Low', requiresFollowUp: true },
];

export default function CallerPatientsScreen() {
    const [search, setSearch] = useState('');

    const filtered = ALL_PATIENTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Patient Directory</Text>
                <Text style={styles.headerSub}>Vis: 30 / 30 Assigned</Text>
            </View>

            {/* Search Layout */}
            <View style={styles.searchWrap}>
                <Search size={18} color="#94A3B8" style={{ marginLeft: 12 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search patient by name..."
                    placeholderTextColor="#94A3B8"
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            {/* List */}
            <FlatList
                data={filtered}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <Pressable style={[styles.card, item.requiresFollowUp && styles.cardAlert]}>
                        {item.requiresFollowUp && (
                            <View style={styles.alertStrip}>
                                <Text style={styles.alertStripTxt}>Requires Manager Review</Text>
                            </View>
                        )}

                        <View style={styles.cardInner}>
                            <View style={styles.cardContent}>
                                <Text style={styles.nameTxt}>{item.name}</Text>

                                <View style={styles.infoRow}>
                                    <Activity size={14} color="#64748B" />
                                    <Text style={styles.infoTxt}>{item.condition}</Text>
                                </View>

                                <View style={styles.infoRow}>
                                    <MapPin size={14} color="#64748B" />
                                    <Text style={styles.infoTxt}>{item.city} • {item.adherence} Adherence</Text>
                                </View>
                            </View>
                            <ChevronRight size={20} color="#CBD5E1" />
                        </View>
                    </Pressable>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },
    header: {
        backgroundColor: colors.primary,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 20, paddingHorizontal: 20,
        alignItems: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
    headerSub: { fontSize: 13, color: '#BDD4EE', marginTop: 4 },

    searchWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF',
        margin: 16, borderRadius: 8,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    searchInput: { flex: 1, height: 44, paddingHorizontal: 12, fontSize: 15, color: '#1A202C' },

    listContent: { paddingHorizontal: 16, paddingBottom: 40 },

    card: {
        backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    cardAlert: { borderColor: '#FECACA', borderWidth: 1.5 },
    alertStrip: { backgroundColor: '#FEF2F2', paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#FECACA' },
    alertStripTxt: { fontSize: 11, fontWeight: '700', color: colors.danger, textTransform: 'uppercase' },

    cardInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    cardContent: { flex: 1, gap: 6 },
    nameTxt: { fontSize: 16, fontWeight: '700', color: '#1A202C', marginBottom: 4 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoTxt: { fontSize: 13, color: '#4A5568' },
});
