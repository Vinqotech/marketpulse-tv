"""Preserve Kokoro's real-time speech; pad silence, never change tempo."""
import json
import math
import subprocess

FPS = 30
NORMALIZE_FILTER = 'aresample=48000,pan=stereo|c0=c0|c1=c0'


def prepare_segment(source, output, requested_frames):
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(source)],
        check=True, capture_output=True, text=True,
    )
    seconds = float(json.loads(probe.stdout)['format']['duration'])
    frames = max(int(requested_frames), math.ceil(seconds * FPS))
    # Extend the picture for long narration; short narration gets trailing silence.
    subprocess.run([
        'ffmpeg', '-y', '-i', str(source), '-af',
        f'{NORMALIZE_FILTER},apad,atrim=duration={frames / FPS}',
        '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(output),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return frames