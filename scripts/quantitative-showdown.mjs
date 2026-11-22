// GitHub CPU runner only: never import this module into the station's web graph.
export const PAIRS = [
 [{ticker:'CAT',name:'Caterpillar'},{ticker:'DE',name:'Deere'}],
 [{ticker:'BA',name:'Boeing'},{ticker:'LMT',name:'Lockheed Martin'}],
 [{ticker:'LLY',name:'Eli Lilly'},{ticker:'PFE',name:'Pfizer'}],
 [{ticker:'UNH',name:'UnitedHealth Group'},{ticker:'JNJ',name:'Johnson & Johnson'}],
 [{ticker:'NVDA',name:'Nvidia'},{ticker:'AMD',name:'Advanced Micro Devices'}],
 [{ticker:'BTC-USD',name:'Bitcoin'},{ticker:'GLD',name:'SPDR Gold Shares (gold ETF)'}],
];
export function selectPair(stories,episodeId){
 const text=stories.map(s=>`${s.title} ${s.summary}`).join(' ');
 const rules=[[/\b(chip|chips|semiconductor|AI|Nvidia|AMD)\b/i,4],[/\b(bitcoin|crypto|gold)\b/i,5],[/\b(aircraft|aviation|defense|Boeing)\b/i,1],[/\b(drug|pharma|Lilly|Pfizer)\b/i,2],[/\b(health|insurance|hospital)\b/i,3],[/\b(industrial|construction|agriculture|Caterpillar|Deere)\b/i,0]];
 const matched=rules.find(([pattern])=>pattern.test(text));
 const hash=Array.from(episodeId).reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
 return PAIRS[matched?matched[1]:hash%PAIRS.length];
}
function anniversary(date,years){const out=new Date(date);out.setUTCFullYear(out.getUTCFullYear()-years);return out;}
export function calculateMetrics(chart,asset,now=new Date()){
 const result=chart.chart?.result?.[0];
 if(!result||chart.chart?.error)throw new Error(`No historical data for ${asset.ticker}`);
 if(result.meta?.currency!=='USD')throw new Error(`${asset.ticker}: expected USD history`);
 const closes=result.indicators?.quote?.[0]?.close;
 const adjusted=result.indicators?.adjclose?.[0]?.adjclose;
 if(!closes||!adjusted)throw new Error(`${asset.ticker}: missing adjusted prices`);
 const cutoff=now.getTime()-36*60*60*1000;
 const rows=(result.timestamp||[]).map((timestamp,i)=>({time:timestamp*1000,close:closes[i],adjusted:adjusted[i]})).filter(r=>r.time<=now.getTime()&&Number.isFinite(r.close)&&r.close>0&&Number.isFinite(r.adjusted)&&r.adjusted>0).sort((a,b)=>a.time-b.time);
 const last=rows.at(-1);if(!last)throw new Error(`${asset.ticker}: empty price history`);
 // Staleness includes weekends and exchange holidays; do not fabricate a quote.
 if(last.time<cutoff-7*86400000)throw new Error(`${asset.ticker}: stale latest close`);
 const startDate=anniversary(new Date(last.time),5).getTime();
 const yearDate=anniversary(new Date(last.time),1).getTime();
 const first=rows.filter(r=>r.time<=startDate).at(-1);
 const year=rows.filter(r=>r.time<=yearDate).at(-1);
 if(!first||!year||startDate-first.time>10*86400000||yearDate-year.time>10*86400000)throw new Error(`${asset.ticker}: incomplete five-year history`);
 let peak=first.adjusted,drawdown=0;
 for(const row of rows.filter(r=>r.time>=first.time)){peak=Math.max(peak,row.adjusted);drawdown=Math.min(drawdown,(row.adjusted/peak-1)*100);}
 return {...asset,currency:'USD',current_price:last.close,one_year_return:(last.adjusted/year.adjusted-1)*100,five_year_return:(last.adjusted/first.adjusted-1)*100,investment_value:10000*last.adjusted/first.adjusted,max_drawdown:drawdown,as_of:new Date(last.time).toISOString().slice(0,10),history_start:new Date(first.time).toISOString().slice(0,10)};
}
export async function fetchAsset(asset,fetcher=fetch,now=new Date()){
 const start=anniversary(now,5);start.setUTCDate(start.getUTCDate()-20);
 let failure;
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  for(let attempt=0;attempt<2;attempt++){
   try{
    const url=new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(asset.ticker)}`);
    url.search=new URLSearchParams({period1:String(Math.floor(start.getTime()/1000)),period2:String(Math.floor(now.getTime()/1000)),interval:'1d',events:'div,splits',includeAdjustedClose:'true'}).toString();
    const response=await fetcher(url,{headers:{'User-Agent':'MarketPulseTV/1.0 financial education'},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const metrics=calculateMetrics(await response.json(),asset,now);
    console.log(`[quant] ${asset.ticker}: latest USD close ${metrics.current_price.toFixed(2)}; 1Y ${metrics.one_year_return.toFixed(2)}%; 5Y ${metrics.five_year_return.toFixed(2)}%; $10K ${metrics.investment_value.toFixed(2)}; drawdown ${metrics.max_drawdown.toFixed(2)}%; as of ${metrics.as_of}`);
    return metrics;
   }catch(error){failure=error;console.warn(`[quant] ${asset.ticker}: history attempt failed (${error.message})`);}
  }
 }
 throw new Error(`Verified historical data unavailable for ${asset.ticker}: ${failure?.message}. No invented prices will be broadcast.`);
}
export const wordCount=text=>text.trim().split(/\s+/).filter(Boolean).length;
const money=value=>`${Math.round(value).toLocaleString('en-US')} dollars`;
const change=value=>`${Math.abs(value).toFixed(1)} percent ${value>=0?'gain':'loss'}`;
export function buildAnalysis(assets,budget){
 const [a,b]=assets;
 if(!a||!b)throw new Error('Two verified assets are required');
 let scoreA=0,scoreB=0;
 for(const field of ['one_year_return','five_year_return','max_drawdown']){if(a[field]>b[field])scoreA++;else if(b[field]>a[field])scoreB++;}
 const verdict=scoreA===scoreB?'The historical scorecard is tied.':`${scoreA>scoreB?a.name:b.name} leads this historical scorecard in ${Math.max(scoreA,scoreB)} of three measures.`;
 const blocks=[
 `Our quantitative head to head compares ${a.name} with ${b.name}. This is a historical scorecard, not a forecast or a recommendation. We are using the latest available daily closing prices in US dollars and five years of adjusted daily history.`,
 `First, the starting price. ${a.name} last closed at ${a.current_price.toFixed(2)} dollars, compared with ${b.current_price.toFixed(2)} dollars for ${b.name}. A lower share price does not by itself mean an asset is cheaper. Price is a starting reference, not a valuation verdict.`,
 `On one year momentum, ${a.name} recorded a ${change(a.one_year_return)}, while ${b.name} recorded a ${change(b.one_year_return)}. This shows how each performed over the same length of time. It does not tell us whether that direction will continue.`,
 `The five year view broadens the comparison. ${a.name} delivered a ${change(a.five_year_return)}. ${b.name} delivered a ${change(b.five_year_return)}. A hypothetical ten thousand dollars would have become ${money(a.investment_value)} in ${a.name}, versus ${money(b.investment_value)} in ${b.name}, before taxes and trading costs.`,
 `Now consider crash survival. The worst daily closing peak to trough decline was ${Math.abs(a.max_drawdown).toFixed(1)} percent for ${a.name}, and ${Math.abs(b.max_drawdown).toFixed(1)} percent for ${b.name}. A smaller decline means a shallower historical drawdown. It does not mean that future losses are capped at that level.`,
 ];
 const explanations=[
 'The investment illustration multiplies the original stake by the ratio between the final and initial adjusted prices. It is not a deposit account and it is not a guaranteed payout. Adjusted prices account for splits and, where the provider includes them, distributions. Actual investor results can differ.',
 'Momentum and compounding answer different questions. The one year window emphasizes recent direction. The five year window captures a longer stretch of gains and setbacks. Strong recent performance can coexist with a weaker long term record, so neither window should replace the other.',
 'Drawdown starts at a previous closing high and measures the fall to a subsequent closing low. The calculation scans the entire five year path, not just the difference between the first and last prices. Intraday losses can be larger than a daily closing calculation reveals.',
 'A percentage loss and the recovery needed after it are not symmetrical. Once capital falls, subsequent gains start from a smaller base. This is why the depth of a setback matters alongside the final return. Ending wealth alone can hide a difficult journey.',
 'This scorecard weights recent return, long term return and shallower drawdown equally. It deliberately does not incorporate earnings forecasts, business valuation, balance sheet strength or portfolio diversification. A historical leader on these measures is not automatically the better purchase at the next opening bell.',
  'Reading across the three measures is more useful than focusing on the largest number. A stronger return with a deeper crash represents a different historical experience from a smaller return with a shallower decline. The score summarizes these observations, but it cannot capture every risk an investor may face.',
 'The comparison uses available trading observations around each anniversary rather than assuming every calendar day has a closing price. Markets have different trading schedules. Bitcoin trades through weekends, while a gold exchange traded fund follows exchange sessions. Those differences matter when reading any side by side history.',
 'The gold comparison uses SPDR Gold Shares, a gold exchange traded fund, not a live spot gold quote. Bitcoin is a digital asset rather than an equity. When these are the selected pair, the comparison is about two price paths, not two interchangeable businesses.',
 ];
 const ending=`The quantitative verdict: ${verdict} That result describes the measured past, not the next move. Consider momentum, compounding and crash survival together. For educational purposes only. Not financial advice. This has been MarketPulse TV.`;
 if(!assets.some(x=>x.ticker==='GLD'))explanations.splice(-1,1);
 let narration=blocks.join(' ');
 for(const paragraph of explanations){
  if(wordCount(`${narration} ${paragraph} ${ending}`)<=budget*1.08)narration+=` ${paragraph}`;
 }
 narration+=` ${ending}`;
 if(wordCount(narration)<budget*.9||wordCount(narration)>budget*1.1)throw new Error(`Act 2 word budget mismatch: ${wordCount(narration)} vs ${budget}`);
 return {narration,showdown:{assets,verdict,methodology:'Yahoo Finance daily history; latest available USD close. Anniversary adjusted-price returns and $10K growth; maximum daily closing drawdown. Before tax and transaction costs. GLD is a gold ETF, not spot gold.'}};
}
export async function prepareShowdown(payload,fetcher=fetch){
 const script=payload.script_json;const plan=script.two_act;
 if(!plan)throw new Error('Missing dynamic two-act budget; generate a new bulletin');
 const pair=selectPair(script.editorial_stories||[],payload.episode_id);
 const assets=await Promise.all(pair.map(asset=>fetchAsset(asset,fetcher)));
 const analysis=buildAnalysis(assets,plan.act2_words);
 script.showdown=analysis.showdown;
 script.segments.push({headline:`${assets[0].ticker} vs ${assets[1].ticker} · Quantitative Asset Showdown`,narration:analysis.narration,takeaways:['One-year momentum','Five-year compounding','Crash survival'],chart_data:[],duration_frames:1});
 console.log(`[quant] Act 2: ${wordCount(analysis.narration)} words / target ${plan.act2_words}`);
 return payload;
}