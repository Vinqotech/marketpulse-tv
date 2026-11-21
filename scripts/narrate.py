import json, sys, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro import KPipeline
payload=json.load(open(sys.argv[1]))
root=Path('render-assets'); root.mkdir(exist_ok=True)
pipeline=KPipeline(lang_code='a')
segments=payload['script_json']['segments']
tracks=[]
for i,segment in enumerate(segments):
    chunks=[audio for _,_,audio in pipeline(segment['narration'],voice='af_heart',speed=1)]
    if not chunks: raise RuntimeError('Kokoro produced no audio')
    raw=root / f'raw-{i}.wav'; out=root / f'segment-{i}.wav'
    sf.write(raw,np.concatenate(chunks),24000)
    duration=segment['duration_frames']/30
    actual=sum(len(c) for c in chunks)/24000
    factor=actual/duration
    filters=[]
    while factor<0.5: filters.append('atempo=0.5'); factor/=0.5
    while factor>2: filters.append('atempo=2'); factor/=2
    filters.extend([f'atempo={factor}',f'apad',f'atrim=duration={duration}'])
    subprocess.run(['ffmpeg','-y','-i',str(raw),'-af',','.join(filters),'-ar','48000',str(out)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    tracks.append(sf.read(out)[0])
sf.write(root / 'narration.wav',np.concatenate(tracks),48000)
