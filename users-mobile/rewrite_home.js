const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/screens/patient/HomeScreen.jsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add expo-blur to imports
if (!content.includes("import { BlurView }")) {
    content = content.replace("import LottieView from 'lottie-react-native';", "import LottieView from 'lottie-react-native';\nimport { BlurView } from 'expo-blur';");
}

// 2. Replace the ScrollView content
const startMarker = "{/* Pills Row */}";
const endMarker = "<View style={{ height: 60 }} />";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const newUI = `
                    {/* BENTO BOX GRID */}
                    <View style={styles.bentoGrid}>
                        {/* HERO TILE */}
                        <View style={styles.bentoHeroTile}>
                            <BlurView intensity={70} tint="light" style={styles.bentoGlass}>
                                <LinearGradient colors={['rgba(99,102,241,0.1)', 'rgba(168,85,247,0.05)']} style={StyleSheet.absoluteFill} />
                                
                                <View style={styles.bentoHeroTop}>
                                    <View>
                                        <Text style={styles.bentoTitle}>Health Score</Text>
                                        <Text style={styles.heroScore}>{healthScore}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <View style={[styles.heroGradeBadge, { backgroundColor: healthColor }]}>
                                            <Text style={styles.heroGradeText}>{healthGrade}</Text>
                                        </View>
                                        <Text style={[styles.heroGradeLabel, { color: healthColor }]}>{healthLabel.toUpperCase()}</Text>
                                    </View>
                                </View>

                                {/* Mood Check-in minimal row */}
                                <View style={styles.bentoMoodRow}>
                                    {!moodLogged ? (
                                        <>
                                            <Text style={styles.bentoMoodText}>How are you feeling?</Text>
                                            <View style={styles.bentoMoodActions}>
                                                <Pressable onPress={() => saveDailyMood('sad')}><LottieView source={require('../../assets/lottie/sad.json')} autoPlay loop style={styles.bentoMoodLottie} /></Pressable>
                                                <Pressable onPress={() => saveDailyMood('okay')}><LottieView source={require('../../assets/lottie/okay.json')} autoPlay loop style={styles.bentoMoodLottie} /></Pressable>
                                                <Pressable onPress={() => saveDailyMood('good')}><LottieView source={require('../../assets/lottie/good.json')} autoPlay loop style={styles.bentoMoodLottie} /></Pressable>
                                                <Pressable onPress={() => saveDailyMood('great')}><LottieView source={require('../../assets/lottie/great.json')} autoPlay loop style={styles.bentoMoodLottie} /></Pressable>
                                            </View>
                                        </>
                                    ) : (
                                        <View style={styles.bentoMoodDone}>
                                            <Sparkles size={14} color="#6366F1" />
                                            <Text style={styles.bentoMoodDoneText}>Mood logged: {selectedMood}</Text>
                                        </View>
                                    )}
                                </View>
                            </BlurView>
                        </View>

                        {/* ROW 2: Split Tiles */}
                        <View style={styles.bentoRow}>
                            <Pressable style={styles.bentoTileHalf} onPress={() => navigation.navigate('Medications')}>
                                <BlurView intensity={70} tint="light" style={styles.bentoGlass}>
                                    <View style={styles.bentoTileHeader}>
                                        <Pill size={18} color="#34D399" />
                                        <Text style={styles.bentoTileTitle}>Next Dose</Text>
                                    </View>
                                    <Text style={styles.bentoTileBigValue}>{nextDose ? nextDose.slot : 'Done'}</Text>
                                    <Text style={styles.bentoTileSub}>{nextDose ? nextDose.time : 'All clear'}</Text>
                                </BlurView>
                            </Pressable>

                            <Pressable style={styles.bentoTileHalf} onPress={() => navigation.navigate('HealthProfile')}>
                                <BlurView intensity={70} tint="light" style={styles.bentoGlass}>
                                    <View style={styles.bentoTileHeader}>
                                        <Activity size={18} color="#F43F5E" />
                                        <Text style={styles.bentoTileTitle}>Vitals</Text>
                                    </View>
                                    <Text style={styles.bentoTileBigValue}>{vitals?.heart_rate || '--'}</Text>
                                    <Text style={styles.bentoTileSub}>bpm Heart Rate</Text>
                                </BlurView>
                            </Pressable>
                        </View>

                        {/* AI COACH TILE */}
                        <View style={styles.bentoTileFull}>
                            <BlurView intensity={80} tint="dark" style={[styles.bentoGlass, { backgroundColor: 'rgba(30,27,75,0.7)' }]}>
                                <View style={styles.bentoTileHeader}>
                                    <Sparkles size={18} color="#A855F7" />
                                    <Text style={[styles.bentoTileTitle, { color: '#E0E7FF' }]}>AI Coach</Text>
                                </View>
                                <Text style={styles.bentoCoachText}>{displayInsight}</Text>
                            </BlurView>
                        </View>

                        {/* QUICK ACTIONS */}
                        <View style={styles.bentoRow}>
                            <Pressable style={styles.bentoActionTile} onPress={() => navigation.navigate('Chatbot')}>
                                <BlurView intensity={70} tint="light" style={styles.bentoGlassCenter}>
                                    <MessageSquare size={20} color="#6366F1" />
                                    <Text style={styles.bentoActionText}>Chat</Text>
                                </BlurView>
                            </Pressable>
                            <Pressable style={styles.bentoActionTile} onPress={() => navigation.navigate('LocationSearch')}>
                                <BlurView intensity={70} tint="light" style={styles.bentoGlassCenter}>
                                    <MapPin size={20} color="#6366F1" />
                                    <Text style={styles.bentoActionText}>Map</Text>
                                </BlurView>
                            </Pressable>
                            <Pressable style={styles.bentoActionTile} onPress={() => navigation.navigate('VitalsHistory')}>
                                <BlurView intensity={70} tint="light" style={styles.bentoGlassCenter}>
                                    <Activity size={20} color="#6366F1" />
                                    <Text style={styles.bentoActionText}>History</Text>
                                </BlurView>
                            </Pressable>
                        </View>
                    `;
    content = content.substring(0, startIndex) + newUI + content.substring(endIndex);
}

