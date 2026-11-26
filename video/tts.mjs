// Voice-over via ElevenLabs. Each line is cached by a hash of its text and
// voice settings, so rebuilding the video only pays for lines that changed.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
  return { file, seconds: audioDuration(file) };
}
