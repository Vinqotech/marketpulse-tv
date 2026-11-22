export type TimedSegment={duration_frames:number};
export function broadcastTiming(props:{segments:TimedSegment[];act1DurationFrames?:number;totalDurationFrames?:number;showdown?:unknown}){
 const total=props.segments.reduce((sum,s)=>sum+s.duration_frames,0);
 if(!Number.isInteger(total)||total<1)throw new Error('Invalid narration duration');
 if(props.showdown){
  const act1=props.segments.slice(0,-1).reduce((sum,s)=>sum+s.duration_frames,0);
  if(props.act1DurationFrames!==act1||props.totalDurationFrames!==total||act1<1||act1>=total)throw new Error('Act timings must match measured narration frames');
 }
 return {durationInFrames:props.totalDurationFrames??total,fps:30};
}
export function isShowdownFrame(frame:number,act1DurationFrames:number){return frame>=act1DurationFrames;}