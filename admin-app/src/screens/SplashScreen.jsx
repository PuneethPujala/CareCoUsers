import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
  StatusBar,
  TouchableOpacity,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';

const { width, height } = Dimensions.get('window');

// ─── Pill icon (merged with clock, bottom-right overlap) ───────────────────
const Pill = () => (
  <Svg
    width="44"
    height="44"
    viewBox="0 0 44 44"
    style={{
      position: 'absolute',
      bottom: -4,
      right: -4,
      transform: [{ rotate: '45deg' }],
    }}
  >
    {/* Shadow layer */}
    <Path
      d="M 12 22 L 12 32 A 10 10 0 0 0 32 32 L 32 22 Z"
      fill="rgba(0,168,107,0.15)"
      transform="translate(1,2)"
    />
    <Path
      d="M 12 22 L 12 12 A 10 10 0 0 1 32 12 L 32 22 Z"
      fill="rgba(26,143,225,0.15)"
      transform="translate(1,2)"
    />
    {/* Pill halves */}
    <Path d="M 12 22 L 12 32 A 10 10 0 0 0 32 32 L 32 22 Z" fill="#00a86b" />
    <Path d="M 12 22 L 12 12 A 10 10 0 0 1 32 12 L 32 22 Z" fill="#1a8fe1" />
    {/* White cross */}
    <Path
      d="M 19 27 L 25 27 M 22 24 L 22 30"
      stroke="#ffffff"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </Svg>
);

// ─── Orbit arc (comet trail, rotates) ──────────────────────────────────────
const OrbitArc = () => (
  <Svg width="260" height="260" viewBox="0 0 260 260">
    <Defs>
      <SvgLinearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#00c9a7" stopOpacity="0" />
        <Stop offset="40%" stopColor="#00c9a7" stopOpacity="0.9" />
        <Stop offset="100%" stopColor="#1a8fe1" stopOpacity="1" />
      </SvgLinearGradient>
      {/* Subtle outer glow ring */}
      <SvgLinearGradient id="glowRing" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#e8f4ff" stopOpacity="0.6" />
        <Stop offset="100%" stopColor="#d0eaff" stopOpacity="0.2" />
      </SvgLinearGradient>
    </Defs>
    {/* Outer subtle glow circle */}
    <Circle
      cx="130"
      cy="130"
      r="126"
      stroke="url(#glowRing)"
      strokeWidth="1"
      fill="none"
      strokeDasharray="8, 6"
      strokeLinecap="round"
    />
    {/* Main comet-trail orbit arc (~300°) */}
    <Circle
      cx="130"
      cy="130"
      r="122"
      stroke="url(#orbitGrad)"
      strokeWidth="2.5"
      fill="none"
      strokeDasharray="575, 192"
      strokeLinecap="round"
    />
  </Svg>
);

// ─── Clock face (static SVG) ───────────────────────────────────────────────
const ClockFace = () => (
  <Svg width="88" height="88" viewBox="0 0 88 88">
    <Defs>
      <RadialGradient id="clockBg" cx="50%" cy="40%" r="60%">
        <Stop offset="0%" stopColor="#ffffff" />
        <Stop offset="100%" stopColor="#f0f8ff" />
      </RadialGradient>
    </Defs>
    {/* Drop shadow effect via offset circle */}
    <Circle cx="44" cy="46" r="38" fill="rgba(26,143,225,0.08)" />
    {/* Main clock circle */}
    <Circle cx="44" cy="44" r="38" stroke="#1a8fe1" strokeWidth="5" fill="url(#clockBg)" />
    {/* Hour tick marks (12, 3, 6, 9) */}
    <Path
      d="M 44 12 L 44 19 M 44 69 L 44 76 M 12 44 L 19 44 M 69 44 L 76 44"
      stroke="#1a8fe1"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Minor tick marks */}
    <Path
      d="M 61.5 16.5 L 58.8 21 M 72.5 30.5 L 68 33.2 M 72.5 57.5 L 68 54.8 M 61.5 71.5 L 58.8 67 M 26.5 71.5 L 29.2 67 M 15.5 57.5 L 20 54.8 M 15.5 30.5 L 20 33.2 M 26.5 16.5 L 29.2 21"
      stroke="#1a8fe1"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.4"
    />
  </Svg>
);

