/**
 * Darts Bot scoring engine — individual-dart opponent model.
 * A dart is { score, isDouble?, isBull?, isTreble?, label }.
 */

export const BOT_LEVELS = Object.freeze({
  1: { averageMin: 55, averageMax: 64, peakDarts: 25, normalMaxDarts: 30 },
  2: { averageMin: 65, averageMax: 74, peakDarts: 21, normalMaxDarts: 26 },
  3: { averageMin: 75, averageMax: 84, peakDarts: 18, normalMaxDarts: 22 },
  4: { averageMin: 85, averageMax: 94, peakDarts: 16, normalMaxDarts: 18 },
  5: { averageMin: 95, averageMax: 104, peakDarts: 15, normalMaxDarts: 17 },
});

export function createLeg(startingScore = 501, rules = {}) {
  if (!Number.isInteger(startingScore) || startingScore < 2) throw new Error("Starting score must be an integer of at least 2.");
  return { startingScore, remaining: startingScore, dartsThrown: 0, pointsScored: 0, visits: [], finished: false, busted: false,
    doubleIn: Boolean(rules.doubleIn), doubleOut: rules.doubleOut !== false, opened: !rules.doubleIn };
}
function validateDart(dart) {
  if (!dart || !Number.isInteger(dart.score) || dart.score < 0 || dart.score > 60) throw new Error("Each dart must have an integer score from 0 to 60.");
}
export function applyVisit(leg, darts) {
  if (leg.finished) throw new Error("This leg has already finished.");
  if (!Array.isArray(darts) || darts.length < 1 || darts.length > 3) throw new Error("A visit must contain between one and three darts.");
  darts.forEach(validateDart);
  const before = leg.remaining; let remaining = before, opened = leg.opened, countedDarts = 0, countedPoints = 0, bustReason = null, checkout = false;
  for (const dart of darts) {
    countedDarts++;
    if (!opened && (dart.isDouble || dart.isBull)) opened = true;
    if (!opened) continue;
    remaining -= dart.score; countedPoints += dart.score;
    if (remaining < 0) { bustReason = "score_below_zero"; break; }
    if (remaining === 1 && leg.doubleOut) { bustReason = "leave_one"; break; }
    if (remaining === 0) {
      if (leg.doubleOut && !(dart.isDouble || dart.isBull)) bustReason = "finish_not_on_double";
      else checkout = true;
      break;
    }
  }
  const isBust = Boolean(bustReason), after = isBust ? before : remaining, pointsForVisit = isBust ? 0 : countedPoints;
  const visit = { before, after, darts: darts.slice(0, countedDarts).map(d => ({...d})), dartsThrown: countedDarts,
    pointsScored: pointsForVisit, rawPoints: countedPoints, bust: isBust, bustReason, checkout: !isBust && checkout };
  return { ...leg, remaining: after, dartsThrown: leg.dartsThrown + countedDarts, pointsScored: leg.pointsScored + pointsForVisit,
    visits: [...leg.visits, visit], finished: !isBust && checkout, busted: isBust, opened };
}
/** Applies a visit entered as a total rather than three individually recorded darts.
 * Total-entry mode cannot infer dart order, so checkout attempts must use dart mode.
 */
export function applyTotalVisit(leg, total) {
  if (leg.finished) throw new Error("This leg has already finished.");
  if (!Number.isInteger(total) || total < 0 || total > 180) throw new Error("Visit total must be an integer from 0 to 180.");
  const before = leg.remaining;
  if (total >= before) throw new Error("Use individual darts to record a checkout.");
  const remaining = before - total;
  const bustReason = remaining === 1 ? "leave_one" : null;
  const bust = Boolean(bustReason);
  const visit = { before, after: bust ? before : remaining, darts: [], dartsThrown: 3,
    pointsScored: bust ? 0 : total, rawPoints: total, bust, bustReason, checkout: false, totalEntry: true };
  return { ...leg, remaining: visit.after, dartsThrown: leg.dartsThrown + 3,
    pointsScored: leg.pointsScored + visit.pointsScored, visits: [...leg.visits, visit],
    finished: false, busted: bust };
}

