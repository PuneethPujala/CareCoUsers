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
import { BlurView } from 'expo-blur';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Pattern,
  Rect,
} from 'react-native-svg';

const { width, height } = Dimensions.get('window');

// ─── BACKGROUND PATTERN ────────────────────────────────────────────────────
const BgPattern = () => (
  <View style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%">
      <Defs>
        <Pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <Circle cx="2" cy="2" r="1.5" fill="#1a8fe1" opacity="0.06" />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  </View>
);

// ─── CLOCK FACE (Static) ───────────────────────────────────────────────────
const ClockFace = () => {
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 * Math.PI) / 180;
    const r1 = 33;
    const r2 = 38;
    const cx = 45;
    const cy = 45;
    const x1 = cx + r1 * Math.sin(angle);
    const y1 = cy - r1 * Math.cos(angle);
    const x2 = cx + r2 * Math.sin(angle);
    const y2 = cy - r2 * Math.cos(angle);
    
    const isHour = i % 3 === 0;
    ticks.push(
      <Path
        key={i}
        d={`M ${x1} ${y1} L ${x2} ${y2}`}
        stroke="#1a8fe1"
        strokeWidth={isHour ? 2.2 : 1}
        strokeLinecap="round"
        opacity={isHour ? 1 : 0.35}
      />
    );
  }

  return (
    <Svg width="90" height="90" viewBox="0 0 90 90">
      <Circle cx="45" cy="45" r="42" stroke="#1a8fe1" strokeWidth="5" fill="none" />
      <Circle cx="45" cy="45" r="39" fill="white" />
      {ticks}
    </Svg>
  );
};

// ─── PILL ICON (SVG) ───────────────────────────────────────────────────────
const Pill = () => (
  <Svg
    width="46"
    height="46"
    viewBox="0 0 46 46"
    style={{
      position: 'absolute',
      bottom: -6,
      right: -6,
      transform: [{ rotate: '45deg' }],
    }}
  >
    <Path d="M 13 23 L 13 33 A 10 10 0 0 0 33 33 L 33 23 Z" fill="#00a86b" />
    <Path d="M 13 23 L 13 13 A 10 10 0 0 1 33 13 L 33 23 Z" fill="#1a8fe1" />
    <Path d="M 13 23 L 33 23" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
    <Path d="M 20 28 L 26 28 M 23 25 L 23 31" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

// ─── TRUST BADGE ICONS ─────────────────────────────────────────────────────
const LockIcon = () => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a8fe1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 11H3v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V11z" />
    <Path d="M7 11V7c0-2.76 2.24-5 5-5s5 2.24 5 5v4" />
  </Svg>
);

const ShieldIcon = () => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00c9a7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <Path d="M9 12l2 2 4-4" />
  </Svg>
);

const CheckCircleIcon = () => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00a86b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M9 12l2 2 4-4" />
  </Svg>
);

