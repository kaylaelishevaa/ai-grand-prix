/* Local image preparation only. Nothing leaves the browser until Send is pressed. */
(() => {
  'use strict';
  const MAX_FILE_BYTES=10*1024*1024,MAX_DATA_LENGTH=55000;
  const supported=new Set(['image/jpeg','image/png','image/webp']);
  async function prepare(file) {
    if(!file||!supported.has(file.type))throw new Error('Choose a JPG, PNG, or WebP photo.');
    if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_FILE_BYTES)throw new Error('Choose an image smaller than 10 MB.');
    const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
    const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!jpeg&&!png&&!webp)throw new Error('This file is not a supported photo. Choose a JPG, PNG, or WebP image.');
    const url=URL.createObjectURL(file),image=new Image();
    try {
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('This photo could not be opened. Try a different image.'));image.src=url;});
      const sourceWidth=image.naturalWidth,sourceHeight=image.naturalHeight;
      if(!sourceWidth||!sourceHeight||sourceWidth*sourceHeight>60000000)throw new Error('This photo is too large to prepare. Choose a smaller image.');
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
      if(!context)throw new Error('Image preparation is unavailable in this browser.');
      let edge=Math.min(720,Math.max(sourceWidth,sourceHeight));
      while(edge>=1) {
        const ratio=Math.min(1,edge/Math.max(sourceWidth,sourceHeight));
        canvas.width=Math.max(1,Math.round(sourceWidth*ratio));canvas.height=Math.max(1,Math.round(sourceHeight*ratio));
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
        for(const quality of [.76,.62,.48,.34]) {
          const dataUrl=canvas.toDataURL('image/jpeg',quality);
          if(dataUrl.startsWith('data:image/jpeg;base64,')&&dataUrl.length<=MAX_DATA_LENGTH)return {dataUrl,name:String(file.name||'Photo').slice(0,100),width:canvas.width,height:canvas.height};
        }
        if(edge<=128)break;
        edge=Math.max(128,Math.floor(edge*.78));
      }
      throw new Error('This photo is too detailed for the live connection. Try a crop or smaller image.');
    } finally {URL.revokeObjectURL(url);image.onload=null;image.onerror=null;}
  }
  window.CoupiChatImages={prepare};
})();