// 3. Replace styles
const styleStartMarker = "const styles = StyleSheet.create({";
const styleStartIndex = content.indexOf(styleStartMarker);

if (styleStartIndex !== -1) {
    const newStyles = "const styles = StyleSheet.create({" + `
    // ── Skeleton ──
    skeletonHeader: { paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 20, backgroundColor: '#F8FAFC', paddingHorizontal: 24 },

    // ── Header ──
    header: { paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingHorizontal: 24, paddingBottom: 14, backgroundColor: '#F8FAFC' },
    mainHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    greetingName: { fontSize: 28, fontWeight: '900', color: '#1E293B', letterSpacing: -1 },
    headerSubtext: { fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: '600' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerIconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    bellDot: { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#FFFFFF' },
    avatarBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },

    // ── Scroll Content ──
    scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: layout.TAB_BAR_CLEARANCE + 20 },

    // ── Bento Box Layout ──
    bentoGrid: { gap: 16 },
    bentoRow: { flexDirection: 'row', gap: 16 },
    bentoGlass: { borderRadius: 32, padding: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
    bentoGlassCenter: { borderRadius: 28, padding: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center', gap: 8 },
    
    bentoHeroTile: { shadowColor: '#6366F1', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 },
    bentoHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    bentoTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.2 },
    heroScore: { fontSize: 64, fontWeight: '900', color: '#0F172A', letterSpacing: -3, marginTop: 4 },
    heroGradeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    heroGradeText: { fontSize: 18, fontWeight: '900', color: '#FFF' },
    heroGradeLabel: { fontSize: 11, fontWeight: '800', marginTop: 6, letterSpacing: 1 },

    bentoMoodRow: { marginTop: 10, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
    bentoMoodText: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 12 },
    bentoMoodActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
    bentoMoodLottie: { width: 44, height: 44 },
    bentoMoodDone: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(99,102,241,0.1)', padding: 12, borderRadius: 16 },
    bentoMoodDoneText: { fontSize: 14, fontWeight: '700', color: '#6366F1' },

    bentoTileHalf: { flex: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 },
    bentoTileFull: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 },
    bentoTileHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    bentoTileTitle: { fontSize: 13, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 },
    bentoTileBigValue: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
    bentoTileSub: { fontSize: 13, fontWeight: '600', color: '#64748B' },

    bentoCoachText: { fontSize: 16, fontWeight: '600', color: '#C7D2FE', lineHeight: 24 },

    bentoActionTile: { flex: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
    bentoActionText: { fontSize: 12, fontWeight: '700', color: '#475569' },
});
`;
    content = content.substring(0, styleStartIndex) + newStyles;
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully updated HomeScreen.jsx to Bento Box layout!');