// ─── CALL ALERT ICONS ──────────────────────────────────────────────────────
const SignalBars = () => {
  const bar1 = useRef(new Animated.Value(0)).current;
  const bar2 = useRef(new Animated.Value(0)).current;
  const bar3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateBar = (anim, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    };
    animateBar(bar1, 0);
    animateBar(bar2, 150);
    animateBar(bar3, 300);
  }, []);

  const getStyle = (anim, h) => ({
    width: 3,
    height: h,
    backgroundColor: '#00c9a7',
    borderRadius: 1.5,
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
  });

  return (
    <View style={s.signalBars}>
      <Animated.View style={getStyle(bar1, 6)} />
      <Animated.View style={getStyle(bar2, 10)} />
      <Animated.View style={getStyle(bar3, 14)} />
    </View>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
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
  const buttonScale = useRef(new Animated.Value(1)).current;

  const phoneRingAnim = useRef(new Animated.Value(0)).current;
  const callAlertTranslate = useRef(new Animated.Value(-40)).current;
  const callAlertOpacity = useRef(new Animated.Value(0)).current;
  const alertShown = useRef(false);

  useEffect(() => {
    Animated.loop(Animated.timing(minuteAnim, { toValue: 1, duration: 15000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(hourAnim, { toValue: 1, duration: 120000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(orbitAnim, { toValue: 1, duration: 30000, easing: Easing.linear, useNativeDriver: true })).start();

    // Phone ring pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(phoneRingAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(phoneRingAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
      ])
    ).start();

    // Entrance animations
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 45, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true })
    ]).start();

    Animated.sequence([
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(contentTranslate, { toValue: 0, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      ])
    ]).start();

    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(buttonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(buttonTranslate, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true })
      ])
    ]).start();

    // Call Alert Trigger
    const listenerId = minuteAnim.addListener(({ value }) => {
      if (value >= 0.32 && value <= 0.36 && !alertShown.current) {
        alertShown.current = true;
        
        Animated.parallel([
          Animated.spring(callAlertTranslate, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }),
          Animated.timing(callAlertOpacity, { toValue: 1, duration: 400, useNativeDriver: true })
        ]).start();

        setTimeout(() => {
          Animated.parallel([
            Animated.timing(callAlertTranslate, { toValue: -40, duration: 400, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(callAlertOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
          ]).start();
          
          setTimeout(() => {
            alertShown.current = false;
          }, 9000);
        }, 3000);
      }
    });

    return () => minuteAnim.removeListener(listenerId);
  }, []);

  const handlePressIn = () => Animated.spring(buttonScale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start();

  const minuteDeg = minuteAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const hourDeg = hourAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const orbitDeg = orbitAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  
  const phoneScale = phoneRingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* BACKGROUND LAYER */}
      <LinearGradient 
        colors={['#f8fcff', '#f0f7ff', '#e6f2ff', '#ffffff']} 
        locations={[0, 0.4, 0.7, 1]} 
        start={{ x: 0, y: 0 }} 
        end={{ x: 1, y: 1 }} 
        style={StyleSheet.absoluteFill} 
      />
      <BgPattern />

      {/* MAIN LAYOUT */}
      <View style={s.layout}>
        
        {/* LOGO AREA (TOP) */}
        <View style={s.layoutTop}>
          <Animated.View style={[s.logoOuter, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
            
            {/* Static inner dashed ring */}
            <View style={[StyleSheet.absoluteFill, s.svgCenter]}>
               <Svg width="270" height="270" viewBox="0 0 270 270">
                 <Circle cx="135" cy="135" r="125" stroke="rgba(26,143,225,0.12)" strokeWidth="1" strokeDasharray="4, 7" fill="none" />
               </Svg>
            </View>

            {/* Rotating comet ring */}
            <Animated.View style={[StyleSheet.absoluteFill, s.svgCenter, { transform: [{ rotate: orbitDeg }] }]}>
              <Svg width="270" height="270" viewBox="0 0 270 270">
                <Defs>
                  <SvgLinearGradient id="cometGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor="#00c9a7" stopOpacity="0" />
                    <Stop offset="35%" stopColor="#00c9a7" stopOpacity="1" />
                    <Stop offset="100%" stopColor="#1a8fe1" stopOpacity="1" />
                  </SvgLinearGradient>
                </Defs>
                <Circle cx="135" cy="135" r="132" stroke="url(#cometGrad)" strokeWidth="2.5" strokeDasharray="580, 248" strokeLinecap="round" fill="none" />
              </Svg>
            </Animated.View>

            {/* Glass Card */}
            <View style={s.logoCard}>
              <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
              
              {/* Clock & Hands */}
              <View style={s.iconContainer}>
                <ClockFace />
                <Animated.View style={[s.handContainer, { transform: [{ rotate: hourDeg }] }]}>
                  <View style={s.hourHand} />
                </Animated.View>
                <Animated.View style={[s.handContainer, { transform: [{ rotate: minuteDeg }] }]}>
                  <View style={s.minuteHand} />
                </Animated.View>
                <View style={s.centerDot} />
                <Pill />
              </View>
            </View>

            {/* Call Alert (Floating glass card) */}
            <Animated.View style={[s.callAlert, { opacity: callAlertOpacity, transform: [{ translateY: callAlertTranslate }] }]}>
               <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
               <View style={s.callAlertContent}>
                 <View style={s.callIconWrapper}>
                    <Animated.View style={[s.callIconRing, { transform: [{ scale: phoneScale }] }]} />
                    <Svg width="18" height="18" viewBox="0 0 24 24" fill="#1a8fe1">
                      <Path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                    </Svg>
                 </View>
                 <View style={s.callAlertText}>
                   <Text style={s.callAlertTitle}>Medicine Time</Text>
                   <Text style={s.callAlertSub}>Calling patient now...</Text>
                 </View>
                 <SignalBars />
               </View>
            </Animated.View>
            
          </Animated.View>
        </View>

        {/* LABEL & BADGES (MIDDLE) */}
        <View style={s.layoutMiddle}>
          <Animated.View style={[s.textBlock, { opacity: contentOpacity, transform: [{ translateY: contentTranslate }] }]}>
            <View style={s.portalRow}>
              <View style={s.dividerLine} />
              <Text style={s.portalLabel}>ADMIN PORTAL</Text>
              <View style={[s.dividerLine, s.dividerGreen]} />
            </View>
            <Text style={s.subtitle}>Intelligent Healthcare Management</Text>
            
            <View style={s.chipsRow}>
              <View style={s.chip}>
                <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
                <View style={s.chipContent}>
                  <LockIcon /><Text style={s.chipText}>Secure</Text>
                </View>
              </View>
              <View style={s.chip}>
                <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
                <View style={s.chipContent}>
                  <ShieldIcon /><Text style={s.chipText}>Certified</Text>
                </View>
              </View>
              <View style={s.chip}>
                <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
                <View style={s.chipContent}>
                  <CheckCircleIcon /><Text style={s.chipText}>HIPAA</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* BOTTOM BUTTON (BOTTOM) */}
        <View style={s.layoutBottom}>
          <Animated.View style={[s.bottomArea, { opacity: buttonOpacity, transform: [{ translateY: buttonTranslate }] }]}>
            <TouchableOpacity activeOpacity={1} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onFinish} style={s.buttonWrap}>
              <Animated.View style={[s.buttonShadow, { transform: [{ scale: buttonScale }] }]}>
                <LinearGradient colors={['#1a8fe1', '#0d72c9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.loginButton}>
                  <Text style={s.loginText}>Admin Login</Text>
                  <Svg width="18" height="18" viewBox="0 0 12 12" fill="none">
                    <Path d="M 0 6 L 10 6 M 6 2 L 10 6 L 6 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </View>

      </View>
    </View>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  layout: {
    flex: 1,
    paddingTop: height * 0.1,
    paddingBottom: 40,
    alignItems: 'center',
  },
  layoutTop: {
    alignItems: 'center',
    marginTop: 30,
  },
  layoutMiddle: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  layoutBottom: {
    width: '100%',
    alignItems: 'center',
  },
  
  // ── LOGO & ORBITS ──
  logoOuter: {
    width: 270,
    height: 270,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCard: {
    width: 172,
    height: 172,
    borderRadius: 86,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#1a8fe1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // ── CLOCK HANDS ──
  iconContainer: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handContainer: {
    position: 'absolute',
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  minuteHand: {
    width: 2.5,
    height: 28,
    borderRadius: 1.5,
    backgroundColor: '#00c9a7',
    marginTop: 17,
  },
  hourHand: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: '#1a8fe1',
    marginTop: 25,
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

  // ── CALL ALERT ──
  callAlert: {
    position: 'absolute',
    top: -30,
    width: 220,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#1a8fe1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    overflow: 'hidden',
  },
  callAlertContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  callIconWrapper: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callIconRing: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(26,143,225,0.5)',
  },
  callAlertText: {
    flex: 1,
    justifyContent: 'center',
  },
  callAlertTitle: {
    color: '#0d5fa1',
    fontSize: 13,
    fontWeight: '700',
  },
  callAlertSub: {
    color: '#5a7fa0',
    fontSize: 11,
    fontWeight: '300',
    marginTop: 2,
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 14,
  },

  // ── TEXT & BADGES ──
  textBlock: {
    alignItems: 'center',
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
    opacity: 0.25,
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
    letterSpacing: 0.5,
    marginBottom: 24,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
    shadowColor: '#1a8fe1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    overflow: 'hidden',
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  chipText: {
    color: '#5a7fa0',
    fontSize: 11,
    fontWeight: '500',
  },

  // ── BOTTOM BUTTON ──
  bottomArea: {
    width: '100%',
    alignItems: 'center',
  },
  buttonWrap: {
    width: '88%',
  },
  buttonShadow: {
    width: '100%',
    shadowColor: '#1a8fe1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 10,
    borderRadius: 16,
  },
  loginButton: {
    width: '100%',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  loginText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
