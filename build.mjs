import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const core=read('src/analysis/core.js'),worker=core+'\n'+read('src/workers/worker.js');
const app=core+'\n'+read('src/app.js').replace('/*WORKER_SOURCE*/',JSON.stringify(worker));
const html=read('src/index.html').replace('/*STYLES*/',read('src/styles.css')).replace('/*APP*/',app.replaceAll('</script','<\\/script'));
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/Electrode_EDS_Analyzer.html',html);console.log('Built '+Buffer.byteLength(html)+' bytes');
