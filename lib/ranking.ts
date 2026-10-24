import {getSku,reviewStats,reviewsForSku} from './catalog';
import {memoryConfidence,reviewPreference} from './memory';
import type {Profile,Verdict} from './types';

export function rankingPolicy(profile:Profile) {
  const learned=reviewPreference(profile);
  const confidence=learned?Math.round(memoryConfidence(learned)*100)/100:0;
  return {reviewWeight:learned?0.5+0.4*confidence:0.35,priceWeight:learned?0.5-0.4*confidence:0.65,rule:'Apply these weights among relevant products after satisfying the current request. Current explicit constraints take precedence over learned preferences.'};
}

/** Re-rank only the model's relevant pair, never unrelated products across the catalog. */
export function personalizeVerdict(profile:Profile,verdict:Verdict,question:string):Verdict {
  const memory=reviewPreference(profile);
  if(!memory||verdict.clarifyingQuestion||!verdict.pickSkuId)return verdict;
  let next={...verdict};
  const pick=getSku(verdict.pickSkuId)!,runner=verdict.runnerUpSkuId?getSku(verdict.runnerUpSkuId):undefined;
  const hardPrice=/\b(cheapest|lowest price|under|at most|maximum|no more than)\b/i.test(question);
  if(runner&&runner.category===pick.category&&runner.type===pick.type&&!hardPrice){
    const a=reviewStats(pick.id).average,b=reviewStats(runner.id).average;
    const weights=rankingPolicy(profile);
    if(a!==null&&b!==null&&a!==b){
      const ratingSpan=Math.abs(a-b),priceSpan=Math.abs(pick.price-runner.price)||1;
      const advantage=weights.reviewWeight*(b-a)/ratingSpan-weights.priceWeight*(runner.price-pick.price)/priceSpan;
      if(advantage>0){
        const rows=reviewsForSku(runner.id).sort((a,b)=>a.stars-b.stars);
        next={...next,pickSkuId:runner.id,runnerUpSkuId:pick.id,reason:`${runner.name} has a ${b}/5 average across ${rows.length} seeded reviews, at ₩${runner.price.toLocaleString('en-US')}.`,dissent:rows.length?`One customer reports: “${rows[0].text}”`:'No reviews are available.',citations:rows.slice(0,3).map(row=>row.id),whyRunnerUpLost:`${pick.name} averages ${a}/5. Your learned review preference gave the other option more weight.`};
      }
    }
  }
  const day=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:profile.timezone}).format(new Date(memory.createdAt));
  next.reason=`You ranked reviews above price — you taught me that on ${day}. ${next.reason}${hardPrice?' Your explicit price constraint comes first here.':''}`;
  return next;
}
