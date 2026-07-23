import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ConfettiParticle = ({ index }) => {
  const angle = (index * 10 + Math.random() * 8) * Math.PI / 180;
  const distance = 80 + Math.random() * 160;
  const destX = Math.cos(angle) * distance;
  // Make particles travel upwards like a fireworks burst
  const destY = Math.sin(angle) * distance - (140 + Math.random() * 180);
  
  const scale = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withTiming(1 + Math.random() * 0.6, { duration: 150 });
    tx.value = withSpring(destX, { damping: 11, stiffness: 85 });
    ty.value = withSpring(destY, { damping: 11, stiffness: 85 });
    rotation.value = withTiming(360 + Math.random() * 720, { duration: 1600, easing: Easing.out(Easing.quad) });
    opacity.value = withDelay(800, withTiming(0, { duration: 800 }));
  }, [destX, destY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#06B6D4'];
  const particleColor = colors[index % colors.length];
  const size = 6 + Math.random() * 8;
  const isCircle = Math.random() > 0.5;

  return (
    <Reanimated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          backgroundColor: particleColor,
          borderRadius: isCircle ? size / 2 : 2,
        },
        animatedStyle,
      ]}
    />
  );
};

export default function CelebrationOverlay({ active, onComplete }) {
  const [show, setShow] = useState(false);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (active) {
      setBurstKey((prev) => prev + 1);
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        if (onComplete) onComplete();
      }, 1600);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [active]);

  if (!show) return null;

  // Generate 36 particles for a beautiful, full-circle fireworks burst
  const particles = Array.from({ length: 36 });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.burstContainer}>
        {particles.map((_, i) => (
          <ConfettiParticle key={`${burstKey}-${i}`} index={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  burstContainer: {
    position: 'absolute',
    left: SCREEN_WIDTH / 2,
    top: SCREEN_HEIGHT / 2 - 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
});
