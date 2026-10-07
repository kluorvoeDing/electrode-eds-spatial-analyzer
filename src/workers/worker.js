onmessage = event => {
  try { const result=Core.process(event.data.payload); const transfers=[result.roi.buffer,...Object.values(result.masks).map(x=>x.buffer)]; postMessage({id:event.data.id,result},transfers); }
  catch(e){postMessage({id:event.data.id,error:e.message});}
};
