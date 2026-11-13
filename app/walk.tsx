// app/walk.tsx — the new solo walk timer (Phase 1 prototype, fully functional).
// Group walks still use /walk-timer until Phase 3.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ink, phaseTone, round, space } from '../lib/spark/tokens';
import { usePrefs } from '../lib/spark/prefs';
import { getWorld } from '../lib/spark/worlds';
import { Button, Card, PhaseIcon, Timeline, Toggle as BaseToggle, LIGHT_TOGGLE, type, useSparkFonts } from '../components/spark/ui';
import Scenery from '../components/spark/Scenery';
import { PRESETS, PHASE_COPY, Segment, buildSegments, fmtClock, fmtMinutes, segmentsFromIntervals, totalSeconds } from '../lib/walk/schedule';
import { useWalkClock, loadActiveWalk, saveActiveWalk, elapsedMs, ClockState } from '../lib/walk/engine';
import { buzz, capabilities, chime, createWakeLock, speak, unlockAudio } from '../lib/walk/cues';
import { getPlanById } from '../lib/storage';
import { recordWalkActivity } from '../lib/api/stats';

type Loaded = { name: string; planId?: string; segments: Segment[]; clock?: ClockState };

export default function WalkScreen() {
  useSparkFonts();
  const router = useRouter();
  const params = useLocalSearchParams<{ planId?: string; preset?: string; resume?: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
      if (params.resume) {
        const w = await loadActiveWalk();
        if (w) return setLoaded({ name: w.name, planId: w.planId, segments: w.segments, clock: w.clock });
      }
      if (params.planId) {
        const p = await getPlanById(String(params.planId));
        if (!p) return setError('That walk plan could not be found on this device.');
        const segs = segmentsFromIntervals(p.intervals);
        if (!segs.length) return setError('This plan has no timed parts. Edit it and add some time.');
        return setLoaded({ name: p.name, planId: p.id, segments: segs });
      }
      const preset = PRESETS.find(p => p.id === params.preset) ?? PRESETS[2];
      setLoaded({ name: preset.name, segments: buildSegments(preset.structure) });
      } catch (e: any) {
        setError('Something went wrong opening this walk. ' + (e?.message ?? ''));
      }
    })();
  }, [params.planId, params.preset, params.resume]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: ink.bg, padding: space.lg, justifyContent: 'center', gap: 16 }}>
        <Text style={type.title}>{error}</Text>
        <Button label="Back to home" onPress={() => router.replace('/dashboard')} />
      </View>
    );
  }
  if (!loaded) return <View style={{ flex: 1, backgroundColor: ink.bg }} />;
  return <ActiveWalk {...loaded} />;
}

