import React, { useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import ArcTimelinePrototype from './ArcTimelinePrototype';

const PROTOTYPE_YEARS = Array.from({ length: 11 }, (_, index) => String(2017 + index));

export function ArcTimelinePrototypeScreen() {
  const [selectedYear, setSelectedYear] = useState(PROTOTYPE_YEARS[PROTOTYPE_YEARS.length - 1]);
  const selectedIndex = Math.max(0, PROTOTYPE_YEARS.indexOf(selectedYear));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>TIMELINE PROTOTYPE</Text>
        <Text style={styles.title}>弧形时间轴</Text>
        <Text style={styles.selected}>{selectedYear}</Text>
      </View>
      <View style={styles.timelineStage}>
        <ArcTimelinePrototype
          onSelect={setSelectedYear}
          selectedIndex={selectedIndex}
          years={PROTOTYPE_YEARS}
        />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerValue}>{selectedYear}</Text>
        <Text style={styles.footerCaption}>当前选中年份</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#e7ebe6',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 74,
    alignItems: 'center',
  },
  eyebrow: {
    color: '#9a6b42',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    marginTop: 10,
    color: '#332e28',
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '700',
  },
  selected: {
    marginTop: 8,
    color: '#9a6b42',
    fontSize: 18,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  timelineStage: {
    marginTop: 96,
    marginHorizontal: -24,
  },
  footer: {
    alignItems: 'center',
    marginTop: 6,
  },
  footerValue: {
    color: '#40382f',
    fontSize: 38,
    lineHeight: 46,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  footerCaption: {
    marginTop: 4,
    color: '#81776d',
    fontSize: 12,
    lineHeight: 18,
  },
});
