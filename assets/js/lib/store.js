/* Stockage local, isolé par certification. Chaque accès est protégé :
   en navigation privée ou si le stockage est bloqué, la page fonctionne sans mémoriser. */

const ROOT = 'certrev:';

export function createStore(certId){
  const prefix = ROOT + certId + ':';
  return {
    get(key, fallback){
      try{
        const raw = localStorage.getItem(prefix + key);
        if(raw == null) return fallback;
        const v = JSON.parse(raw);
        return v == null ? fallback : v;
      }catch(e){ return fallback; }
    },
    set(key, value){
      try{ localStorage.setItem(prefix + key, JSON.stringify(value)); }catch(e){}
    },
    remove(key){
      try{ localStorage.removeItem(prefix + key); }catch(e){}
    }
  };
}

/* Résumé lu par le catalogue : points revus, quiz, dernier examen. */
export function readSummary(certId){
  return createStore(certId).get('summary', null);
}
