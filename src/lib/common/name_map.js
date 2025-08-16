// src/lib/common/name_map.js
// Robust player-name normalizer so odds joins and anchor detection don't miss stars.

function stripDiacritics(s){
  try{
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }catch{ return s; }
}

export function normalizePlayerName(raw){
  if (!raw) return "";
  let s = String(raw);
  s = stripDiacritics(s);
  s = s.replace(/\./g, '');           // remove periods
  s = s.replace(/\s+/g, ' ').trim();  // collapse spaces
  // If name is "Last, First" -> "First Last"
  if (s.includes(',')){
    const [last, first] = s.split(',').map(x=>x.trim());
    if (first && last) s = `${first} ${last}`;
  }
  // Common nick/suffix cleanup
  s = s.replace(/\bJr\b\.?/i,'').replace(/\bSr\b\.?/i,'').replace(/\bII\b/i,'').replace(/\bIII\b/i,'');
  s = s.replace(/\s+/g,' ').trim();

  // Alias map for books quirks
  const alias = {
    "Shohei Ohtani": ["Ohtani Shohei","S Ohtani"],
    "Kyle Schwarber": ["K Schwarber"],
    "Cal Raleigh": ["C Raleigh"],
    "Juan Soto": ["J Soto"],
    "Aaron Judge": ["A Judge"],
    "Yordan Alvarez": ["Y Alvarez","Yordan Álvarez","Y Álvarez"],
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
    "Jose Altuve": ["José Altuve","J Altuve"],
    "Carlos Correa": ["C Correa"],
    "Yainer Diaz": ["Y Díaz","Yainer Díaz","Y Diaz"],
    "Jesus Sanchez": ["Jesús Sánchez","J Sanchez","Jesus Sánchez"]
  };
  for (const [canon, list] of Object.entries(alias)){
    if (s.toLowerCase() === canon.toLowerCase()) return canon;
    for (const a of list){
      if (s.toLowerCase() === a.toLowerCase()) return canon;
    }
  }
  return s;
}