export function undoVisit(leg) {
  if (!leg.visits.length) return leg;
  const visits = leg.visits.slice(0, -1), dartsThrown = visits.reduce((n,v)=>n+v.dartsThrown,0), pointsScored = visits.reduce((n,v)=>n+v.pointsScored,0), last = visits.length ? visits[visits.length - 1] : null;
  return { ...leg, remaining: last ? last.after : leg.startingScore, dartsThrown, pointsScored, visits, finished: Boolean(last?.checkout),
    busted: Boolean(last?.bust), opened: leg.doubleIn ? visits.some(v=>v.darts.some(d=>d.isDouble||d.isBull)) : true };
}
export function threeDartAverage(leg) { return leg.dartsThrown ? leg.pointsScored / leg.dartsThrown * 3 : 0; }
export function firstNineAverage(leg) {
  const firstNine = leg.visits.flatMap(v=>v.darts.map(d=>({score:v.bust?0:d.score}))).slice(0,9);
  return firstNine.length ? firstNine.reduce((s,d)=>s+d.score,0)/firstNine.length*3 : 0;
}
export function summariseLeg(leg) {
  const successfulVisits=leg.visits.filter(v=>!v.bust), checkoutVisits=leg.visits.filter(v=>v.checkout);
  return { remaining:leg.remaining, dartsThrown:leg.dartsThrown, pointsScored:leg.pointsScored, threeDartAverage:threeDartAverage(leg),
    highestVisit:Math.max(0,...successfulVisits.map(v=>v.pointsScored)), visits:leg.visits.length,
    busts:leg.visits.filter(v=>v.bust).length, finished:leg.finished, checkout:checkoutVisits.length>0 };
}

