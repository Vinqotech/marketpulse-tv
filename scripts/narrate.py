import json, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro import KPipeline
from narration_audio import prepare_segment, assemble_acts
payload=json.load(open(sys.argv[1]))
root=Path('render-assets'); root.mkdir(exist_ok=True)
pipeline=KPipeline(lang_code='a')
segments=payload['script_json']['segments']
tracks=[]
for i,segment in enumerate(segments):
    chunks=[audio for _,_,audio in pipeline(segment['narration'],voice='af_bella',speed=1)]
    if not chunks: raise RuntimeError('Kokoro produced no audio')
    raw=root / f'raw-{i}.wav'; out=root / f'segment-{i}.wav'
    sf.write(raw,np.concatenate(chunks),24000)
    segment['duration_frames']=prepare_segment(raw,out,0 if payload['script_json'].get('two_act') else segment['duration_frames'])
    print(f"[audio] Segment {i+1}: 1.0x speech, 48000 Hz stereo, {segment['duration_frames']/30:.3f}s timeline",flush=True)
    tracks.append(sf.read(out)[0])
sf.write(root / 'narration-source.wav',np.concatenate(tracks),48000,subtype='PCM_16')
if payload['script_json'].get('two_act'):
    timing=assemble_acts(root,segments)
    with open(root / 'timing.json','w') as output:
        json.dump(timing,output)
with open(root / 'segments.json','w') as output:
    json.dump(segments,output)
