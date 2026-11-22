"""Preserve Kokoro's real-time speech; pad silence, never change tempo."""
import json
import math
import subprocess
from pathlib import Path

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


def assemble_acts(root, segments):
    """Concatenate normalized PCM on exact frame boundaries; AAC copies are inspectable acts.

    Mux from PCM, never concatenate AAC encoder delays. At 48 kHz / 30 FPS every
    frame is exactly 1600 samples. Rounding adds at most one frame per segment.
    """
    root = Path(root)
    if len(segments) < 2:
        raise ValueError('Both acts require narration')
    counts = [sum(s['duration_frames'] for s in segments[:-1]), segments[-1]['duration_frames']]
    groups = [list(range(len(segments)-1)), [len(segments)-1]]
    for act, indices in enumerate(groups, 1):
        listing = root / f'act{act}-concat.txt'
        listing.write_text(''.join(f"file '{(root / f'segment-{i}.wav').resolve()}'\n" for i in indices))
        wav = root / f'act{act}.wav'
        subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
                        '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(wav)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['ffmpeg', '-y', '-i', str(wav), '-ar', '48000', '-ac', '2',
                        '-c:a', 'aac', '-b:a', '128k', str(root / f'act{act}.m4a')], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                '-of', 'json', str(wav)], check=True, capture_output=True, text=True)
        measured = float(json.loads(probe.stdout)['format']['duration'])
        if abs(measured - counts[act-1]/FPS) > .0001:
            raise ValueError('Act duration differs from normalized audio timeline')
        print(f'[audio] Act {act}: measured {measured:.6f}s, {counts[act-1]} frames; 48 kHz stereo AAC copy, 1.0x', flush=True)
    listing = root / 'acts-concat.txt'
    listing.write_text(''.join(f"file '{(root / f'act{i}.wav').resolve()}'\n" for i in (1, 2)))
    subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
                    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(root / 'narration-source.wav')],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {'act1DurationFrames': counts[0], 'totalDurationFrames': sum(counts)}