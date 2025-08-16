\
// src/lib/common/name_map.js
function stripDiacritics(s){
  try{ return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); }catch{ return s; }
}
export function normalizePlayerName(raw){
  if (!raw) return "";
  let s = String(raw);
  s = stripDiacritics(s).replace(/\\./g,'').replace(/\\s+/g,' ').trim();
  if (s.includes(',')){
    const [last, first] = s.split(',').map(x=>x.trim());
    if (first && last) s = `${first} ${last}`;
  }
  s = s.replace(/\\bJr\\b\\.?/i,'').replace(/\\bSr\\b\\.?/i,'').replace(/\\bII\\b/i,'').replace(/\\bIII\\b/i,'');
  s = s.replace(/\\s+/g,' ').trim();
  const alias = {
    "Shohei Ohtani": ["Ohtani Shohei","S Ohtani"],
    "Kyle Schwarber": ["K Schwarber"],
    "Cal Raleigh": ["C Raleigh"],
    "Juan Soto": ["J Soto"],
    "Aaron Judge": ["A Judge"],
    "Yordan Alvarez": ["Y Alvarez","Yordan Alvarez","Yordan \\u00C1lvarez","Y \\u00C1lvarez"],
    "Pete Alonso": ["P Alonso","Peter Alonso"],
    "Gunnar Henderson": ["G Henderson"],
    "Matt Olson": ["M Olson"],
    "Corey Seager": ["C Seager"],
    "Marcell Ozuna": ["M Ozuna"],
    "Kyle Tucker": ["K Tucker"],
    "Rafael Devers": ["R Devers"],
    "Jack Suwinski": ["J Suwinski"],
    "Kyle Higashioka": ["K Higashioka"],
    "Daylen Lile": ["D Lile"],
    "Christian Walker": ["C Walker"],
    "Jose Altuve": ["Jose Altuve","J Altuve"],
    "Carlos Correa": ["C Correa"],
    "Yainer Diaz": ["Y Diaz","Yainer Diaz"],
    "Jesus Sanchez": ["Jesus Sanchez","J Sanchez"]
  };
  for (const [canon, list] of Object.entries(alias)){
    if (s.toLowerCase() === canon.toLowerCase()) return canon;
    for (const a of list){
      if (s.toLowerCase() === a.toLowerCase()) return canon;
    }
  }
  return s;
}
