import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, FlatList, Modal, Pressable, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { publicUrl, type Bucket } from '../api/storage';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, IconButton, ProductImage, Row } from '../ui';

function ZoomableImage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });
  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value > 1) {
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1 ? 1 : 2.5;
      scale.value = withTiming(next);
      saved.value = next;
      if (next === 1) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan))}>
      <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

/** Swipeable photo gallery that opens a full-screen, pinch-to-zoom viewer on tap. */
export function PhotoGallery({ photos, bucket = 'product-photos', height = 280, categoryId, brand, name }: { photos: string[]; bucket?: Bucket; height?: number; categoryId?: number | null; brand?: string | null; name?: string }) {
  const { colors } = useTheme();
  const width = Math.min(Dimensions.get('window').width, 720);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  if (!photos.length) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <ProductImage categoryId={categoryId} brand={brand} name={name} width={width - 32} height={height - 16} radius={20} />
      </View>
    );
  }
  return (
    <View>
      <FlatList
        horizontal
        pagingEnabled
        data={photos}
        keyExtractor={(p) => p}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Pressable onPress={() => setOpen(true)} style={{ width, height, padding: 16 }}>
            <ProductImage path={item} bucket={bucket} width={width - 32} height={height - 32} thumb={false} radius={16} />
          </Pressable>
        )}
      />
      {photos.length > 1 ? (
        <Row gap={5} justify="center">
          {photos.map((p, i) => (
            <View key={p} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.primary : colors.border }} />
          ))}
        </Row>
      ) : null}
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <Row justify="space-between" style={{ paddingHorizontal: 8 }}>
              <AppText color="#FFFFFF" variant="label">{`${index + 1} / ${photos.length}`}</AppText>
              <IconButton icon="close" color="#fff" onPress={() => setOpen(false)} label="Close" />
            </Row>
            <FlatList
              horizontal
              pagingEnabled
              initialScrollIndex={index}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              data={photos}
              keyExtractor={(p) => p}
              onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item }) => {
                const uri = publicUrl(bucket, item);
                return uri ? <ZoomableImage uri={uri} width={width} height={Dimensions.get('window').height - 120} /> : null;
              }}
            />
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