function ActiveWalk({ name, planId, segments, clock: initialClock }: Loaded) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [prefs, setPrefs] = usePrefs();
  const { clock, phase, running, started, start, pause, resume } = useWalkClock(segments, initialClock);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finished, setFinished] = useState<null | { seconds: number; complete: boolean; saved: 'saving' | 'saved' | 'failed' }>(null);
  const [wakeHeld, setWakeHeld] = useState(false);
  const total = totalSeconds(segments);
  const caps = useMemo(capabilities, []);
  const light = prefs.brightMode;
  const world = getWorld(prefs.world);

  const C = light
    ? { bg: '#FAF7F0', text: '#121212', sub: '#3B3A36', card: '#FFFFFF', line: 'rgba(0,0,0,0.14)' }
    : { bg: ink.bg, text: ink.text, sub: ink.sub, card: ink.card, line: ink.line };

  // ---- persistence (resume after reload / app switch) ----
  useEffect(() => {
    if (!started || finished) return;
    saveActiveWalk({ version: 1, name, planId, segments, clock, savedAt: Date.now() });
  }, [clock, started, finished]);

  // ---- wake lock ----
  const wake = useRef<ReturnType<typeof createWakeLock> | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    wake.current = createWakeLock(setWakeHeld);
    return () => wake.current?.disable();
  }, []);
  useEffect(() => {
    if (running && prefs.keepAwake) wake.current?.enable(); else wake.current?.disable();
  }, [running, prefs.keepAwake]);

  // ---- cues on phase change (fires once per change; skipped phases are not replayed) ----
  const lastIdx = useRef<number | null>(initialClock ? phase.index : null);
  const headsUp = useRef<string>('');
  useEffect(() => {
    if (!started) return;
    const v = prefs.volume;
    if (lastIdx.current !== phase.index) {
      const first = lastIdx.current === null;
      lastIdx.current = phase.index;
      if (phase.done) {
        if (prefs.chime) chime('DONE', v);
        if (prefs.vibrate) buzz('DONE');
        if (prefs.voice) speak('That’s your walk complete. Well done.', v);
        complete(total, true);
        return;
      }
      if (!running || !phase.segment) return;
      const seg = phase.segment;
      if (prefs.chime) chime(seg.pace, v);
      if (prefs.vibrate && !first) buzz(seg.pace);
      if (prefs.voice) speak(`${PHASE_COPY[seg.pace].spoken} ${spokenDuration(seg.seconds)}.`, v);
    }
    // gentle heads-up 10 seconds before a change
    if (running && phase.next && phase.segment && phase.segment.seconds >= 40 && phase.remainingInSegment <= 10 && phase.remainingInSegment > 8) {
      const key = `${phase.index}`;
      if (headsUp.current !== key) {
        headsUp.current = key;
        if (prefs.voice) speak(`In ten seconds, ${PHASE_COPY[phase.next.pace].label.toLowerCase()}.`, v);
      }
    }
  }, [phase.index, phase.done, Math.ceil(phase.remainingInSegment), running, started]);

  const complete = async (seconds: number, isComplete: boolean) => {
    await saveActiveWalk(null);
    wake.current?.disable();
    const secs = Math.round(seconds);
    setFinished({ seconds: secs, complete: isComplete, saved: 'saving' });
    if (secs < 60) return setFinished({ seconds: secs, complete: isComplete, saved: 'failed' });
    try {
      const doneCount = segments.filter((_, i) => i < phase.index || isComplete).length;
      await recordWalkActivity(secs, doneCount);
      setFinished({ seconds: secs, complete: isComplete, saved: 'saved' });
    } catch {
      setFinished({ seconds: secs, complete: isComplete, saved: 'failed' });
    }
  };

  const onStart = () => { unlockAudio(); start(); };
  const onResume = () => { unlockAudio(); resume(); };
  const onFinish = () => { setConfirmFinish(false); complete(elapsedMs(clock) / 1000, false); };

  if (finished) return <Finished {...finished} name={name} segments={segments} />;

  const seg = phase.segment ?? segments[0];
  const tone = phaseTone[seg.pace];
  const phaseColor = light ? tone.light : tone.dark;
  const digits = Math.min(140, Math.max(84, width * 0.27));
  const showScene = !prefs.lowPower && world.layers.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingTop: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }}>
        <Pressable onPress={() => router.replace('/dashboard')} accessibilityRole="button" accessibilityLabel={started ? 'Back to home. Your walk keeps time.' : 'Back to home'}
          style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </Pressable>
        <Text style={[type.label, { color: C.text, flex: 1, textAlign: 'center' }]} numberOfLines={1}>{name}</Text>
        <Pressable onPress={() => setShowSettings(s => !s)} accessibilityRole="button" accessibilityLabel="Walk settings: sound, voice, vibration, display"
          style={{ minWidth: 48, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Ionicons name={showSettings ? 'close' : 'options-outline'} size={26} color={C.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        {showSettings ? (
          <SettingsPanel prefs={prefs} setPrefs={setPrefs} caps={caps} wakeHeld={wakeHeld} running={running} C={C} />
        ) : null}

        {/* Static scene band: decorative, never animated during a walk */}
        {showScene ? (
          <View style={{ height: 92, borderRadius: round.lg, overflow: 'hidden', marginTop: 8, opacity: light ? 0.9 : 0.75 }}>
            <Scenery world={world} still focus="horizon" />
          </View>
        ) : null}

        {/* Phase */}
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={started ? `${PHASE_COPY[seg.pace].label}. ${spokenDuration(phase.remainingInSegment)} left in this part.` : `Ready. First: ${PHASE_COPY[seg.pace].label}`}
          style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: phaseColor, alignItems: 'center', justifyContent: 'center' }}>
            <PhaseIcon pace={seg.pace} size={28} color={light ? tone.onLight : tone.onDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.eyebrow, { color: C.sub }]}>{started ? (running ? 'Now' : 'Paused') : 'First up'}</Text>
            <Text style={[type.title, { color: C.text, fontSize: 30, lineHeight: 36 }]}>{PHASE_COPY[seg.pace].label}</Text>
          </View>
        </View>

        {/* Countdown */}
        <Text accessibilityElementsHidden importantForAccessibility="no"
          style={[type.num, { color: C.text, fontSize: digits, lineHeight: digits * 1.05, letterSpacing: -2, marginTop: 10, textAlign: 'center' }]}>
          {fmtClock(started ? phase.remainingInSegment : seg.seconds)}
        </Text>
        <Text style={[type.small, { color: C.sub, textAlign: 'center', fontSize: 16 }]}>
          Part {Math.min(phase.index + 1, segments.length)} of {segments.length} · {fmtClock(started ? phase.remainingTotal : total)} left in walk
        </Text>

        {/* Progress */}
        <View style={{ marginTop: 22 }}>
          <Timeline segments={segments} progress={phase.elapsed / (total || 1)} light={light} />
        </View>

        {/* Next */}
        <View style={{ marginTop: 18, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: round.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
          {phase.next || !started ? (
            <>
              <Text style={[type.eyebrow, { color: C.sub }]}>Next</Text>
              {(() => { const n = started ? phase.next! : segments[1]; if (!n) return <Text style={[type.label, { color: C.text }]}>Finish</Text>; return (<>
                <PhaseIcon pace={n.pace} color={light ? phaseTone[n.pace].light : phaseTone[n.pace].dark} />
                <Text style={[type.label, { color: C.text, flex: 1 }]}>{PHASE_COPY[n.pace].label}</Text>
                <Text style={[type.num, { color: C.sub, fontSize: 16 }]}>{fmtClock(n.seconds)}</Text>
              </>); })()}
            </>
          ) : (
            <Text style={[type.label, { color: C.text }]}>Last part — you’re nearly there</Text>
          )}
        </View>

        {/* Controls */}
        <View style={{ marginTop: 24, gap: 12 }}>
          {!started ? (
            <Button big label="Start walk" icon="play" onPress={onStart} a11yHint="Starts the timer with your chosen cues" />
          ) : confirmFinish ? (
            <Card style={{ gap: 12, backgroundColor: C.card, borderColor: C.line }}>
              <Text style={[type.label, { color: C.text }]}>Finish now? We’ll save {fmtMinutes(phase.elapsed)} of walking.</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Button label="Keep walking" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirmFinish(false)} />
                <Button label="Finish" style={{ flex: 1 }} onPress={onFinish} />
              </View>
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {running
                ? <Button big label="Pause" icon="pause" style={{ flex: 1.4 }} onPress={pause} />
                : <Button big label="Resume" icon="play" style={{ flex: 1.4 }} onPress={onResume} />}
              <Button big label="Finish" icon="flag-outline" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirmFinish(true)}
                tone={light ? { bg: '#ECE6DA', fg: '#121212' } : undefined} />
            </View>
          )}
        </View>

        <Text style={[type.small, { color: C.sub, marginTop: 20, textAlign: 'center' }]}>
          {Platform.OS === 'web'
            ? 'Time stays accurate if you lock your phone or switch apps, but sounds and voice may wait until you come back. Please stay aware of your surroundings.'
            : 'Time stays accurate in the background. Please stay aware of your surroundings.'}
        </Text>
      </ScrollView>
    </View>
  );
}

