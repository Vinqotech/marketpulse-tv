"""Preserve Kokoro's real-time speech; pad silence, never change tempo."""
import json
import math
import subprocess
import sys
from pathlib import Path

FPS = 30
NORMALIZE_FILTER = 'aresample=48000,pan=stereo|c0=c0|c1=c0'


def run_audio(command):
    """Keep successful tools quiet, but never discard their failure reason."""
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        print(f'[audio] {command[0]} failed with exit code {error.returncode}', file=sys.stderr, flush=True)
        for output in (error.stdout, error.stderr):
            if output:
                print(output.rstrip(), file=sys.stderr, flush=True)
        raise
    except OSError as error:
        print(f'[audio] Cannot start {command[0]}: {error}', file=sys.stderr, flush=True)
        raise


def prepare_segment(source, output, requested_frames):
    probe = run_audio(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(source)],
    )
    seconds = float(json.loads(probe.stdout)['format']['duration'])
    frames = max(int(requested_frames), math.ceil(seconds * FPS))
    # Extend the picture for long narration; short narration gets trailing silence.
    run_audio([
        'ffmpeg', '-y', '-i', str(source), '-af',
        f'{NORMALIZE_FILTER},apad,atrim=duration={frames / FPS}',
        '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(output),
    ])
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
        run_audio(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
                   '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(wav)])
        run_audio(['ffmpeg', '-y', '-i', str(wav), '-ar', '48000', '-ac', '2',
                   '-c:a', 'aac', '-b:a', '128k', str(root / f'act{act}.m4a')])
        probe = run_audio(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                           '-of', 'json', str(wav)])
        measured = float(json.loads(probe.stdout)['format']['duration'])
        if abs(measured - counts[act-1]/FPS) > .0001:
            raise ValueError('Act duration differs from normalized audio timeline')
        print(f'[audio] Act {act}: measured {measured:.6f}s, {counts[act-1]} frames; 48 kHz stereo AAC copy, 1.0x', flush=True)
    listing = root / 'acts-concat.txt'
    listing.write_text(''.join(f"file '{(root / f'act{i}.wav').resolve()}'\n" for i in (1, 2)))
    run_audio(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
                    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(root / 'narration-source.wav')],
                   )
    return {'act1DurationFrames': counts[0], 'totalDurationFrames': sum(counts)}