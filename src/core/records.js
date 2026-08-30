/* ===== core/records.js — persistent local service record =====
   Best-run stats survive page reloads via localStorage. Everything is
   wrapped in try/catch: localStorage can throw (private browsing, blocked
   third-party contexts) and the game must never die over a high score. */

const KEY = 'skyfall.best.v1';

/* -> {score, dist, kills, date} | null */
export function loadBest(){
  try{
    const b = JSON.parse(localStorage.getItem(KEY));
    if(b && typeof b.score === 'number') return b;
  }catch(e){ /* storage unavailable or corrupt — treat as no record */ }
  return null;
}

export function saveBest(b){
  try{ localStorage.setItem(KEY, JSON.stringify(b)); }catch(e){ /* best effort */ }
}

/* Compare a finished run against the stored record. Persists if it's a new
   best and reports back what to show on the game-over screen. */
export function submitRun(score, dist, kills){
  const prev = loadBest();
  const isRecord = !prev || score > prev.score;
  if(isRecord) saveBest({ score, dist, kills, date: Date.now() });
  return { isRecord, best: isRecord ? score : prev.score };
}