function SettingsPanel({ prefs, setPrefs, caps, wakeHeld, running, C }: any) {
  const vol = Math.round(prefs.volume * 100);
  const light = prefs.brightMode;
  const pal = light ? LIGHT_TOGGLE : undefined;
  const stepTone = light ? { bg: '#ECE6DA', fg: '#121212' } : undefined;
  return (
    <Card style={{ marginTop: 8, gap: 2, backgroundColor: C.card, borderColor: C.line }}>
      <BaseToggle palette={pal} label="Spoken announcements" value={prefs.voice && caps.speech} onChange={v => setPrefs({ voice: v })}
        note={caps.speech ? 'Plays over music briefly; it won’t stop your music.' : 'Not available in this browser.'} />
      <BaseToggle palette={pal} label="Chimes" value={prefs.chime} onChange={v => setPrefs({ chime: v })} note="Rising for brisk, falling for easy." />
      <BaseToggle palette={pal} label="Vibration" value={prefs.vibrate} onChange={v => setPrefs({ vibrate: v })}
        note={caps.vibrate ? undefined : 'Not supported here (iPhone browsers don’t allow it).'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 }}>
        <Text style={[type.label, { flex: 1, color: C.text }]}>Cue volume</Text>
        <Button label="Quieter" kind="secondary" icon="remove" tone={stepTone} style={{ minHeight: 48, paddingHorizontal: 12 }} onPress={() => setPrefs({ volume: Math.max(0, +(prefs.volume - 0.1).toFixed(1)) })} />
        <Text accessibilityLiveRegion="polite" style={[type.num, { width: 48, textAlign: 'center', color: C.text, fontSize: 16 }]}>{vol}%</Text>
        <Button label="Louder" kind="secondary" icon="add" tone={stepTone} style={{ minHeight: 48, paddingHorizontal: 12 }} onPress={() => setPrefs({ volume: Math.min(1, +(prefs.volume + 0.1).toFixed(1)) })} />
      </View>
      <BaseToggle palette={pal} label="Bright light mode" value={prefs.brightMode} onChange={v => setPrefs({ brightMode: v })} note="Dark text on light for strong sunshine." />
      <BaseToggle palette={pal} label="Low-power mode" value={prefs.lowPower} onChange={v => setPrefs({ lowPower: v })} note="Hides scenery and animation everywhere." />
      <BaseToggle palette={pal} label="Keep screen on" value={prefs.keepAwake} onChange={v => setPrefs({ keepAwake: v })}
        note={!caps.wakeLock ? 'Not supported in this browser.' : running ? (wakeHeld ? 'Screen is being kept on.' : 'Waiting for permission.') : 'Starts when your walk starts.'} />
    </Card>
  );
}

