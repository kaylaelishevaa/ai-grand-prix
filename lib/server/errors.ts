export class AppError extends Error {
  constructor(public code:string,message:string,public status=400){super(message);this.name='AppError';}
}
export function errorResponse(error:unknown){
  if(error instanceof AppError)return Response.json({error:error.message,code:error.code},{status:error.status});
  if(error && typeof error==='object' && 'issues' in error)return Response.json({error:'That request is missing valid fields.',code:'INVALID_REQUEST'},{status:400});
  console.error('[coupi] request failed', error instanceof Error?error.name:'UnknownError');
  return Response.json({error:'Something went wrong on the server. Your changes have not been approved.',code:'INTERNAL_ERROR'},{status:500});
}