const SECTORS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const LEVEL_AIM = {
  1:{t20:.15,s20:.50,adj:.19,other:.10,miss:.06,double:0.68},
  2:{t20:.21,s20:.51,adj:.15,other:.08,miss:.05,double:0.82},
  3:{t20:.28,s20:.52,adj:.12,other:.05,miss:.03,double:0.82},
  4:{t20:.354,s20:.506,adj:.07,other:.04,miss:.03,double:0.95},
  5:{t20:.42,s20:.45,adj:.08,other:.03,miss:.02,double:0.98},
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function pickWeighted(items,rng) {
  let n=rng(), sum=0;
  for(const item of items){sum+=item.p;if(n<=sum)return item.value;}
  return items[items.length - 1].value;
}
function throwAt20(level,rng,p=LEVEL_AIM[level]) {
  const outcome=pickWeighted([
    {p:p.t20,value:"T20"},{p:p.s20,value:"S20"},{p:p.adj,value:"ADJ"},
    {p:p.other,value:"OTHER"},{p:p.miss,value:"MISS"}
  ],rng);
  if(outcome==="T20")return {score:60,isTreble:true,label:"T20"};
  if(outcome==="S20")return {score:20,label:"S20"};
  if(outcome==="ADJ"){
    const n=pickWeighted([{p:.5,value:1},{p:.5,value:5}],rng); return {score:n,label:`S${n}`};
  }
  if(outcome==="OTHER"){
    const n=pickWeighted([{p:.25,value:20},{p:.25,value:19},{p:.25,value:18},{p:.25,value:12}],rng);
    return {score:n,label:`S${n}`};
  }
  return {score:0,label:"MISS"};
}
const CHECKOUT_CACHE = new Map();
function legalCheckoutRoutes(target) {
  if(!Number.isInteger(target)||target<2||target>170)return [];
  if(CHECKOUT_CACHE.has(target))return CHECKOUT_CACHE.get(target);
  const doubles=[20,10,18,16,8,12,14,6,4,2,1,5,9,7,3,11,13,15,17,19].map(n=>({score:n*2,isDouble:true,label:`D${n}`}));
  doubles.push({score:50,isDouble:true,isBull:true,label:"BULL"});
  const scoring=[];
  for(let n=1;n<=20;n++)scoring.push({score:n,label:`S${n}`},{score:n*2,isDouble:true,label:`D${n}`},{score:n*3,isTreble:true,label:`T${n}`});
  scoring.push({score:25,label:"25"},{score:50,isDouble:true,isBull:true,label:"BULL"});
  let routes=[];
  for(const last of doubles)if(last.score===target)routes.push([last]);
  if(!routes.length)for(const last of doubles)for(const first of scoring)if(first.score+last.score===target)routes.push([first,last]);
  if(!routes.length){
    outer: for(const last of doubles)for(const first of scoring)for(const second of scoring){
      if(first.score+second.score+last.score===target){routes.push([first,second,last]);if(routes.length>=12)break outer;}
    }
  }
  CHECKOUT_CACHE.set(target,routes);
  return routes;
}
function chooseCheckoutRoute(target,level,rng,p=LEVEL_AIM[level]) {
  const routes=legalCheckoutRoutes(target);
  if(!routes.length)return null;
  const shortestLength=Math.min(...routes.map(r=>r.length));
  const shortest=routes.filter(r=>r.length===shortestLength);
  const quality=route=>route.reduce((product,d)=>{
    const hit=d.isDouble?p.double:(d.isTreble?p.t20:p.s20);
    return product*hit;
  },1);
  shortest.sort((a,b)=>quality(b)-quality(a));
  const top=shortest.slice(0,Math.min(4,shortest.length));
  return top[Math.floor(rng()*top.length)];
}
function throwAtSegment(target,level,rng,p=LEVEL_AIM[level]) {
  const isDouble=Boolean(target.isDouble), isBull=Boolean(target.isBull);
  const hit=isDouble ? p.double : (target.isTreble ? p.t20 : p.s20);
  if(rng()<hit)return {...target};
  // Misses can land in a neighbouring single, the wrong multiplier, or outside.
  const r=rng();
  if(r<.42)return {score:0,label:"MISS"};
  if(r<.78){
    const n=target.label?.match(/\d+/)?.[0];
    const base=n?Number(n):20;
    const neighbour=base===20?1:base+1;
    return {score:neighbour,label:`S${neighbour}`};
  }
  if(isDouble)return {score:target.score/2,label:`S${target.score/2}`};
  if(target.isTreble)return {score:target.score/3,label:`S${target.score/3}`};
  return {score:target.score,label:target.label};
}

/**
 * Generates a realistic three-dart visit. When remaining is a checkout,
 * the bot selects a legal route and attempts the individual darts. A missed
 * double is recorded as a miss; it is never awarded an automatic checkout.
 */
export function generateBotVisit({level=3,remaining=501,game=501,rng=Math.random}={}) {
  const profile=BOT_LEVELS[level]; if(!profile)throw new Error("Bot level must be from 1 to 5.");
  const darts=[]; let score=remaining, busted=false, checkout=false;
  const aim={...LEVEL_AIM[level]};
  if(game===301){
    const boost={1:[.01,.01,.03],2:[.02,.02,.03],3:[.02,.02,.01],4:[.02,.01,.02],5:[.07,.03,.04]}[level];
    aim.t20+=boost[0]; aim.s20+=boost[1]; aim.double=Math.min(.995,aim.double+boost[2]);
    const reduction=boost[0]+boost[1];
    aim.adj=Math.max(.01,aim.adj-reduction*.55);
    aim.other=Math.max(.01,aim.other-reduction*.25);
    aim.miss=Math.max(.005,aim.miss-reduction*.20);
    const sum=aim.t20+aim.s20+aim.adj+aim.other+aim.miss;
    aim.t20/=sum; aim.s20/=sum; aim.adj/=sum; aim.other/=sum; aim.miss/=sum;
  }
  const route=remaining<=170?chooseCheckoutRoute(remaining,level,rng,aim):null;
  if(route){
    for(const target of route){
      let dart=throwAtSegment(target,level,rng,aim);
      if(score-dart.score<2 && score-dart.score!==0 && rng()>0.015)dart={score:0,label:"MISS"};
      darts.push(dart); score-=dart.score;
      if(score===0 && (dart.isDouble||dart.isBull)){checkout=true;break;}
      if(score<2 || (score===1)){busted=true;break;}
      // A missed route ends the visit's intended finish attempt; remaining darts
      // continue as ordinary scoring darts only if there is a sensible target.
      if(dart.score!==target.score)break;
    }
    if(!checkout && !busted && darts.length<3){
      while(darts.length<3){
        let d=throwAt20(level,rng,aim);
        if(score-d.score<2 && score-d.score!==0 && rng()>0.015)d={score:0,label:"MISS"};
        darts.push(d); score-=d.score;
        if(score<2){busted=true;break;}
      }
    }
  } else {
    while(darts.length<3){
      let d=throwAt20(level,rng,aim);
      if(score-d.score<2 && rng()>0.015)d={score:0,label:"MISS"};
      darts.push(d); score-=d.score;
      if(score<2 || score===1){busted=true;break;}
    }
  }
  if(busted)return {darts,score:0,bust:true,checkout:false,dartsThrown:darts.length,targetAverage:(profile.averageMin+profile.averageMax)/2};
  return {darts,score:darts.reduce((s,d)=>s+d.score,0),bust:false,checkout,dartsThrown:darts.length,targetAverage:(profile.averageMin+profile.averageMax)/2};
}
export function generateBotDarts(options={}) { return generateBotVisit(options).darts; }

export function createMatch({game=501,legsToWin=3,opponent={type:"standard",level:3}}={}) {
  if(![301,501].includes(game))throw new Error("Game must be 301 or 501.");
  if(!Number.isInteger(legsToWin)||legsToWin<1)throw new Error("legsToWin must be a positive integer.");
  if(opponent.type==="standard"&&!BOT_LEVELS[opponent.level])throw new Error("Invalid bot level.");
  return {game,legsToWin,opponent:JSON.parse(JSON.stringify(opponent)),status:"in_progress",currentLeg:createLeg(game,{doubleOut:true}),playerLegs:0,botLegs:0,completedLegs:[]};
}
