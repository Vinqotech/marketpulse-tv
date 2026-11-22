import {execFileSync} from 'node:child_process';

export const RENDER_FPS = 30;
export const AUDIO_FILTER = 'aresample=48000,pan=stereo|c0=c0|c1=c0';

export function normalizeNarration(input, output) {
  execFileSync('ffmpeg', ['-y', '-i', input, '-vn', '-af', AUDIO_FILTER,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output], {stdio: 'inherit'});
}

export function muxBroadcast(video, narration, output) {
  // Mux the normalized WAV, not an intermediate compressed audio track.
  // Neither input is retimed: no atempo, asetrate, -shortest or input -r.
  execFileSync('ffmpeg', ['-y', '-i', video, '-i', narration,
    '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=1920:1080',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25',
    '-maxrate', '1800k', '-bufsize', '3600k', '-g', '60', '-keyint_min', '60',
    '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-r', String(RENDER_FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', output], {stdio: 'inherit'});
}