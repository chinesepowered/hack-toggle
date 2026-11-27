// Voice-over via ElevenLabs. Each line is cached by a hash of its text and
// voice settings, so rebuilding the video only pays for lines that changed.

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VOICE = {
  id: 'cgSgspJ2msm6clMCkdW9', // "Jessica": young, American, playful and warm
  model: 'eleven_multilingual_v2',
  settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
};

export function audioDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(out.trim());
}

// Returns { file, seconds } for one narration line. `before` and `after` are the
// neighbouring lines; passing them keeps the intonation continuous across files.
export async function speak(text, { dir, before = '', after = '' }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  mkdirSync(dir, { recursive: true });
  const hash = createHash('sha256').update(JSON.stringify([VOICE, text, before, after])).digest('hex').slice(0, 16);
  const file = join(dir, `${hash}.mp3`);
  if (!existsSync(file)) {
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set and this line is not cached');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: VOICE.model,
        voice_settings: VOICE.settings,
        previous_text: before || undefined,
        next_text: after || undefined,
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  // Keep only the speech, so that the pauses between lines are the builder's to set.
  const speech = file.replace(/\.mp3$/, '.speech.wav');
  if (!existsSync(speech)) {
    const [start, end] = speechBounds(file);
    const fades = `afade=t=in:d=0.01,afade=t=out:st=${(end - start - 0.04).toFixed(3)}:d=0.04`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-ss', start.toFixed(3), '-to', end.toFixed(3), '-af', fades, speech]);
  }
  return { file: speech, seconds: audioDuration(speech) };
}

// Where the speech is in a clip, as [start, end] in seconds. The service pads a
// line with silence, and now and then leaves a click before or after it: a sound
// shorter than 0.2 s, separated from the speech by 0.4 s or more of silence.
export function speechBounds(file) {
  const total = audioDuration(file);
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-45dB:d=0.15', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Math.max(Number(m[1]), 0));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const silences = starts.map((from, i) => ({ from, to: ends[i] ?? total }));
  const first = silences[0];
  const last = silences.at(-1);
  let start = 0;
  let end = total;
  if (first && (first.from < 0.05 || (first.from < 0.2 && first.to - first.from >= 0.4))) start = Math.max(first.to - 0.03, 0);
  if (last && (total - last.to < 0.05 || (total - last.to < 0.2 && last.to - last.from >= 0.4))) end = Math.min(last.from + 0.1, total);
  return [start, end];
}
