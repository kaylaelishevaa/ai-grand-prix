import {AppError} from './errors';
export function requireLocalOrigin(request:Request){
  const origin=request.headers.get('origin');
  if(!origin)return;
  let expected:string;
  try{
    const requestUrl=new URL(request.url),host=request.headers.get('host');
    // Next may canonicalize Request.url to localhost while the browser used 127.0.0.1.
    // Host is the actual request authority; forwarded host/protocol headers are not trusted.
    if(host&&/[\s,/@\\?#]/.test(host))throw new Error('Invalid host');
    const target=host?new URL(`${requestUrl.protocol}//${host}`):requestUrl;
    if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('Invalid authority');
    expected=target.origin;
    if(new URL(origin).origin!==origin)throw new Error('Invalid origin');
  }catch{throw new AppError('ORIGIN_MISMATCH','Open this app from its own local address.',403);}
  if(origin!==expected)throw new AppError('ORIGIN_MISMATCH','Open this app from its own local address.',403);
}
export async function readJson(request:Request){
  requireLocalOrigin(request);
  const text=await request.text();
  if(text.length>100_000)throw new AppError('REQUEST_TOO_LARGE','This request is too large.',413);
  try{return JSON.parse(text);}catch{throw new AppError('INVALID_JSON','Send a valid JSON request.');}
}