function Finished({ seconds, complete, saved, name, segments }: { seconds: number; complete: boolean; saved: string; name: string; segments: Segment[] }) {
  const router = useRouter();
  const [prefs] = usePrefs();
  const world = getWorld(prefs.world);
  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <View style={{ height: 300 }}>
        {!prefs.lowPower ? <Scenery world={world} fadeTo={ink.bg} focus="horizon" /> : null}
      </View>
      <View style={{ padding: space.lg, marginTop: -60, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <Text accessibilityRole="header" style={type.display}>{complete ? 'Lovely walk.' : 'Nicely done.'}</Text>
        <Text style={type.body}>
          {complete ? `You finished ${name}.` : `You walked part of ${name}. Every bit counts.`}
        </Text>
        <Card>
          <Text style={type.eyebrow}>Time walking</Text>
          <Text style={[type.num, { color: ink.text, fontSize: 40 }]}>{fmtClock(seconds)}</Text>
          <View style={{ marginTop: 12 }}><Timeline segments={segments} height={24} /></View>
          <Text style={[type.small, { marginTop: 12 }]}>
            {saved === 'saving' ? 'Saving to your history…' : saved === 'saved' ? 'Saved to your history.' : seconds < 60 ? 'Walks under a minute aren’t saved.' : 'Couldn’t save to your history — check your connection or sign in.'}
          </Text>
        </Card>
        <Button label="Back to home" onPress={() => router.replace('/dashboard')} />
      </View>
    </View>
  );
}

function spokenDuration(sec: number) {
  const s = Math.round(sec);
  const m = Math.floor(s / 60), r = s % 60;
  if (m && r) return `${m} minute${m > 1 ? 's' : ''} ${r} seconds`;
  if (m) return `${m} minute${m > 1 ? 's' : ''}`;
  return `${r} seconds`;
}