// ─── Main Component ────────────────────────────────────────────────────────
export default function SplashScreen({ onFinish }) {
  const minuteAnim = useRef(new Animated.Value(0)).current;
  const hourAnim = useRef(new Animated.Value(0)).current;
  const orbitAnim = useRef(new Animated.Value(0)).current;

  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslate = useRef(new Animated.Value(16)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslate = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Continuous animations
    Animated.loop(
      Animated.timing(minuteAnim, {
        toValue: 1,
        duration: 10000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.timing(hourAnim, {
        toValue: 1,
        duration: 120000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.timing(orbitAnim, {
        toValue: 1,
        duration: 30000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Entry sequence
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 45,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslate, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonTranslate, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const minuteDeg = minuteAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const hourDeg = hourAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const orbitDeg = orbitAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Light radial background ── */}
      <LinearGradient
        colors={['#e8f4ff', '#f5faff', '#ffffff']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Decorative soft circle behind logo ── */}
      <View style={s.bgBloom} />

      <View style={s.centerContent}>

        {/* ── LOGO AREA ── */}
        <Animated.View
          style={[
            s.logoOuter,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          {/* Rotating orbit arc */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { alignItems: 'center', justifyContent: 'center', transform: [{ rotate: orbitDeg }] },
            ]}
          >
            <OrbitArc />
          </Animated.View>

          {/* White card circle */}
          <View style={s.logoCard}>
            {/* Clock face */}
            <View style={s.iconContainer}>
              <ClockFace />

              {/* Hour hand */}
              <Animated.View style={[s.handBase, { transform: [{ rotate: hourDeg }] }]}>
                <View style={s.hourHand} />
              </Animated.View>

              {/* Minute hand */}
              <Animated.View style={[s.handBase, { transform: [{ rotate: minuteDeg }] }]}>
                <View style={s.minuteHand} />
              </Animated.View>

              {/* Center dot */}
              <View style={s.centerDot} />

              {/* Pill overlay */}
              <Pill />
            </View>

            {/* Wordmark */}
            <View style={s.wordmark}>
              <Text style={s.wordBlue}>Care</Text>
              <Text style={s.wordGreen}>My</Text>
              <Text style={s.wordBlue}>Med</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── LABEL + SUBTITLE ── */}
        <Animated.View
          style={[
            s.textBlock,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslate }],
            },
          ]}
        >
          {/* Admin Portal row */}
          <View style={s.portalRow}>
            <View style={s.dividerLine} />
            <Text style={s.portalLabel}>ADMIN PORTAL</Text>
            <View style={[s.dividerLine, s.dividerGreen]} />
          </View>

          <Text style={s.subtitle}>Intelligent Healthcare Management</Text>

          {/* Trust chips */}
          <View style={s.chipsRow}>
            {[
              { icon: '🔒', label: 'Secure' },
              { icon: '🛡️', label: 'Certified' },
              { icon: '✔', label: 'HIPAA' },
            ].map((chip) => (
              <View key={chip.label} style={s.chip}>
                <Text style={s.chipIcon}>{chip.icon}</Text>
                <Text style={s.chipText}>{chip.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      {/* ── BOTTOM BUTTON ── */}
      <Animated.View
        style={[
          s.bottomArea,
          {
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslate }],
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onFinish}
          style={s.buttonShadowWrap}
        >
          <LinearGradient
            colors={['#1a8fe1', '#0d75cc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.loginButton}
          >
            <Text style={s.loginText}>Admin Login</Text>
            <Text style={s.loginArrow}>→</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={s.versionText}>Secure Platform v1.0.0</Text>
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const LOGO_SIZE = 220;
const CARD_SIZE = 168;

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5faff',
  },
  bgBloom: {
    position: 'absolute',
    width: width * 1.1,
    height: width * 1.1,
    borderRadius: width * 0.55,
    backgroundColor: '#daeeff',
    opacity: 0.45,
    top: height * 0.15,
    left: -(width * 0.05),
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  // ── Logo ──
  logoOuter: {
    width: LOGO_SIZE + 40,
    height: LOGO_SIZE + 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  logoCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: CARD_SIZE / 2,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1a8fe1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
  },
  iconContainer: {
    width: 88,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handBase: {
    position: 'absolute',
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  hourHand: {
    width: 4,
    height: 22,
    backgroundColor: '#1a8fe1',
    borderRadius: 2,
    marginTop: 22,
  },
  minuteHand: {
    width: 2.5,
    height: 30,
    backgroundColor: '#00c9a7',
    borderRadius: 1.5,
    marginTop: 14,
  },
  centerDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: '#1a8fe1',
  },
  wordmark: {
    flexDirection: 'row',
    marginTop: 14,
  },
  wordBlue: {
    color: '#1a8fe1',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  wordGreen: {
    color: '#00a86b',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // ── Text block ──
  textBlock: {
    alignItems: 'center',
    marginTop: 36,
  },
  portalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dividerLine: {
    width: 52,
    height: 1,
    backgroundColor: '#1a8fe1',
    opacity: 0.3,
    borderRadius: 1,
  },
  dividerGreen: {
    backgroundColor: '#00a86b',
  },
  portalLabel: {
    color: '#0d5fa1',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    marginHorizontal: 14,
  },
  subtitle: {
    color: '#5a7fa0',
    fontSize: 14,
    fontWeight: '300',
    letterSpacing: 0.4,
    marginBottom: 20,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(26,143,225,0.18)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
    shadowColor: '#1a8fe1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  chipIcon: {
    fontSize: 11,
  },
  chipText: {
    color: '#5a7fa0',
    fontSize: 11,
    fontWeight: '500',
  },

  // ── Button ──
  bottomArea: {
    width: '100%',
    paddingHorizontal: '6%',
    paddingBottom: 44,
    alignItems: 'center',
  },
  buttonShadowWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#1a8fe1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  loginButton: {
    width: '100%',
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loginText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  loginArrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 18,
    fontWeight: '400',
  },
  versionText: {
    marginTop: 18,
    color: '#aac0d0',
    fontSize: 11,
    fontWeight: '300',
    letterSpacing: 0.3,
  },
});
