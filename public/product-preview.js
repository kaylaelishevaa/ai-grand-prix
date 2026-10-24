/* Product-photo preparation for local live previews. Sourced product geometry stays intact.
 * Verified packshot masks remove non-product regions; fallback extraction only removes
 * an edge-connected neutral backdrop. Lens translucency and white-edge matting are approximate.
 */
(() => {
  'use strict';
  const TYPES = {lipstick:'lip',lipbalm:'lip',sweater:'garment',chair:'object',lamp:'object',tshirt:'garment',hoodie:'garment',glasses:'glasses'};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  // Hand-traced silhouettes for the exact sourced packshots below. Coordinates are in
  // the original photo, before a catalog crop. These masks remove display stands,
  // hangers, folded glasses temples and photographic floor shadows without replacing
  // product pixels or inventing an unseen view.
  const PACKSHOT_MASKS = {
    '6331079250': {size:492,image:'/products/6331079250.jpg',keep:[[[25,147],[429,147],[430,316],[25,316]]],clear:[
      [[89,168],[114,165],[139,167],[163,174],[182,187],[193,204],[199,225],[196,246],[185,271],[170,286],[151,297],[128,303],[106,302],[83,294],[65,278],[54,259],[48,239],[47,218],[53,196],[67,180]],
      [[287,177],[307,168],[332,164],[355,165],[378,173],[395,188],[406,208],[409,231],[403,254],[390,277],[370,294],[348,302],[325,302],[303,296],[282,283],[266,263],[258,242],[256,221],[263,200],[273,186]]
    ]},
    '7835573890': {size:640,image:'/products/7835573890.png',anchor:{shoulderWidth:.50,shoulderY:.20},keep:[
      [[258,77],[228,91],[185,111],[158,128],[130,158],[59,232],[127,315],[151,304],[151,589],[474,589],[474,304],[497,315],[566,232],[503,165],[466,129],[417,106],[370,77],[360,86],[342,93],[320,97],[299,95],[277,88]]
    ]},
    '6015571890': {size:492,image:'/products/6015571890.png',anchor:{shoulderWidth:.50,shoulderY:.18},keep:[
      [[199,32],[180,39],[139,56],[107,75],[72,109],[25,150],[84,221],[113,202],[113,469],[375,470],[375,203],[404,222],[465,150],[418,108],[381,76],[341,56],[289,32],[283,41],[270,47],[250,50],[228,47],[208,40]]
    ]},
    '7944769320': {size:640,image:'/products/7944769320.jpg',anchor:{shoulderWidth:.53,shoulderY:.20},keep:[
      [[253,83],[234,83],[191,98],[156,113],[130,143],[96,195],[50,275],[115,325],[126,311],[128,390],[137,477],[154,561],[173,621],[219,610],[280,605],[346,606],[410,613],[468,623],[490,567],[503,494],[509,410],[508,311],[529,328],[599,281],[574,228],[542,177],[514,134],[496,115],[449,98],[399,81],[385,90],[369,96],[348,100],[327,101],[305,98],[282,91],[267,87]]
    ],clear:[[[250,78],[269,78],[269,88],[257,95],[250,89]],[[383,77],[401,77],[401,93],[386,95]]]},
    '345674940': {size:492,image:'/products/345674940.jpg',anchor:{shoulderWidth:.43,shoulderY:.17},keep:[
      [[203,26],[216,29],[231,36],[248,40],[265,36],[283,27],[287,50],[296,66],[323,74],[336,83],[343,115],[353,182],[361,247],[374,305],[379,356],[376,394],[368,411],[348,403],[334,432],[304,468],[298,449],[294,428],[273,429],[253,435],[234,434],[214,427],[193,424],[175,428],[166,467],[159,450],[147,428],[139,401],[121,399],[110,407],[103,398],[97,377],[94,352],[97,304],[108,239],[123,184],[137,127],[147,92],[159,77],[185,66],[199,52]]
    ]},
    '8610766199': {size:492,image:'/products/8610766199.jpg',anchor:{shoulderWidth:.41,shoulderY:.24},keep:[
      [[215,16],[246,12],[276,14],[303,21],[319,41],[322,60],[329,80],[343,97],[354,130],[365,178],[381,233],[394,278],[401,320],[401,358],[394,402],[377,449],[364,480],[339,477],[314,468],[317,443],[307,417],[271,409],[227,403],[179,395],[146,387],[132,405],[117,411],[89,399],[91,378],[86,368],[85,345],[88,314],[98,271],[108,229],[123,189],[136,145],[148,112],[161,89],[178,74],[180,52],[190,29]]
    ]},
    '240870751': {size:492,image:'/products/240870751.jpg',anchor:{shoulderWidth:.29,shoulderY:.30},keep:[
      [[217,126],[197,130],[179,141],[164,167],[146,202],[126,234],[171,259],[171,405],[321,406],[321,260],[363,234],[341,192],[327,158],[311,143],[279,127],[269,133],[255,136],[242,136],[229,133]]
    ]},
    '7330605115': {size:492,image:'/products/7330605115.jpg',keep:[[[129,133],[345,133],[363,443],[129,443]]],clear:[
      [[160,360],[170,360],[170,370],[160,370]],[[306,365],[315,365],[315,375],[306,375]],[[169,237],[176,237],[176,246],[169,246]],[[318,265],[323,265],[323,273],[318,273]],[[268,228],[271,228],[271,233],[268,233]]
    ]},
    '9086958339': {size:492,image:'/products/9086958339.jpg',keep:[[[112,10],[379,10],[379,486],[112,486]]],clear:[
      [[186,230],[194,230],[194,238],[186,238]],[[171,278],[175,278],[175,280],[171,280]]
    ]},
    '7915055185': {size:492,image:'/products/7915055185.jpg',keep:[
      [[57,458],[79,447],[96,435],[105,415],[113,376],[130,376],[137,420],[146,435],[165,441],[212,447],[249,455],[270,461],[272,468],[264,473],[66,474],[55,469]],
      [[116,376],[116,204],[119,153],[129,119],[145,94],[167,78],[190,68],[230,57],[253,53],[257,67],[230,70],[201,77],[180,85],[163,96],[151,112],[140,137],[133,166],[131,204],[130,376]],
      [[252,54],[271,48],[276,62],[255,68]],
      [[271,42],[298,33],[334,26],[371,20],[409,17],[430,19],[434,31],[430,43],[407,51],[372,60],[334,66],[297,69],[273,65]]
    ]},

    '7950092256': {size:640, image:'/products/7950092256.jpg', keep:[
      [[299,35],[472,29],[505,39],[470,220],[448,245],[395,252],[297,254],[267,248],[250,219],[245,166],[268,96]],
      [[143,170],[249,166],[250,181],[236,183],[236,197],[258,270],[272,278],[260,282],[249,272],[226,186],[147,178]],
      [[421,175],[490,175],[498,181],[495,190],[488,195],[493,212],[476,218],[475,196],[423,187]],
      [[123,301],[173,282],[271,274],[367,278],[446,285],[471,296],[475,309],[468,334],[444,348],[365,365],[180,365],[140,359],[111,347],[102,332],[107,316]],
      [[168,355],[185,360],[166,539],[152,545],[149,535]],[[278,355],[296,355],[302,501],[308,508],[286,511],[280,505]],
      [[345,354],[365,352],[353,573],[341,582],[333,576]],[[476,214],[492,210],[527,507],[529,540],[516,549],[505,544],[500,510]],
      [[147,539],[165,538],[177,547],[183,560],[180,574],[172,581],[150,582],[137,574],[134,562],[139,548]],
      [[341,570],[358,573],[369,585],[368,602],[360,616],[347,620],[335,615],[329,601],[333,580]]
    ]},
    '7950092244': {size:640, image:'/products/7950092244.jpg', keep:[
      [[296,35],[473,29],[503,39],[469,222],[447,247],[399,251],[300,253],[268,246],[249,222],[244,167],[264,99]],
      [[144,162],[248,169],[247,184],[235,186],[256,271],[270,278],[257,283],[246,270],[225,182],[145,169]],
      [[420,171],[489,178],[497,184],[495,193],[489,196],[494,215],[476,221],[476,200],[420,184]],
      [[122,303],[167,284],[269,275],[370,280],[445,286],[466,298],[470,312],[463,336],[440,350],[362,366],[180,366],[138,360],[109,347],[101,332],[107,317]],
      [[168,356],[185,361],[163,540],[148,548],[146,538]],[[278,357],[297,356],[302,500],[307,508],[286,511],[279,503]],
      [[345,354],[364,352],[349,574],[337,582],[330,575]],[[477,213],[494,211],[525,509],[527,542],[514,548],[504,544],[499,511]],
      [[145,540],[164,538],[176,548],[181,563],[177,578],[166,585],[145,583],[133,574],[130,562],[136,548]],
      [[337,572],[355,574],[366,588],[365,604],[355,618],[342,621],[331,614],[326,600],[329,582]]
    ]},
    '20145368': {size:492,image:'/products/20145368.jpg',keep:[
      [[221,34],[384,30],[395,35],[364,174],[350,198],[305,207],[219,195],[198,177],[196,139]],
      [[192,124],[201,132],[194,146],[164,148],[128,157],[109,177],[104,201],[109,223],[119,238],[108,244],[96,229],[89,206],[87,185],[96,162],[115,147],[155,133]],
      [[326,139],[394,133],[411,141],[414,151],[409,160],[389,166],[380,210],[366,240],[349,252],[343,240],[363,210],[375,163],[327,154]],
      [[116,212],[172,207],[277,215],[333,231],[350,248],[354,263],[329,276],[277,275],[147,260],[116,253],[101,239],[103,223]],
      [[198,165],[211,167],[218,202],[202,200]],
      [[158,258],[174,262],[113,387],[110,406],[97,407],[100,387]],
      [[177,265],[193,269],[254,339],[259,359],[247,361],[244,345]],
      [[329,272],[345,272],[313,318],[310,331],[305,430],[292,438],[289,426],[296,326],[302,308]],
      [[368,219],[382,213],[399,344],[403,374],[389,380],[384,348]],
      [[96,402],[111,400],[117,407],[119,420],[113,433],[99,436],[87,432],[86,419],[90,408]],
      [[245,356],[261,356],[268,364],[267,376],[257,387],[244,386],[237,379],[237,369]],
      [[390,373],[405,372],[409,382],[409,395],[401,407],[389,408],[383,400],[385,387]],
      [[291,429],[306,427],[317,437],[317,449],[308,465],[294,469],[282,463],[278,451],[282,437]]
    ]},
    '9474375760': {size:492,image:'/products/9474375760.jpg',anchor:{shoulderWidth:.44,shoulderY:.24},keep:[
      [[213,87],[204,91],[177,101],[145,115],[130,130],[97,166],[64,195],[111,247],[127,238],[130,416],[162,420],[270,416],[307,419],[366,414],[365,245],[381,251],[429,193],[404,168],[371,130],[347,111],[309,98],[278,87],[272,96],[259,103],[243,106],[228,101],[219,94]]
    ]},
    '6431292464': {size:640,image:'/products/6431292464.jpg',anchor:{shoulderWidth:.52,shoulderY:.20},keep:[
      [[249,77],[232,83],[195,96],[148,113],[119,147],[96,206],[57,296],[143,334],[155,315],[155,626],[500,626],[501,319],[530,348],[574,305],[540,211],[514,152],[497,132],[463,109],[398,82],[386,88],[372,97],[352,102],[329,104],[308,101],[287,96],[266,87]]
    ]},
    '5186051654': {size:492,image:'/products/5186051654.jpg',anchor:{shoulderWidth:.49,shoulderY:.19},keep:[
      [[198,61],[169,69],[123,87],[104,108],[42,191],[99,244],[108,232],[110,472],[127,478],[184,475],[232,478],[283,473],[329,476],[375,470],[379,232],[394,251],[445,191],[415,153],[381,108],[364,87],[324,73],[288,61],[279,69],[266,77],[249,80],[230,77],[214,71],[204,65]]
    ],clear:[[[195,57],[214,57],[214,68],[207,77],[199,69]],[[278,57],[290,57],[290,68],[278,76],[275,69]]]},
    '331802095': {size:640,image:'/products/331802095.jpg',anchor:{shoulderWidth:.39,shoulderY:.29},keep:[
      [[315,13],[330,15],[365,33],[394,57],[413,82],[425,117],[421,150],[441,169],[470,198],[494,240],[521,284],[543,328],[558,369],[569,411],[571,456],[567,490],[557,527],[543,562],[527,594],[521,606],[490,592],[488,620],[146,623],[138,586],[135,552],[131,514],[108,505],[84,481],[70,457],[66,434],[69,402],[76,376],[86,346],[105,310],[125,277],[146,246],[169,209],[193,182],[218,164],[213,144],[213,124],[218,91],[235,62],[262,39],[293,21]]
    ]},
    '7612276799': {size:492,image:'/products/7612276799.jpg',keep:[
      [[65,150],[81,146],[89,132],[112,121],[139,116],[166,117],[191,122],[207,134],[215,146],[221,140],[234,136],[248,138],[260,145],[271,132],[289,123],[315,116],[345,116],[370,121],[388,133],[396,147],[413,146],[414,156],[398,158],[395,190],[389,210],[376,224],[353,233],[321,237],[296,232],[279,223],[270,207],[265,185],[263,162],[218,163],[215,192],[205,211],[191,224],[166,232],[137,236],[112,232],[96,223],[87,208],[82,187],[80,159],[66,158]]
    ],clear:[
      [[88,151],[92,138],[108,127],[134,122],[160,122],[185,127],[202,137],[210,152],[209,175],[203,197],[192,214],[173,224],[147,230],[122,228],[104,220],[94,204],[89,183]],
      [[270,152],[278,138],[293,128],[316,122],[340,121],[362,126],[381,136],[390,150],[390,176],[384,199],[372,216],[352,226],[328,230],[306,227],[289,219],[279,204],[273,182]]
    ]},
    '6274724147': {size:492,image:'/products/6274724147.jpg',keep:[
      [[16,183],[339,187],[341,240],[327,320],[203,325],[173,257],[160,262],[143,312],[48,314],[23,265]]
    ],clear:[
      [[60,214],[72,208],[90,205],[112,209],[131,219],[141,233],[142,255],[137,274],[125,287],[109,295],[88,297],[71,291],[61,279],[55,263],[51,244],[50,228]],
      [[212,220],[228,214],[248,216],[270,223],[290,235],[302,250],[300,272],[292,290],[279,301],[257,307],[239,305],[225,297],[216,284],[210,265],[205,245],[205,230]]
    ]},
    '8561267958': {size:640,image:'/products/8561267958.jpg',keep:[
      [[44,325],[65,318],[81,310],[99,300],[135,289],[177,280],[210,275],[242,276],[272,289],[293,306],[308,316],[326,307],[341,292],[350,271],[368,254],[398,241],[439,233],[475,231],[506,234],[539,239],[573,242],[589,241],[592,259],[584,272],[584,309],[573,345],[552,377],[531,394],[500,410],[462,419],[424,422],[398,414],[375,399],[362,380],[350,359],[336,350],[322,359],[315,391],[302,425],[279,446],[246,459],[206,468],[165,471],[128,462],[104,447],[88,424],[77,400],[60,361],[45,352]]
    ],clear:[
      [[107,339],[123,319],[148,307],[178,299],[211,295],[242,295],[265,305],[281,324],[291,349],[293,376],[287,401],[276,422],[256,437],[229,449],[198,456],[166,457],[141,450],[123,438],[111,419],[102,393],[99,366]],
      [[374,287],[392,270],[421,255],[454,248],[483,248],[509,252],[535,261],[553,276],[565,296],[564,322],[554,348],[536,371],[512,388],[482,400],[450,406],[421,405],[400,397],[385,383],[376,361],[368,334],[366,310]]
    ]}
  };
  function packshotMask(product,crop) {
    const spec=PACKSHOT_MASKS[String(product?.id)];
    if(!spec||spec.image!==(product.preview?.image||product.image))return null;
    const project=polygon=>polygon.map(([x,y])=>[(x/spec.size-crop.x)/crop.width,(y/spec.size-crop.y)/crop.height]);
    return {keep:spec.keep.map(project),clear:(spec.clear||[]).map(project),anchor:spec.anchor,frameFinish:product.id==='7612276799'?'gold':['8561267958','6274724147'].includes(product.id)?'dark':null,preserveWhite:['7950092256','7950092244','20145368','5186051654','7835573890','6015571890','7944769320','7915055185'].includes(String(product.id))};
  }
  function rasterizePolygons(polygons,width,height) {
    const mask=new Uint8Array(width*height);
    for(const polygon of polygons){
      if(!Array.isArray(polygon)||polygon.length<3||polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n < -1||n>2)))throw Error('The verified product silhouette is invalid.');
      for(let y=0;y<height;y++){
        const scan=(y+.5)/height,crossings=[];
        for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
          const a=polygon[j],b=polygon[i];if((a[1]>scan)===(b[1]>scan))continue;
          crossings.push((a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]))*width);
        }
        crossings.sort((a,b)=>a-b);
        for(let i=0;i+1<crossings.length;i+=2){
          const left=Math.max(0,Math.ceil(crossings[i]-.5)),right=Math.min(width-1,Math.floor(crossings[i+1]-.5));
          for(let x=left;x<=right;x++)mask[y*width+x]=255;
        }
      }
    }
    return mask;
  }
  function applySilhouette(image,spec,{lensTint}={}) {
    const {data,width,height}=image;
    if(!spec?.keep?.length)return {removed:0,cleared:0};
    const keep=rasterizePolygons(spec.keep,width,height),clear=rasterizePolygons(spec.clear||[],width,height);
    const tint=/^#[0-9a-f]{6}$/i.test(lensTint||'')?[1,3,5].map(i=>parseInt(lensTint.slice(i,i+2),16)):null;
    let removed=0,cleared=0;
    for(let i=0;i<keep.length;i++){
      const offset=i*4;
      if(!keep[i]){if(data[offset+3])removed++;data[offset+3]=0;}
      else if(clear[i]){if(data[offset+3])cleared++;if(tint){for(let c=0;c<3;c++)data[offset+c]=tint[c];data[offset+3]=80;}else data[offset+3]=0;}
    }
    // A one-pixel edge feather prevents a hard stair-step when the cutout is enlarged.
    // Only alpha changes; white products, logos and bright metal rims retain their RGB.
    const alpha=Uint8Array.from({length:width*height},(_,i)=>data[i*4+3]);
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=y*width+x;if(!alpha[i])continue;
      const neighbors=[i-1,i+1,i-width,i+width].filter(n=>alpha[n]>0).length;
      if(neighbors<4)data[i*4+3]=Math.round(alpha[i]*(.5+neighbors*.125));
    }
    return {removed,cleared};
  }
  function cleanFrameBackdrop(image,finish) {
    let cleaned=0;
    for(let i=0;i<image.width*image.height;i++){
      const n=i*4;if(!image.data[n+3])continue;
      const rgb=[image.data[n],image.data[n+1],image.data[n+2]],low=Math.min(...rgb),high=Math.max(...rgb);
      if(low<190)continue;
      let alpha=1;
      if(finish==='gold'&&rgb[0]-rgb[2]>=2&&rgb[1]>=rgb[2])alpha=clamp((255-rgb[2])/50,0,1);
      else if(high-low<=18)alpha=finish==='dark'?clamp((220-low)/25,0,1):clamp((246-low)/35,0,1);
      if(alpha===1)continue;cleaned++;
      image.data[n+3]=Math.round(image.data[n+3]*alpha);
      if(alpha>0)for(let c=0;c<3;c++)image.data[n+c]=clamp(Math.round((rgb[c]-255*(1-alpha))/alpha),0,255);
    }
    return {cleaned};
  }
  function removeSmallIslands(image) {
    const {data,width,height}=image,total=width*height,seen=new Uint8Array(total),queue=new Uint32Array(total),groups=[];
    for(let start=0;start<total;start++){
      if(seen[start]||data[start*4+3]<16)continue;
      let head=0,tail=0;queue[tail++]=start;seen[start]=1;const group=[];
      while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);group.push(i);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const j=ny*width+nx;if(!seen[j]&&data[j*4+3]>=16){seen[j]=1;queue[tail++]=j;}}
      }groups.push(group);
    }
    const largest=Math.max(0,...groups.map(g=>g.length));let removed=0;
    for(const group of groups)if(group.length<largest*.02)for(const i of group){data[i*4+3]=0;removed++;}
    return {removed};
  }
  function assetPath(value,origin=window.location?.origin || 'http://localhost') {
    if(typeof value!=='string'||!value)throw Error('This product has no preview image.');
    let url;try{url=new URL(value,origin);}catch{throw Error('This product image is unavailable.');}
    if(url.origin!==origin||!/^\/products\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(url.pathname)||url.search||url.hash)throw Error('Only verified local product images can be previewed.');
    return url.pathname;
  }
  function normalizedCrop(value) {
    if(value===undefined||value===null)return {x:0,y:0,width:1,height:1};
    if(typeof value!=='object'||Array.isArray(value)||['x','y','width','height'].some(key=>typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||value[key]>1)||value.width===0||value.height===0||value.x+value.width>1||value.y+value.height>1)throw Error('This product photo crop is invalid.');
    return {x:value.x,y:value.y,width:value.width,height:value.height};
  }
  function removeEdgeWhite(image,{backgroundColor,backgroundTolerance=8,transparentSeeds=false}={}) {
    const {data,width,height}=image,total=width*height;
    const tolerance=Number.isFinite(backgroundTolerance)&&backgroundTolerance>=0&&backgroundTolerance<=12?backgroundTolerance:8;
    const lightNeutral=rgb=>Math.min(...rgb)>=224&&Math.max(...rgb)-Math.min(...rgb)<=12;
    let background=/^#[0-9a-f]{6}$/i.test(backgroundColor||'')?[1,3,5].map(i=>parseInt(backgroundColor.slice(i,i+2),16)):null;
    if(!background||!lightNeutral(background)){
      const edge=[];
      const sample=i=>{const p=i*4,rgb=[data[p],data[p+1],data[p+2]];if((data[p+3]>8||transparentSeeds)&&lightNeutral(rgb))edge.push(rgb);};
      for(let x=0;x<width;x++){sample(x);if(height>1)sample((height-1)*width+x);}for(let y=1;y<height-1;y++){sample(y*width);if(width>1)sample(y*width+width-1);}
      const perimeter=Math.max(1,width*2+Math.max(0,height-2)*2);
      if(edge.length<perimeter*.4)return {removed:0,keptOriginal:true};
      background=[0,1,2].map(channel=>edge.map(pixel=>pixel[channel]).sort((a,b)=>a-b)[Math.floor(edge.length/2)]);
    }
    const seen=new Uint8Array(total),queue=new Uint32Array(total);let head=0,tail=0,removed=0;
    const eligible=i=>{const n=i*4,rgb=[data[n],data[n+1],data[n+2]];return data[n+3]<8||(lightNeutral(rgb)&&rgb.every((value,channel)=>Math.abs(value-background[channel])<=tolerance));};
    const add=i=>{if(!seen[i]&&eligible(i)){seen[i]=1;queue[tail++]=i;}};
    for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
    if(transparentSeeds)for(let i=0;i<total;i++)if(data[i*4+3]===0)add(i);
    while(head<tail){const i=queue[head++],x=i%width;if(data[i*4+3]>0)removed++;if(x>0)add(i-1);if(x<width-1)add(i+1);if(i>=width)add(i-width);if(i<total-width)add(i+width);}
    // An almost-white garment can be indistinguishable from its backdrop. Keep the photo instead of erasing it.
    if(removed/total>.975)return {removed:0,keptOriginal:true};
    for(let i=0;i<total;i++)if(seen[i])data[i*4+3]=0;
    return {removed,keptOriginal:false};
  }
  function alphaBounds(image) {
    const {data,width,height}=image;let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left)return null;
    return {x:left,y:top,width:right-left+1,height:bottom-top+1};
  }
  function estimateLipColor(image) {
    const buckets=new Map(),stride=Math.max(1,Math.floor(image.width*image.height/20000));
    for(let i=0;i<image.width*image.height;i+=stride){const p=i*4,r=image.data[p],g=image.data[p+1],b=image.data[p+2];if(image.data[p+3]<32||r<65||r<g*1.12||r<b*.92||Math.max(r,g,b)-Math.min(r,g,b)<35)continue;const key=`${r>>4},${g>>4},${b>>4}`,v=buckets.get(key)||{n:0,r:0,g:0,b:0};v.n++;v.r+=r;v.g+=g;v.b+=b;buckets.set(key,v);}
    const best=[...buckets.values()].sort((a,b)=>b.n-a.n)[0];if(!best||best.n<3)return null;
    return '#'+['r','g','b'].map(c=>Math.round(best[c]/best.n).toString(16).padStart(2,'0')).join('');
  }
  function objectLayout(preview,w,h,options={}) {
    const scale=clamp(Number(options.scale)||1,.35,2.5),isChair=preview.productType==='chair';
    const maxEdge=Math.min(w,h)*(isChair?.62:.48)*scale;
    const ratio=preview.width/preview.height;
    let height=maxEdge,width=height*ratio;
    if(width>w*.85){width=w*.85;height=width/ratio;}
    if(height>h*.8){height=h*.8;width=height*ratio;}
    return {x:clamp(Number.isFinite(Number(options.x))?Number(options.x):.5,0,1)*w,y:clamp(Number.isFinite(Number(options.y))?Number(options.y):.74,0,1)*h,width,height,rotation:(Number(options.rotation)||0)*Math.PI/180};
  }
  function garmentLayout(preview,points,w,h,options={}) {
    if(!points?.[24]||[11,12,23,24].some(i=>(points[i].visibility??1)<.4))return null;
    const mirror=options.mirror===true,p=i=>({x:(mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h});
    let a=p(11),b=p(12);if(a.x>b.x)[a,b]=[b,a];
    const shoulders=Math.hypot(b.x-a.x,b.y-a.y),hips={x:(p(23).x+p(24).x)/2,y:(p(23).y+p(24).y)/2};
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2,scale=clamp(Number(options.scale)||1,.35,2.5),hoodie=preview.productType==='hoodie';
    const shoulderFraction=clamp(Number(preview.shoulderWidth)|| (hoodie?.54:.60),.3,.9);
    const shoulderY=clamp(Number(preview.shoulderY)|| (hoodie?.27:.10),.02,.6);
    const imageRatio=preview.width/preview.height;
    let width=shoulders/shoulderFraction*scale,height=width/imageRatio;
    const torso=Math.max(shoulders*.75,Math.hypot(hips.x-x,hips.y-y));
    // Preserve the product's image aspect ratio; never stretch logos or fabricate fabric drape.
    const maxHeight=torso*(hoodie?1.9:1.6)*scale;
    if(height>maxHeight){height=maxHeight;width=height*imageRatio;}
    if(width<20||height<20)return null;
    return {x,y,width,height,top:-height*shoulderY,rotation:Math.atan2(b.y-a.y,b.x-a.x)+(Number(options.rotation)||0)*Math.PI/180};
  }
  function clearGlassesLenses(image,masks,tint) {
    if(!Array.isArray(masks)||masks.length!==2)return {cleared:0};
    const valid=masks.every(m=>m&&['x','y','rx','ry'].every(k=>Number.isFinite(m[k]))&&m.x>0&&m.x<1&&m.y>0&&m.y<1&&m.rx>0&&m.rx<.3&&m.ry>0&&m.ry<.48);
    if(!valid)return {cleared:0};
    const rgb=/^#[0-9a-f]{6}$/i.test(tint||'')?[1,3,5].map(i=>parseInt(tint.slice(i,i+2),16)):null;
    let cleared=0;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const inside=masks.some(m=>{const dx=x-m.x*image.width,dy=y-m.y*image.height,angle=clamp(Number(m.rotation)||0,-30,30)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return ((dx*c+dy*s)/(m.rx*image.width))**2+((-dx*s+dy*c)/(m.ry*image.height))**2<1;});
      if(inside){const n=(y*image.width+x)*4;if(image.data[n+3])cleared++;if(rgb){image.data[n]=rgb[0];image.data[n+1]=rgb[1];image.data[n+2]=rgb[2];image.data[n+3]=80;}else image.data[n+3]=0;}
    }
    // Clear the remaining bright lens interior up to the dark rim, including rounded corners
    // outside the conservative ellipse. The ellipse also removes folded temple bars.
    const total=image.width*image.height,seen=new Uint8Array(total),queue=new Uint32Array(total);let head=0,tail=0;
    const white=i=>{const n=i*4,r=image.data[n],g=image.data[n+1],b=image.data[n+2];return Math.min(r,g,b)>=230&&Math.max(r,g,b)-Math.min(r,g,b)<=18;};
    const add=i=>{if(!seen[i]&&white(i)){seen[i]=1;queue[tail++]=i;}};
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const inside=masks.some(m=>{const dx=x-m.x*image.width,dy=y-m.y*image.height,angle=clamp(Number(m.rotation)||0,-30,30)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return ((dx*c+dy*s)/(m.rx*image.width))**2+((-dx*s+dy*c)/(m.ry*image.height))**2<1.03;});
      if(inside){const i=y*image.width+x;if(!seen[i]){seen[i]=1;queue[tail++]=i;}}
    }
    while(head<tail){const i=queue[head++],x=i%image.width,n=i*4;if(white(i)&&image.data[n+3]){image.data[n+3]=0;cleared++;}if(x>0)add(i-1);if(x<image.width-1)add(i+1);if(i>=image.width)add(i-image.width);if(i<total-image.width)add(i+image.width);}
    // Remove only near-white neutral fringe on the photographed cutout, not coloured rims.
    for(let i=0;i<total;i++){const n=i*4,r=image.data[n],g=image.data[n+1],b=image.data[n+2],low=Math.min(r,g,b);if(image.data[n+3]&&low>=225&&Math.max(r,g,b)-low<=16){const alpha=clamp((245-low)/20,0,1);image.data[n+3]=Math.round(image.data[n+3]*alpha);if(alpha>0)for(let j=0;j<3;j++)image.data[n+j]=clamp(Math.round((image.data[n+j]-255*(1-alpha))/alpha),0,255);}}
    return {cleared};
  }
  function glassesLayout(preview,points,w,h,options={}) {
    if(!points?.[263]||![33,133,263,362,168].every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)))return null;
    const point=i=>({x:(options.mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h,z:(points[i].z||0)*w});
    let a=point(33),b=point(263);if(a.x>b.x)[a,b]=[b,a];
    const distance=Math.hypot(b.x-a.x,b.y-a.y);if(distance<w*.035||distance>w*.65)return null;
    const depth=(b.z-a.z)/distance,yaw=clamp(depth,-1.2,1.2);
    const nose=point(168),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const noseShift=(nose.x-mid.x)/distance;
    if(Math.abs(yaw)>.78||Math.abs(noseShift)>.29)return null;
    const scale=clamp(Number(options.scale)||1,.5,1.7),width=distance*1.48*scale/clamp(Number(preview.frameWidth)||.94,.65,1),height=width*preview.height/preview.width;
    if(!Number.isFinite(height)||height<5)return null;
    const rotation=Math.atan2(b.y-a.y,b.x-a.x)+((Number(options.rotation)||0)-clamp(Number(preview.frameRoll)||0,-30,30))*Math.PI/180;
    const bx=clamp(Number(preview.bridgeX)||.5,.25,.75),by=clamp(Number(preview.bridgeY)||.42,.12,.8);
    // The product's bridge follows the nose; outer-eye span supplies physical face-relative scale.
    const center={x:nose.x,y:nose.y+distance*.06},cos=Math.cos(rotation),sin=Math.sin(rotation);
    const convert=(u,v)=>{const x=(u-bx)*width,y=(v-by)*height*(1+(u-.5)*yaw*.22);return {x:center.x+x*cos-y*sin,y:center.y+x*sin+y*cos};};
    return {x:center.x,y:center.y,width,height,rotation,yaw,quad:[convert(0,0),convert(1,0),convert(1,1),convert(0,1)]};
  }
  function garmentMesh(preview,points,w,h,options={}) {
    const base=garmentLayout(preview,points,w,h,options);if(!base)return null;
    const p=i=>({x:(options.mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h});
    let ls=p(11),rs=p(12),lh=p(23),rh=p(24);if(ls.x>rs.x)[ls,rs]=[rs,ls];if(lh.x>rh.x)[lh,rh]=[rh,lh];
    const shoulder={x:(ls.x+rs.x)/2,y:(ls.y+rs.y)/2},hip={x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2};
    const torso=Math.hypot(hip.x-shoulder.x,hip.y-shoulder.y);if(torso<20)return null;
    const dx=(hip.x-shoulder.x)/torso,dy=(hip.y-shoulder.y)/torso;
    const shoulderY=clamp(Number(preview.shoulderY)||(preview.productType==='hoodie'?.27:.1),.02,.6);
    const height=Math.min(base.height,torso*(preview.productType==='hoodie'?1.55:1.3)*clamp(Number(options.scale)||1,.35,2.5));
    const top={x:shoulder.x-dx*height*shoulderY,y:shoulder.y-dy*height*shoulderY};
    const bottom={x:shoulder.x+dx*height*(1-shoulderY),y:shoulder.y+dy*height*(1-shoulderY)};
    const hipRatio=Math.hypot(rh.x-lh.x,rh.y-lh.y)/Math.hypot(rs.x-ls.x,rs.y-ls.y);
    const hemWidth=base.width*clamp(hipRatio*.85,.66,1.02);
    const topAngle=base.rotation,bottomAngle=clamp(Math.atan2(rh.y-lh.y,rh.x-lh.x)-topAngle,-.28,.28)+topAngle;
    const edge=(c,width,angle,side)=>({x:c.x+Math.cos(angle)*width*.5*side,y:c.y+Math.sin(angle)*width*.5*side});
    return {...base,height,quad:[edge(top,base.width,topAngle,-1),edge(top,base.width,topAngle,1),edge(bottom,hemWidth,bottomAngle,1),edge(bottom,hemWidth,bottomAngle,-1)]};
  }
  function headOcclusion(points,w,h,options={}) {
    if(!points||![0,2,5,9,10,11,12].every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&(points[i].visibility??1)>.55))return null;
    const p=i=>({x:(options.mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h});
    let a=p(2),b=p(5);if(a.x>b.x)[a,b]=[b,a];
    const eye={x:(a.x+b.x)/2,y:(a.y+b.y)/2},mouth={x:(p(9).x+p(10).x)/2,y:(p(9).y+p(10).y)/2};
    const shoulders=Math.hypot(p(11).x-p(12).x,p(11).y-p(12).y),eyeSpan=Math.hypot(b.x-a.x,b.y-a.y);
    if(shoulders<25||eyeSpan<4||mouth.y<eye.y)return null;
    const ears=[7,8].every(i=>points[i]&&(points[i].visibility??1)>.4)?Math.hypot(p(7).x-p(8).x,p(7).y-p(8).y):0;
    const faceWidth=clamp(Math.max(ears,eyeSpan*2,shoulders*.30),shoulders*.26,shoulders*.65);
    const rotation=clamp(Math.atan2(b.y-a.y,b.x-a.x),-.55,.55),dx=-Math.sin(rotation),dy=Math.cos(rotation);
    const top={x:eye.x-dx*faceWidth*.62,y:eye.y-dy*faceWidth*.62},bottom={x:mouth.x+dx*faceWidth*.30,y:mouth.y+dy*faceWidth*.30};
    const x=(top.x+bottom.x)/2,y=(top.y+bottom.y)/2,rx=faceWidth*.57,ry=Math.hypot(bottom.x-top.x,bottom.y-top.y)/2;
    const shoulderLimit=Math.min(p(11).y,p(12).y)-shoulders*.04;
    // Bound the mask above the shoulders so the previous shirt cannot be restored over the new one.
    return {x,y,rx,ry:Math.max(5,Math.min(ry,shoulderLimit-y)),rotation};
  }
  // Textured triangles allow a bounded live warp without inventing unseen product geometry.
  function drawQuad(ctx,image,quad,columns=3,rows=3) {
    if(!quad||quad.length!==4)return;
    const width=image.width,height=image.height;
    const at=(u,v)=>({x:(1-v)*((1-u)*quad[0].x+u*quad[1].x)+v*((1-u)*quad[3].x+u*quad[2].x),y:(1-v)*((1-u)*quad[0].y+u*quad[1].y)+v*((1-u)*quad[3].y+u*quad[2].y)});
    const triangle=(source,target)=>{
      const [a,b,c]=source,[p,q,r]=target,den=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);if(Math.abs(den)<.001)return;
      const affine=key=>[(p[key]*(b.y-c.y)+q[key]*(c.y-a.y)+r[key]*(a.y-b.y))/den,(p[key]*(c.x-b.x)+q[key]*(a.x-c.x)+r[key]*(b.x-a.x))/den,(p[key]*(b.x*c.y-c.x*b.y)+q[key]*(c.x*a.y-a.x*c.y)+r[key]*(a.x*b.y-b.x*a.y))/den];
      const tx=affine('x'),ty=affine('y');ctx.save();ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineTo(r.x,r.y);ctx.closePath();ctx.clip();ctx.transform(tx[0],ty[0],tx[1],ty[1],tx[2],ty[2]);ctx.drawImage(image,0,0);ctx.restore();
    };
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const u0=x/columns,u1=(x+1)/columns,v0=y/rows,v1=(y+1)/rows;
      const src=[{x:u0*width,y:v0*height},{x:u1*width,y:v0*height},{x:u1*width,y:v1*height},{x:u0*width,y:v1*height}],dst=[at(u0,v0),at(u1,v0),at(u1,v1),at(u0,v1)];
      triangle([src[0],src[1],src[2]],[dst[0],dst[1],dst[2]]);triangle([src[0],src[2],src[3]],[dst[0],dst[2],dst[3]]);
    }
  }
  class NookProductPreview {
    constructor({canvasFactory=()=>document.createElement('canvas'),loadImage,origin=window.location?.origin||'http://localhost'}={}) {this.canvasFactory=canvasFactory;this.imageLoader=loadImage||this._image.bind(this);this.origin=origin;this.sequence=0;this.current=null;}
    _image(path){return new Promise((resolve,reject)=>{const image=new Image();const timeout=setTimeout(()=>{image.onload=null;image.onerror=null;reject(Error('Product photo timed out. Try again.'));},12000);image.crossOrigin='anonymous';image.onload=()=>{clearTimeout(timeout);resolve(image);};image.onerror=()=>{clearTimeout(timeout);reject(Error('Product photo could not load. Try a different product.'));};image.src=path;});}
    clear(){this.sequence++;this.current=null;}
    async load(product) {
      const token=++this.sequence;this.current=null;
      const kind=TYPES[product?.productType];if(!kind)throw Error('Choose glasses, a lip product, a chair, lamp, T-shirt, hoodie or sweater from the catalog.');
      if(product.preview?.available===false)throw Error(product.preview.reason||product.preview.unavailableReason||'This listing photo is not suitable for a clean live preview.');
      const path=assetPath(product.preview?.image||product.image,this.origin),crop=normalizedCrop(product.preview?.crop),mask=packshotMask(product,crop);
      const image=await this.imageLoader(path);if(token!==this.sequence)return {ok:false,stale:true};
      const sw=image.naturalWidth||image.width,sh=image.naturalHeight||image.height;if(!(sw>0&&sh>0))throw Error('Product photo has no usable pixels.');
      const sourceX=Math.min(sw-1,Math.floor(sw*crop.x)),sourceY=Math.min(sh-1,Math.floor(sh*crop.y)),sourceWidth=Math.max(1,Math.min(sw-sourceX,Math.round(sw*crop.width))),sourceHeight=Math.max(1,Math.min(sh-sourceY,Math.round(sh*crop.height)));
      const canvas=this.canvasFactory(),factor=Math.min(1,640/Math.max(sourceWidth,sourceHeight));canvas.width=Math.max(1,Math.round(sourceWidth*factor));canvas.height=Math.max(1,Math.round(sourceHeight*factor));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('This browser cannot prepare product previews.');
      ctx.drawImage(image,sourceX,sourceY,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
      let pixels;try{pixels=ctx.getImageData(0,0,canvas.width,canvas.height);}catch{throw Error('Product image could not be used safely in the camera.');}
      let shadeColor=null,shadeEstimated=false;
      if(kind==='lip'){shadeColor=/^#[0-9a-f]{6}$/i.test(product.preview?.color||'')?product.preview.color:estimateLipColor(pixels);if(!shadeColor)throw Error('This photo has no reliable lipstick colour to preview. Choose another lipstick.');shadeEstimated=product.preview?.shadeVerified!==true;}
      const silhouette=kind!=='lip'&&mask?applySilhouette(pixels,mask,{lensTint:product.preview?.lensTint}):{removed:0,cleared:0};
      const removed=kind!=='lip'&&(!mask||(!mask.preserveWhite&&!mask.frameFinish))&&product.preview?.background==='white'?removeEdgeWhite(pixels,{backgroundColor:product.preview?.backgroundColor,backgroundTolerance:String(product.id)==='7612276799'?2:product.preview?.backgroundTolerance,transparentSeeds:!!mask}):{removed:0};
      const lensResult=kind==='glasses'&&!mask&&product.preview?.lensClear===true?clearGlassesLenses(pixels,product.preview?.lensMasks,product.preview?.lensTint):{cleared:0};
      const frameCleanup=mask?.frameFinish?cleanFrameBackdrop(pixels,mask.frameFinish):{cleaned:0};
      if(String(product.id)==='8561267958'&&mask)removeSmallIslands(pixels);
      if(removed.removed||lensResult.cleared||silhouette.removed||silhouette.cleared||frameCleanup.cleaned)ctx.putImageData(pixels,0,0);
      const bounds=alphaBounds(pixels);if(!bounds)throw Error('Product image has no visible product.');
      let drawable=canvas;
      if(bounds.width!==canvas.width||bounds.height!==canvas.height){drawable=this.canvasFactory();drawable.width=bounds.width;drawable.height=bounds.height;drawable.getContext('2d').drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);}
      if(token!==this.sequence)return {ok:false,stale:true};
      const result={ok:true,productId:String(product.id),productType:product.productType,kind,canvas:drawable,width:drawable.width,height:drawable.height,backgroundRemoved:removed.removed>0||silhouette.removed>0,cleanSilhouette:!!mask,shadeColor,shadeEstimated,shoulderWidth:mask?.anchor?clamp(mask.anchor.shoulderWidth/crop.width*canvas.width/bounds.width,.3,.9):product.preview?.shoulderWidth,shoulderY:mask?.anchor?clamp(((mask.anchor.shoulderY-crop.y)/crop.height*canvas.height-bounds.y)/bounds.height,.02,.6):product.preview?.shoulderY,frameWidth:product.preview?.frameWidth===undefined?undefined:clamp(product.preview.frameWidth*canvas.width/bounds.width,.65,1),frameRoll:product.preview?.frameRoll,bridgeX:product.preview?.bridgeX===undefined?undefined:clamp((product.preview.bridgeX*canvas.width-bounds.x)/bounds.width,0,1),bridgeY:product.preview?.bridgeY===undefined?undefined:clamp((product.preview.bridgeY*canvas.height-bounds.y)/bounds.height,0,1),lensCleared:lensResult.cleared>0||silhouette.cleared>0,notice:kind==='lip'?'Colour estimated from the listing photo; not an exact shade match.':'Actual listing photo, placed in 2D; not a fit or size guarantee.'};
      this.current=result;return result;
    }
  }
  Object.assign(NookProductPreview,{assetPath,normalizedCrop,packshotMask,rasterizePolygons,applySilhouette,cleanFrameBackdrop,removeSmallIslands,removeEdgeWhite,alphaBounds,estimateLipColor,objectLayout,garmentLayout,clearGlassesLenses,glassesLayout,garmentMesh,drawQuad,headOcclusion});
  window.NookProductPreview=NookProductPreview;
})();
