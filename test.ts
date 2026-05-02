import fs from 'fs';
fetch('https://openrouter.ai/api/v1/models')
  .then(r=>r.json())
  .then(d=> {
     let m = d.data.filter(x => x.id.includes('google'));
     console.log("Google models: ", m.map(x=>x.id));
  })
