import {Composition,registerRoot} from 'remotion';
import {TVBroadcast,type BroadcastProps} from './TVBroadcast';
const defaults:BroadcastProps={segments:[{headline:'MarketPulse TV',narration:'',takeaways:[],duration_frames:14400,chart_data:[]}],ticker_headlines:['MarketPulse TV'],headline_title:'MarketPulse TV',anchor_name:'Alex Morgan',channel_bug_text:'MARKETPULSE TV',start_time:'2026-11-21T00:00:00Z',anchor_image:'anchor.png',audio_src:'narration.wav'};
const Root=()=> <Composition id="TVBroadcast" component={TVBroadcast} durationInFrames={14400} fps={30} width={1920} height={1080} defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:props.segments.reduce((sum,s)=>sum+s.duration_frames,0)})}/>;
registerRoot(Root);
